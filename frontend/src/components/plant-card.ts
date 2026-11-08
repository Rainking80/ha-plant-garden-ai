import { mdiCameraOutline, mdiRulerSquare, mdiSprout } from "@mdi/js";
import { css, html, nothing } from "lit";

import type { Plant } from "../api/types";
import { shared } from "../styles/shared";
import { formatAge, formatLength } from "../util/format";
import { navigate } from "../util/navigate";
import { PgElement, define, icon } from "./base";

export function plantPath(plant: Pick<Plant, "id">, prefix = "/plant-garden"): string {
  return `${prefix}/plants/${plant.id}`;
}

/** One plant in the grid: cover photo, name, a few facts. Links to the detail view. */
export class PgPlantCard extends PgElement {
  static override properties = {
    plant: { attribute: false },
    prefix: {},
  };

  declare plant: Plant;
  declare prefix: string;

  constructor() {
    super();
    this.prefix = "/plant-garden";
  }

  private _open(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    navigate(plantPath(this.plant, this.prefix));
  }

  protected override render() {
    const { plant, t } = this;
    const age = formatAge(plant.age_months_now, t);
    const height = formatLength(plant.height_cm, this.language);
    const subtitle = [plant.scientific_name, plant.variety && `'${plant.variety}'`]
      .filter(Boolean)
      .join(" ");
    return html`
      <a class="card" href=${plantPath(plant, this.prefix)} @click=${this._open}>
        <div class="cover">
          ${
            plant.cover
              ? html`<img
                  src=${plant.cover.urls.thumb}
                  srcset="${plant.cover.urls.thumb} 360w, ${plant.cover.urls.medium} 1024w"
                  sizes="(max-width: 600px) 50vw, 280px"
                  alt=""
                  loading="lazy"
                  decoding="async"
                />`
              : html`<div class="placeholder">${icon(mdiSprout)}</div>`
          }
          ${
            plant.status !== "healthy"
              ? html`<span class="badge status status-${plant.status}"
                  >${t(`status.${plant.status}`)}</span
                >`
              : nothing
          }
        </div>
        <div class="body">
          <h3>${plant.name}</h3>
          ${subtitle ? html`<p class="latin">${subtitle}</p>` : nothing}
          <p class="meta">
            <span>${t(`category.${plant.category}`)}</span>
            ${age ? html`<span>${age}</span>` : nothing}
            ${height ? html`<span>${icon(mdiRulerSquare)}${height}</span>` : nothing}
            ${
              plant.photo_count
                ? html`<span
                    >${icon(mdiCameraOutline)}${t(
                      plant.photo_count === 1 ? "plants.photos_one" : "plants.photos_other",
                      { n: plant.photo_count },
                    )}</span
                  >`
                : nothing
            }
          </p>
        </div>
      </a>
    `;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: block;
      }
      a {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        color: inherit;
        text-decoration: none;
        transition:
          transform 160ms ease,
          box-shadow 160ms ease;
      }
      a:hover {
        transform: translateY(-2px);
        box-shadow:
          0 4px 16px rgba(0, 0, 0, 0.12),
          0 1px 3px rgba(0, 0, 0, 0.08);
      }
      a:focus-visible {
        outline: 2px solid var(--pg-accent);
        outline-offset: 2px;
      }
      .cover {
        position: relative;
        aspect-ratio: 4 / 3;
        background: var(--pg-leaf-soft);
      }
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .placeholder {
        display: grid;
        place-items: center;
        height: 100%;
        color: var(--pg-leaf);
      }
      .placeholder .icon {
        width: 48px;
        height: 48px;
        opacity: 0.7;
      }
      .badge {
        position: absolute;
        top: 8px;
        left: 8px;
        padding: 3px 10px;
        border-radius: 999px;
        background: var(--pg-surface);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
        font-weight: 500;
      }
      .body {
        padding: 12px 14px 14px;
        display: grid;
        gap: 2px;
      }
      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .latin {
        margin: 0;
        font-style: italic;
        font-size: 13px;
        color: var(--pg-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 12px;
        margin: 6px 0 0;
        font-size: 12px;
        color: var(--pg-text-muted);
      }
      .meta span {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }
      .meta .icon {
        width: 14px;
        height: 14px;
      }
      @media (prefers-reduced-motion: reduce) {
        a,
        a:hover {
          transition: none;
          transform: none;
        }
      }
    `,
  ];
}

define("pg-plant-card", PgPlantCard);
