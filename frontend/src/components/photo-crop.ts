import { mdiAutoFix, mdiCropFree, mdiRestore, mdiRotateRight } from "@mdi/js";
import { css, html, nothing } from "lit";

import { editPhoto, errorMessage } from "../api/client";
import type { Photo } from "../api/types";
import { shared } from "../styles/shared";
import {
  clampBox,
  dragBox,
  fitRatio,
  FULL,
  isFull,
  ratioFor,
  suggestCrop,
  turnBox,
  turnedSize,
  type CropBox,
  type Handle,
  type Rotation,
} from "../util/crop";
import { PgElement, define, icon } from "./base";

const CORNERS: Handle[] = ["nw", "ne", "sw", "se"];
const EDGES: Handle[] = ["n", "e", "s", "w"];
const SUGGEST_EDGE = 128; // px of the image the suggestion looks at
const KEY_STEP = 0.01;

interface Drag {
  handle: Handle;
  pointerId: number;
  x: number;
  y: number;
  box: CropBox;
  /** Size of the photo on screen, in px. */
  width: number;
  height: number;
}

/**
 * Crop and turn photos after an upload or from the photo viewer (D-041).
 * `await crop.edit(photos)` goes through them one by one and resolves when the
 * user is done; fires "photos-changed" after every saved crop.
 */
export class PgPhotoCrop extends PgElement {
  static override properties = {
    _photos: { state: true },
    _index: { state: true },
    _box: { state: true },
    _rotate: { state: true },
    _square: { state: true },
    _size: { state: true },
    _busy: { state: true },
    _note: { state: true },
    _error: { state: true },
  };

  declare _photos: Photo[];
  declare _index: number;
  declare _box: CropBox;
  declare _rotate: Rotation;
  declare _square: boolean;
  /** Pixel size of the upload (unturned), once known. */
  declare _size: { width: number; height: number } | null;
  declare _busy: boolean;
  declare _note: string;
  declare _error: string;

  private _resolve?: () => void;
  private _drag?: Drag;
  private _suggestOnLoad = false;

  constructor() {
    super();
    this._photos = [];
    this._index = 0;
    this._box = FULL;
    this._rotate = 0;
    this._square = false;
    this._size = null;
    this._busy = false;
    this._note = "";
    this._error = "";
  }

  /** Crop the photos one after the other; resolves when done or cancelled. */
  edit(photos: Photo[]): Promise<void> {
    this._resolve?.();
    if (!photos.length) return Promise.resolve();
    this._photos = photos;
    this._show(0);
    void this.updateComplete.then(() => this._dialog?.showModal());
    return new Promise((resolve) => (this._resolve = resolve));
  }

  private get _dialog(): HTMLDialogElement | null {
    return this.renderRoot.querySelector("dialog");
  }

  private get _photo(): Photo | undefined {
    return this._photos[this._index];
  }

  private _show(index: number): void {
    const photo = this._photos[index];
    if (!photo) return;
    this._index = index;
    const edit = photo.edit;
    this._rotate = edit?.rotate ?? 0;
    this._box = edit ? clampBox(edit) : FULL;
    // an edited photo's size is that of its crop; the upload's size comes on load
    this._size = edit ? null : { width: photo.width, height: photo.height };
    this._square = false;
    this._suggestOnLoad = !edit;
    this._note = "";
    this._error = "";
  }

  private _finish(): void {
    this._dialog?.close();
    this._photos = [];
    const resolve = this._resolve;
    this._resolve = undefined;
    resolve?.();
  }

  private _next(): void {
    if (this._index + 1 < this._photos.length) this._show(this._index + 1);
    else this._finish();
  }

  private async _apply(): Promise<void> {
    const photo = this._photo;
    if (!photo || this._busy) return;
    this._busy = true;
    this._error = "";
    try {
      const crop = isFull(this._box) ? null : this._box;
      await editPhoto(this.hass, photo.id, crop, this._rotate);
      this.fire("photos-changed");
      this._next();
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  // ------------------------------------------------------------ geometry
  private get _turned() {
    const size = this._size ?? { width: 1, height: 1 };
    return turnedSize(size.width, size.height, this._rotate);
  }

  /** Box width / height in fractions that makes a square on the turned photo. */
  private get _squareRatio(): number {
    const { width, height } = this._turned;
    return ratioFor(1, width, height);
  }

  private _turn(): void {
    this._rotate = ((this._rotate + 90) % 360) as Rotation;
    this._box = turnBox(this._box);
    this._note = "";
  }

  private _setSquare(square: boolean): void {
    this._square = square;
    if (square) this._box = fitRatio(this._box, this._squareRatio);
  }

  private _whole(): void {
    this._box = this._square ? fitRatio(FULL, this._squareRatio) : FULL;
    this._note = "";
  }

  private _asUploaded(): void {
    this._rotate = 0;
    this._square = false;
    this._box = FULL;
    this._note = "";
  }

  // ------------------------------------------------------------ suggestion
  private _onLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) {
      this._size = { width: img.naturalWidth, height: img.naturalHeight };
    }
    if (this._suggestOnLoad) {
      this._suggestOnLoad = false;
      const box = this._suggestion(img);
      if (box) this._box = box;
    }
  }

