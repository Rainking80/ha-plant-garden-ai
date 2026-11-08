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
import "./views/garden-view";
import "./views/plant-detail";
import "./views/assistant-view";
import "./views/plants-view";
import "./views/tasks-view";
import "./views/tech-view";
import "./views/water-view";

export type View =
  | { name: "plan"; focusPlantId: string | null }
  | { name: "plants" }
  | { name: "water" }
  | { name: "tasks" }
  | { name: "assistant" }
  | { name: "tech" }
  | { name: "plant"; plantId: string };

const FRESHNESS_CHECK_MS = 15 * 60 * 1000;

/** Map the part of the URL after the panel prefix to a view. */
export function parseRoute(path: string | undefined): View {
  const value = path ?? "";
  const plant = /^\/plants\/([0-9A-Za-z]+)\/?$/.exec(value);
  if (plant?.[1]) return { name: "plant", plantId: plant[1] };
  if (/^\/plants\/?$/.test(value)) return { name: "plants" };
  if (/^\/water\/?$/.test(value)) return { name: "water" };
  if (/^\/tech\/?$/.test(value)) return { name: "tech" };
  if (/^\/tasks\/?$/.test(value)) return { name: "tasks" };
  if (/^\/assistant\/?$/.test(value)) return { name: "assistant" };
  const focus = /^\/plan\/([0-9A-Za-z]+)\/?$/.exec(value);
  return { name: "plan", focusPlantId: focus?.[1] ?? null };
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
  /** Where "back" from a plant goes: the tab that was used last. */
  private _lastList: Exclude<View["name"], "plant"> = "plan";
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
    if (changed.has("route")) {
      const view = parseRoute(this.route?.path);
      if (view.name !== "plant") this._lastList = view.name;
    }
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
    const plantName =
      view.name === "plant" ? (this._store.getPlant(view.plantId)?.name ?? gardenName) : "";

    return html`
      <header class="toolbar">
        ${
          view.name === "plant"
            ? html`<button
                class="icon-button"
                @click=${() =>
                  navigate(
                    this._lastList === "plan" ? this._prefix : `${this._prefix}/${this._lastList}`,
                  )}
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
        <h1>${view.name === "plant" ? plantName : gardenName}</h1>
        ${
          view.name === "plant"
            ? nothing
            : html`<nav class="tabs">
                <a
                  href=${this._prefix}
                  aria-current=${view.name === "plan" ? "page" : "false"}
                  @click=${(e: MouseEvent) => this._go(e, this._prefix)}
                  >${t("nav.plan")}</a
                >
                <a
                  href="${this._prefix}/plants"
                  aria-current=${view.name === "plants" ? "page" : "false"}
                  @click=${(e: MouseEvent) => this._go(e, `${this._prefix}/plants`)}
                  >${t("nav.plants")}</a
                >
                <a
                  href="${this._prefix}/tasks"
                  aria-current=${view.name === "tasks" ? "page" : "false"}
                  @click=${(e: MouseEvent) => this._go(e, `${this._prefix}/tasks`)}
                  >${t("nav.tasks")}${this._badge()}</a
                >
                <a
                  href="${this._prefix}/assistant"
                  aria-current=${view.name === "assistant" ? "page" : "false"}
                  @click=${(e: MouseEvent) => this._go(e, `${this._prefix}/assistant`)}
                  >${t("nav.assistant")}</a
                >
                <a
                  href="${this._prefix}/water"
                  aria-current=${view.name === "water" ? "page" : "false"}
                  @click=${(e: MouseEvent) => this._go(e, `${this._prefix}/water`)}
                  >${t("nav.water")}</a
                >
                ${
                  this._info?.is_admin
                    ? html`<a
                        href="${this._prefix}/tech"
                        aria-current=${view.name === "tech" ? "page" : "false"}
                        @click=${(e: MouseEvent) => this._go(e, `${this._prefix}/tech`)}
                        >${t("nav.tech")}</a
                      >`
                    : nothing
                }
              </nav>`
        }
      </header>
      <main class=${view.name === "plan" ? "full" : ""}>
        ${this._renderBody(t, view, gardenName)}
      </main>
    `;
  }

  /** Overdue tasks as a small count on the tab. */
  private _badge() {
    const overdue = this._store.care.garden.overdue ?? 0;
    return overdue
      ? html`<span class="badge" title=${this._localize("tasks.group_overdue")}>${overdue}</span>`
      : nothing;
  }

  private _go(event: MouseEvent, path: string): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    navigate(path);
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
    switch (view.name) {
      case "plant":
        return html`<pg-plant-detail
          .hass=${this.hass}
          .store=${this._store}
          .plantId=${view.plantId}
          .prefix=${this._prefix}
        ></pg-plant-detail>`;
      case "plants":
        return html`<pg-plants-view
          .hass=${this.hass}
          .store=${this._store}
          .gardenName=${gardenName}
          .prefix=${this._prefix}
        ></pg-plants-view>`;
      case "water":
        return html`<pg-water-view
          .hass=${this.hass}
          .store=${this._store}
          .prefix=${this._prefix}
        ></pg-water-view>`;
      case "tasks":
        return html`<pg-tasks-view
          .hass=${this.hass}
          .store=${this._store}
          .prefix=${this._prefix}
        ></pg-tasks-view>`;
      case "assistant":
        return html`<pg-assistant-view
          .hass=${this.hass}
          .store=${this._store}
          .prefix=${this._prefix}
        ></pg-assistant-view>`;
      case "tech":
        if (!this._info.is_admin) return nothing;
        return html`<pg-tech-view .hass=${this.hass} .store=${this._store}></pg-tech-view>`;
      default:
        return html`<pg-garden-view
          .hass=${this.hass}
          .store=${this._store}
          .prefix=${this._prefix}
          .focusPlantId=${view.focusPlantId}
        ></pg-garden-view>`;
    }
  }

  static override styles = [
    tokens,
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        height: 100%;
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
        flex: none;
        height: var(--header-height, 56px);
        padding: 0 12px;
        background: var(--app-header-background-color, var(--pg-accent));
        color: var(--app-header-text-color, #fff);
        border-bottom: var(--app-header-border-bottom, none);
      }
      .toolbar h1 {
        margin: 0 12px 0 8px;
        font-size: 20px;
        font-weight: 400;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tabs {
        display: flex;
        align-self: stretch;
        margin-left: auto;
        min-width: 0;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .tabs a {
        flex: none;
      }
      .tabs a {
        display: flex;
        align-items: center;
        padding: 0 14px;
        color: inherit;
        text-decoration: none;
        opacity: 0.75;
        border-bottom: 3px solid transparent;
        font-weight: 500;
        font-size: 14px;
      }
      .badge {
        margin-left: 6px;
        min-width: 18px;
        height: 18px;
        border-radius: 9px;
        padding: 0 5px;
        box-sizing: border-box;
        background: var(--error-color, #db4437);
        color: #fff;
        font-size: 11px;
        line-height: 18px;
        text-align: center;
      }
      .tabs a[aria-current="page"] {
        opacity: 1;
        border-bottom-color: currentColor;
      }
      .tabs a:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: -4px;
      }
      main {
        flex: 1;
        width: 100%;
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px 16px 32px;
        box-sizing: border-box;
      }
      main.full {
        max-width: none;
        padding: 0;
        min-height: 0;
        /* Home Assistant's panel container has no definite height, so neither
           flex: 1 nor height: 100% below reach the window: with them the plan
           (only absolutely positioned layers) collapsed to 0 px in view mode.
           A fixed size from the viewport is the only reliable reference. */
        flex: none;
        height: calc(100vh - var(--header-height, 56px));
        height: calc(100dvh - var(--header-height, 56px));
      }
      .loading {
        text-align: center;
        padding: 48px 0;
      }
      .state {
        margin: 20px 16px;
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
      @media (max-width: 520px) {
        .toolbar h1 {
          font-size: 18px;
          margin-right: 4px;
        }
        .tabs a {
          padding: 0 10px;
        }
      }
    `,
  ];
}
