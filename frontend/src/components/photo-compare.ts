import {
  mdiAlertOutline,
  mdiCompareHorizontal,
  mdiTrendingDown,
  mdiTrendingNeutral,
  mdiTrendingUp,
} from "@mdi/js";
import { css, html, nothing } from "lit";

import { comparePhoto, errorMessage, photoComparison } from "../api/client";
import type { GardenChangeEvent, Photo, PhotoComparison } from "../api/types";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatDate } from "../util/format";
import { PgElement, define, icon } from "./base";

const GROWTH_ICONS: Record<PhotoComparison["growth"], string> = {
  more: mdiTrendingUp,
  same: mdiTrendingNeutral,
  less: mdiTrendingDown,
  unclear: mdiTrendingNeutral,
};

/**
 * The newest photo of a plant compared with an earlier one by the AI: growth,
 * changes, concerns - and the problem it opened when something is wrong. Runs
 * by hand here, or after every upload with the option "compare new photos".
 */
export class PgPhotoCompare extends PgElement {
  static override properties = {
    store: { attribute: false },
    plantId: {},
    photos: { attribute: false },
    _comparison: { state: true },
    _busy: { state: true },
    _error: { state: true },
  };

  declare store: GardenStore;
  declare plantId: string;
  /** the plant's photos, newest first */
  declare photos: Photo[];
  declare _comparison: PhotoComparison | null;
  declare _busy: boolean;
  declare _error: string;

  private readonly _onChange = (event: Event) => {
    const change = (event as CustomEvent<GardenChangeEvent>).detail;
    if (change.kind === "ai" && change.plant_id === this.plantId) void this._load();
  };

  constructor() {
    super();
    this.photos = [];
    this._comparison = null;
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
      this._comparison = await photoComparison(this.hass, this.plantId);
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private async _compare(): Promise<void> {
    const newest = this.photos[0];
    if (!newest) return;
    this._busy = true;
    this._error = "";
    try {
      this._comparison = await comparePhoto(this.hass, newest.id);
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  protected override render() {
    const { t } = this;
    const comparison = this._comparison;
    // a new photo since the last comparison can be compared again
    const canCompare =
      this.photos.length >= 2 && (!comparison || comparison.photo_id !== this.photos[0]?.id);
    return html`
      <div class="header">
        <h3>${icon(mdiCompareHorizontal)} ${t("compare.title")}</h3>
        ${
          canCompare
            ? html`<button class="button text" ?disabled=${this._busy} @click=${this._compare}>
                ${this._busy ? t("compare.running") : t("compare.run")}
              </button>`
            : nothing
        }
      </div>
      ${
        comparison
          ? this._renderComparison(comparison)
          : html`<p class="muted small">
              ${this.photos.length >= 2 ? t("compare.empty") : t("compare.need_two")}
            </p>`
      }
      <p class="muted small">${t("compare.option")}</p>
      ${this._error ? html`<p class="error-text small" role="alert">${this._error}</p>` : nothing}
    `;
  }

  private _thumb(photoId: string, taken: string) {
    const photo = this.photos.find((p) => p.id === photoId);
    return html`<figure>
      ${photo ? html`<img src=${photo.urls.thumb} alt="" loading="lazy" />` : html`<span class="gone"></span>`}
      <figcaption class="small">${formatDate(taken, this.language)}</figcaption>
    </figure>`;
  }

  private _renderComparison(comparison: PhotoComparison) {
    const { t } = this;
    return html`
      <div class="photos">
        ${this._thumb(comparison.earlier_id, comparison.earlier_taken_at)}
        <span class="arrow" aria-hidden="true">→</span>
        ${this._thumb(comparison.photo_id, comparison.taken_at)}
        <span class="growth ${comparison.growth}">
          ${icon(GROWTH_ICONS[comparison.growth])} ${t(`compare.growth_${comparison.growth}`)}
        </span>
      </div>
      ${comparison.summary ? html`<p>${comparison.summary}</p>` : nothing}
      ${
        comparison.changes.length
          ? html`<ul class="changes">
              ${comparison.changes.map((change) => html`<li>${change}</li>`)}
            </ul>`
          : nothing
      }
      ${
        comparison.concerns.length
          ? html`<ul class="concerns">
              ${comparison.concerns.map(
                (concern) =>
                  html`<li class=${concern.severity}>
                    ${icon(mdiAlertOutline)} ${concern.text}
                    <span class="muted small">(${t(`compare.severity_${concern.severity}`)})</span>
                  </li>`,
              )}
            </ul>`
          : nothing
      }
      ${
        comparison.problem_id
          ? html`<p class="small problem">
              ${t("compare.problem", { title: comparison.problem_title ?? "" })}
            </p>`
          : nothing
      }
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
      p {
        margin: 0;
      }
      .photos {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
      }
      figure {
        margin: 0;
        display: grid;
        gap: 2px;
        justify-items: center;
      }
      img,
      .gone {
        width: 96px;
        height: 96px;
        object-fit: cover;
        border-radius: 10px;
        background: var(--pg-leaf-soft, #dcedc8);
      }
      .arrow {
        font-size: 20px;
        color: var(--pg-text-muted);
      }
      .growth {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 10px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--pg-accent) 12%, transparent);
        font-size: 13px;
      }
      .growth .icon {
        width: 18px;
        height: 18px;
      }
      .growth.less {
        background: color-mix(in srgb, var(--warning-color, #ffa600) 16%, transparent);
      }
      ul {
        margin: 0;
        padding-left: 20px;
      }
      .concerns {
        list-style: none;
        padding: 0;
        display: grid;
        gap: 4px;
      }
      .concerns li {
        display: flex;
        align-items: flex-start;
        gap: 6px;
      }
      .concerns .icon {
        flex: none;
        width: 18px;
        height: 18px;
        color: var(--warning-color, #b07000);
      }
      .concerns .high .icon {
        color: var(--error-color, #db4437);
      }
      .problem {
        color: var(--error-color, #db4437);
      }
    `,
  ];
}

define("pg-photo-compare", PgPhotoCompare);
