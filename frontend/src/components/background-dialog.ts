import { mdiClose, mdiImageOutline, mdiMapOutline, mdiUpload } from "@mdi/js";
import { css, html, nothing } from "lit";

import { errorMessage, uploadBackground } from "../api/client";
import type { Background, ImageBackground, Layout } from "../api/types";
import { shared } from "../styles/shared";
import { formatNumber } from "../util/format";
import { prepareImage } from "../util/image";
import { uploadErrorText } from "../util/upload";
import type { Viewport } from "../util/viewport";
import { WMS_PRESETS, presetFor, resolveWms } from "../util/wms";
import { PgElement, define, icon } from "./base";

type Choice = "none" | "wms" | "image";
const CUSTOM = "custom";

/**
 * Choose the plan background: none, official aerial imagery (WMS) or an own
 * picture. Fires "background-change" {background: Background | null}.
 */
export class PgBackgroundDialog extends PgElement {
  static override properties = {
    background: { attribute: false },
    origin: { attribute: false },
    _choice: { state: true },
    _preset: { state: true },
    _url: { state: true },
    _layers: { state: true },
    _attribution: { state: true },
    _opacity: { state: true },
    _image: { state: true },
    _rotation: { state: true },
    _busy: { state: true },
    _error: { state: true },
  };

  declare background: Background | null;
  declare origin: Layout["origin"];
  declare _choice: Choice;
  declare _preset: string;
  declare _url: string;
  declare _layers: string;
  declare _attribution: string;
  declare _opacity: number;
  declare _image: ImageBackground | null;
  declare _rotation: string;
  declare _busy: boolean;
  declare _error: string;
  private _viewport: Viewport = { cx: 0, cy: 0, width: 40 };

  constructor() {
    super();
    this.background = null;
    this.origin = null;
    this._choice = "none";
    this._preset = "";
    this._url = "";
    this._layers = "";
    this._attribution = "";
    this._opacity = 1;
    this._image = null;
    this._rotation = "0";
    this._busy = false;
    this._error = "";
  }

  /** `viewport` is where a newly uploaded picture is placed initially. */
  open(viewport: Viewport): void {
    this._viewport = viewport;
    const bg = this.background;
    this._choice = bg?.type ?? "none";
    this._error = "";
    this._busy = false;
    const suggested = presetFor(this.origin)?.key ?? WMS_PRESETS[0]?.key ?? "";
    if (bg?.type === "wms") {
      this._preset = bg.preset ?? CUSTOM;
      this._url = bg.url ?? "";
      this._layers = bg.layers ?? "";
      this._attribution = bg.attribution ?? "";
      this._opacity = bg.opacity;
    } else {
      this._preset = suggested;
      this._url = this._layers = this._attribution = "";
      this._opacity = bg?.type === "image" ? bg.opacity : 1;
    }
    this._image = bg?.type === "image" ? bg : null;
    this._rotation = bg?.type === "image" ? String(bg.rotation) : "0";
    if (bg?.type === "image") this._opacity = bg.opacity;
    void this.updateComplete.then(() => this.renderRoot.querySelector("dialog")?.showModal());
  }

  close(): void {
    this.renderRoot.querySelector("dialog")?.close();
  }

