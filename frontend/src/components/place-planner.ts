import { mdiAlertOutline, mdiCheck, mdiCreationOutline } from "@mdi/js";
import { css, html, nothing } from "lit";

import { acceptPlan, errorMessage, planPlace } from "../api/client";
import type { PlacePlan, PlanSuggestion, Point } from "../api/types";
import { shared } from "../styles/shared";
import { formatLength, formatNumber } from "../util/format";
import { PgElement, define, icon } from "./base";

/**
 * "What fits here?": asks the AI for plants that suit a place on the plan (its
 * sun, soil, room and neighbours) and takes one over as a planned plant.
 * Nothing is asked before the user presses the button. Fires "plant-planned"
 * {plantId} after taking a suggestion over.
 */
export class PgPlacePlanner extends PgElement {
  static override properties = {
    _at: { state: true },
    _wish: { state: true },
    _plan: { state: true },
    _busy: { state: true },
    _error: { state: true },
    _taken: { state: true },
  };

  declare _at: Point | null;
  declare _wish: string;
  declare _plan: PlacePlan | null;
  declare _busy: boolean;
  declare _error: string;
  /** suggestion id -> the plant it became */
  declare _taken: Record<string, string>;

  constructor() {
    super();
    this._at = null;
    this._wish = "";
    this._plan = null;
    this._busy = false;
    this._error = "";
    this._taken = {};
  }

  open(at: Point): void {
    this._at = at;
    this._plan = null;
    this._error = "";
    this._taken = {};
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector("dialog")?.showModal();
      this.renderRoot.querySelector("input")?.focus();
    });
  }

  close(): void {
    this.renderRoot.querySelector("dialog")?.close();
    this._at = null;
  }

  private async _ask(event: Event): Promise<void> {
    event.preventDefault();
    if (!this._at || this._busy) return;
    this._busy = true;
    this._error = "";
    try {
      this._plan = await planPlace(this.hass, this._at, this._wish.trim() || null);
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  private async _take(suggestion: PlanSuggestion): Promise<void> {
    if (!this._plan || this._busy) return;
    this._busy = true;
    this._error = "";
    try {
      const result = await acceptPlan(this.hass, this._plan.id, suggestion.id);
      this._taken = { ...this._taken, [suggestion.id]: result.plant_id };
      this.fire("plant-planned", { plantId: result.plant_id });
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  private _months(months: number[]): string {
    const name = new Intl.DateTimeFormat(this.language, { month: "short" });
    return months.map((month) => name.format(new Date(2024, month - 1, 15))).join(", ");
  }

  private _renderSite(plan: PlacePlan) {
    const { t, language } = this;
    const site = plan.site;
    const facts = [
      t("planner.sun", {
        hours: formatNumber(site.sun_hours_season, language, 1),
        light: t(`light.${site.light}`),
      }),
      site.soil ? t(`soil.${site.soil}` as "soil.loam") : "",
      t("planner.room", { radius: formatNumber(site.free_radius_m, language, 1) }),
      site.irrigated ? t("planner.irrigated") : "",
      site.under_a_roof ? t("balance.sheltered") : "",
    ].filter(Boolean);
    return html`<p class="site muted small">${facts.join(" · ")}</p>
      ${plan.note ? html`<p class="note">${plan.note}</p>` : nothing}`;
  }

  private _renderSuggestion(suggestion: PlanSuggestion) {
    const { t, language } = this;
    const taken = this._taken[suggestion.id];
    const size = [
      suggestion.height_cm
        ? `${t("field.height")} ${formatLength(suggestion.height_cm, language)}`
        : "",
      suggestion.width_cm
        ? `${t("field.width")} ${formatLength(suggestion.width_cm, language)}`
        : "",
      suggestion.light ? t(`light.${suggestion.light}`) : "",
      suggestion.water_need ? t(`water.${suggestion.water_need}`) : "",
      suggestion.planting_months.length
        ? t("planner.plant_in", { months: this._months(suggestion.planting_months) })
        : "",
    ].filter(Boolean);
    return html`<li class="suggestion">
      <div class="head">
        <div>
          <strong>${suggestion.name}</strong>
          ${suggestion.scientific_name ? html`<em>${suggestion.scientific_name}</em>` : nothing}
        </div>
        ${
          taken
            ? html`<span class="taken">${icon(mdiCheck)} ${t("planner.taken")}</span>`
            : html`<button
                class="button secondary"
                ?disabled=${this._busy}
                @click=${() => this._take(suggestion)}
              >
                ${t("planner.take")}
              </button>`
        }
      </div>
      ${suggestion.reason ? html`<p>${suggestion.reason}</p>` : nothing}
      ${size.length ? html`<p class="muted small">${size.join(" · ")}</p>` : nothing}
      ${suggestion.neighbours ? html`<p class="small">${suggestion.neighbours}</p>` : nothing}
      ${
        suggestion.caution
          ? html`<p class="small caution">${icon(mdiAlertOutline)} ${suggestion.caution}</p>`
          : nothing
      }
    </li>`;
  }

  protected override render() {
    const { t } = this;
    const plan = this._plan;
    return html`<dialog @cancel=${() => (this._at = null)} aria-labelledby="title">
      <div class="dialog-header"><h2 id="title">${t("planner.title")}</h2></div>
      <div class="dialog-body">
        <form @submit=${this._ask}>
          <label class="field">
            <span>${t("planner.wish")}</span>
            <input
              maxlength="300"
              placeholder=${t("planner.wish_placeholder")}
              .value=${this._wish}
              @input=${(e: Event) => (this._wish = (e.target as HTMLInputElement).value)}
            />
          </label>
          <button type="submit" class="button" ?disabled=${this._busy}>
            ${icon(mdiCreationOutline)}
            ${t(this._busy && !plan ? "planner.asking" : plan ? "planner.again" : "planner.ask")}
          </button>
        </form>
        <p class="muted small">${t("planner.hint")}</p>
        ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
        ${
          plan
            ? html`${this._renderSite(plan)}
              ${
                plan.suggestions.length
                  ? html`<ul class="suggestions">
                      ${plan.suggestions.map((s) => this._renderSuggestion(s))}
                    </ul>`
                  : html`<p class="muted">${t("planner.none")}</p>`
              }`
            : nothing
        }
      </div>
      <div class="dialog-actions">
        <button type="button" class="button text" @click=${() => this.close()}>
          ${t("common.close")}
        </button>
      </div>
    </dialog>`;
  }

  static override styles = [
    shared,
    css`
      dialog {
        width: min(560px, calc(100vw - 24px));
      }
      form {
        display: grid;
        gap: 8px;
        justify-items: start;
      }
      form .field {
        width: 100%;
      }
      .note {
        margin: 8px 0;
      }
      .suggestions {
        list-style: none;
        margin: 8px 0 0;
        padding: 0;
        display: grid;
        gap: 4px;
      }
      .suggestion {
        padding: 10px 0;
        border-top: 1px solid var(--pg-divider);
      }
      .suggestion p {
        margin: 4px 0 0;
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .head em {
        display: block;
        color: var(--pg-muted);
        font-size: 13px;
      }
      .taken {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--pg-accent);
        white-space: nowrap;
      }
      .caution {
        color: var(--pg-thirsty, #b86a10);
      }
    `,
  ];
}

define("pg-place-planner", PgPlacePlanner);
