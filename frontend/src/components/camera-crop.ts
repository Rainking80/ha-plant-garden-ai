import { css, html, nothing } from "lit";

import { cameraPreview, errorMessage, setCameraCrop } from "../api/client";
import { shared } from "../styles/shared";
import { FULL, clampBox, dragBox, isFull, type CropBox, type Handle } from "../util/crop";
import { PgElement, define } from "./base";

const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const KEY_STEP = 0.02;

interface Drag {
  handle: Handle;
  pointerId: number;
  x: number;
  y: number;
  box: CropBox;
  width: number;
  height: number;
}

/**
 * The frame of a plant's camera: shows the camera's whole picture and lets the
 * user mark the part that shows the plant. Every picture the camera takes for
 * the plant (the daily one and "take one now") is then cut to it, so the
 * time-lapse always shows the same view. Fires "frame-saved" after saving.
 */
export class PgCameraCrop extends PgElement {
  static override properties = {
    _plantId: { state: true },
    _image: { state: true },
    _ratio: { state: true },
    _box: { state: true },
    _busy: { state: true },
    _error: { state: true },
  };

  declare _plantId: string | null;
  /** the camera's picture as a data URL, once loaded */
  declare _image: string;
  /** width / height of the camera's picture */
  declare _ratio: number;
  declare _box: CropBox;
  declare _busy: boolean;
  declare _error: string;

  private _drag?: Drag;

  constructor() {
    super();
    this._plantId = null;
    this._image = "";
    this._ratio = 16 / 9;
    this._box = FULL;
    this._busy = false;
    this._error = "";
  }

  /** Open for a plant: fetch its camera's current picture and the frame so far. */
  open(plantId: string): void {
    this._plantId = plantId;
    this._image = "";
    this._box = FULL;
    this._error = "";
    void this.updateComplete.then(() => this.renderRoot.querySelector("dialog")?.showModal());
    void this._load(plantId);
  }

  close(): void {
    this.renderRoot.querySelector("dialog")?.close();
    this._plantId = null;
  }

  private async _load(plantId: string): Promise<void> {
    this._busy = true;
    try {
      const preview = await cameraPreview(this.hass, plantId);
      if (plantId !== this._plantId) return;
      this._image = preview.image;
      this._ratio = preview.width / Math.max(1, preview.height);
      this._box = preview.crop ? clampBox(preview.crop) : FULL;
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  private async _save(): Promise<void> {
    const plantId = this._plantId;
    if (!plantId || this._busy) return;
    this._busy = true;
    this._error = "";
    try {
      const box = clampBox(this._box);
      await setCameraCrop(this.hass, plantId, isFull(box) ? null : box);
      this.close();
      this.fire("frame-saved", { plantId });
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
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
    this._box = dragBox(this._box, event.shiftKey ? "se" : "move", delta[0], delta[1]);
  }

  protected override render() {
    const { t } = this;
    const box = this._box;
    const pct = (value: number) => `${(value * 100).toFixed(3)}%`;
    return html`<dialog @cancel=${() => (this._plantId = null)} aria-labelledby="title">
      <div class="dialog-header"><h2 id="title">${t("camera.frame_title")}</h2></div>
      <div class="dialog-body">
        <p>${t("camera.frame_intro")}</p>
        ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
        ${
          this._image
            ? html`<div
                class="stage"
                style="--ratio:${this._ratio.toFixed(5)}"
                @pointermove=${this._onMove}
                @pointerup=${this._endDrag}
                @pointercancel=${this._endDrag}
              >
                <img src=${this._image} alt="" draggable="false" />
                <div
                  class="box"
                  style="left:${pct(box.x)};top:${pct(box.y)};width:${pct(box.w)};height:${pct(box.h)}"
                  tabindex="0"
                  role="group"
                  aria-label=${t("crop.box")}
                  @pointerdown=${(e: PointerEvent) => this._startDrag(e, "move")}
                  @keydown=${this._onKey}
                >
                  ${HANDLES.map(
                    (handle) =>
                      html`<span
                        class="handle ${handle}"
                        @pointerdown=${(e: PointerEvent) => this._startDrag(e, handle)}
                      ></span>`,
                  )}
                </div>
              </div>`
            : this._error
              ? nothing
              : html`<p class="muted">${t("camera.frame_loading")}</p>`
        }
      </div>
      <div class="dialog-actions">
        <button
          type="button"
          class="button text whole"
          ?disabled=${!this._image || isFull(box)}
          @click=${() => (this._box = FULL)}
        >
          ${t("crop.full")}
        </button>
        <span class="spacer"></span>
        <button type="button" class="button text" @click=${() => this.close()}>
          ${t("common.cancel")}
        </button>
        <button
          type="button"
          class="button apply"
          ?disabled=${!this._image || this._busy}
          @click=${this._save}
        >
          ${t("camera.frame_save")}
        </button>
      </div>
    </dialog>`;
  }

  static override styles = [
    shared,
    css`
      dialog {
        width: min(760px, calc(100vw - 24px));
      }
      .stage {
        position: relative;
        width: min(100%, calc(58vh * var(--ratio, 1)));
        aspect-ratio: var(--ratio, 1);
        margin: 0 auto;
        overflow: hidden;
        border-radius: 8px;
        background: #000;
        touch-action: none;
        user-select: none;
      }
      .stage img {
        display: block;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
      .box {
        position: absolute;
        box-sizing: border-box;
        border: 2px solid #fff;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
        cursor: move;
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
      .spacer {
        flex: 1;
      }
    `,
  ];
}

define("pg-camera-crop", PgCameraCrop);
