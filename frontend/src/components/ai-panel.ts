import { mdiCheck, mdiClose, mdiCreationOutline, mdiOpenInNew } from "@mdi/js";
import { css, html, nothing } from "lit";

import {
  aiStatus,
  decideSuggestion,
  errorMessage,
  estimateIdentify,
  getIdentification,
  identifyPlant,
} from "../api/client";
import {
  ORGANS,
  type AIStatus,
  type GardenChangeEvent,
  type Identification,
  type Organ,
  type Photo,
  type Suggestion,
} from "../api/types";
import type { TranslationKey } from "../i18n/en";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatAge, formatDate, formatLength, formatMoney, formatNumber } from "../util/format";
import { PgElement, define, icon } from "./base";

const MAX_PHOTOS = 3;
const ENUMS: Record<string, string> = {
  category: "category",
  water_need: "water",
  light: "light",
};

/**
 * AI on the plant page: start an identification (1 to 3 photos, what each
 * shows), then take over or dismiss every suggestion on its own. Values the
 * user entered are never replaced; a different AI opinion is only shown.
 */
export class PgAIPanel extends PgElement {
  static override properties = {
    store: { attribute: false },
    plantId: { attribute: false },
    photos: { attribute: false },
    _status: { state: true },
    _record: { state: true },
    _chosen: { state: true },
    _estimate: { state: true },
    _busy: { state: true },
    _error: { state: true },
  };

  declare store: GardenStore;
  declare plantId: string;
  declare photos: Photo[];
  declare _status: AIStatus | null;
  declare _record: Identification | null;
  declare _chosen: Map<string, Organ>;
  declare _estimate: { cost: number | null; currency: string } | null;
  declare _busy: boolean;
  declare _error: string;

  private readonly _onChange = (event: Event) => {
    const change = (event as CustomEvent<GardenChangeEvent>).detail;
    if (change.kind === "ai" && change.plant_id === this.plantId) void this._load();
  };

