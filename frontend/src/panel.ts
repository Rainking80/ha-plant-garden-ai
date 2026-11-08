import {
  mdiAlertCircleOutline,
  mdiCreationOutline,
  mdiFloorPlan,
  mdiImageMultipleOutline,
  mdiMenu,
  mdiRefresh,
  mdiWaterOutline,
} from "@mdi/js";
import { LitElement, css, html, nothing, type PropertyValues } from "lit";

import { errorMessage, fetchInfo, type GardenInfo } from "./api/client";
import { heroIllustration, heroStyles } from "./components/hero";
import { createLocalize, type Localize, type TranslationKey } from "./i18n";
import { tokens } from "./styles/tokens";
import type { HomeAssistant, PanelInfo, PlantGardenPanelConfig } from "./types/hass";

interface Feature {
  icon: string;
  title: TranslationKey;
  body: TranslationKey;
}

const FEATURES: Feature[] = [
  { icon: mdiFloorPlan, title: "feature.plan.title", body: "feature.plan.body" },
  { icon: mdiImageMultipleOutline, title: "feature.plants.title", body: "feature.plants.body" },
  { icon: mdiWaterOutline, title: "feature.water.title", body: "feature.water.body" },
  { icon: mdiCreationOutline, title: "feature.ai.title", body: "feature.ai.body" },
];

