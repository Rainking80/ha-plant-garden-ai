import { mdiMagnify, mdiPlaylistPlus, mdiPlus } from "@mdi/js";
import { css, html, nothing } from "lit";

import type { Plant, PlantStatus } from "../api/types";
import { PLANT_STATUSES } from "../api/types";
import { PgElement, define, icon } from "../components/base";
import { heroIllustration, heroStyles } from "../components/hero";
import { plantPath } from "../components/plant-card";
import "../components/plant-card";
import type { PgPlantForm, PlantSavedDetail } from "../components/plant-form";
import "../components/plant-form";
import type { PgTodoImport } from "../components/todo-import";
import "../components/todo-import";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { navigate } from "../util/navigate";

type StatusFilter = "all" | PlantStatus;

export function matchesQuery(plant: Plant, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [plant.name, plant.scientific_name, plant.variety, plant.family, ...plant.tags]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase().includes(needle));
}

/** Grid of all plants with search and status filter. */
export class PgPlantsView extends PgElement {
  static override properties = {
    store: { attribute: false },
    gardenName: { attribute: false },
    prefix: {},
    _query: { state: true },
    _status: { state: true },
  };

  declare store: GardenStore;
  declare gardenName: string;
  declare prefix: string;
  declare _query: string;
  declare _status: StatusFilter;

  private readonly _onStoreChange = () => this.requestUpdate();

  constructor() {
    super();
    this.prefix = "/plant-garden";
    this.gardenName = "";
    this._query = "";
    this._status = "all";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.store?.addEventListener("change", this._onStoreChange);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.store?.removeEventListener("change", this._onStoreChange);
  }

  private _openForm(): void {
    this.renderRoot.querySelector<PgPlantForm>("pg-plant-form")?.open();
  }

  private _openImport(): void {
    this.renderRoot.querySelector<PgTodoImport>("pg-todo-import")?.open();
  }

  private _onSaved(event: CustomEvent<PlantSavedDetail>): void {
    void this.store.refresh();
    if (event.detail.created) navigate(plantPath(event.detail.plant, this.prefix));
  }

  protected override render() {
    const { t } = this;
    const plants = this.store.plants;
    const statuses = PLANT_STATUSES.filter((status) => plants.some((p) => p.status === status));
    const visible = plants.filter(
      (plant) =>
        (this._status === "all" || plant.status === this._status) &&
        matchesQuery(plant, this._query),
    );

    return html`
      ${
        plants.length
          ? html`
              <div class="filters">
                <label class="search">
                  ${icon(mdiMagnify)}
                  <span class="sr-only">${t("plants.search")}</span>
                  <input
                    type="search"
                    placeholder=${t("plants.search")}
                    .value=${this._query}
                    @input=${(e: Event) => (this._query = (e.target as HTMLInputElement).value)}
                  />
                </label>
                ${
                  statuses.length > 1
                    ? html`<div class="chips" role="group">
                        <button
                          class="chip"
                          aria-pressed=${this._status === "all"}
                          @click=${() => (this._status = "all")}
                        >
                          ${t("plants.filter_all")} · ${plants.length}
                        </button>
                        ${statuses.map(
                          (status) =>
                            html`<button
                              class="chip"
                              aria-pressed=${this._status === status}
                              @click=${() => (this._status = status)}
                            >
                              <span class="status status-${status}">${t(`status.${status}`)}</span>
                            </button>`,
                        )}
                      </div>`
                    : nothing
                }
                <button class="button text import" @click=${this._openImport}>
                  ${icon(mdiPlaylistPlus)} ${t("import.open")}
                </button>
              </div>
              ${
                visible.length
                  ? html`<div class="grid">
                      ${visible.map(
                        (plant) =>
                          html`<pg-plant-card
                            .hass=${this.hass}
                            .plant=${plant}
                            .prefix=${this.prefix}
                          ></pg-plant-card>`,
                      )}
                    </div>`
                  : html`<p class="muted empty-search">${t("plants.no_results")}</p>`
              }
            `
          : html`
              <section class="card hero welcome">
                ${heroIllustration}
                <div class="welcome-text">
                  <h2>${t("plants.empty_title", { garden: this.gardenName })}</h2>
                  <p class="muted">${t("plants.empty_body")}</p>
                  <div class="welcome-actions">
                    <button class="button" @click=${this._openForm}>
                      ${icon(mdiPlus)} ${t("plants.add")}
                    </button>
                    <button class="button secondary" @click=${this._openImport}>
                      ${icon(mdiPlaylistPlus)} ${t("import.open")}
                    </button>
                  </div>
                </div>
              </section>
            `
      }
      ${
        plants.length
          ? html`<button class="button fab" @click=${this._openForm} aria-label=${t("plants.add")}>
              ${icon(mdiPlus)} <span>${t("plants.add")}</span>
            </button>`
          : nothing
      }
      <pg-plant-form
        .hass=${this.hass}
        .origin=${this.store.layout?.origin ?? null}
        @plant-saved=${this._onSaved}
      ></pg-plant-form>
      <pg-todo-import
        .hass=${this.hass}
        .existingNames=${plants.map((plant) => plant.name)}
        @imported=${() => void this.store.refresh()}
      ></pg-todo-import>
    `;
  }

  static override styles = [
    shared,
    heroStyles,
    css`
      :host {
        display: block;
        padding-bottom: 88px;
      }
      .filters {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }
      .search {
        position: relative;
        flex: 1 1 240px;
        max-width: 420px;
      }
      .search .icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 20px;
        height: 20px;
        color: var(--pg-text-muted);
      }
      .search input {
        padding-left: 38px;
        border-radius: 999px;
        background: var(--pg-surface);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 16px;
      }
      .empty-search {
        text-align: center;
        padding: 32px 0;
      }
      .welcome {
        overflow: hidden;
      }
      .welcome svg {
        display: block;
        width: 100%;
        height: auto;
        max-height: 240px;
      }
      .welcome-text {
        padding: 8px 24px 24px;
        display: grid;
        gap: 8px;
        justify-items: start;
      }
      .welcome h2 {
        margin: 8px 0 0;
        font-size: 26px;
        font-weight: 500;
      }
      .welcome p {
        margin: 0 0 8px;
        max-width: 60ch;
        line-height: 1.5;
      }
      .welcome-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .import {
        margin-left: auto;
      }
      .fab {
        position: fixed;
        right: max(24px, env(safe-area-inset-right));
        bottom: max(24px, env(safe-area-inset-bottom));
        min-height: 56px;
        padding: 0 22px;
        border-radius: 16px;
        box-shadow:
          0 4px 12px rgba(0, 0, 0, 0.18),
          0 1px 3px rgba(0, 0, 0, 0.12);
        z-index: 2;
      }
      @media (max-width: 600px) {
        .grid {
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 12px;
        }
        .fab span {
          display: none;
        }
        .fab {
          padding: 0 16px;
        }
      }
    `,
  ];
}

define("pg-plants-view", PgPlantsView);
