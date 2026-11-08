import { mdiAlertCircleOutline } from "@mdi/js";
import { css, html, nothing } from "lit";

import { errorMessage, listProblems } from "../api/client";
import type { GardenChangeEvent, Problem } from "../api/types";
import { PgElement, define, icon } from "../components/base";
import "../components/task-list";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatDate } from "../util/format";

/** All garden tasks and the open problems of every plant. */
export class PgTasksView extends PgElement {
  static override properties = {
    store: { attribute: false },
    prefix: { attribute: false },
    _problems: { state: true },
    _error: { state: true },
  };

  declare store: GardenStore;
  declare prefix: string;
  declare _problems: Problem[];
  declare _error: string;

  private readonly _onChange = (event: Event) => {
    const change = (event as CustomEvent<GardenChangeEvent>).detail;
    if (change.kind === "care" || change.kind === "plant_removed") void this._load();
  };

  constructor() {
    super();
    this.prefix = "/plant-garden";
    this._problems = [];
    this._error = "";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.store?.addEventListener("plant-changed", this._onChange);
    void this._load();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.store?.removeEventListener("plant-changed", this._onChange);
  }

  private async _load(): Promise<void> {
    try {
      this._problems = await listProblems(this.hass, { activeOnly: true });
      this._error = "";
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  protected override render() {
    const { t, language } = this;
    return html`
      <section class="card block">
        <pg-task-list .hass=${this.hass} .store=${this.store} .prefix=${this.prefix}></pg-task-list>
      </section>
      <section class="card block">
        <h3>${t("problems.open_title")}</h3>
        ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
        ${
          this._problems.length
            ? html`<ul>
                ${this._problems.map((p) => {
                  const plant = this.store?.getPlant(p.plant_id);
                  return html`<li>
                    ${icon(mdiAlertCircleOutline)}
                    <a href=${`${this.prefix}/plants/${p.plant_id}`}>
                      <strong>${plant?.name ?? ""}</strong>: ${p.title}
                    </a>
                    <span class="muted small">
                      ${t(`problem_status.${p.status}`)} ·
                      ${t("problems.since", { date: formatDate(p.observed_on, language) })}
                    </span>
                    ${
                      p.diagnosis
                        ? html`<span class="small diagnosis">${p.diagnosis.summary}</span>`
                        : nothing
                    }
                  </li>`;
                })}
              </ul>`
            : html`<p class="muted small">${t("problems.none_open")}</p>`
        }
      </section>
    `;
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
      h3 {
        margin: 0 0 8px;
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 8px;
      }
      li {
        display: grid;
        grid-template-columns: auto 1fr;
        column-gap: 8px;
      }
      li > .icon {
        color: var(--error-color, #db4437);
        grid-row: span 3;
      }
      a {
        color: inherit;
      }
      .small {
        font-size: 13px;
      }
    `,
  ];
}

define("pg-tasks-view", PgTasksView);
