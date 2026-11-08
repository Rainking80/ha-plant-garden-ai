import {
  mdiAccountEditOutline,
  mdiCreationOutline,
  mdiDeleteOutline,
  mdiImagePlusOutline,
  mdiPencilOutline,
  mdiSprout,
  mdiMapMarkerRadiusOutline,
  mdiStar,
} from "@mdi/js";
import { css, html, nothing, type PropertyValues } from "lit";

import {
  addMeasurement,
  deleteMeasurement,
  deletePlant,
  errorMessage,
  getPlant,
  movePlants,
} from "../api/client";
import type {
  FieldSource,
  GardenChangeEvent,
  Photo,
  Plant,
  PlantDetail,
  PlantFields,
  Point,
} from "../api/types";
import { PgElement, define, icon } from "../components/base";
import type { PgConfirmDialog } from "../components/confirm-dialog";
import "../components/confirm-dialog";
import "../components/growth-chart";
import type { PgPhotoViewer } from "../components/photo-viewer";
import "../components/photo-viewer";
import "../components/water-panel";
import "../components/ai-panel";
import type { PgPlantForm } from "../components/plant-form";
import "../components/plant-form";
import type { TranslationKey } from "../i18n";
import { STALE_AFTER_MS, type GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import {
  formatAge,
  formatDate,
  formatLength,
  formatMonth,
  formatNumber,
  monthKey,
  todayIso,
} from "../util/format";
import { navigate } from "../util/navigate";
import { parseNumber } from "../util/plant-form";
import { tagLabel } from "../util/tags";
import { suggestedPosition, uploadFiles } from "../util/upload";

interface Fact {
  label: TranslationKey;
  value: string;
  source?: FieldSource;
}

export function groupByMonth(photos: Photo[]): { key: string; photos: Photo[] }[] {
  const groups: { key: string; photos: Photo[] }[] = [];
  for (const photo of photos) {
    const key = monthKey(photo.taken_at);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.photos.push(photo);
    else groups.push({ key, photos: [photo] });
  }
  return groups;
}

/** Everything about one plant: profile, growth, photo timeline. */
export class PgPlantDetail extends PgElement {
  static override properties = {
    store: { attribute: false },
    plantId: { attribute: false },
    prefix: {},
    _detail: { state: true },
    _error: { state: true },
    _notFound: { state: true },
    _uploading: { state: true },
    _uploadErrors: { state: true },
    _dragging: { state: true },
    _mDate: { state: true },
    _mHeight: { state: true },
    _mWidth: { state: true },
    _mError: { state: true },
    _gpsSuggestion: { state: true },
  };

  declare store: GardenStore;
  declare plantId: string;
  declare prefix: string;
  declare _detail: PlantDetail | undefined;
  declare _error: string;
  declare _notFound: boolean;
  declare _uploading: string;
  declare _uploadErrors: string[];
  declare _dragging: boolean;
  declare _mDate: string;
  declare _mHeight: string;
  declare _mWidth: string;
  declare _mError: string;
  declare _gpsSuggestion: Point | null;

  private _loadedAt = 0;
  private _reloadTimer?: ReturnType<typeof setTimeout>;

  private readonly _onPlantChanged = (event: Event) => {
    const change = (event as CustomEvent<GardenChangeEvent>).detail;
    if (change.plant_id !== this.plantId) return;
    if (change.kind === "plant_removed") {
      this._notFound = true;
      return;
    }
    clearTimeout(this._reloadTimer);
    this._reloadTimer = setTimeout(() => void this._load(), 150);
  };

  private readonly _onStoreChange = () => {
    if (Date.now() - this._loadedAt > STALE_AFTER_MS) void this._load();
  };

  constructor() {
    super();
    this.prefix = "/plant-garden";
    this._error = "";
    this._notFound = false;
    this._uploading = "";
    this._uploadErrors = [];
    this._dragging = false;
    this._mDate = todayIso();
    this._mHeight = "";
    this._mWidth = "";
    this._mError = "";
    this._gpsSuggestion = null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.store?.addEventListener("plant-changed", this._onPlantChanged);
    this.store?.addEventListener("change", this._onStoreChange);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this._reloadTimer);
    this.store?.removeEventListener("plant-changed", this._onPlantChanged);
    this.store?.removeEventListener("change", this._onStoreChange);
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has("plantId") && this.plantId) {
      this._detail = undefined;
      this._notFound = false;
      this._error = "";
      void this._load();
    }
  }

  private async _load(): Promise<void> {
    const plantId = this.plantId;
    try {
      const detail = await getPlant(this.hass, plantId);
      if (plantId !== this.plantId) return; // navigated away meanwhile
      this._detail = detail;
      this._error = "";
      this._loadedAt = Date.now();
    } catch (err) {
      if ((err as { code?: string }).code === "not_found") this._notFound = true;
      else this._error = errorMessage(err);
    }
  }

  // ------------------------------------------------------------ actions
  private _edit(): void {
    const plant = this._detail?.plant;
    if (plant) this.renderRoot.querySelector<PgPlantForm>("pg-plant-form")?.open(plant);
  }

  private async _delete(): Promise<void> {
    const plant = this._detail?.plant;
    const confirm = this.renderRoot.querySelector<PgConfirmDialog>("pg-confirm-dialog");
    if (!plant || !confirm) return;
    const ok = await confirm.ask(
      this.t("detail.delete_title", { name: plant.name }),
      this.t("detail.delete_body"),
      this.t("common.delete"),
    );
    if (!ok) return;
    try {
      await deletePlant(this.hass, plant.id);
      void this.store.refresh();
      navigate(this.prefix, { replace: true });
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private _pickFiles(): void {
    this.renderRoot.querySelector<HTMLInputElement>("#file-input")?.click();
  }

  private async _upload(files: File[]): Promise<void> {
    const images = files.filter((file) => file.type.startsWith("image/") || file.type === "");
    if (!images.length || this._uploading) return;
    this._uploadErrors = [];
    const result = await uploadFiles(this.hass, this.plantId, images, this.t, (n, total) => {
      this._uploading = this.t("detail.uploading", { current: n, total });
    });
    this._uploading = "";
    this._uploadErrors = result.errors;
    // a photo with GPS can suggest the spot of a plant that is not on the plan yet
    const plant = this._detail?.plant;
    if (plant && !plant.position) {
      this._gpsSuggestion = suggestedPosition(result.gps, this.store.layout?.origin);
    }
    await this._load();
  }

  private async _acceptGps(): Promise<void> {
    const position = this._gpsSuggestion;
    this._gpsSuggestion = null;
    if (!position) return;
    try {
      await movePlants(this.hass, [{ plant_id: this.plantId, position }]);
      void this.store.refresh();
      await this._load();
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private _onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this._upload([...(input.files ?? [])]);
    input.value = "";
  }

  private _onDrop(event: DragEvent): void {
    event.preventDefault();
    this._dragging = false;
    void this._upload([...(event.dataTransfer?.files ?? [])]);
  }

  private _onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    this._dragging = true;
  }

  private _openPhoto(photo: Photo): void {
    const index = this._detail?.photos.findIndex((p) => p.id === photo.id) ?? -1;
    if (index >= 0) this.renderRoot.querySelector<PgPhotoViewer>("pg-photo-viewer")?.open(index);
  }

  private async _addMeasurement(event: Event): Promise<void> {
    event.preventDefault();
    const height = parseNumber(this._mHeight);
    const width = parseNumber(this._mWidth);
    if (height === null && width === null) {
      this._mError = this.t("detail.measurement_needs_value");
      return;
    }
    try {
      await addMeasurement(this.hass, this.plantId, {
        measured_on: this._mDate || todayIso(),
        height_cm: height,
        width_cm: width,
      });
      this._mHeight = "";
      this._mWidth = "";
      this._mError = "";
      await this._load();
    } catch (err) {
      this._mError = errorMessage(err);
    }
  }

  private async _deleteMeasurement(id: string): Promise<void> {
    try {
      await deleteMeasurement(this.hass, id);
      await this._load();
    } catch (err) {
      this._mError = errorMessage(err);
    }
  }

  // ------------------------------------------------------------ rendering
  private _facts(plant: Plant): Fact[] {
    const { t, language } = this;
    const src = (key: keyof PlantFields) => plant.sources[key];
    const facts: (Fact | null)[] = [
      { label: "field.category", value: t(`category.${plant.category}`), source: src("category") },
      {
        label: "field.location_type",
        value: t(`location.${plant.location_type}`),
        source: src("location_type"),
      },
      plant.light
        ? { label: "field.light", value: t(`light.${plant.light}`), source: src("light") }
        : null,
      plant.water_need
        ? {
            label: "field.water_need",
            value: t(`water.${plant.water_need}`),
            source: src("water_need"),
          }
        : null,
      plant.soil_type
        ? {
            label: "field.soil_type",
            value: t(`soil.${plant.soil_type}`),
            source: src("soil_type"),
          }
        : null,
      plant.age_months_now !== null
        ? {
            label: "field.age",
            value: formatAge(plant.age_months_now, t),
            source: src("age") ?? src("planted_on"),
          }
        : null,
      plant.planted_on
        ? {
            label: "field.planted_on",
            value: formatDate(plant.planted_on, language),
            source: src("planted_on"),
          }
        : null,
      plant.height_cm !== null
        ? { label: "field.height", value: formatLength(plant.height_cm, language) }
        : null,
      plant.width_cm !== null
        ? { label: "field.width", value: formatLength(plant.width_cm, language) }
        : null,
      plant.min_temperature_c !== null
        ? {
            label: "field.min_temperature_c",
            value: t("detail.frost_to", { temp: formatNumber(plant.min_temperature_c, language) }),
            source: src("min_temperature_c"),
          }
        : null,
      plant.root_depth_cm !== null
        ? {
            label: "field.root_depth_cm",
            value: formatLength(plant.root_depth_cm, language),
            source: src("root_depth_cm"),
          }
        : null,
    ];
    return facts.filter((fact): fact is Fact => fact !== null);
  }

  private _sourceMark(source: FieldSource | undefined) {
    if (!source) return nothing;
    const { t } = this;
    const title =
      source.source === "ai"
        ? source.confidence !== null
          ? t("source.ai_confidence", { confidence: Math.round(source.confidence * 100) })
          : t("source.ai")
        : t(`source.${source.source}`);
    const path = source.source === "user" ? mdiAccountEditOutline : mdiCreationOutline;
    return html`<span class="source source-${source.source}" title=${title}
      >${icon(path, title)}</span
    >`;
  }

  protected override render() {
    const { t } = this;
    if (this._notFound) {
      return html`<section class="card message">
        <p>${t("detail.not_found")}</p>
        <button class="button" @click=${() => navigate(this.prefix, { replace: true })}>
          ${t("detail.back_to_list")}
        </button>
      </section>`;
    }
    if (!this._detail) {
      return this._error
        ? html`<p class="error-text" role="alert">${this._error}</p>`
        : html`<p class="muted loading">${t("panel.loading")}</p>`;
    }
    const { plant, photos, measurements } = this._detail;
    const cover = plant.cover;
    const subtitle = [plant.scientific_name, plant.variety && `'${plant.variety}'`]
      .filter(Boolean)
      .join(" ");

    return html`
      ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
      <section class="card hero">
        <button
          class="cover"
          ?disabled=${!cover}
          @click=${() => {
            const photo = photos.find((p) => p.id === cover?.id);
            if (photo) this._openPhoto(photo);
          }}
          aria-label=${t("detail.cover")}
        >
          ${
            cover
              ? html`<img src=${cover.urls.medium} alt="" />`
              : html`<span class="placeholder">${icon(mdiSprout)}</span>`
          }
        </button>
        <div class="summary">
          <div class="title-row">
            <h2>${plant.name}</h2>
            <span class="status status-${plant.status}">${t(`status.${plant.status}`)}</span>
          </div>
          ${subtitle ? html`<p class="latin">${subtitle}</p>` : nothing}
          ${plant.family ? html`<p class="muted family">${plant.family}</p>` : nothing}
          ${
            plant.tags.length
              ? html`<div class="chips">
                  ${plant.tags.map((tag) => html`<span class="chip static">${tag}</span>`)}
                </div>`
              : nothing
          }
          <dl class="facts">
            ${this._facts(plant).map(
              (fact) =>
                html`<div>
                  <dt>${t(fact.label)}</dt>
                  <dd>${fact.value} ${this._sourceMark(fact.source)}</dd>
                </div>`,
            )}
          </dl>
          <div class="actions">
            <button class="button" @click=${this._pickFiles} ?disabled=${Boolean(this._uploading)}>
              ${icon(mdiImagePlusOutline)} ${t("detail.add_photos")}
            </button>
            <button class="button secondary" @click=${this._edit}>
              ${icon(mdiPencilOutline)} ${t("detail.edit")}
            </button>
            ${
              plant.position
                ? html`<button
                    class="button secondary"
                    @click=${() => navigate(`${this.prefix}/plan/${plant.id}`)}
                  >
                    ${icon(mdiMapMarkerRadiusOutline)} ${t("plan.show_on_plan")}
                  </button>`
                : nothing
            }
            <button class="button text danger" @click=${this._delete}>
              ${icon(mdiDeleteOutline)} ${t("detail.delete")}
            </button>
          </div>
        </div>
      </section>

      ${
        plant.notes
          ? html`<section class="card block">
              <h3>${t("detail.notes")}</h3>
              <p class="notes">${plant.notes}</p>
            </section>`
          : nothing
      }

      <section class="card block">
        <h3>${t("detail.growth")}</h3>
        ${
          measurements.length
            ? html`<pg-growth-chart
                .hass=${this.hass}
                .measurements=${measurements}
              ></pg-growth-chart>`
            : html`<p class="muted">${t("detail.no_measurements")}</p>`
        }
        ${measurements.length ? this._renderMeasurementList() : nothing}
        <form class="measure" @submit=${this._addMeasurement}>
          <label class="field">
            <span>${t("detail.measured_on")}</span>
            <input
              type="date"
              .value=${this._mDate}
              @input=${(e: Event) => (this._mDate = (e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            <span>${t("form.height_cm")}</span>
            <input
              type="number"
              min="0"
              inputmode="decimal"
              .value=${this._mHeight}
              @input=${(e: Event) => (this._mHeight = (e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            <span>${t("form.width_cm")}</span>
            <input
              type="number"
              min="0"
              inputmode="decimal"
              .value=${this._mWidth}
              @input=${(e: Event) => (this._mWidth = (e.target as HTMLInputElement).value)}
            />
          </label>
          <button class="button secondary" type="submit">${t("detail.add_measurement")}</button>
          ${this._mError ? html`<p class="error-text" role="alert">${this._mError}</p>` : nothing}
        </form>
      </section>

      <section class="card block">
        <pg-water-panel
          .hass=${this.hass}
          .store=${this.store}
          .plantId=${plant.id}
        ></pg-water-panel>
      </section>

      <section class="card block">
        <pg-ai-panel
          .hass=${this.hass}
          .store=${this.store}
          .plantId=${plant.id}
          .photos=${photos}
        ></pg-ai-panel>
      </section>

      <section
        class="card block photos ${this._dragging ? "dragging" : ""}"
        @dragover=${this._onDragOver}
        @dragleave=${() => (this._dragging = false)}
        @drop=${this._onDrop}
      >
        <div class="block-header">
          <h3>${t("detail.photos")}</h3>
          <button
            class="button text"
            @click=${this._pickFiles}
            ?disabled=${Boolean(this._uploading)}
          >
            ${icon(mdiImagePlusOutline)} ${t("detail.add_photos")}
          </button>
        </div>
        ${this._uploading ? html`<p class="muted" aria-live="polite">${this._uploading}</p>` : nothing}
        ${
          this._gpsSuggestion
            ? html`<div class="gps" role="status">
                <span>${t("detail.gps_found")}</span>
                <button class="button secondary" @click=${this._acceptGps}>
                  ${t("detail.gps_accept")}
                </button>
                <button class="button text" @click=${() => (this._gpsSuggestion = null)}>
                  ${t("common.cancel")}
                </button>
              </div>`
            : nothing
        }
        ${
          this._uploadErrors.length
            ? html`<ul class="error-text" role="alert">
                ${this._uploadErrors.map((error) => html`<li>${error}</li>`)}
              </ul>`
            : nothing
        }
        ${photos.length ? this._renderTimeline(photos, cover?.id ?? null) : html`<p class="muted">${t("detail.no_photos")}</p>`}
        ${this._dragging ? html`<div class="drop-hint">${t("detail.drop_photos")}</div>` : nothing}
      </section>

      <input
        id="file-input"
        class="sr-only"
        type="file"
        accept="image/*"
        multiple
        @change=${this._onFileInput}
      />
      <pg-plant-form .hass=${this.hass} @plant-saved=${() => this._load()}></pg-plant-form>
      <pg-photo-viewer
        .hass=${this.hass}
        .photos=${photos}
        .plantId=${plant.id}
        .coverId=${cover?.id ?? null}
        @photos-changed=${() => this._load()}
      ></pg-photo-viewer>
      <pg-confirm-dialog .hass=${this.hass}></pg-confirm-dialog>
    `;
  }

  private _renderMeasurementList() {
    const { t, language } = this;
    const rows = [...(this._detail?.measurements ?? [])].reverse();
    return html`<table>
      <thead>
        <tr>
          <th>${t("detail.measured_on")}</th>
          <th>${t("field.height")}</th>
          <th>${t("field.width")}</th>
          <th><span class="sr-only">${t("common.delete")}</span></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(
          (m) =>
            html`<tr>
              <td>${formatDate(m.measured_on, language)}</td>
              <td>${formatLength(m.height_cm, language) || "–"}</td>
              <td>${formatLength(m.width_cm, language) || "–"}</td>
              <td class="row-action">
                <button
                  class="icon-button"
                  @click=${() => this._deleteMeasurement(m.id)}
                  aria-label=${t("detail.delete_measurement")}
                  title=${t("detail.delete_measurement")}
                >
                  ${icon(mdiDeleteOutline)}
                </button>
              </td>
            </tr>`,
        )}
      </tbody>
    </table>`;
  }

  private _renderTimeline(photos: Photo[], coverId: string | null) {
    const { t, language } = this;
    return groupByMonth(photos).map(
      (group) =>
        html`<div class="month">
          <h4>${formatMonth(group.photos[0]?.taken_at ?? "", language)}</h4>
          <div class="thumbs">
            ${group.photos.map(
              (photo) =>
                html`<button
                  class="thumb"
                  @click=${() => this._openPhoto(photo)}
                  aria-label=${t("viewer.taken", { date: formatDate(photo.taken_at, language) })}
                >
                  <img src=${photo.urls.thumb} alt="" loading="lazy" decoding="async" />
                  ${photo.id === coverId ? html`<span class="star">${icon(mdiStar)}</span>` : nothing}
                  ${
                    photo.tags.length
                      ? html`<span class="tags">
                          ${photo.tags.map(
                            (tag) =>
                              html`<span class="tag ${tag === "problem" ? "problem" : ""}"
                                >${tagLabel(tag, t)}</span
                              >`,
                          )}
                        </span>`
                      : nothing
                  }
                </button>`,
            )}
          </div>
        </div>`,
    );
  }

  static override styles = [
    shared,
    css`
      :host {
        display: grid;
        gap: 16px;
      }
      .loading,
      .message {
        text-align: center;
        padding: 32px 16px;
      }
      .hero {
        display: grid;
        grid-template-columns: minmax(240px, 400px) 1fr;
        overflow: hidden;
      }
      .cover {
        all: unset;
        display: block;
        aspect-ratio: 4 / 3;
        background: var(--pg-leaf-soft);
        cursor: zoom-in;
      }
      .cover:disabled {
        cursor: default;
      }
      .cover:focus-visible {
        outline: 2px solid var(--pg-accent);
        outline-offset: -2px;
      }
      .cover img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .placeholder {
        display: grid;
        place-items: center;
        height: 100%;
        color: var(--pg-leaf);
      }
      .placeholder .icon {
        width: 64px;
        height: 64px;
        opacity: 0.6;
      }
      .summary {
        display: grid;
        align-content: start;
        gap: 6px;
        padding: 20px 24px;
        min-width: 0;
      }
      .title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 4px 14px;
      }
      h2 {
        margin: 0;
        font-size: 26px;
        font-weight: 500;
      }
      .latin {
        margin: 0;
        font-style: italic;
        color: var(--pg-text-muted);
      }
      .family {
        margin: 0;
        font-size: 13px;
      }
      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 12px 20px;
        margin: 12px 0 8px;
      }
      dt {
        font-size: 12px;
        color: var(--pg-text-muted);
      }
      dd {
        margin: 2px 0 0;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .source .icon {
        width: 14px;
        height: 14px;
        color: var(--pg-text-muted);
        opacity: 0.7;
      }
      .source-ai .icon {
        color: var(--pg-accent);
        opacity: 1;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
      }
      .block {
        position: relative;
        padding: 16px 20px 20px;
      }
      .block h3 {
        margin: 0 0 12px;
        font-size: 18px;
        font-weight: 500;
      }
      .block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .block-header h3 {
        margin: 0;
      }
      .notes {
        margin: 0;
        white-space: pre-wrap;
        line-height: 1.5;
      }
      table {
        width: 100%;
        margin-top: 12px;
        border-collapse: collapse;
        font-size: 14px;
      }
      th {
        text-align: left;
        font-size: 12px;
        font-weight: 500;
        color: var(--pg-text-muted);
        padding: 4px 8px;
      }
      td {
        padding: 2px 8px;
        border-top: 1px solid var(--pg-divider);
      }
      .row-action {
        width: 48px;
        text-align: right;
      }
      .row-action .icon-button {
        width: 32px;
        height: 32px;
        color: var(--pg-text-muted);
      }
      .row-action .icon {
        width: 18px;
        height: 18px;
      }
      .measure {
        display: grid;
        grid-template-columns: repeat(3, minmax(110px, 1fr)) auto;
        align-items: end;
        gap: 12px;
        margin-top: 16px;
      }
      .measure .error-text {
        grid-column: 1 / -1;
        margin: 0;
      }
      .month h4 {
        margin: 16px 0 8px;
        font-size: 13px;
        font-weight: 600;
        color: var(--pg-text-muted);
      }
      .thumbs {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 8px;
      }
      .thumb {
        all: unset;
        position: relative;
        aspect-ratio: 1;
        border-radius: 10px;
        overflow: hidden;
        background: var(--pg-leaf-soft);
        cursor: zoom-in;
      }
      .thumb:focus-visible {
        outline: 2px solid var(--pg-accent);
        outline-offset: 2px;
      }
      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 200ms ease;
      }
      .thumb:hover img {
        transform: scale(1.04);
      }
      .star {
        position: absolute;
        top: 6px;
        right: 6px;
        color: #ffd54f;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
      }
      .star .icon {
        width: 18px;
        height: 18px;
      }
      .tags {
        position: absolute;
        left: 6px;
        bottom: 6px;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .tag {
        padding: 1px 7px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        font-size: 11px;
      }
      .tag.problem {
        background: var(--error-color, #db4437);
      }
      .photos.dragging {
        outline: 2px dashed var(--pg-accent);
        outline-offset: -6px;
      }
      .gps {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin: 8px 0;
        padding: 8px 12px;
        border-radius: 12px;
        background: color-mix(in srgb, var(--pg-accent) 10%, transparent);
      }
      .gps span {
        flex: 1 1 200px;
      }
      .drop-hint {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        border-radius: inherit;
        background: color-mix(in srgb, var(--pg-surface) 85%, transparent);
        color: var(--pg-accent);
        font-weight: 500;
        pointer-events: none;
      }
      @media (max-width: 760px) {
        .hero {
          grid-template-columns: 1fr;
        }
        .summary {
          padding: 16px;
        }
        .measure {
          grid-template-columns: 1fr 1fr;
        }
        .measure .button {
          grid-column: 1 / -1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .thumb img {
          transition: none;
        }
        .thumb:hover img {
          transform: none;
        }
      }
    `,
  ];
}

define("pg-plant-detail", PgPlantDetail);
