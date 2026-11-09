import {
  mdiCalendarCheckOutline,
  mdiCheck,
  mdiPlus,
  mdiAlertOutline,
  mdiBookOpenPageVariantOutline,
  mdiDeleteOutline,
  mdiOpenInNew,
} from "@mdi/js";
import { css, html, nothing } from "lit";

import { calendarTask, deleteKnowledge, errorMessage, researchPlant } from "../api/client";
import type { PlantKnowledge } from "../api/types";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatDateTime, formatMoney } from "../util/format";
import { renderMarkdown } from "../util/markdown";
import "./confirm-dialog";
import type { PgConfirmDialog } from "./confirm-dialog";
import { PgElement, define, icon } from "./base";

/** Short month names of a language, January first. */
export function monthNames(language: string): string[] {
  const format = new Intl.DateTimeFormat(language, { month: "short" });
  return Array.from({ length: 12 }, (_, i) => format.format(new Date(2026, i, 1)));
}

/**
 * What the assistant found out about one plant: care by topic, a care
 * calendar, warnings and the sources. Research it now, or delete it so the
 * assistant researches the plant again.
 */
export class PgKnowledgePanel extends PgElement {
  static override properties = {
    store: { attribute: false },
    plantId: {},
    _busy: { state: true },
    _error: { state: true },
    _taking: { state: true },
  };

  declare store: GardenStore;
  declare plantId: string;
  declare _busy: boolean;
  declare _error: string;
  /** calendar job being taken over as a task */
  declare _taking: number | null;

  private readonly _onStoreChange = () => this.requestUpdate();

  constructor() {
    super();
    this._busy = false;
    this._error = "";
    this._taking = null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.store?.addEventListener("change", this._onStoreChange);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.store?.removeEventListener("change", this._onStoreChange);
  }

