import {
  mdiChevronLeft,
  mdiChevronRight,
  mdiClose,
  mdiCrop,
  mdiDeleteOutline,
  mdiOpenInNew,
  mdiPlus,
  mdiStar,
  mdiStarOutline,
} from "@mdi/js";
import { css, html, nothing, type PropertyValues } from "lit";

import { deletePhoto, errorMessage, setCover, updatePhoto } from "../api/client";
import type { Photo } from "../api/types";
import { shared } from "../styles/shared";
import { formatDate } from "../util/format";
import { PRESET_TAGS, tagLabel, toggleTag } from "../util/tags";
import { PgElement, define, icon } from "./base";
import type { PgConfirmDialog } from "./confirm-dialog";
import "./confirm-dialog";

/**
 * Full-size photo with navigation and editing of tags, note and cover.
 * Fires "photos-changed" after any change and "crop-photo" (Photo) to crop one.
 */
export class PgPhotoViewer extends PgElement {
  static override properties = {
    photos: { attribute: false },
    plantId: { attribute: false },
    coverId: { attribute: false },
    _index: { state: true },
    _tags: { state: true },
    _note: { state: true },
    _newTag: { state: true },
    _busy: { state: true },
    _error: { state: true },
  };

  declare photos: Photo[];
  declare plantId: string;
  declare coverId: string | null;
  declare _index: number;
  declare _tags: string[];
  declare _note: string;
  declare _newTag: string;
  declare _busy: boolean;
  declare _error: string;

  constructor() {
    super();
    this.photos = [];
    this.coverId = null;
    this._index = 0;
    this._tags = [];
    this._note = "";
    this._newTag = "";
    this._busy = false;
    this._error = "";
  }

  open(index: number): void {
    this._show(index);
    void this.updateComplete.then(() => this._dialog?.showModal());
  }

  close(): void {
    this._dialog?.close();
  }

  private get _dialog(): HTMLDialogElement | null {
    return this.renderRoot.querySelector("dialog");
  }

  private get _photo(): Photo | undefined {
    return this.photos[this._index];
  }

