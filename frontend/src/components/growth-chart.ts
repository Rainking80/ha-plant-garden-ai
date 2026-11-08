import { css, html, nothing, svg } from "lit";

import type { Measurement } from "../api/types";
import { buildChart, pathOf, PADDING, type ChartPoint } from "../util/chart";
import { formatDate, formatLength } from "../util/format";
import { PgElement, define } from "./base";

const HEIGHT = 200;

/** Height and width over time as a small line chart. */
export class PgGrowthChart extends PgElement {
  static override properties = {
    measurements: { attribute: false },
    _width: { state: true },
  };

  declare measurements: Measurement[];
  declare _width: number;
  private _observer?: ResizeObserver;

  constructor() {
    super();
    this.measurements = [];
    this._width = 600;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (typeof ResizeObserver !== "undefined") {
      this._observer = new ResizeObserver(([entry]) => {
        const width = Math.round(entry?.contentRect.width ?? 0);
        if (width > 0 && width !== this._width) this._width = width;
      });
      this._observer.observe(this);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._observer?.disconnect();
  }

  private _series(points: ChartPoint[], kind: "height" | "width", label: string) {
    if (!points.length) return nothing;
    return svg`
      <path class="line ${kind}" d=${pathOf(points)}></path>
      ${points.map(
        (p) => svg`<circle class="dot ${kind}" cx=${p.x} cy=${p.y} r="4">
          <title>${label} ${formatDate(p.date, this.language)}: ${formatLength(p.value, this.language)}</title>
        </circle>`,
      )}
    `;
  }

  protected override render() {
    const { t, language } = this;
    const model = buildChart(this.measurements, this._width, HEIGHT);
    const right = this._width - PADDING.right;
    const bottom = HEIGHT - PADDING.bottom + 18;
    return html`
      <svg
        viewBox="0 0 ${this._width} ${HEIGHT}"
        width=${this._width}
        height=${HEIGHT}
        role="img"
        aria-label=${t("chart.label")}
      >
        ${model.ticks.map(
          (tick) => svg`
            <line class="grid" x1=${PADDING.left} x2=${right} y1=${tick.y} y2=${tick.y}></line>
            <text class="tick" x=${PADDING.left - 8} y=${tick.y + 4} text-anchor="end">
              ${formatLength(tick.value, language)}
            </text>`,
        )}
        ${
          model.first
            ? svg`<text class="tick" x=${PADDING.left} y=${bottom}>${formatDate(model.first, language)}</text>`
            : nothing
        }
        ${
          model.last
            ? svg`<text class="tick" x=${right} y=${bottom} text-anchor="end">${formatDate(model.last, language)}</text>`
            : nothing
        }
        ${this._series(model.width, "width", t("field.width"))}
        ${this._series(model.height, "height", t("field.height"))}
      </svg>
      <div class="legend">
        <span class="key height">${t("field.height")}</span>
        <span class="key width">${t("field.width")}</span>
      </div>
    `;
  }

  static override styles = css`
    :host {
      display: block;
      min-width: 0;
    }
    svg {
      display: block;
      max-width: 100%;
      overflow: visible;
    }
    .grid {
      stroke: var(--pg-divider);
      stroke-width: 1;
    }
    .tick {
      fill: var(--pg-text-muted);
      font-size: 11px;
    }
    .line {
      fill: none;
      stroke-width: 2.5;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .line.height {
      stroke: var(--pg-leaf);
    }
    .line.width {
      stroke: var(--pg-soil);
      stroke-dasharray: 6 4;
    }
    .dot {
      stroke: var(--pg-surface);
      stroke-width: 2;
    }
    .dot.height {
      fill: var(--pg-leaf);
    }
    .dot.width {
      fill: var(--pg-soil);
    }
    .legend {
      display: flex;
      gap: 16px;
      margin-top: 4px;
      font-size: 12px;
      color: var(--pg-text-muted);
    }
    .key::before {
      content: "";
      display: inline-block;
      width: 14px;
      height: 3px;
      margin-right: 6px;
      vertical-align: middle;
      border-radius: 2px;
    }
    .key.height::before {
      background: var(--pg-leaf);
    }
    .key.width::before {
      background: var(--pg-soil);
    }
  `;
}

define("pg-growth-chart", PgGrowthChart);
