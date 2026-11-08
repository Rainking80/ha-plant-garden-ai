import { mdiDeleteOutline, mdiWateringCanOutline } from "@mdi/js";
import { css, html, nothing, svg } from "lit";

import { deleteIrrigationEvent, errorMessage, irrigationEvents, logWatering } from "../api/client";
import type { GardenChangeEvent, IrrigationEvent, WaterDay } from "../api/types";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatDateTime, formatLiters, formatNumber } from "../util/format";
import { PgElement, define, icon } from "./base";
import "./confirm-dialog";
import type { PgConfirmDialog } from "./confirm-dialog";
import "./number-dialog";
import type { PgNumberDialog } from "./number-dialog";

const EVENT_LIMIT = 8;

/** Bars of the last days' water in mm, scaled to the largest day (at least 5 mm). */
export function waterBars(
  days: WaterDay[],
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number; day: WaterDay }[] {
  if (!days.length) return [];
  const top = Math.max(5, ...days.map((day) => day.mm));
  const slot = width / days.length;
  return days.map((day, i) => {
    const h = (day.mm / top) * height;
    return { x: i * slot + slot * 0.15, y: height - h, w: slot * 0.7, h, day };
  });
}

/**
 * Water of one plant on its detail page: today, total, the last two weeks as
 * bars, the latest events and "log watering" for the watering can.
 */
export class PgWaterPanel extends PgElement {
  static override properties = {
    store: { attribute: false },
    plantId: { attribute: false },
    _events: { state: true },
    _error: { state: true },
  };

  declare store: GardenStore;
  declare plantId: string;
  declare _events: IrrigationEvent[];
  declare _error: string;

  private readonly _onStoreChange = () => this.requestUpdate();
  private readonly _onPlantChanged = (event: Event) => {
    const change = (event as CustomEvent<GardenChangeEvent>).detail;
    if (change.kind === "irrigation") void this._load();
  };

  constructor() {
    super();
    this._events = [];
    this._error = "";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.store?.addEventListener("change", this._onStoreChange);
    this.store?.addEventListener("plant-changed", this._onPlantChanged);
    void this._load();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.store?.removeEventListener("change", this._onStoreChange);
    this.store?.removeEventListener("plant-changed", this._onPlantChanged);
  }

  private async _load(): Promise<void> {
    const plantId = this.plantId;
    try {
      const events = await irrigationEvents(this.hass, { plant_id: plantId, limit: EVENT_LIMIT });
      if (plantId === this.plantId) this._events = events;
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private async _log(): Promise<void> {
    const dialog = this.renderRoot.querySelector<PgNumberDialog>("pg-number-dialog");
    const liters = await dialog?.ask(
      this.t("water.log_title"),
      this.t("water.liters"),
      this.t("water.log_hint"),
    );
    if (!liters) return;
    try {
      await logWatering(this.hass, [{ plant_id: this.plantId, liters }]);
      this._error = "";
      await this._load();
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private async _delete(event: IrrigationEvent): Promise<void> {
    const confirm = this.renderRoot.querySelector<PgConfirmDialog>("pg-confirm-dialog");
    const ok = await confirm?.ask(
      this.t("water.delete_title"),
      this.t(event.zone_id ? "water.delete_zone" : "water.delete_manual"),
      this.t("common.delete"),
    );
    if (!ok) return;
    try {
      await deleteIrrigationEvent(this.hass, event.id);
      this._events = this._events.filter((item) => item.id !== event.id);
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private _source(event: IrrigationEvent): string {
    if (!event.zone_id) return this.t("water.by_hand");
    const zone = this.store.getShape(event.zone_id);
    return zone?.label ?? this.t("kind.zone");
  }

  private _flags(event: IrrigationEvent): string {
    const { t } = this;
    const flags = [];
    if (event.source === "estimate") flags.push(t("water.estimated"));
    if (event.source === "meter") flags.push(t("water.metered"));
    if (event.uncertain) flags.push(t("water.uncertain"));
    if (event.reconstructed) flags.push(t("water.reconstructed"));
    return flags.join(" · ");
  }

  protected override render() {
    const { t, language } = this;
    const stats = this.store?.irrigation.plants[this.plantId];
    const bars = waterBars(stats?.days ?? [], 280, 48);
    return html`
      <div class="block-header">
        <h3>${t("water.title")}</h3>
        <button class="button text" @click=${this._log}>
          ${icon(mdiWateringCanOutline)} ${t("water.log")}
        </button>
      </div>
      ${
        stats
          ? html`<p class="summary">
              ${t("water.summary", {
                today: formatLiters(stats.today_l, language),
                mm: formatNumber(stats.today_mm, language, 1),
                total: formatLiters(stats.total_l, language),
              })}
            </p>`
          : html`<p class="muted">${t("water.none")}</p>`
      }
      ${
        bars.some((bar) => bar.h > 0)
          ? html`<svg
                class="bars"
                viewBox="0 0 280 48"
                preserveAspectRatio="none"
                role="img"
                aria-label=${t("water.chart")}
              >
                ${bars.map(
                  (bar) =>
                    svg`<rect x=${bar.x} y=${bar.y} width=${bar.w} height=${bar.h} rx="1.5">
                    <title>${bar.day.day}: ${formatNumber(bar.day.mm, language, 1)} mm</title>
                  </rect>`,
                )}
              </svg>
              <p class="muted small">${t("water.chart")}</p>`
          : nothing
      }
      ${
        this._events.length
          ? html`<ul class="events">
              ${this._events.map((event) => {
                const mine = event.plants.find((share) => share.plant_id === this.plantId);
                return html`<li>
                  <div>
                    <strong>${this._source(event)}</strong>
                    <span class="muted small">${formatDateTime(event.ended_at, language)}</span>
                    <span class="muted small">${this._flags(event)}</span>
                  </div>
                  <span>${mine ? formatLiters(mine.liters, language) : ""}</span>
                  <button
                    class="icon-button small"
                    aria-label=${t("water.delete_title")}
                    title=${t("water.delete_title")}
                    @click=${() => this._delete(event)}
                  >
                    ${icon(mdiDeleteOutline)}
                  </button>
                </li>`;
              })}
            </ul>`
          : nothing
      }
      ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
      <pg-number-dialog .hass=${this.hass}></pg-number-dialog>
      <pg-confirm-dialog .hass=${this.hass}></pg-confirm-dialog>
    `;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: block;
      }
      .block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      h3 {
        margin: 0;
      }
      .summary {
        margin: 8px 0;
      }
      .bars {
        display: block;
        width: 100%;
        height: 48px;
        margin-top: 8px;
      }
      .bars rect {
        fill: var(--pg-water);
      }
      .events {
        list-style: none;
        margin: 12px 0 0;
        padding: 0;
        display: grid;
        gap: 6px;
      }
      .events li {
        display: grid;
        grid-template-columns: 1fr auto auto;
        align-items: center;
        gap: 8px;
        padding: 6px 0;
        border-top: 1px solid var(--pg-divider);
      }
      .events li div {
        display: flex;
        flex-wrap: wrap;
        gap: 2px 8px;
        align-items: baseline;
      }
    `,
  ];
}

define("pg-water-panel", PgWaterPanel);
