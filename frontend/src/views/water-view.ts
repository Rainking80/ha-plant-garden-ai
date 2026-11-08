import { mdiAlertCircleOutline, mdiOpenInNew, mdiRefresh, mdiSnowflake, mdiWater } from "@mdi/js";
import { css, html, nothing, svg } from "lit";

import { errorMessage, refreshWater } from "../api/client";
import type { Plant, PlantBalance, WeatherDay } from "../api/types";
import { PgElement, define, icon } from "../components/base";
import { plantPath } from "../components/plant-card";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatDate, formatDateTime, formatNumber } from "../util/format";
import { navigate } from "../util/navigate";
import { deficitColor, deficitFraction, weatherChart } from "../util/water";

const CHART_W = 600;
const CHART_H = 120;

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

  private _renderWeather(days: WeatherDay[]) {
    const { t, language } = this;
    if (!days.length) {
      return html`<section class="card block">
        <p class="muted">${t("weather.no_data")}</p>
      </section>`;
    }
    const chart = weatherChart(days, CHART_W, CHART_H);
    const today = days.filter((day) => !day.forecast).at(-1);
    const tomorrow = days.find((day) => day.forecast);
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
        ${chart.rain.map(
          (bar) => svg`<rect class="rain" x=${bar.x} y=${bar.y} width=${bar.w} height=${bar.h}>
            <title>${formatDate(bar.day.day, language)}: ${formatNumber(bar.day.precip_mm ?? 0, language, 1)} mm</title>
          </rect>`,
        )}
        ${chart.et0 ? svg`<path class="et0" d=${chart.et0}></path>` : nothing}
      </svg>
      <p class="legend small">
        <span class="key rain"></span>${t("weather.legend_rain")}
        <span class="key et0"></span>${t("weather.legend_et0")}
        <span class="key forecast"></span>${t("weather.legend_forecast")}
        <span class="muted">· ${t("weather.scale", { top: chart.top })}</span>
      </p>
    </section>`;
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
              ${balance.needs_water ? html`<span class="badge thirsty">${t("balance.needs")}</span>` : nothing}
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
      .chart {
        display: block;
        width: 100%;
        height: 140px;
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
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }
      .plants li {
        display: grid;
        grid-template-columns: minmax(90px, 1fr) 2fr auto auto;
        align-items: center;
        gap: 10px;
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
        .plants li {
          grid-template-columns: 1fr auto;
        }
        .plants .meter {
          grid-column: 1 / -1;
          order: 3;
        }
      }
    `,
  ];
}

define("pg-water-view", PgWaterView);
