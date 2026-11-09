import {
  mdiMushroomOutline,
  mdiSnail,
  mdiSnowflake,
  mdiThermometerHigh,
  mdiWeatherPouring,
  mdiWeatherWindy,
} from "@mdi/js";
import { css, html, nothing } from "lit";

import type { AlertKind, Plant, WeatherAlert } from "../api/types";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatDayMonth, formatNumber, formatWeekday } from "../util/format";
import { navigate } from "../util/navigate";
import { PgElement, define, icon } from "./base";
import { plantPath } from "./plant-card";

const ICONS: Record<AlertKind, string> = {
  frost: mdiSnowflake,
  heat: mdiThermometerHigh,
  storm: mdiWeatherWindy,
  heavy_rain: mdiWeatherPouring,
  fungal: mdiMushroomOutline,
  slugs: mdiSnail,
};

/**
 * Warnings of the coming days with what to do: frost below a plant's limit,
 * heat, storm, heavy rain, and weather for plant diseases and slugs. Computed by
 * rules in the backend (no AI); also sent as a Home Assistant notification.
 */
export class PgWeatherAlerts extends PgElement {
  static override properties = {
    store: { attribute: false },
    prefix: {},
  };

  declare store: GardenStore;
  declare prefix: string;

  private readonly _onStoreChange = () => this.requestUpdate();

  constructor() {
    super();
    this.prefix = "/plant-garden";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.store?.addEventListener("change", this._onStoreChange);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.store?.removeEventListener("change", this._onStoreChange);
  }

  protected override render() {
    const alerts = this.store?.water?.alerts ?? [];
    if (!alerts.length) return nothing;
    return html`<section class="card block" aria-label=${this.t("alert.title")}>
      <h3>${this.t("alert.title")}</h3>
      <ul>
        ${alerts.map((alert) => this._renderAlert(alert))}
      </ul>
    </section>`;
  }

  private _renderAlert(alert: WeatherAlert) {
    const { t, language } = this;
    const plants = alert.plants
      .map((id) => this.store.getPlant(id))
      .filter((plant): plant is Plant => plant !== undefined);
    const day = `${formatWeekday(alert.day, language)} ${formatDayMonth(alert.day, language)}`;
    const value = alert.value === null ? "" : formatNumber(alert.value, language, 0);
    return html`<li class="alert ${alert.kind}">
      ${icon(ICONS[alert.kind])}
      <div>
        <strong>${t(`alert.${alert.kind}`, { day, value })}</strong>
        <p class="small">${t(`alert.${alert.kind}_action`)}</p>
        ${
          plants.length
            ? html`<p class="small plants">
                ${t("alert.plants")}
                ${plants.map((plant, i) => {
                  const path = plantPath(plant, this.prefix);
                  return html`${i ? ", " : ""}<a
                      href=${path}
                      @click=${(e: MouseEvent) => {
                        e.preventDefault();
                        navigate(path);
                      }}
                      >${plant.name}</a
                    >`;
                })}
              </p>`
            : nothing
        }
      </div>
    </li>`;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: block;
      }
      .block {
        padding: 16px;
      }
      h3 {
        margin: 0 0 8px;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }
      .alert {
        display: flex;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 10px;
        background: color-mix(in srgb, var(--warning-color, #ffa600) 12%, transparent);
      }
      .alert.frost,
      .alert.heavy_rain {
        background: color-mix(in srgb, var(--pg-water) 12%, transparent);
      }
      .alert > .icon {
        flex: none;
        width: 24px;
        height: 24px;
        color: var(--warning-color, #b07000);
      }
      .alert.frost > .icon,
      .alert.heavy_rain > .icon {
        color: var(--pg-water);
      }
      p {
        margin: 2px 0 0;
      }
      .plants a {
        color: inherit;
        font-weight: 500;
      }
    `,
  ];
}

define("pg-weather-alerts", PgWeatherAlerts);
