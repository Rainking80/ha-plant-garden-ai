import { mdiClose, mdiCrosshairsGps, mdiHomeOutline } from "@mdi/js";
import { css, html, nothing } from "lit";

import type { Layout } from "../api/types";
import { shared } from "../styles/shared";
import { formatNumber } from "../util/format";
import { PLAN_EXTENT_M } from "../util/geometry";
import { parseNumber } from "../util/plant-form";
import { geoToPlan, type GeoOrigin } from "../util/wms";
import { PgElement, define, icon } from "./base";

export interface OriginChangeDetail {
  latitude: number;
  longitude: number;
  moveContent: boolean;
}

/** "48.13743, 11.57549" as copied from a map app. */
const PAIR = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** Distance as "850 m" or "20.6 km". */
export function formatDistance(metres: number, language: string): string {
  return metres < 1000
    ? `${formatNumber(metres, language, 0)} m`
    : `${formatNumber(metres / 1000, language, 1)} km`;
}

/**
 * Where the garden is: the plan measures metres from this point. Needed when
 * the garden is not at Home Assistant's home location (an allotment, say).
 * Fires "origin-change" {latitude, longitude, moveContent}.
 */
export class PgOriginDialog extends PgElement {
  static override properties = {
    origin: { attribute: false },
    _lat: { state: true },
    _lon: { state: true },
    _moveContent: { state: true },
    _error: { state: true },
  };

  declare origin: Layout["origin"];
  declare _lat: string;
  declare _lon: string;
  declare _moveContent: boolean;
  declare _error: string;
  private _center: GeoOrigin | null = null;

  constructor() {
    super();
    this.origin = null;
    this._lat = "";
    this._lon = "";
    this._moveContent = false;
    this._error = "";
  }

  /** `center` is the middle of the visible map, offered as the new location. */
  open(center: GeoOrigin | null): void {
    this._center = center;
    this._setFields(center ?? this.origin);
    this._moveContent = false;
    this._error = "";
    void this.updateComplete.then(() => this.renderRoot.querySelector("dialog")?.showModal());
  }

  close(): void {
    this.renderRoot.querySelector("dialog")?.close();
  }

  private _setFields(geo: GeoOrigin | null): void {
    this._lat = geo ? geo.latitude.toFixed(6) : "";
    this._lon = geo ? geo.longitude.toFixed(6) : "";
    this._error = "";
  }

  private get _home(): GeoOrigin | null {
    const config = this.hass?.config;
    return config ? { latitude: config.latitude, longitude: config.longitude } : null;
  }

  private _onLatInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const pair = PAIR.exec(value);
    if (pair) {
      this._lat = pair[1] ?? "";
      this._lon = pair[2] ?? "";
    } else {
      this._lat = value;
    }
    this._error = "";
  }

  private _parsed(): GeoOrigin | null {
    const latitude = parseNumber(this._lat);
    const longitude = parseNumber(this._lon);
    if (latitude === null || longitude === null) return null;
    if (Math.abs(latitude) > 85 || Math.abs(longitude) > 180) return null;
    return { latitude, longitude };
  }

  private _apply(event: Event): void {
    event.preventDefault();
    const geo = this._parsed();
    if (!geo) {
      this._error = this.t("origin.invalid");
      return;
    }
    this.close();
    this.fire<OriginChangeDetail>("origin-change", { ...geo, moveContent: this._moveContent });
  }

  protected override render() {
    const { t } = this;
    const geo = this._parsed();
    const origin = this.origin;
    const moved = geo && origin ? geoToPlan(origin, geo.latitude, geo.longitude) : null;
    const distance = moved ? Math.hypot(moved.x, moved.y) : 0;
    return html`<dialog aria-labelledby="title">
      <form @submit=${this._apply}>
        <div class="dialog-header">
          <h2 id="title">${t("origin.title")}</h2>
          <button
            type="button"
            class="icon-button"
            @click=${this.close}
            aria-label=${t("common.close")}
          >
            ${icon(mdiClose)}
          </button>
        </div>
        <div class="dialog-body">
          <p class="muted small">
            ${t("origin.intro", { extent: formatDistance(PLAN_EXTENT_M, this.language) })}
          </p>
          <div class="quick" role="group">
            ${
              this._center
                ? html`<button
                    type="button"
                    class="button secondary"
                    @click=${() => this._setFields(this._center)}
                  >
                    ${icon(mdiCrosshairsGps)} ${t("origin.use_center")}
                  </button>`
                : nothing
            }
            ${
              this._home
                ? html`<button
                    type="button"
                    class="button secondary"
                    @click=${() => this._setFields(this._home)}
                  >
                    ${icon(mdiHomeOutline)} ${t("origin.use_home")}
                  </button>`
                : nothing
            }
          </div>
          <div class="coords">
            <label class="field">
              <span>${t("origin.latitude")}</span>
              <input inputmode="decimal" .value=${this._lat} @input=${this._onLatInput} />
            </label>
            <label class="field">
              <span>${t("origin.longitude")}</span>
              <input
                inputmode="decimal"
                .value=${this._lon}
                @input=${(e: Event) => {
                  this._lon = (e.target as HTMLInputElement).value;
                  this._error = "";
                }}
              />
            </label>
          </div>
          <p class="muted small">${t("origin.paste_hint")}</p>
          <p class="muted small">
            ${
              distance >= 0.5
                ? t("origin.distance", { distance: formatDistance(distance, this.language) })
                : t("origin.same")
            }
          </p>
          <fieldset>
            <legend>${t("origin.content")}</legend>
            <label class="check">
              <input
                type="radio"
                name="content"
                .checked=${!this._moveContent}
                @change=${() => (this._moveContent = false)}
              />
              <span>${t("origin.keep")}</span>
            </label>
            <label class="check">
              <input
                type="radio"
                name="content"
                .checked=${this._moveContent}
                @change=${() => (this._moveContent = true)}
              />
              <span>${t("origin.move")}</span>
            </label>
          </fieldset>
          ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
        </div>
        <div class="dialog-actions">
          <button type="button" class="button text" @click=${this.close}>
            ${t("common.cancel")}
          </button>
          <button type="submit" class="button">${t("common.apply")}</button>
        </div>
      </form>
    </dialog>`;
  }

  static override styles = [
    shared,
    css`
      dialog {
        width: min(480px, calc(100vw - 24px));
      }
      .dialog-body {
        display: grid;
        gap: 12px;
      }
      .quick {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .quick .icon {
        width: 18px;
        height: 18px;
      }
      .coords {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      fieldset {
        border: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 6px;
      }
      legend {
        font-size: 14px;
        font-weight: 500;
        padding: 0;
        margin-bottom: 4px;
      }
      .check {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
      }
      .check input {
        width: 18px;
        min-height: 18px;
        height: 18px;
        margin: 0;
      }
      .small {
        font-size: 12px;
        margin: 0;
        line-height: 1.45;
      }
    `,
  ];
}

define("pg-origin-dialog", PgOriginDialog);