  private async _research(): Promise<void> {
    this._busy = true;
    this._error = "";
    try {
      const info = await researchPlant(this.hass, this.plantId);
      // show it right away; the summary that follows brings the cost in the display currency
      const research = this.store.research;
      if (research) {
        this.store.setResearch({
          ...research,
          plants: { ...research.plants, [this.plantId]: { ...info, cost: null } },
          queue: research.queue.filter((id) => id !== this.plantId),
        });
      }
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  /** Take care calendar jobs over as yearly tasks, one after the other. */
  private async _takeOver(indexes: number[]): Promise<void> {
    this._error = "";
    try {
      for (const index of indexes) {
        this._taking = index;
        const info = await calendarTask(this.hass, this.plantId, index);
        const research = this.store.research;
        if (research) {
          const known = research.plants[this.plantId];
          this.store.setResearch({
            ...research,
            plants: { ...research.plants, [this.plantId]: { ...info, cost: known?.cost ?? null } },
          });
        }
      }
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._taking = null;
    }
  }

  private async _delete(): Promise<void> {
    const confirm = this.renderRoot.querySelector<PgConfirmDialog>("pg-confirm-dialog");
    const plant = this.store.getPlant(this.plantId);
    if (!confirm || !plant) return;
    const ok = await confirm.ask(
      this.t("knowledge.delete_title"),
      this.t("knowledge.delete_body", { name: plant.name }),
      this.t("common.delete"),
    );
    if (!ok) return;
    try {
      await deleteKnowledge(this.hass, this.plantId);
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  protected override render() {
    const { t } = this;
    const research = this.store?.research;
    const info = research?.plants[this.plantId];
    const running = this._busy || research?.running === this.plantId;
    return html`
      <div class="header">
        <h3>${icon(mdiBookOpenPageVariantOutline)} ${t("knowledge.title")}</h3>
        ${
          info && !running
            ? html`<button class="button text danger" @click=${this._delete}>
                ${icon(mdiDeleteOutline)} ${t("knowledge.delete")}
              </button>`
            : nothing
        }
      </div>
      ${
        running
          ? html`<p class="muted" role="status">${t("knowledge.researching")}</p>`
          : info
            ? this._renderKnowledge(info)
            : this._renderEmpty()
      }
      ${this._error ? html`<p class="error-text small" role="alert">${this._error}</p>` : nothing}
      <pg-confirm-dialog .hass=${this.hass}></pg-confirm-dialog>
    `;
  }

  private _renderEmpty() {
    const { t, language } = this;
    const research = this.store?.research;
    if (!research) return nothing;
    if (!research.available) return html`<p class="muted small">${t("research.no_provider")}</p>`;
    const failed = research.failed[this.plantId];
    const position = research.queue.indexOf(this.plantId);
    return html`
      <p class="muted">${t("knowledge.empty")}</p>
      ${
        failed
          ? html`<p class="error-text small">${t("knowledge.failed", { error: failed.error })}</p>`
          : nothing
      }
      <p class="muted small">
        ${
          research.schedule === "off"
            ? t("knowledge.schedule_off")
            : position >= 0 && research.next_run
              ? t("knowledge.queued", {
                  position: position + 1,
                  time: formatDateTime(research.next_run, language),
                })
              : nothing
        }
        ${
          research.estimate !== null
            ? t("research.cost", {
                cost: formatMoney(research.estimate, research.currency, language),
              })
            : nothing
        }
      </p>
      <div class="actions">
        <button class="button" ?disabled=${research.running !== null} @click=${this._research}>
          ${icon(mdiBookOpenPageVariantOutline)} ${t("knowledge.research")}
        </button>
      </div>
    `;
  }

  private _renderKnowledge(info: PlantKnowledge) {
    const { t, language } = this;
    const months = monthNames(language);
    return html`
      ${info.summary ? html`<p class="summary">${info.summary}</p>` : nothing}
      ${
        info.warnings.length
          ? html`<ul class="warnings">
              ${info.warnings.map((warning) => html`<li>${icon(mdiAlertOutline)} ${warning}</li>`)}
            </ul>`
          : nothing
      }
      ${info.sections.map(
        (section) =>
          html`<details
            class="topic"
            ?open=${section.topic === "watering" || section.topic === "pruning"}
          >
            <summary>${t(`knowledge.topic_${section.topic}`)}</summary>
            <div class="text">${renderMarkdown(section.text)}</div>
          </details>`,
      )}
      ${
        info.calendar.length
          ? html`<h4>${t("knowledge.calendar")}</h4>
              <ul class="calendar">
                ${info.calendar.map(
                  (item, index) =>
                    html`<li>
                      <span class="months"
                        >${item.months.map((m) => months[m - 1]).join(", ")}</span
                      >
                      <span>${item.task}</span>
                      ${
                        item.task_id
                          ? html`<span class="muted small taken"
                              >${icon(mdiCheck)} ${t("knowledge.task_taken")}</span
                            >`
                          : html`<button
                              class="button text small"
                              ?disabled=${this._taking !== null}
                              @click=${() => void this._takeOver([index])}
                            >
                              ${icon(mdiPlus)} ${t("knowledge.task_take")}
                            </button>`
                      }
                    </li>`,
                )}
              </ul>
              ${
                info.calendar.filter((item) => !item.task_id).length > 1
                  ? html`<div class="actions">
                      <button
                        class="button secondary"
                        ?disabled=${this._taking !== null}
                        @click=${() =>
                          void this._takeOver(
                            info.calendar.flatMap((item, i) => (item.task_id ? [] : [i])),
                          )}
                      >
                        ${icon(mdiCalendarCheckOutline)} ${t("knowledge.tasks_take_all")}
                      </button>
                    </div>`
                  : nothing
              }`
          : nothing
      }
      ${
        info.sources.length
          ? html`<h4>${t("knowledge.sources")}</h4>
              <ul class="sources">
                ${info.sources.map(
                  (source) =>
                    html`<li>
                      <a href=${source.url} target="_blank" rel="noopener noreferrer">
                        ${source.title} ${icon(mdiOpenInNew)}
                      </a>
                    </li>`,
                )}
              </ul>`
          : nothing
      }
      <p class="muted small meta">
        ${t(`knowledge.method_${info.method}`)} ·
        ${t("knowledge.researched", { time: formatDateTime(info.researched_at, language) })} ·
        ${info.model}
        ${info.cost !== null ? html` · ${formatMoney(info.cost, this.store.research?.currency ?? "USD", language)}` : nothing}
      </p>
    `;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: grid;
        gap: 8px;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      h3 {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0;
      }
      h3 .icon {
        width: 20px;
        height: 20px;
        color: var(--pg-accent);
      }
      h4 {
        margin: 8px 0 2px;
        font-size: 14px;
      }
      p {
        margin: 0;
      }
      .summary {
        font-size: 15px;
      }
      .warnings,
      .calendar,
      .sources {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 4px;
      }
      .warnings li {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--warning-color, #ffa600) 14%, transparent);
      }
      .warnings .icon {
        flex: none;
        width: 18px;
        height: 18px;
        color: var(--warning-color, #b07000);
      }
      .topic {
        border-top: 1px solid var(--pg-divider);
        padding: 6px 0;
      }
      .topic summary {
        cursor: pointer;
        font-weight: 500;
      }
      .topic .text {
        margin-top: 4px;
      }
      .calendar li {
        display: grid;
        grid-template-columns: minmax(90px, auto) 1fr auto;
        align-items: center;
        gap: 10px;
      }
      .calendar .taken {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .calendar .icon,
      .actions .icon {
        width: 16px;
        height: 16px;
      }
      .calendar .months {
        color: var(--pg-accent);
        font-weight: 500;
      }
      .sources a {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--pg-accent);
        text-decoration: none;
        overflow-wrap: anywhere;
      }
      .sources .icon {
        width: 14px;
        height: 14px;
        flex: none;
      }
      .actions {
        display: flex;
        gap: 8px;
      }
      .meta {
        margin-top: 4px;
      }
    `,
  ];
}

define("pg-knowledge-panel", PgKnowledgePanel);
