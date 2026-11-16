import { mdiPause, mdiPlay } from "@mdi/js";
import { css, html, nothing } from "lit";

import type { Photo } from "../api/types";
import { shared } from "../styles/shared";
import { formatDate } from "../util/format";
import { PgElement, define, icon } from "./base";

const SPEEDS = [2, 5, 10] as const; // pictures per second
export const CAMERA_TAG = "camera";

/** Oldest first; with `cameraOnly` just the daily pictures of the plant's camera. */
export function timelapseFrames(photos: Photo[], cameraOnly: boolean): Photo[] {
  return photos
    .filter((photo) => !cameraOnly || photo.tags.includes(CAMERA_TAG))
    .sort((a, b) => a.taken_at.localeCompare(b.taken_at));
}

/**
 * A plant's photos played one after the other, oldest first: its season as a
 * time-lapse. With pictures from a camera only those are played (same view
 * every day); the switch shows all photos instead.
 */
export class PgTimelapse extends PgElement {
  static override properties = {
    _photos: { state: true },
    _index: { state: true },
    _playing: { state: true },
    _speed: { state: true },
    _cameraOnly: { state: true },
  };

  declare _photos: Photo[];
  declare _index: number;
  declare _playing: boolean;
  declare _speed: number;
  declare _cameraOnly: boolean;

  private _timer?: ReturnType<typeof setInterval>;

  constructor() {
    super();
    this._photos = [];
    this._index = 0;
    this._playing = false;
    this._speed = 5;
    this._cameraOnly = false;
  }

  open(photos: Photo[]): void {
    this._photos = photos;
    this._cameraOnly = photos.filter((photo) => photo.tags.includes(CAMERA_TAG)).length >= 2;
    this._index = 0;
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector("dialog")?.showModal();
      this._play();
    });
  }

  close(): void {
    this.renderRoot.querySelector("dialog")?.close();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._pause();
  }

  private get _frames(): Photo[] {
    return timelapseFrames(this._photos, this._cameraOnly);
  }

  private _play(): void {
    this._pause();
    if (this._frames.length < 2) return;
    if (this._index >= this._frames.length - 1) this._index = 0;
    this._playing = true;
    this._timer = setInterval(() => {
      if (this._index >= this._frames.length - 1) this._pause();
      else this._index += 1;
    }, 1000 / this._speed);
  }

  private _pause(): void {
    clearInterval(this._timer);
    this._timer = undefined;
    this._playing = false;
  }

  private _setSpeed(speed: number): void {
    this._speed = speed;
    if (this._playing) this._play();
  }

  protected override render() {
    const { t, language } = this;
    const frames = this._frames;
    const photo = frames[Math.min(this._index, frames.length - 1)];
    const hasCamera = this._photos.some((p) => p.tags.includes(CAMERA_TAG));
    return html`<dialog @close=${() => this._pause()} aria-labelledby="title">
      <div class="dialog-header"><h2 id="title">${t("timelapse.title")}</h2></div>
      <div class="dialog-body">
        ${
          photo
            ? html`<div class="stage">
                  <img src=${photo.urls.medium} alt="" />
                  <span class="date">${formatDate(photo.taken_at, language)}</span>
                </div>
                <!-- the next pictures load ahead, so playing does not stutter -->
                <div class="preload" aria-hidden="true">
                  ${frames
                    .slice(this._index + 1, this._index + 4)
                    .map((next) => html`<img src=${next.urls.medium} alt="" />`)}
                </div>
                <input
                  class="scrub"
                  type="range"
                  min="0"
                  max=${frames.length - 1}
                  .value=${String(this._index)}
                  aria-label=${t("timelapse.position")}
                  @input=${(e: Event) => {
                    this._pause();
                    this._index = Number((e.target as HTMLInputElement).value);
                  }}
                />
                <div class="controls">
                  <button
                    class="button"
                    @click=${() => (this._playing ? this._pause() : this._play())}
                  >
                    ${icon(this._playing ? mdiPause : mdiPlay)}
                    ${t(this._playing ? "timelapse.pause" : "timelapse.play")}
                  </button>
                  <div class="chips" role="group" aria-label=${t("timelapse.speed")}>
                    ${SPEEDS.map(
                      (speed) =>
                        html`<button
                          class="chip"
                          aria-pressed=${this._speed === speed}
                          @click=${() => this._setSpeed(speed)}
                        >
                          ${speed}×
                        </button>`,
                    )}
                  </div>
                  <span class="muted small"
                    >${t("timelapse.count", { index: this._index + 1, count: frames.length })}</span
                  >
                </div>`
            : html`<p class="muted">${t("timelapse.none")}</p>`
        }
        ${
          hasCamera
            ? html`<label class="check">
                <input
                  type="checkbox"
                  .checked=${this._cameraOnly}
                  @change=${(e: Event) => {
                    this._pause();
                    this._cameraOnly = (e.target as HTMLInputElement).checked;
                    this._index = 0;
                  }}
                />
                <span>${t("timelapse.camera_only")}</span>
              </label>`
            : nothing
        }
      </div>
      <div class="dialog-actions">
        <button type="button" class="button text" @click=${() => this.close()}>
          ${t("common.close")}
        </button>
      </div>
    </dialog>`;
  }

  static override styles = [
    shared,
    css`
      dialog {
        width: min(720px, calc(100vw - 24px));
      }
      .stage {
        position: relative;
        background: #000;
        border-radius: 8px;
        overflow: hidden;
        aspect-ratio: 4 / 3;
      }
      .stage img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .date {
        position: absolute;
        left: 8px;
        bottom: 8px;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        font-size: 13px;
      }
      .preload {
        position: absolute;
        width: 0;
        height: 0;
        overflow: hidden;
      }
      .scrub {
        width: 100%;
        margin: 12px 0 4px;
      }
      .controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
      }
      .chips {
        display: flex;
        gap: 4px;
      }
      .check {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-top: 12px;
      }
    `,
  ];
}

define("pg-timelapse", PgTimelapse);