const icon = (path: string) =>
  html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d=${path}></path></svg>`;

export class PlantGardenPanel extends LitElement {
  static override properties = {
    hass: { attribute: false },
    narrow: { type: Boolean },
    panel: { attribute: false },
    _info: { state: true },
    _error: { state: true },
  };

  declare hass: HomeAssistant;
  declare narrow: boolean;
  declare panel: PanelInfo<PlantGardenPanelConfig>;
  declare _info: GardenInfo | undefined;
  declare _error: string | undefined;

  private _loading = false;
  private _localize: Localize = createLocalize("en");
  private _language = "";

  protected override willUpdate(changed: PropertyValues): void {
    if (!changed.has("hass") || !this.hass) return;

    const language = this.hass.locale?.language ?? this.hass.language;
    if (language !== this._language) {
      this._language = language;
      this._localize = createLocalize(language);
    }
    this.toggleAttribute("dark", Boolean(this.hass.themes?.darkMode));

    if (!this._info && !this._error && !this._loading) void this._load();
  }

  private async _load(): Promise<void> {
    this._loading = true;
    this._error = undefined;
    try {
      this._info = await fetchInfo(this.hass);
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._loading = false;
    }
  }

  private _toggleSidebar(): void {
    this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
  }

  protected override render() {
    const t = this._localize;
    const title = this._info?.garden_name ?? this.panel?.title ?? "Plant Garden";
    return html`
      <header class="toolbar">
        ${
          this.narrow
            ? html`<button
                class="icon-button"
                @click=${this._toggleSidebar}
                aria-label=${t("panel.open_sidebar")}
                title=${t("panel.open_sidebar")}
              >
                ${icon(mdiMenu)}
              </button>`
            : nothing
        }
        <h1>${title}</h1>
      </header>
      <main>${this._renderBody(t, title)}</main>
    `;
  }

  private _renderBody(t: Localize, title: string) {
    if (this._error) {
      return html`
        <section class="card state" role="alert">
          ${icon(mdiAlertCircleOutline)}
          <h2>${t("panel.error_title")}</h2>
          <p class="muted">${this._error}</p>
          <p class="muted">${t("panel.error_hint")}</p>
          <button class="button" @click=${this._load}>
            ${icon(mdiRefresh)} ${t("panel.retry")}
          </button>
        </section>
      `;
    }
    if (!this._info) {
      return html`<p class="muted loading" aria-live="polite">${t("panel.loading")}</p>`;
    }
    return html`
      <section class="hero card">
        ${heroIllustration}
        <div class="hero-text">
          <h2>${t("welcome.title", { garden: title })}</h2>
          <p class="muted">${t("welcome.lead")}</p>
        </div>
      </section>
      <section class="features" aria-label=${t("feature.coming")}>
        ${FEATURES.map(
          (feature) => html`
            <article class="card feature">
              <div class="feature-icon">${icon(feature.icon)}</div>
              <h3>${t(feature.title)}</h3>
              <p class="muted">${t(feature.body)}</p>
              <span class="badge">${t("feature.coming")}</span>
            </article>
          `,
        )}
      </section>
      <footer class="muted">
        ${t("meta.version", { version: this._info.version })} · ${t("meta.connected")}
      </footer>
    `;
  }

  static override styles = [
    tokens,
    heroStyles,
    css`
      :host {
        display: block;
        min-height: 100%;
        background: var(--pg-bg);
        color: var(--pg-text);
        font-family: var(--pg-font);
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        height: var(--header-height, 56px);
        padding: 0 16px;
        background: var(--app-header-background-color, var(--pg-accent));
        color: var(--app-header-text-color, #fff);
        border-bottom: var(--app-header-border-bottom, none);
        box-sizing: border-box;
      }
      .toolbar h1 {
        margin: 0;
        font-size: 20px;
        font-weight: 400;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .icon {
        width: 24px;
        height: 24px;
        fill: currentColor;
        flex: none;
      }
      .icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        margin-left: -8px;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      .icon-button:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      .icon-button:focus-visible,
      .button:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
      }
      main {
        max-width: 1040px;
        margin: 0 auto;
        padding: 24px 16px 40px;
        display: grid;
        gap: 16px;
      }
      .card {
        background: var(--pg-surface);
        border-radius: var(--pg-radius);
        box-shadow: var(--pg-shadow);
      }
      .muted {
        color: var(--pg-text-muted);
      }
      .loading {
        text-align: center;
        padding: 48px 0;
      }
      .hero {
        overflow: hidden;
        display: grid;
      }
      .hero svg {
        display: block;
        width: 100%;
        height: auto;
        max-height: 260px;
      }
      .hero-text {
        padding: 8px 24px 24px;
      }
      .hero h2 {
        margin: 8px 0;
        font-size: 26px;
        font-weight: 500;
      }
      .hero p {
        margin: 0;
        max-width: 64ch;
        line-height: 1.5;
      }
      .features {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
      }
      .feature {
        position: relative;
        padding: 20px;
        transition:
          transform 160ms ease,
          box-shadow 160ms ease;
      }
      .feature:hover {
        transform: translateY(-2px);
      }
      .feature h3 {
        margin: 12px 0 4px;
        font-size: 16px;
        font-weight: 500;
      }
      .feature p {
        margin: 0 0 12px;
        line-height: 1.45;
        font-size: 14px;
      }
      .feature-icon {
        display: inline-flex;
        padding: 10px;
        border-radius: 12px;
        background: var(--pg-leaf-soft);
        color: var(--pg-leaf);
      }
      .badge {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 12px;
        background: color-mix(in srgb, var(--pg-accent) 14%, transparent);
        color: var(--pg-accent);
      }
      .state {
        padding: 32px 24px;
        text-align: center;
        display: grid;
        justify-items: center;
        gap: 4px;
      }
      .state > .icon {
        width: 40px;
        height: 40px;
        color: var(--error-color, #db4437);
      }
      .state h2 {
        margin: 8px 0 4px;
        font-weight: 500;
      }
      .button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 12px;
        padding: 8px 16px;
        border: none;
        border-radius: 999px;
        background: var(--pg-accent);
        color: var(--text-primary-color, #fff);
        font: inherit;
        cursor: pointer;
      }
      .button .icon {
        width: 18px;
        height: 18px;
      }
      footer {
        text-align: center;
        font-size: 13px;
      }
      @media (prefers-reduced-motion: reduce) {
        .feature {
          transition: none;
        }
        .feature:hover {
          transform: none;
        }
      }
    `,
  ];
}