  private async _upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    this._busy = true;
    this._error = "";
    try {
      const prepared = await prepareImage(file);
      const uploaded = await uploadBackground(this.hass, prepared.blob);
      // place it centred in the current view, 70 % of its width
      const width = this._viewport.width * 0.7;
      const height = (width * uploaded.height_px) / uploaded.width_px;
      this._image = {
        type: "image",
        image_id: uploaded.image_id,
        width_px: uploaded.width_px,
        height_px: uploaded.height_px,
        x: Math.round((this._viewport.cx - width / 2) * 10) / 10,
        y: Math.round((this._viewport.cy - height / 2) * 10) / 10,
        width_m: Math.round(width * 10) / 10,
        rotation: 0,
        opacity: 0.8,
        url: uploaded.url,
      };
      this._opacity = 0.8;
      this._rotation = "0";
    } catch (err) {
      this._error = uploadErrorText(err, this.t) || errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  private _result(): Background | null | "invalid" {
    if (this._choice === "none") return null;
    if (this._choice === "wms") {
      if (this._preset !== CUSTOM)
        return { type: "wms", preset: this._preset, opacity: this._opacity };
      const url = this._url.trim();
      const layers = this._layers.trim();
      if (!/^https:\/\/\S+$/.test(url) || !layers) return "invalid";
      return {
        type: "wms",
        preset: null,
        url,
        layers,
        attribution: this._attribution.trim() || null,
        opacity: this._opacity,
      };
    }
    if (!this._image) return "invalid";
    const rotation = Number(this._rotation.replace(",", "."));
    return {
      ...this._image,
      rotation: Number.isFinite(rotation) ? Math.max(-360, Math.min(360, rotation)) : 0,
      opacity: this._opacity,
    };
  }

  private _apply(): void {
    const result = this._result();
    if (result === "invalid") {
      this._error = this.t(
        this._choice === "image" ? "background.need_image" : "background.need_wms",
      );
      return;
    }
    this.close();
    this.fire("background-change", { background: result });
  }

  private _renderChoice(choice: Choice, path: string, label: string) {
    return html`<button
      type="button"
      class="choice"
      aria-pressed=${this._choice === choice}
      @click=${() => {
        this._choice = choice;
        this._error = "";
      }}
    >
      ${path ? icon(path) : nothing}<span>${label}</span>
    </button>`;
  }

  protected override render() {
    const { t } = this;
    const suggested = presetFor(this.origin);
    return html`<dialog aria-labelledby="title">
      <div class="dialog-header">
        <h2 id="title">${t("background.title")}</h2>
        <button class="icon-button" @click=${this.close} aria-label=${t("common.close")}>
          ${icon(mdiClose)}
        </button>
      </div>
      <div class="dialog-body">
        <div class="choices" role="group">
          ${this._renderChoice("none", "", t("background.none"))}
          ${this._renderChoice("wms", mdiMapOutline, t("background.wms"))}
          ${this._renderChoice("image", mdiImageOutline, t("background.image"))}
        </div>

        ${this._choice === "wms" ? this._renderWms(suggested?.key) : nothing}
        ${this._choice === "image" ? this._renderImage() : nothing}
        ${
          this._choice !== "none"
            ? html`<label class="field">
                <span
                  >${t("background.opacity")}:
                  ${formatNumber(this._opacity * 100, this.language, 0)} %</span
                >
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  .value=${String(this._opacity)}
                  @input=${(e: Event) => (this._opacity = Number((e.target as HTMLInputElement).value))}
                />
              </label>`
            : nothing
        }
        ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
      </div>
      <div class="dialog-actions">
        <button class="button text" @click=${this.close}>${t("common.cancel")}</button>
        <button class="button" ?disabled=${this._busy} @click=${this._apply}>
          ${t("common.apply")}
        </button>
      </div>
    </dialog>`;
  }

  private _renderWms(suggestedKey: string | undefined) {
    const { t } = this;
    const preview =
      this._preset !== CUSTOM
        ? resolveWms({ type: "wms", preset: this._preset, opacity: 1 })
        : null;
    return html`<label class="field">
        <span>${t("background.service")}</span>
        <select @change=${(e: Event) => (this._preset = (e.target as HTMLSelectElement).value)}>
          ${WMS_PRESETS.map(
            (preset) =>
              html`<option value=${preset.key} ?selected=${preset.key === this._preset}>
                ${preset.name}${preset.key === suggestedKey ? ` – ${t("background.suggested")}` : ""}
              </option>`,
          )}
          <option value=${CUSTOM} ?selected=${this._preset === CUSTOM}>
            ${t("background.custom")}
          </option>
        </select>
      </label>
      ${
        this._preset === CUSTOM
          ? html`<label class="field">
                <span>${t("background.url")}</span>
                <input
                  type="url"
                  placeholder="https://…/wms"
                  .value=${this._url}
                  @input=${(e: Event) => (this._url = (e.target as HTMLInputElement).value)}
                />
              </label>
              <label class="field">
                <span>${t("background.layers")}</span>
                <input
                  .value=${this._layers}
                  @input=${(e: Event) => (this._layers = (e.target as HTMLInputElement).value)}
                />
              </label>
              <label class="field">
                <span>${t("background.attribution")}</span>
                <input
                  .value=${this._attribution}
                  @input=${(e: Event) => (this._attribution = (e.target as HTMLInputElement).value)}
                />
              </label>`
          : html`<p class="muted small">
              ${t("background.source")}: ${preview?.attribution ?? ""}
            </p>`
      }
      <p class="muted small">${t("background.wms_hint")}</p>`;
  }

  private _renderImage() {
    const { t } = this;
    return html`${
        this._image?.url ? html`<img class="preview" src=${this._image.url} alt="" />` : nothing
      }
      <label class="upload">
        <span class="button secondary">
          ${icon(mdiUpload)} ${this._image ? t("background.replace") : t("background.upload")}
        </span>
        <input
          class="sr-only"
          type="file"
          accept="image/*"
          ?disabled=${this._busy}
          @change=${this._upload}
        />
      </label>
      ${this._busy ? html`<p class="muted">${t("background.uploading")}</p>` : nothing}
      ${
        this._image
          ? html`<label class="field">
              <span>${t("background.rotation")}</span>
              <input
                type="number"
                step="0.5"
                .value=${this._rotation}
                @input=${(e: Event) => (this._rotation = (e.target as HTMLInputElement).value)}
              />
            </label>`
          : nothing
      }
      <p class="muted small">${t("background.image_hint")}</p>`;
  }

  static override styles = [
    shared,
    css`
      dialog {
        width: min(560px, calc(100vw - 24px));
      }
      .dialog-body {
        display: grid;
        gap: 14px;
      }
      .choices {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }
      .choice {
        display: grid;
        justify-items: center;
        gap: 4px;
        padding: 12px 8px;
        border: 1px solid var(--pg-divider);
        border-radius: 12px;
        background: transparent;
        color: var(--pg-text);
        font: inherit;
        font-size: 14px;
        cursor: pointer;
        min-height: 72px;
        align-content: center;
      }
      .choice[aria-pressed="true"] {
        border-color: var(--pg-accent);
        background: color-mix(in srgb, var(--pg-accent) 10%, transparent);
        color: var(--pg-accent);
        font-weight: 500;
      }
      .preview {
        width: 100%;
        max-height: 220px;
        object-fit: contain;
        border-radius: 8px;
        background: var(--pg-input-bg);
      }
      .upload {
        cursor: pointer;
        justify-self: start;
      }
      .upload:focus-within .button {
        outline: 2px solid var(--pg-accent);
        outline-offset: 2px;
      }
      .small {
        font-size: 12px;
        margin: 0;
        line-height: 1.45;
      }
      input[type="range"] {
        padding: 0;
        min-height: 28px;
        background: none;
        border: none;
      }
    `,
  ];
}

define("pg-background-dialog", PgBackgroundDialog);
