import { mdiBookOpenPageVariantOutline } from "@mdi/js";
import { css, html, nothing } from "lit";

import { errorMessage, researchPlant } from "../api/client";
import type { Plant } from "../api/types";
import "../components/assistant-panel";
import { PgElement, define, icon } from "../components/base";
import { plantPath } from "../components/plant-card";
import "../components/research-schedule";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatDate } from "../util/format";
import { navigate } from "../util/navigate";

/** How many plants still without knowledge the list shows. */
const QUEUE_SHOWN = 8;

/**
 * The garden assistant: chat about the whole garden, garden tips, open
 * questions - and the knowledge it collects about the plants.
 */
export class PgAssistantView extends PgElement {
  static override properties = {
    store: { attribute: false },
    prefix: { attribute: false },
    _busy: { state: true },
    _error: { state: true },
  };

  declare store: GardenStore;
  declare prefix: string;
  declare _busy: string | null;
  declare _error: string;

  private readonly _onStoreChange = () => this.requestUpdate();

  constructor() {
    super();
    this._busy = null;
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

  private async _research(plantId: string): Promise<void> {
    this._busy = plantId;
    this._error = "";
    try {
      await researchPlant(this.hass, plantId);
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = null;
    }
  }

  private _link(plant: Plant) {
    const path = plantPath(plant, this.prefix);
    return html`<a
      href=${path}
      @click=${(e: MouseEvent) => {
        e.preventDefault();
        navigate(path);
      }}
      >${plant.name}</a
    >`;
  }

  protected override render() {
    return html`<section class="card block">
        <pg-assistant-panel
          .hass=${this.hass}
          .store=${this.store}
          .plantId=${null}
          .prefix=${this.prefix}
        ></pg-assistant-panel>
      </section>
      ${this._renderKnowledge()}`;
  }

  private _renderKnowledge() {
    const { t, language } = this;
    const research = this.store?.research;
    if (!research) return nothing;
    const plants = (ids: string[]) =>
      ids.map((id) => this.store.getPlant(id)).filter((plant): plant is Plant => !!plant);
    const known = plants(Object.keys(research.plants)).sort((a, b) => a.name.localeCompare(b.name));
    const queue = plants(research.queue);
    const running = research.running ? this.store.getPlant(research.running) : undefined;
    return html`<section class="card block knowledge">
      <h3>${icon(mdiBookOpenPageVariantOutline)} ${t("research.title")}</h3>
      <p class="muted">${t("research.intro")}</p>
      <pg-research-schedule .hass=${this.hass} .store=${this.store}></pg-research-schedule>
      ${
        running
          ? html`<p class="small" role="status">
              ${t("research.running", { name: running.name })}
            </p>`
          : nothing
      }
      ${this._error ? html`<p class="error-text small" role="alert">${this._error}</p>` : nothing}
      ${
        known.length
          ? html`<h4>${t("research.collected", { count: known.length })}</h4>
              <ul class="known">
                ${known.map((plant) => {
                  const info = research.plants[plant.id];
                  return html`<li>
                    <div class="line">
                      ${this._link(plant)}
                      <span class="muted small"
                        >${info ? formatDate(info.researched_at, language) : ""}</span
                      >
                    </div>
                    ${info?.summary ? html`<p class="small">${info.summary}</p>` : nothing}
                    ${
                      info?.warnings.length
                        ? html`<p class="small warning">${info.warnings.join(" · ")}</p>`
                        : nothing
                    }
                  </li>`;
                })}
              </ul>`
          : nothing
      }
      ${
        queue.length && research.available
          ? html`<h4>${t("research.queue", { count: queue.length })}</h4>
              <ul class="queue">
                ${queue.slice(0, QUEUE_SHOWN).map(
                  (plant) =>
                    html`<li>
                      ${this._link(plant)}
                      <button
                        class="button text"
                        ?disabled=${research.running !== null || this._busy !== null}
                        @click=${() => void this._research(plant.id)}
                      >
                        ${this._busy === plant.id ? t("knowledge.researching") : t("research.now")}
                      </button>
                    </li>`,
                )}
              </ul>
              ${
                queue.length > QUEUE_SHOWN
                  ? html`<p class="muted small">
                      ${t("research.more", { count: queue.length - QUEUE_SHOWN })}
                    </p>`
                  : nothing
              }`
          : nothing
      }
    </section>`;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: grid;
        gap: 16px;
      }
      .block {
        padding: 16px;
      }
      .knowledge {
        display: grid;
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
        margin: 8px 0 0;
      }
      p {
        margin: 0;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }
      .known li {
        border-top: 1px solid var(--pg-divider);
        padding-top: 6px;
      }
      .line,
      .queue li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      a {
        color: inherit;
        font-weight: 500;
        text-decoration: none;
      }
      .warning {
        color: var(--warning-color, #b07000);
      }
    `,
  ];
}

define("pg-assistant-view", PgAssistantView);
