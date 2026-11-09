import {
  mdiAlertCircleOutline,
  mdiOpenInNew,
  mdiRefresh,
  mdiSnowflake,
  mdiSprout,
  mdiWater,
} from "@mdi/js";
import { css, html, nothing, svg } from "lit";

import { errorMessage, refreshWater } from "../api/client";
import type { Plant, PlantBalance, WeatherDay } from "../api/types";
import { PgElement, define, icon } from "../components/base";
import { plantPath } from "../components/plant-card";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import {
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatNumber,
  formatWeekday,
} from "../util/format";
import { navigate } from "../util/navigate";
import {
  cloudLayout,
  deficitColor,
  deficitFraction,
  nextWatering,
  wateringDays,
  weatherChart,
} from "../util/water";

const CHART_W = 600;
const CHART_H = 120;
/** The chart shows this many days before today and after it. */
const PAST_DAYS = 7;
const FUTURE_DAYS = 7;
/** How far a puff of the cloud reaches around a plant (plant radius 1). */
const PUFF = 1.55;

/** The days the chart shows: a week back, today and the forecast week. */
export function chartDays(days: WeatherDay[]): WeatherDay[] {
  return [
    ...days.filter((day) => !day.forecast).slice(-(PAST_DAYS + 1)),
    ...days.filter((day) => day.forecast).slice(0, FUTURE_DAYS),
  ];
}

/** Weather, soil water of every plant and what the zones should do (spec 8.2). */
export class PgWaterView extends PgElement {
  static override properties = {
    store: { attribute: false },
    prefix: {},
    _busy: { state: true },
    _error: { state: true },
  };

  declare store: GardenStore;
  declare prefix: string;
  declare _busy: boolean;
  declare _error: string;

  private readonly _onStoreChange = () => this.requestUpdate();