  private _show(index: number): void {
    const count = this.photos.length;
    this._index = count ? (index + count) % count : 0;
    this._tags = [...(this._photo?.tags ?? [])];
    this._note = this._photo?.note ?? "";
    this._newTag = "";
    this._error = "";
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has("photos") && this._dialog?.open) {
      if (!this.photos.length) {
        this.close();
        return;
      }
      // keep showing the same photo after a reload, if it still exists
      const previous = (changed.get("photos") as Photo[] | undefined)?.[this._index]?.id;
      const index = this.photos.findIndex((photo) => photo.id === previous);
      if (index >= 0) this._index = index;
      else this._show(Math.min(this._index, this.photos.length - 1));
    }
  }

  private get _dirty(): boolean {
    const photo = this._photo;
    if (!photo) return false;
    return photo.note !== this._note || JSON.stringify(photo.tags) !== JSON.stringify(this._tags);
  }

  private async _run(action: () => Promise<unknown>): Promise<void> {
    this._busy = true;
    this._error = "";
    try {
      await action();
      this.fire("photos-changed");
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  private _save(): Promise<void> {
    const photo = this._photo;
    if (!photo) return Promise.resolve();
    return this._run(() =>
      updatePhoto(this.hass, photo.id, { tags: this._tags, note: this._note }),
    );
  }

  private _setCover(): Promise<void> {
    const photo = this._photo;
    if (!photo) return Promise.resolve();
    return this._run(async () => {
      await setCover(this.hass, this.plantId, photo.id);
      this.coverId = photo.id;
    });
  }

  private async _delete(): Promise<void> {
    const photo = this._photo;
    const confirm = this.renderRoot.querySelector<PgConfirmDialog>("pg-confirm-dialog");
    if (!photo || !confirm) return;
    const ok = await confirm.ask(
      this.t("viewer.delete_confirm"),
      formatDate(photo.taken_at, this.language),
      this.t("common.delete"),
    );
    if (ok) await this._run(() => deletePhoto(this.hass, photo.id));
  }

  private _addTag(event: Event): void {
    event.preventDefault();
    const tag = this._newTag.trim();
    if (tag && !this._tags.includes(tag)) this._tags = [...this._tags, tag];
    this._newTag = "";
  }

  private _onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA"].includes(target.tagName)) return;
    if (event.key === "ArrowLeft") this._show(this._index - 1);
    if (event.key === "ArrowRight") this._show(this._index + 1);
  }

  protected override render() {
    const { t } = this;
    const photo = this._photo;
    const many = this.photos.length > 1;
    const isCover = photo?.id === this.coverId;
    const customTags = this._tags.filter(
      (tag) => !(PRESET_TAGS as readonly string[]).includes(tag),
    );
    return html`
      <dialog @keydown=${this._onKey} aria-label=${t("detail.photos")}>
        ${
          photo
            ? html`
                <div class="layout">
                  <div class="stage">
                    <img
                      src=${photo.urls.medium}
                      srcset="${photo.urls.medium} 1024w, ${photo.urls.original} 2560w"
                      sizes="(max-width: 900px) 100vw, 70vw"
                      alt=${t("viewer.taken", { date: formatDate(photo.taken_at, this.language) })}
                    />
                    ${
                      many
                        ? html`
                            <button
                              class="icon-button nav prev"
                              @click=${() => this._show(this._index - 1)}
                              aria-label=${t("viewer.previous")}
                            >
                              ${icon(mdiChevronLeft)}
                            </button>
                            <button
                              class="icon-button nav next"
                              @click=${() => this._show(this._index + 1)}
                              aria-label=${t("viewer.next")}
                            >
                              ${icon(mdiChevronRight)}
                            </button>
                            <span class="counter">${this._index + 1} / ${this.photos.length}</span>
                          `
                        : nothing
                    }
                  </div>
                  <aside>
                    <div class="aside-header">
                      <h2>
                        ${t("viewer.taken", { date: formatDate(photo.taken_at, this.language) })}
                      </h2>
                      <button
                        class="icon-button"
                        @click=${this.close}
                        aria-label=${t("common.close")}
                      >
                        ${icon(mdiClose)}
                      </button>
                    </div>
                    <div class="field">
                      <span>${t("viewer.tags")}</span>
                      <div class="chips">
                        ${PRESET_TAGS.map(
                          (tag) =>
                            html`<button
                              class="chip"
                              aria-pressed=${this._tags.includes(tag)}
                              @click=${() => (this._tags = toggleTag(this._tags, tag))}
                            >
                              ${tagLabel(tag, t)}
                            </button>`,
                        )}
                        ${customTags.map(
                          (tag) =>
                            html`<button
                              class="chip selected"
                              @click=${() => (this._tags = toggleTag(this._tags, tag))}
                              aria-label="${tag} ✕"
                            >
                              ${tag} ${icon(mdiClose)}
                            </button>`,
                        )}
                      </div>
                      <form class="add-tag" @submit=${this._addTag}>
                        <input
                          maxlength="40"
                          placeholder=${t("viewer.add_tag")}
                          .value=${this._newTag}
                          @input=${(e: Event) => (this._newTag = (e.target as HTMLInputElement).value)}
                        />
                        <button class="icon-button" type="submit" aria-label=${t("viewer.add_tag")}>
                          ${icon(mdiPlus)}
                        </button>
                      </form>
                    </div>
                    <label class="field">
                      <span>${t("viewer.note")}</span>
                      <textarea
                        maxlength="2000"
                        .value=${this._note}
                        @input=${(e: Event) => (this._note = (e.target as HTMLTextAreaElement).value)}
                      ></textarea>
                    </label>
                    ${
                      this._dirty
                        ? html`<button class="button" ?disabled=${this._busy} @click=${this._save}>
                            ${t("common.save")}
                          </button>`
                        : nothing
                    }
                    ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
                    <div class="actions">
                      <button
                        class="button secondary"
                        ?disabled=${this._busy || isCover}
                        @click=${this._setCover}
                      >
                        ${icon(isCover ? mdiStar : mdiStarOutline)}
                        ${isCover ? t("viewer.is_cover") : t("viewer.set_cover")}
                      </button>
                      <button
                        class="button text"
                        ?disabled=${this._busy}
                        @click=${() => this.fire<Photo>("crop-photo", photo)}
                      >
                        ${icon(mdiCrop)} ${t("viewer.crop")}
                      </button>
                      <a
                        class="button text"
                        href=${photo.urls.source}
                        target="_blank"
                        rel="noopener"
                      >
                        ${icon(mdiOpenInNew)} ${t("viewer.open_original")}
                      </a>
                      <button
                        class="button text danger"
                        ?disabled=${this._busy}
                        @click=${this._delete}
                      >
                        ${icon(mdiDeleteOutline)} ${t("viewer.delete")}
                      </button>
                    </div>
                  </aside>
                </div>
              `
            : nothing
        }
      </dialog>
      <pg-confirm-dialog .hass=${this.hass}></pg-confirm-dialog>
    `;
  }

  static override styles = [
    shared,
    css`
      dialog {
        width: min(1200px, calc(100vw - 24px));
        height: min(820px, calc(100vh - 24px));
        overflow: hidden;
      }
      .layout {
        display: grid;
        grid-template-columns: 1fr 320px;
        height: 100%;
      }
      .stage {
        position: relative;
        display: grid;
        place-items: center;
        min-height: 0;
        background: #111;
      }
      .stage img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      .nav {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(0, 0, 0, 0.45);
        color: #fff;
      }
      .nav:hover {
        background: rgba(0, 0, 0, 0.65);
      }
      .prev {
        left: 12px;
      }
      .next {
        right: 12px;
      }
      .counter {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        padding: 2px 10px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.5);
        color: #fff;
        font-size: 12px;
      }
      aside {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 12px 16px 16px;
        overflow: auto;
      }
      .aside-header {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .aside-header h2 {
        flex: 1;
        margin: 0;
        font-size: 16px;
        font-weight: 500;
      }
      .add-tag {
        display: flex;
        gap: 4px;
        margin-top: 6px;
      }
      .actions {
        display: grid;
        gap: 4px;
        justify-items: start;
        margin-top: auto;
      }
      a.button {
        text-decoration: none;
      }
      @media (max-width: 800px) {
        dialog {
          width: 100vw;
          max-width: 100vw;
          height: 100vh;
          max-height: 100vh;
          border-radius: 0;
        }
        .layout {
          grid-template-columns: 1fr;
          grid-template-rows: minmax(0, 55vh) auto;
          overflow: auto;
        }
        aside {
          overflow: visible;
        }
      }
    `,
  ];
}

define("pg-photo-viewer", PgPhotoViewer);
