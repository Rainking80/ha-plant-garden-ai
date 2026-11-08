import { mdiClose, mdiMagnify } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import { css, html, nothing } from "lit";

import { shared } from "../styles/shared";
import { markerIcon, markerName, markerValue } from "../util/markers";
import { PgElement, define, icon } from "./base";

/** Domains that make sense on a garden plan come first. */
const PREFERRED = ["sensor", "binary_sensor", "lawn_mower", "valve", "switch", "weather"];
const LIMIT = 150;

export function rankEntities(
  states: Record<string, HassEntity>,
  query: string,
  domains?: string[],
): HassEntity[] {
  const needle = query.trim().toLocaleLowerCase();
  const rank = (state: HassEntity) => {
    const index = PREFERRED.indexOf(state.entity_id.split(".")[0] ?? "");
    return index === -1 ? PREFERRED.length : index;
  };
  return Object.values(states)
    .filter((state) => !domains || domains.includes(state.entity_id.split(".")[0] ?? ""))
    .filter(
      (state) =>
        !needle ||
        state.entity_id.toLocaleLowerCase().includes(needle) ||
        markerName(state, state.entity_id).toLocaleLowerCase().includes(needle),
    )
    .sort(
      (a, b) =>
        rank(a) - rank(b) || markerName(a, a.entity_id).localeCompare(markerName(b, b.entity_id)),
    )
    .slice(0, LIMIT);
}

/**
 * Searchable list of Home Assistant entities (own element: HA's pickers are not
 * guaranteed to be loaded in custom panels). Fires "entity-picked" {entityId}.
 */
export class PgEntityPicker extends PgElement {
  static override properties = {
    domains: { attribute: false },
    heading: {},
    _query: { state: true },
  };

  declare domains: string[] | undefined;
  declare heading: string;
  declare _query: string;

  constructor() {
    super();
    this.heading = "";
    this._query = "";
  }

  open(): void {
    this._query = "";
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector("dialog")?.showModal();
      this.renderRoot.querySelector("input")?.focus();
    });
  }

  close(): void {
    this.renderRoot.querySelector("dialog")?.close();
  }

  private _pick(entityId: string): void {
    this.close();
    this.fire("entity-picked", { entityId });
  }

  protected override render() {
    const { t } = this;
    const entities = this.hass ? rankEntities(this.hass.states, this._query, this.domains) : [];
    return html`<dialog aria-labelledby="title">
      <div class="dialog-header">
        <h2 id="title">${this.heading || t("picker.title")}</h2>
        <button class="icon-button" @click=${this.close} aria-label=${t("common.close")}>
          ${icon(mdiClose)}
        </button>
      </div>
      <div class="dialog-body">
        <label class="search">
          ${icon(mdiMagnify)}
          <span class="sr-only">${t("picker.search")}</span>
          <input
            type="search"
            placeholder=${t("picker.search")}
            .value=${this._query}
            @input=${(e: Event) => (this._query = (e.target as HTMLInputElement).value)}
          />
        </label>
        ${
          entities.length
            ? html`<ul>
                ${entities.map(
                  (state) =>
                    html`<li>
                      <button class="entity" @click=${() => this._pick(state.entity_id)}>
                        ${icon(markerIcon(state.entity_id, state))}
                        <span class="names">
                          <span class="name">${markerName(state, state.entity_id)}</span>
                          <span class="id">${state.entity_id}</span>
                        </span>
                        <span class="value">${markerValue(state, this.language, t)}</span>
                      </button>
                    </li>`,
                )}
              </ul>`
            : html`<p class="muted">${t("picker.none")}</p>`
        }
        ${entities.length === LIMIT ? html`<p class="muted small">${t("picker.more")}</p>` : nothing}
      </div>
    </dialog>`;
  }

  static override styles = [
    shared,
    css`
      dialog {
        width: min(520px, calc(100vw - 24px));
        height: min(640px, calc(100vh - 24px));
      }
      .dialog-body {
        display: flex;
        flex-direction: column;
        gap: 10px;
        height: calc(100% - 64px);
      }
      .search {
        position: relative;
      }
      .search .icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 18px;
        height: 18px;
        color: var(--pg-text-muted);
      }
      .search input {
        padding-left: 34px;
        border-radius: 999px;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        overflow: auto;
      }
      .entity {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 8px 10px;
        border: none;
        border-radius: 10px;
        background: transparent;
        color: var(--pg-text);
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .entity:hover,
      .entity:focus-visible {
        background: color-mix(in srgb, var(--pg-accent) 10%, transparent);
        outline: none;
      }
      .entity > .icon {
        color: var(--pg-water);
      }
      .names {
        display: grid;
        flex: 1;
        min-width: 0;
      }
      .name,
      .id {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .id {
        font-size: 12px;
        color: var(--pg-text-muted);
      }
      .value {
        font-size: 13px;
        color: var(--pg-text-muted);
        white-space: nowrap;
      }
      .small {
        font-size: 12px;
      }
    `,
  ];
}

define("pg-entity-picker", PgEntityPicker);
