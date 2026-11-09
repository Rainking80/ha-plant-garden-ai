import { css, html, nothing } from "lit";

import { errorMessage, setResearchSchedule } from "../api/client";
import { RESEARCH_SCHEDULES, type ResearchSchedule } from "../api/types";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatDateTime, formatMoney } from "../util/format";
import { PgElement, define } from "./base";

/**
 * How often the assistant researches plants on its own (off by default), with
 * the cost of one plant and when the next one is due. Shown on the assistant
 * and the tech page; only administrators can change it.
 */
export class PgResearchSchedule extends PgElement {
  static override properties = {
    store: { attribute: false },
    _busy: { state: true },
    _error: { state: true },
  };

  declare store: GardenStore;
  declare _busy: boolean;
  declare _error: string;

  private readonly _onStoreChange = () => this.requestUpdate();

  constructor() {
    super();
    this._busy = false;
    this._error = "";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.store?.addEventListener("change", this._onStoreChange);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.store?.removeEventListener("change", this._onStoreChange);
  }

  private async _set(event: Event): Promise<void> {
    const schedule = (event.target as HTMLSelectElement).value as ResearchSchedule;
    this._busy = true;
    try {
      this.store.setResearch(await setResearchSchedule(this.hass, schedule));
      this._error = "";
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  protected override render() {
    const { t, language } = this;
    const research = this.store?.research;
    if (!research) return nothing;
    if (!research.available) return html`<p class="muted small">${t("research.no_provider")}</p>`;
    const admin = this.hass?.user?.is_admin ?? true;
    const total = this.store.plants.filter(
      (plant) => plant.status !== "removed" && plant.status !== "dead",
    ).length;
    const done = Object.keys(research.plants).length;
    return html`
      <label class="field">
        <span>${t("research.schedule")}</span>
        <select ?disabled=${!admin || this._busy} @change=${this._set}>
          ${RESEARCH_SCHEDULES.map(
            (schedule) =>
              html`<option value=${schedule} ?selected=${schedule === research.schedule}>
                ${t(`research.schedule_${schedule}`)}
              </option>`,
          )}
        </select>
      </label>
      <p class="muted small">
        ${
          research.estimate === null
            ? t("research.cost_unknown")
            : t("research.cost", {
                cost: formatMoney(research.estimate, research.currency, language),
              })
        }
        ${research.web ? t("research.web") : t("research.no_web")}
        ${admin ? nothing : t("research.admin_only")}
      </p>
      <p class="small status">
        ${t("research.status", { done, total })}
        ${
          research.next_run
            ? html` · ${t("research.next", { time: formatDateTime(research.next_run, language) })}`
            : nothing
        }
      </p>
      ${this._error ? html`<p class="error-text small" role="alert">${this._error}</p>` : nothing}
    `;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: grid;
        gap: 4px;
      }
      p {
        margin: 0;
      }
      .field {
        max-width: 360px;
      }
    `,
  ];
}

define("pg-research-schedule", PgResearchSchedule);