  constructor() {
    super();
    this.photos = [];
    this._status = null;
    this._record = null;
    this._chosen = new Map();
    this._estimate = null;
    this._busy = false;
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
      const [status, record] = await Promise.all([
        aiStatus(this.hass),
        getIdentification(this.hass, this.plantId),
      ]);
      this._status = status;
      this._record = record;
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private async _open(): Promise<void> {
    // newest photos first, the newest one preselected
    this._chosen = new Map(this.photos.slice(0, 1).map((photo) => [photo.id, "auto"]));
    this.renderRoot.querySelector("dialog")?.showModal();
    await this._updateEstimate();
  }

  private async _updateEstimate(): Promise<void> {
    try {
      this._estimate = await estimateIdentify(this.hass, this._chosen.size);
    } catch {
      this._estimate = null;
    }
  }

  private _toggle(photo: Photo): void {
    const chosen = new Map(this._chosen);
    if (chosen.has(photo.id)) chosen.delete(photo.id);
    else if (chosen.size < MAX_PHOTOS) chosen.set(photo.id, "auto");
    this._chosen = chosen;
    void this._updateEstimate();
  }

  private async _start(): Promise<void> {
    this._busy = true;
    this._error = "";
    try {
      this._record = await identifyPlant(
        this.hass,
        this.plantId,
        [...this._chosen].map(([photo_id, organ]) => ({ photo_id, organ })),
      );
      this.renderRoot.querySelector("dialog")?.close();
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  private async _decide(suggestion: Suggestion, accept: boolean): Promise<void> {
    try {
      this._record = await decideSuggestion(this.hass, this.plantId, suggestion.key, accept);
      this._error = "";
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private _value(key: string, value: unknown): string {
    const { t, language } = this;
    if (value === null || value === undefined || value === "") return "–";
    const prefix = ENUMS[key];
    if (prefix) return t(`${prefix}.${String(value)}` as TranslationKey);
    if (key === "min_temperature_c") return `${formatNumber(Number(value), language, 0)} °C`;
    if (key === "crown_diameter_m") return `${formatNumber(Number(value), language, 1)} m`;
    if (key === "age") return formatAge(Number(value), t);
    if (key === "size" && typeof value === "object") {
      const size = value as { height_cm: number | null; width_cm: number | null };
      return [
        size.height_cm !== null
          ? `${t("field.height")} ${formatLength(size.height_cm, language)}`
          : "",
        size.width_cm !== null
          ? `${t("field.width")} ${formatLength(size.width_cm, language)}`
          : "",
      ]
        .filter(Boolean)
        .join(", ");
    }
    return String(value);
  }

  private _label(key: string): string {
    const known: Record<string, TranslationKey> = {
      scientific_name: "field.scientific_name",
      variety: "field.variety",
      family: "field.family",
      category: "field.category",
      water_need: "field.water_need",
      light: "field.light",
      min_temperature_c: "field.min_temperature_c",
      crown_diameter_m: "ai.crown",
      care_water: "field.care_water",
      care_fertilize: "field.care_fertilize",
      care_prune: "field.care_prune",
      size: "ai.size",
      age: "field.age",
    };
    return this.t(known[key] ?? "ai.size");
  }

  protected override render() {
    const { t } = this;
    const status = this._status;
    if (!status) return nothing;
    if (!status.available) {
      return html`
        <div class="block-header">
          <h3>${t("ai.title")}</h3>
          <a class="button text" href="/config/integrations/integration/plant_garden">
            ${icon(mdiOpenInNew)} ${t("ai.setup_link")}
          </a>
        </div>
        <p class="muted small">${t("ai.setup")}</p>
      `;
    }
    return html`
      <div class="block-header">
        <h3>${t("ai.title")}</h3>
        <button class="button text" ?disabled=${!this.photos.length} @click=${this._open}>
          ${icon(mdiCreationOutline)} ${t("ai.identify")}
        </button>
      </div>
      ${this.photos.length ? nothing : html`<p class="muted small">${t("ai.needs_photo")}</p>`}
      ${this._record ? this._renderResult(this._record) : nothing}
      ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
      ${this._renderDialog(status)}
    `;
  }

  private _renderResult(record: Identification) {
    const { t, language } = this;
    const result = record.result;
    const top = result?.candidates[0];
    const net = record.plantnet;
    return html`
      <p class="muted small">
        ${t("ai.from", {
          date: formatDate(record.created, language),
          model: record.provider ?? "Pl@ntNet",
        })}
      </p>
      ${
        top
          ? html`<div class="species">
              <strong>${top.scientific_name}</strong>
              ${
                (language === "de" ? top.common_name_de : top.common_name_en)
                  ? html`<span>
                      · ${language === "de" ? top.common_name_de : top.common_name_en}</span
                    >`
                  : nothing
              }
              ${this._bar(top.confidence)}
              <p class="small">${top.reason}</p>
            </div>`
          : nothing
      }
      ${
        net
          ? html`<p class="small attribution">
              ${t("ai.plantnet", {
                candidates: net.candidates
                  .slice(0, 3)
                  .map((c) => `${c.scientific_name} ${Math.round(c.score * 100)} %`)
                  .join(", "),
              })}
            </p>`
          : html`<p class="small muted">${t("ai.no_plantnet")}</p>`
      }
      ${result?.health.summary ? html`<p class="small">${result.health.summary}</p>` : nothing}
      ${
        record.suggestions.length
          ? html`<ul class="suggestions">
              ${record.suggestions.map((s) => this._renderSuggestion(s))}
            </ul>`
          : nothing
      }
      ${
        result?.questions.length
          ? html`<div class="questions">
              <strong class="small">${t("ai.questions")}</strong>
              <ul>
                ${result.questions.map((q) => html`<li class="small">${q}</li>`)}
              </ul>
            </div>`
          : nothing
      }
    `;
  }

  private _bar(confidence: number) {
    const percent = Math.round(confidence * 100);
    return html`<span
      class="bar"
      role="meter"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow=${percent}
      title=${`${percent} %`}
      ><span style="width: ${percent}%"></span
    ></span>`;
  }

  private _renderSuggestion(s: Suggestion) {
    const { t } = this;
    const value = this._value(s.key, s.value);
    return html`<li class=${s.state}>
      <span class="label">${this._label(s.key)}</span>
      <span class="value">
        ${value}
        ${
          s.state === "differs"
            ? html`<span class="muted small">
                ${t("ai.differs", { yours: this._value(s.key, s.current) })}
              </span>`
            : nothing
        }
      </span>
      ${this._bar(s.confidence)}
      <span class="actions">
        ${
          s.state === "new"
            ? html`<button
                  class="icon-button small"
                  title=${t("ai.accept")}
                  aria-label=${t("ai.accept")}
                  @click=${() => this._decide(s, true)}
                >
                  ${icon(mdiCheck)}
                </button>
                <button
                  class="icon-button small"
                  title=${t("ai.reject")}
                  aria-label=${t("ai.reject")}
                  @click=${() => this._decide(s, false)}
                >
                  ${icon(mdiClose)}
                </button>`
            : s.state === "differs"
              ? html`<button
                  class="icon-button small"
                  title=${t("ai.reject")}
                  aria-label=${t("ai.reject")}
                  @click=${() => this._decide(s, false)}
                >
                  ${icon(mdiClose)}
                </button>`
              : html`<span class="muted small">${t(`ai.state_${s.state}` as TranslationKey)}</span>`
        }
      </span>
    </li>`;
  }

  private _renderDialog(status: AIStatus) {
    const { t, language } = this;
    const estimate = this._estimate;
    return html`<dialog aria-labelledby="ai-title">
      <div class="dialog-header"><h2 id="ai-title">${t("ai.identify")}</h2></div>
      <div class="dialog-body">
        <p class="small">${t("ai.choose", { max: MAX_PHOTOS })}</p>
        <div class="photos">
          ${this.photos.map((photo) => {
            const organ = this._chosen.get(photo.id);
            return html`<div class="photo ${organ ? "chosen" : ""}">
              <button
                class="thumb"
                aria-pressed=${organ !== undefined}
                @click=${() => this._toggle(photo)}
              >
                <img src=${photo.urls.thumb} alt=${formatDate(photo.taken_at, language)} />
              </button>
              ${
                organ
                  ? html`<select
                      aria-label=${t("ai.organ")}
                      @change=${(e: Event) => {
                        const chosen = new Map(this._chosen);
                        chosen.set(photo.id, (e.target as HTMLSelectElement).value as Organ);
                        this._chosen = chosen;
                      }}
                    >
                      ${ORGANS.map(
                        (o) =>
                          html`<option value=${o} ?selected=${o === organ}>
                            ${t(`organ.${o}`)}
                          </option>`,
                      )}
                    </select>`
                  : nothing
              }
            </div>`;
          })}
        </div>
        <p class="muted small">${t("ai.tip_reference")}</p>
        ${status.plantnet ? nothing : html`<p class="muted small">${t("ai.no_plantnet")}</p>`}
        <p class="small">
          ${
            estimate?.cost === null || estimate === null
              ? t("ai.cost_unknown")
              : t("ai.cost", { cost: formatMoney(estimate.cost, estimate.currency, language) })
          }
        </p>
        ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
      </div>
      <div class="dialog-actions">
        <button
          class="button text"
          @click=${() => this.renderRoot.querySelector("dialog")?.close()}
        >
          ${t("common.cancel")}
        </button>
        <button class="button" ?disabled=${this._busy || !this._chosen.size} @click=${this._start}>
          ${this._busy ? t("ai.running") : t("ai.start")}
        </button>
      </div>
    </dialog>`;
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
      }
      h3 {
        margin: 0;
      }
      a.button {
        text-decoration: none;
      }
      .species {
        margin: 8px 0;
      }
      .species p {
        margin: 4px 0 0;
      }
      .bar {
        display: inline-block;
        width: 60px;
        height: 6px;
        border-radius: 3px;
        background: color-mix(in srgb, var(--pg-text) 12%, transparent);
        overflow: hidden;
        vertical-align: middle;
        margin: 0 6px;
      }
      .bar span {
        display: block;
        height: 100%;
        background: var(--pg-accent);
      }
      .suggestions {
        list-style: none;
        padding: 0;
        margin: 12px 0;
        display: grid;
        gap: 6px;
      }
      .suggestions li {
        display: grid;
        grid-template-columns: minmax(110px, 1fr) 2fr auto auto;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
        border-top: 1px solid var(--pg-divider);
      }
      .suggestions li.accepted,
      .suggestions li.rejected,
      .suggestions li.same {
        opacity: 0.65;
      }
      .label {
        color: var(--pg-text-muted);
        font-size: 13px;
      }
      .value {
        display: flex;
        flex-wrap: wrap;
        gap: 2px 8px;
      }
      .actions {
        display: flex;
        gap: 2px;
      }
      .attribution {
        color: var(--pg-text-muted);
      }
      .questions ul {
        margin: 4px 0 0;
        padding-left: 18px;
      }
      dialog {
        width: min(560px, calc(100vw - 24px));
      }
      .photos {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
        gap: 8px;
      }
      .photo {
        display: grid;
        gap: 4px;
      }
      .thumb {
        padding: 0;
        border: 2px solid transparent;
        border-radius: 10px;
        overflow: hidden;
        background: none;
        cursor: pointer;
        aspect-ratio: 1;
      }
      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .photo.chosen .thumb {
        border-color: var(--pg-accent);
      }
      @media (max-width: 600px) {
        .suggestions li {
          grid-template-columns: 1fr auto;
        }
      }
    `,
  ];
}

define("pg-ai-panel", PgAIPanel);
