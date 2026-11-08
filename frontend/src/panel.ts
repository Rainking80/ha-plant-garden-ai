import { mdiAlertCircleOutline, mdiArrowLeft, mdiMenu, mdiRefresh } from "@mdi/js";
import { LitElement, css, html, nothing, type PropertyValues } from "lit";

import { errorMessage, fetchInfo, type GardenInfo } from "./api/client";
import { icon } from "./components/base";
import { createLocalize, type Localize } from "./i18n";
import { GardenStore } from "./state/garden-store";
import { shared } from "./styles/shared";
import { tokens } from "./styles/tokens";
import type { HomeAssistant, PanelInfo, PlantGardenPanelConfig, Route } from "./types/hass";
import { navigate } from "./util/navigate";
import "./views/plant-detail";
import "./views/plants-view";

export type View = { name: "plants" } | { name: "plant"; plantId: string };

const FRESHNESS_CHECK_MS = 15 * 60 * 1000;

/** Map the part of the URL after the panel prefix to a view. */
export function parseRoute(path: string | undefined): View {
  const match = /^\/plants\/([0-9A-Za-z]+)\/?$/.exec(path ?? "");
  return match?.[1] ? { name: "plant", plantId: match[1] } : { name: "plants" };
}

export class PlantGardenPanel extends LitElement {
  static override properties = {
    hass: { attribute: false },
    narrow: { type: Boolean },
    route: { attribute: false },
    panel: { attribute: false },
    _info: { state: true },
    _infoError: { state: true },
  };

  declare hass: HomeAssistant;
  declare narrow: boolean;
  declare route: Route | undefined;
  declare panel: PanelInfo<PlantGardenPanelConfig>;
  declare _info: GardenInfo | undefined;
  declare _infoError: string | undefined;

  private readonly _store = new GardenStore(() => this.hass);
  private _started = false;
  private _localize: Localize = createLocalize("en");
  private _language = "";

  private _freshnessTimer?: ReturnType<typeof setInterval>;

  private readonly _onStoreChange = () => this.requestUpdate();
  /**
   * Photo URLs are signed for 24 h. Reload data that is older than an hour when
   * the tab becomes visible, and every 15 minutes for panels that stay open
   * (wall tablets), so images never point at expired URLs.
   */
  private readonly _refreshIfStale = () => {
    if (document.visibilityState === "visible" && this._store.stale) void this._store.refresh();
  };

  override connectedCallback(): void {
    super.connectedCallback();
    this._store.addEventListener("change", this._onStoreChange);
    document.addEventListener("visibilitychange", this._refreshIfStale);
    this._freshnessTimer = setInterval(this._refreshIfStale, FRESHNESS_CHECK_MS);
    if (this.hass) this._start();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._store.removeEventListener("change", this._onStoreChange);
    document.removeEventListener("visibilitychange", this._refreshIfStale);
    clearInterval(this._freshnessTimer);
    void this._store.disconnect();
    this._started = false;
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (!changed.has("hass") || !this.hass) return;
    const language = this.hass.locale?.language ?? this.hass.language;
    if (language !== this._language) {
      this._language = language;
      this._localize = createLocalize(language);
    }
    this.toggleAttribute("dark", Boolean(this.hass.themes?.darkMode));
    if (!this._started && this.isConnected) this._start();
  }

  private _start(): void {
    this._started = true;
    void this._loadInfo();
    void this._store.connect();
  }

  private async _loadInfo(): Promise<void> {
    try {
      this._info = await fetchInfo(this.hass);
      this._infoError = undefined;
    } catch (err) {
      this._infoError = errorMessage(err);
    }
  }

  private _retry(): void {
    void this._loadInfo();
    void this._store.connect().then(() => this._store.refresh());
  }

  private get _prefix(): string {
    return this.route?.prefix ?? `/${this.panel?.url_path ?? "plant-garden"}`;
  }

  private _toggleSidebar(): void {
    this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
  }

  protected override render() {
    const t = this._localize;
    const view = parseRoute(this.route?.path);
    const gardenName = this._info?.garden_name ?? this.panel?.title ?? "Plant Garden";
    const title =
      view.name === "plant" ? (this._store.getPlant(view.plantId)?.name ?? gardenName) : gardenName;

    return html`
      <header class="toolbar">
        ${
          view.name === "plant"
            ? html`<button
                class="icon-button"
                @click=${() => navigate(this._prefix)}
                aria-label=${t("panel.back")}
                title=${t("panel.back")}
              >
                ${icon(mdiArrowLeft)}
              </button>`
            : this.narrow
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
      <main>${this._renderBody(t, view, gardenName)}</main>
    `;
  }

  private _renderBody(t: Localize, view: View, gardenName: string) {
    const error = this._infoError ?? (this._store.loaded ? undefined : this._store.error);
    if (error) {
      return html`
        <section class="card state" role="alert">
          ${icon(mdiAlertCircleOutline)}
          <h2>${t("panel.error_title")}</h2>
          <p class="muted">${error}</p>
          <p class="muted">${t("panel.error_hint")}</p>
          <button class="button" @click=${this._retry}>
            ${icon(mdiRefresh)} ${t("panel.retry")}
          </button>
        </section>
      `;
    }
    if (!this._store.loaded || !this._info) {
      return html`<p class="muted loading" aria-live="polite">${t("panel.loading")}</p>`;
    }
    if (view.name === "plant") {
      return html`<pg-plant-detail
        .hass=${this.hass}
        .store=${this._store}
        .plantId=${view.plantId}
        .prefix=${this._prefix}
      ></pg-plant-detail>`;
    }
    return html`<pg-plants-view
      .hass=${this.hass}
      .store=${this._store}
      .gardenName=${gardenName}
      .prefix=${this._prefix}
    ></pg-plants-view>`;
  }

  static override styles = [
    tokens,
    shared,
    css`
      :host {
        display: block;
        min-height: 100%;
        background: var(--pg-bg);
        color: var(--pg-text);
        font-family: var(--pg-font);
        -webkit-font-smoothing: antialiased;
      }
      .toolbar {
        position: sticky;
        top: 0;
        z-index: 3;
        display: flex;
        align-items: center;
        gap: 4px;
        height: var(--header-height, 56px);
        padding: 0 12px;
        background: var(--app-header-background-color, var(--pg-accent));
        color: var(--app-header-text-color, #fff);
        border-bottom: var(--app-header-border-bottom, none);
      }
      .toolbar h1 {
        margin: 0 0 0 8px;
        font-size: 20px;
        font-weight: 400;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      main {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px 16px 32px;
      }
      .loading {
        text-align: center;
        padding: 48px 0;
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
      .state .button {
        margin-top: 12px;
      }
    `,
  ];
}