  constructor() {
    super();
    this.prefix = "/plant-garden";
    this._busy = false;
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

  private async _refresh(): Promise<void> {
    this._busy = true;
    try {
      this.store.setWater(await refreshWater(this.hass));
      this._error = "";
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  protected override render() {
    const { t } = this;
    const water = this.store?.water;
    if (!water?.configured) {
      return html`<section class="card state">
        ${icon(mdiWater)}
        <h2>${t("weather.setup_title")}</h2>
        <p class="muted">${t("weather.setup_body")}</p>
        <a class="button" href="/config/integrations/integration/plant_garden">
          ${icon(mdiOpenInNew)} ${t("weather.setup_action")}
        </a>
      </section>`;
    }
    return html`
      ${this._renderWeather(water.weather)} ${this._renderPlants()} ${this._renderZones()}
      <section class="card block sources">
        <div class="block-header">
          <h3>${t("weather.sources")}</h3>
          <button class="button text" ?disabled=${this._busy} @click=${this._refresh}>
            ${icon(mdiRefresh)} ${t("weather.refresh")}
          </button>
        </div>
        <ul>
          ${water.sources.map(
            (source) =>
              html`<li class=${source.ok ? "" : "error-text"}>
                ${source.ok ? nothing : icon(mdiAlertCircleOutline)}
                <strong>${source.title}</strong>
                ${
                  source.ok
                    ? t("weather.source_days", { days: source.days })
                    : (source.error ?? t("weather.source_failed"))
                }
              </li>`,
          )}
        </ul>
        ${
          water.updated
            ? html`<p class="muted small">
                ${t("weather.updated", { time: formatDateTime(water.updated, this.language) })}
              </p>`
            : nothing
        }
        ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
      </section>
    `;
  }

  private _renderWeather(all: WeatherDay[]) {
    const { t, language } = this;
    if (!all.length) {
      return html`<section class="card block">
        <p class="muted">${t("weather.no_data")}</p>
      </section>`;
    }
    const days = chartDays(all);
    const chart = weatherChart(days, CHART_W, CHART_H);
    const today = days.filter((day) => !day.forecast).at(-1);
    const tomorrow = days.find((day) => day.forecast);
    const due = wateringDays(this.store.water?.plants ?? {});
    const columns = `grid-template-columns: repeat(${days.length}, minmax(0, 1fr))`;
    const todayIndex = today ? days.indexOf(today) : -1;
    const slot = CHART_W / days.length;
    // one scale for all clouds: the largest, at least three plants big
    const largest = Math.max(3, ...days.map((day) => due.get(day.day)?.length ?? 0));
    const cloudSize = cloudLayout(largest).radius + PUFF - 1;
    return html`<section class="card block">
      <h3>${t("weather.title")}</h3>
      <p class="today">
        ${
          today
            ? t("weather.today", {
                rain: formatNumber(today.precip_mm ?? 0, language, 1),
                et0: formatNumber(today.et0_mm ?? 0, language, 1),
              })
            : nothing
        }
        ${
          tomorrow
            ? html` ·
              ${t("weather.tomorrow", {
                rain: formatNumber(tomorrow.precip_mm ?? 0, language, 1),
              })}`
            : nothing
        }
      </p>
      <svg class="defs" aria-hidden="true">
        <clipPath id="pg-dot-clip" clipPathUnits="objectBoundingBox">
          <circle cx="0.5" cy="0.5" r="0.5"></circle>
        </clipPath>
      </svg>
      <div class="timeline">
        <div class="clouds" style=${columns}>
          ${days.map((day) => this._renderCloud(day.day, due.get(day.day) ?? [], cloudSize))}
        </div>
        <svg
          class="chart"
          viewBox="0 0 ${CHART_W} ${CHART_H}"
          preserveAspectRatio="none"
          role="img"
          aria-label=${t("weather.chart")}
        >
          ${
            chart.forecastX !== null
              ? svg`<rect class="forecast" x=${chart.forecastX} y="0"
                  width=${CHART_W - chart.forecastX} height=${CHART_H}></rect>`
              : nothing
          }
          ${
            todayIndex >= 0
              ? svg`<rect class="today" x=${todayIndex * slot} y="0" width=${slot} height=${CHART_H}></rect>`
              : nothing
          }
          ${chart.rain.map(
            (bar) => svg`<rect class="rain" x=${bar.x} y=${bar.y} width=${bar.w} height=${bar.h}>
              <title>${formatDate(bar.day.day, language)}: ${formatNumber(bar.day.precip_mm ?? 0, language, 1)} mm</title>
            </rect>`,
          )}
          ${chart.et0 ? svg`<path class="et0" d=${chart.et0}></path>` : nothing}
        </svg>
        <div class="axis" style=${columns}>
          ${days.map(
            (day) =>
              html`<span class="tick ${day === today ? "today" : ""}">
                <span class="weekday">${formatWeekday(day.day, language)}</span>
                <span class="date">${formatDayMonth(day.day, language)}</span>
              </span>`,
          )}
        </div>
      </div>
      <p class="legend small">
        <span class="key rain"></span>${t("weather.legend_rain")}
        <span class="key et0"></span>${t("weather.legend_et0")}
        <span class="key forecast"></span>${t("weather.legend_forecast")}
        <span class="key dot"></span>${t("weather.legend_water")}
        <span class="muted">· ${t("weather.scale", { top: chart.top })}</span>
      </p>
      <p class="muted small">${t("weather.outlook_hint")}</p>
    </section>`;
  }

  /**
   * The plants that need water on a day, as circles grouped in a cloud. Every
   * cloud is drawn to the scale of the largest (`size`, its radius), so a plant
   * has the same size on every day; the cloud sits on the bottom of its cell.
   */
  private _renderCloud(day: string, plantIds: string[], size: number) {
    const plants = plantIds
      .map((id) => this.store.getPlant(id))
      .filter((plant): plant is Plant => plant !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!plants.length) return html`<span class="cloud"></span>`;
    const { language } = this;
    const { points, radius } = cloudLayout(plants.length);
    const r = radius + PUFF - 1;
    const box = `${-size} ${r - 2 * size} ${2 * size} ${2 * size}`;
    const label = this.t("weather.cloud", {
      day: `${formatWeekday(day, language)} ${formatDayMonth(day, language)}`,
      plants: plants.map((plant) => plant.name).join(", "),
    });
    const puffs = points.map((p) => svg`<circle cx=${p.x} cy=${p.y} r=${PUFF}></circle>`);
    return html`<span class="cloud" role="group" aria-label=${label} title=${label}>
      <svg viewBox=${box} preserveAspectRatio="xMidYMax meet">
        <g class="puffs">${puffs}</g>
        <g class="puffs fill">${puffs}</g>
        ${plants.map((plant, i) => {
          const p = points[i] ?? { x: 0, y: 0 };
          const href = plantPath(plant, this.prefix);
          return svg`<a href=${href} @click=${(e: MouseEvent) => {
            e.preventDefault();
            navigate(href);
          }}>
            <title>${plant.name}</title>
            <circle class="dot" cx=${p.x} cy=${p.y} r="1"></circle>
            ${
              plant.cover
                ? svg`<image href=${plant.cover.urls.thumb} x=${p.x - 1} y=${p.y - 1} width="2" height="2"
                    preserveAspectRatio="xMidYMid slice" clip-path="url(#pg-dot-clip)"></image>`
                : svg`<path class="sprout" d=${mdiSprout}
                    transform="translate(${p.x - 0.65} ${p.y - 0.65}) scale(${1.3 / 24})"></path>`
            }
            <circle class="dot-ring" cx=${p.x} cy=${p.y} r="1"></circle>
          </a>`;
        })}
      </svg>
    </span>`;
  }

  private _renderPlants() {
    const { t, language } = this;
    const balances = this.store.water?.plants ?? {};
    const rows = this.store.plants
      .map((plant) => [plant, balances[plant.id]] as const)
      .filter((row): row is readonly [Plant, PlantBalance] => row[1] !== undefined)
      .sort((a, b) => deficitFraction(b[1]) - deficitFraction(a[1]));
    if (!rows.length) return nothing;
    return html`<section class="card block">
      <h3>${t("balance.title")}</h3>
      <p class="muted small">${t("balance.explain")}</p>
      <ul class="plants">
        ${rows.map(([plant, balance]) => {
          const fraction = deficitFraction(balance);
          const threshold = balance.taw > 0 ? balance.raw / balance.taw : 0.5;
          return html`<li>
            <a
              href=${plantPath(plant, this.prefix)}
              @click=${(e: MouseEvent) => {
                e.preventDefault();
                navigate(plantPath(plant, this.prefix));
              }}
              >${plant.name}</a
            >
            <div
              class="meter"
              role="meter"
              aria-valuemin="0"
              aria-valuemax=${balance.taw}
              aria-valuenow=${balance.depletion}
              aria-label=${t("balance.meter", { name: plant.name })}
            >
              <span
                class="used"
                style="width: ${fraction * 100}%; background: ${deficitColor(balance)}"
              ></span>
              <span class="threshold" style="left: ${threshold * 100}%"></span>
            </div>
            <span class="numbers small">
              ${formatNumber(balance.depletion, language, 0)} /
              ${formatNumber(balance.taw, language, 0)} mm
            </span>
            <span class="badges">
              ${this._renderNext(balance)}
              ${
                balance.frost !== null
                  ? html`<span
                      class="badge frost"
                      title=${t("balance.frost", { temp: formatNumber(balance.frost, language, 0) })}
                      >${icon(mdiSnowflake)}</span
                    >`
                  : nothing
              }
            </span>
          </li>`;
        })}
      </ul>
    </section>`;
  }

  /**
   * When a plant needs water: today, not yet because rain is coming, or the next
   * day within the forecast.
   */
  private _renderNext(balance: PlantBalance) {
    const { t, language } = this;
    const next = nextWatering(balance);
    const today = balance.outlook?.[0]?.day;
    if (balance.needs_water) {
      // without an outlook (older data) the plant simply needs water
      return next === today || !balance.outlook
        ? html`<span class="badge thirsty">${t("balance.needs")}</span>`
        : html`<span class="badge rain" title=${t("balance.rain_expected_hint")}
            >${t("balance.rain_expected")}</span
          >`;
    }
    if (!next) return nothing;
    return html`<span class="next muted small">
      ${t("balance.next", {
        day: `${formatWeekday(next, language)} ${formatDayMonth(next, language)}`,
      })}
    </span>`;
  }

  private _renderZones() {
    const { t, language } = this;
    const advice = this.store.water?.zones ?? {};
    const zones = (this.store.layout?.shapes ?? []).filter((shape) => advice[shape.id]);
    if (!zones.length) return nothing;
    return html`<section class="card block">
      <h3>${t("advice.title")}</h3>
      <ul class="zones">
        ${zones.map((zone) => {
          const item = advice[zone.id];
          if (!item) return nothing;
          const text =
            item.reason === "dry"
              ? t("advice.dry", { minutes: formatNumber(item.minutes ?? 0, language, 0) })
              : t(`advice.${item.reason}`);
          return html`<li class=${item.recommended ? "recommended" : ""}>
            <strong>${zone.label ?? t("kind.zone")}</strong> ${text}
          </li>`;
        })}
      </ul>
      <p class="muted small">${t("advice.never_switches")}</p>
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
      .block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      h3 {
        margin: 0 0 8px;
      }
      .state {
        padding: 32px 24px;
        display: grid;
        justify-items: center;
        text-align: center;
        gap: 6px;
      }
      .state > .icon {
        width: 40px;
        height: 40px;
        color: var(--pg-water);
      }
      .defs {
        position: absolute;
        width: 0;
        height: 0;
      }
      .timeline {
        display: grid;
      }
      .clouds,
      .axis {
        display: grid;
      }
      .cloud {
        position: relative;
        height: 72px;
        padding: 0 2px;
      }
      .cloud svg {
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .cloud .puffs circle {
        fill: color-mix(in srgb, var(--pg-water) 14%, var(--pg-surface));
        stroke: color-mix(in srgb, var(--pg-water) 45%, transparent);
        stroke-width: 1.5px;
        vector-effect: non-scaling-stroke;
      }
      /* drawn again without an edge: only the outline of the whole cloud remains */
      .cloud .puffs.fill circle {
        stroke: none;
      }
      .cloud .dot {
        fill: var(--pg-leaf-soft, #dcedc8);
      }
      .cloud .sprout {
        fill: var(--pg-leaf, #43a047);
      }
      .cloud .dot-ring {
        fill: none;
        stroke: var(--pg-thirsty, #e08a1e);
        stroke-width: 1.5px;
        vector-effect: non-scaling-stroke;
      }
      .cloud a:hover .dot-ring,
      .cloud a:focus-visible .dot-ring {
        stroke: var(--pg-accent);
        stroke-width: 2.5px;
      }
      .chart {
        display: block;
        width: 100%;
        height: 140px;
      }
      .chart .today {
        fill: color-mix(in srgb, var(--pg-accent) 10%, transparent);
      }
      .axis {
        margin-top: 4px;
        font-size: 11px;
        line-height: 1.25;
        text-align: center;
        color: var(--pg-text-muted);
      }
      .tick {
        display: grid;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
      }
      .tick .weekday {
        font-weight: 500;
        color: var(--pg-text);
      }
      .tick.today {
        color: var(--pg-accent);
        font-weight: 600;
      }
      .tick.today .weekday {
        color: var(--pg-accent);
      }
      .chart .rain {
        fill: var(--pg-water);
      }
      .chart .et0 {
        fill: none;
        stroke: var(--pg-sun, #e08a1e);
        stroke-width: 2;
        vector-effect: non-scaling-stroke;
      }
      .chart .forecast {
        fill: color-mix(in srgb, var(--pg-text) 6%, transparent);
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 10px;
        margin: 6px 0 0;
      }
      .key {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 3px;
        margin-right: -6px;
      }
      .key.rain {
        background: var(--pg-water);
      }
      .key.et0 {
        background: var(--pg-sun, #e08a1e);
        height: 3px;
      }
      .key.forecast {
        background: color-mix(in srgb, var(--pg-text) 12%, transparent);
      }
      .key.dot {
        border-radius: 50%;
        background: var(--pg-leaf-soft, #dcedc8);
        box-shadow: inset 0 0 0 1.5px var(--pg-thirsty, #e08a1e);
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }
      /* one set of columns for all rows: the bars line up whatever stands behind them */
      .plants {
        grid-template-columns: minmax(90px, 1fr) minmax(120px, 2fr) auto auto;
        column-gap: 12px;
      }
      .plants li {
        display: grid;
        grid-column: 1 / -1;
        grid-template-columns: subgrid;
        align-items: center;
      }
      .badges {
        display: flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      }
      .plants a {
        color: inherit;
        text-decoration: none;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .meter {
        position: relative;
        height: 10px;
        border-radius: 5px;
        background: color-mix(in srgb, var(--pg-text) 10%, transparent);
        overflow: hidden;
      }
      .meter .used {
        position: absolute;
        inset: 0 auto 0 0;
        border-radius: 5px;
      }
      .meter .threshold {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2px;
        background: var(--pg-text);
        opacity: 0.5;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        padding: 1px 8px;
        border-radius: 999px;
        font-size: 12px;
      }
      .badge.thirsty {
        background: color-mix(in srgb, var(--pg-thirsty, #e08a1e) 18%, transparent);
        color: var(--pg-thirsty, #b86a10);
      }
      .badge.rain {
        background: color-mix(in srgb, var(--pg-water) 16%, transparent);
        color: color-mix(in srgb, var(--pg-water) 75%, var(--pg-text));
      }
      .badge.frost .icon {
        width: 16px;
        height: 16px;
        color: var(--pg-frost, #6cb8f0);
      }
      .zones li.recommended {
        color: var(--pg-thirsty, #b86a10);
      }
      .sources li {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .sources li .icon {
        width: 18px;
        height: 18px;
      }
      @media (max-width: 600px) {
        .plants {
          grid-template-columns: 1fr auto auto;
        }
        .plants .meter {
          grid-column: 1 / -1;
          order: 3;
        }
        .tick .date {
          display: none;
        }
        .cloud {
          height: 44px;
        }
      }
    `,
  ];
}

define("pg-water-view", PgWaterView);