  private _suggest(): void {
    const img = this.renderRoot.querySelector<HTMLImageElement>(".stage img");
    const box = img ? this._suggestion(img) : null;
    if (box) {
      this._box = box;
      this._note = "";
    } else {
      this._note = this.t("crop.no_suggestion");
    }
  }

  /** Look at a small copy of the turned photo for the plant. */
  private _suggestion(img: HTMLImageElement): CropBox | null {
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) return null;
    const scale = SUGGEST_EDGE / Math.max(width, height);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const turned = turnedSize(w, h, this._rotate);
    const canvas = document.createElement("canvas");
    canvas.width = turned.width;
    canvas.height = turned.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    try {
      context.translate(turned.width / 2, turned.height / 2);
      context.rotate((this._rotate * Math.PI) / 180);
      context.drawImage(img, -w / 2, -h / 2, w, h);
      const box = suggestCrop(context.getImageData(0, 0, turned.width, turned.height));
      return box && this._square ? fitRatio(box, this._squareRatio) : box;
    } catch {
      return null; // e.g. an image the canvas may not read
    }
  }

  // ------------------------------------------------------------ dragging
  private _startDrag(event: PointerEvent, handle: Handle): void {
    if (event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    const stage = this.renderRoot.querySelector<HTMLElement>(".stage");
    if (!stage) return;
    stage.setPointerCapture?.(event.pointerId);
    const rect = stage.getBoundingClientRect();
    this._drag = {
      handle,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      box: this._box,
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    };
  }

  private _onMove(event: PointerEvent): void {
    const drag = this._drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this._box = dragBox(
      drag.box,
      drag.handle,
      (event.clientX - drag.x) / drag.width,
      (event.clientY - drag.y) / drag.height,
      this._square ? this._squareRatio : null,
    );
  }

  private _endDrag(event: PointerEvent): void {
    if (this._drag?.pointerId === event.pointerId) this._drag = undefined;
  }

  /** Arrow keys move the frame; with Shift they change its size. */
  private _onKey(event: KeyboardEvent): void {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const delta = step[event.key];
    if (!delta) return;
    event.preventDefault();
    const ratio = this._square ? this._squareRatio : null;
    this._box = event.shiftKey
      ? dragBox(this._box, "se", delta[0], delta[1], ratio)
      : dragBox(this._box, "move", delta[0], delta[1]);
  }

  // ------------------------------------------------------------ render
  protected override render() {
    const { t } = this;
    const photo = this._photo;
    const total = this._photos.length;
    return html`<dialog @cancel=${this._finish} aria-labelledby="crop-title">
      ${
        photo
          ? html`<div class="dialog-header">
                <h2 id="crop-title">${t("crop.title")}</h2>
                ${
                  total > 1
                    ? html`<span class="muted">
                        ${t("crop.progress", { current: this._index + 1, total })}
                      </span>`
                    : nothing
                }
              </div>
              <div class="dialog-body">
                <p class="muted small">${t("crop.hint")}</p>
                ${this._renderStage(photo)}
                <div class="tools">
                  <div class="chips" role="group">
                    <button
                      class="chip"
                      aria-pressed=${String(!this._square)}
                      @click=${() => this._setSquare(false)}
                    >
                      ${t("crop.free")}
                    </button>
                    <button
                      class="chip"
                      aria-pressed=${String(this._square)}
                      @click=${() => this._setSquare(true)}
                    >
                      ${t("crop.square")}
                    </button>
                  </div>
                  <button class="button text" @click=${this._turn}>
                    ${icon(mdiRotateRight)} ${t("crop.rotate")}
                  </button>
                  <button class="button text" @click=${this._suggest}>
                    ${icon(mdiAutoFix)} ${t("crop.suggest")}
                  </button>
                  <button class="button text" @click=${this._whole}>
                    ${icon(mdiCropFree)} ${t("crop.full")}
                  </button>
                  ${
                    photo.edit
                      ? html`<button class="button text" @click=${this._asUploaded}>
                          ${icon(mdiRestore)} ${t("crop.as_uploaded")}
                        </button>`
                      : nothing
                  }
                </div>
                ${this._note ? html`<p class="muted small" role="status">${this._note}</p>` : nothing}
                ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
              </div>
              <div class="dialog-actions">
                <button class="button text" ?disabled=${this._busy} @click=${this._next}>
                  ${total > 1 ? t("crop.skip") : t("common.cancel")}
                </button>
                <button class="button apply" ?disabled=${this._busy} @click=${this._apply}>
                  ${t("crop.apply")}
                </button>
              </div>`
          : nothing
      }
    </dialog>`;
  }

  private _renderStage(photo: Photo) {
    if (!this._size) {
      // the size of an edited photo's upload is known once it has loaded
      return html`<div class="stage loading">
        <img src=${photo.urls.source} alt="" @load=${this._onLoad} />
        <p class="muted">${this.t("panel.loading")}</p>
      </div>`;
    }
    const turned = this._turned;
    const ratio = turned.width / turned.height;
    const box = this._box;
    const pct = (value: number) => `${(value * 100).toFixed(3)}%`;
    // the image box before turning, in % of the (turned) stage
    const sideways = this._rotate % 180 !== 0;
    const imgWidth = sideways ? 1 / ratio : 1;
    const imgHeight = sideways ? ratio : 1;
    const handles = this._square ? CORNERS : [...CORNERS, ...EDGES];
    return html`<div
      class="stage"
      style="--ratio:${ratio.toFixed(5)}"
      @pointermove=${this._onMove}
      @pointerup=${this._endDrag}
      @pointercancel=${this._endDrag}
    >
      <img
        src=${photo.urls.source}
        alt=""
        draggable="false"
        style="width:${pct(imgWidth)};height:${pct(imgHeight)};transform:translate(-50%, -50%) rotate(${this._rotate}deg)"
        @load=${this._onLoad}
      />
      <div
        class="box"
        style="left:${pct(box.x)};top:${pct(box.y)};width:${pct(box.w)};height:${pct(box.h)}"
        tabindex="0"
        role="group"
        aria-label=${this.t("crop.box")}
        @pointerdown=${(e: PointerEvent) => this._startDrag(e, "move")}
        @keydown=${this._onKey}
      >
        ${handles.map(
          (handle) =>
            html`<span
              class="handle ${handle}"
              @pointerdown=${(e: PointerEvent) => this._startDrag(e, handle)}
            ></span>`,
        )}
      </div>
    </div>`;
  }

  static override styles = [
    shared,
    css`
      dialog {
        width: min(720px, calc(100vw - 24px));
      }
      .small {
        font-size: 13px;
      }
      .stage {
        position: relative;
        /* as wide as the dialog allows, at most 58 % of the screen high */
        width: min(100%, calc(58vh * var(--ratio, 1)));
        aspect-ratio: var(--ratio, 1);
        margin: 8px auto;
        overflow: hidden;
        background: #111;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }
      .stage.loading {
        display: grid;
        place-items: center;
        width: 100%;
        height: 240px;
        aspect-ratio: auto;
      }
      .stage.loading img {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
      }
      .stage img {
        position: absolute;
        left: 50%;
        top: 50%;
        max-width: none;
        pointer-events: none;
      }
      .box {
        position: absolute;
        box-sizing: border-box;
        border: 2px solid #fff;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
        cursor: move;
        /* thirds, to place the plant */
        background:
          linear-gradient(
            to right,
            transparent calc(33.33% - 0.5px),
            rgba(255, 255, 255, 0.45) calc(33.33% - 0.5px) calc(33.33% + 0.5px),
            transparent calc(33.33% + 0.5px) calc(66.67% - 0.5px),
            rgba(255, 255, 255, 0.45) calc(66.67% - 0.5px) calc(66.67% + 0.5px),
            transparent calc(66.67% + 0.5px)
          ),
          linear-gradient(
            to bottom,
            transparent calc(33.33% - 0.5px),
            rgba(255, 255, 255, 0.45) calc(33.33% - 0.5px) calc(33.33% + 0.5px),
            transparent calc(33.33% + 0.5px) calc(66.67% - 0.5px),
            rgba(255, 255, 255, 0.45) calc(66.67% - 0.5px) calc(66.67% + 0.5px),
            transparent calc(66.67% + 0.5px)
          );
      }
      .box:focus-visible {
        outline: 3px solid var(--pg-accent, #03a9f4);
        outline-offset: 2px;
      }
      /* large touch targets, small marks */
      .handle {
        position: absolute;
        width: 32px;
        height: 32px;
        margin: -16px 0 0 -16px;
      }
      .handle::after {
        content: "";
        position: absolute;
        inset: 10px;
        background: #fff;
        border-radius: 3px;
        box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
      }
      .nw {
        left: 0;
        top: 0;
        cursor: nwse-resize;
      }
      .ne {
        left: 100%;
        top: 0;
        cursor: nesw-resize;
      }
      .sw {
        left: 0;
        top: 100%;
        cursor: nesw-resize;
      }
      .se {
        left: 100%;
        top: 100%;
        cursor: nwse-resize;
      }
      .n {
        left: 50%;
        top: 0;
        cursor: ns-resize;
      }
      .s {
        left: 50%;
        top: 100%;
        cursor: ns-resize;
      }
      .e {
        left: 100%;
        top: 50%;
        cursor: ew-resize;
      }
      .w {
        left: 0;
        top: 50%;
        cursor: ew-resize;
      }
      .n::after,
      .s::after {
        inset: 13px 6px;
      }
      .e::after,
      .w::after {
        inset: 6px 13px;
      }
      .tools {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 8px;
      }
      .tools .chips {
        margin-right: auto;
      }
    `,
  ];
}

define("pg-photo-crop", PgPhotoCrop);
