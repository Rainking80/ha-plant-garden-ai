import { mdiClose, mdiImagePlusOutline } from "@mdi/js";
import { css, html, nothing } from "lit";

import { addMeasurement, createPlant, errorMessage, updatePlant } from "../api/client";
import {
  LIGHTS,
  LOCATION_TYPES,
  PLANT_CATEGORIES,
  PLANT_STATUSES,
  SOIL_TYPES,
  WATER_NEEDS,
  type Plant,
} from "../api/types";
import type { TranslationKey } from "../i18n";
import { shared } from "../styles/shared";
import { todayIso } from "../util/format";
import {
  changedFields,
  emptyFormState,
  fieldsFromFormState,
  formStateFromPlant,
  parseNumber,
  plantFields,
  type PlantFormState,
} from "../util/plant-form";
import { uploadFiles } from "../util/upload";
import { PgElement, define, icon } from "./base";

export interface PlantSavedDetail {
  plant: Plant;
  created: boolean;
}

/**
 * Dialog to create or edit a plant. On create it also uploads the chosen photos
 * and stores the current size as a first measurement.
 * Fires "plant-saved" (PlantSavedDetail) when done.
 */
export class PgPlantForm extends PgElement {
  static override properties = {
    _plant: { state: true },
    _state: { state: true },
    _files: { state: true },
    _height: { state: true },
    _width: { state: true },
    _busy: { state: true },
    _progress: { state: true },
    _errors: { state: true },
  };

  declare _plant: Plant | undefined;
  declare _state: PlantFormState;
  declare _files: File[];
  declare _height: string;
  declare _width: string;
  declare _busy: boolean;
  declare _progress: string;
  declare _errors: string[];
  /** Set after a create whose photo uploads partly failed. */
  private _created?: Plant;

  constructor() {
    super();
    this._reset();
  }

  private _reset(plant?: Plant): void {
    this._plant = plant;
    this._state = plant ? formStateFromPlant(plant) : emptyFormState();
    this._files = [];
    this._height = "";
    this._width = "";
    this._busy = false;
    this._progress = "";
    this._errors = [];
    this._created = undefined;
  }

  open(plant?: Plant): void {
    this._reset(plant);
    void this.updateComplete.then(() => {
      this._dialog?.showModal();
      this.renderRoot.querySelector<HTMLInputElement>("#name")?.focus();
    });
  }

  close(): void {
    this._dialog?.close();
  }

  private get _dialog(): HTMLDialogElement | null {
    return this.renderRoot.querySelector("dialog");
  }

  private _set(key: keyof PlantFormState, value: string): void {
    this._state = { ...this._state, [key]: value };
  }

  private _input(key: keyof PlantFormState) {
    return (event: Event) => this._set(key, (event.target as HTMLInputElement).value);
  }

  private async _submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this._busy) return;
    if (this._created) {
      this._finish(this._created, true);
      return;
    }
    const fields = fieldsFromFormState(this._state);
    if (!fields.name) {
      this._errors = [this.t("form.name_required")];
      return;
    }
    this._busy = true;
    this._errors = [];
    try {
      if (this._plant) {
        const changes = changedFields(fields, plantFields(this._plant));
        const plant = Object.keys(changes).length
          ? await updatePlant(this.hass, this._plant.id, changes)
          : this._plant;
        this._finish(plant, false);
      } else {
        await this._create(fields);
      }
    } catch (err) {
      this._errors = [errorMessage(err)];
    } finally {
      this._busy = false;
      this._progress = "";
    }
  }

  private async _create(fields: ReturnType<typeof fieldsFromFormState>): Promise<void> {
    const plant = await createPlant(this.hass, {
      ...changedFields(fields, null),
      name: fields.name,
    });
    const height = parseNumber(this._height);
    const width = parseNumber(this._width);
    const errors: string[] = [];
    if (height !== null || width !== null) {
      try {
        await addMeasurement(this.hass, plant.id, {
          measured_on: todayIso(),
          height_cm: height,
          width_cm: width,
        });
      } catch (err) {
        errors.push(errorMessage(err));
      }
    }
    if (this._files.length) {
      const result = await uploadFiles(this.hass, plant.id, this._files, this.t, (n, total) => {
        this._progress = this.t("detail.uploading", { current: n, total });
      });
      errors.push(...result.errors);
    }
    if (errors.length) {
      // The plant exists; show what went wrong and let the user continue.
      this._created = plant;
      this._errors = errors;
      return;
    }
    this._finish(plant, true);
  }

  private _finish(plant: Plant, created: boolean): void {
    this.close();
    this.fire<PlantSavedDetail>("plant-saved", { plant, created });
  }

  private _select(
    key: keyof PlantFormState,
    values: readonly string[],
    prefix: string,
    optional: boolean,
  ) {
    const current = this._state[key];
    return html`<select id=${key} .value=${current} @change=${this._input(key)}>
      ${
        optional
          ? html`<option value="" ?selected=${current === ""}>${this.t("common.not_set")}</option>`
          : nothing
      }
      ${values.map(
        (value) =>
          html`<option value=${value} ?selected=${current === value}>
            ${this.t(`${prefix}.${value}` as TranslationKey)}
          </option>`,
      )}
    </select>`;
  }

  private _text(key: keyof PlantFormState, label: TranslationKey, type = "text") {
    return html`<label class="field">
      <span>${this.t(label)}</span>
      <input id=${key} type=${type} .value=${this._state[key]} @input=${this._input(key)} />
    </label>`;
  }

  protected override render() {
    const { t } = this;
    const editing = Boolean(this._plant);
    const title = editing
      ? t("form.edit_title", { name: this._plant?.name ?? "" })
      : t("form.create_title");
    return html`
      <dialog aria-labelledby="form-title" @close=${() => (this._busy = false)}>
        <form @submit=${this._submit} novalidate>
          <div class="dialog-header">
            <h2 id="form-title">${title}</h2>
            <button
              type="button"
              class="icon-button"
              @click=${this.close}
              aria-label=${t("common.close")}
            >
              ${icon(mdiClose)}
            </button>
          </div>
          <div class="dialog-body">
            <fieldset ?disabled=${this._busy || Boolean(this._created)}>
              <legend>${t("form.section_basics")}</legend>
              <div class="grid">
                <label class="field wide">
                  <span>${t("field.name")} *</span>
                  <input
                    id="name"
                    required
                    maxlength="100"
                    autocomplete="off"
                    .value=${this._state.name}
                    @input=${this._input("name")}
                  />
                </label>
                <label class="field">
                  <span>${t("field.scientific_name")}</span>
                  <input
                    class="latin"
                    .value=${this._state.scientific_name}
                    @input=${this._input("scientific_name")}
                  />
                </label>
                <label class="field">
                  <span>${t("field.variety")}</span>
                  <input .value=${this._state.variety} @input=${this._input("variety")} />
                </label>
              </div>
            </fieldset>

            <fieldset ?disabled=${this._busy || Boolean(this._created)}>
              <legend>${t("form.section_classification")}</legend>
              <div class="grid">
                <label class="field"
                  ><span>${t("field.category")}</span>
                  ${this._select("category", PLANT_CATEGORIES, "category", false)}</label
                >
                <label class="field"
                  ><span>${t("field.location_type")}</span>
                  ${this._select("location_type", LOCATION_TYPES, "location", false)}</label
                >
                <label class="field"
                  ><span>${t("field.light")}</span>
                  ${this._select("light", LIGHTS, "light", true)}</label
                >
                <label class="field"
                  ><span>${t("field.water_need")}</span>
                  ${this._select("water_need", WATER_NEEDS, "water", true)}</label
                >
                <label class="field"
                  ><span>${t("field.soil_type")}</span>
                  ${this._select("soil_type", SOIL_TYPES, "soil", true)}</label
                >
                ${
                  editing
                    ? html`<label class="field"
                        ><span>${t("field.status")}</span>
                        ${this._select("status", PLANT_STATUSES, "status", false)}</label
                      >`
                    : nothing
                }
              </div>
            </fieldset>

            <fieldset ?disabled=${this._busy || Boolean(this._created)}>
              <legend>${t("form.section_age")}</legend>
              <div class="grid">
                ${this._text("planted_on", "field.planted_on", "date")}
                <div class="age wide">
                  <label class="field">
                    <span>${t("form.age_years")}</span>
                    <input
                      type="number"
                      min="0"
                      inputmode="numeric"
                      .value=${this._state.age_years}
                      @input=${this._input("age_years")}
                    />
                  </label>
                  <label class="field">
                    <span>${t("form.age_months")}</span>
                    <input
                      type="number"
                      min="0"
                      max="11"
                      inputmode="numeric"
                      .value=${this._state.age_months}
                      @input=${this._input("age_months")}
                    />
                  </label>
                  <label class="field">
                    <span>${t("form.age_on")}</span>
                    <input
                      type="date"
                      .value=${this._state.age_on}
                      @input=${this._input("age_on")}
                    />
                  </label>
                  <small class="hint">${t("form.age_hint")}</small>
                </div>
              </div>
            </fieldset>

            ${editing ? nothing : this._renderStart()}

            <fieldset ?disabled=${this._busy || Boolean(this._created)}>
              <legend>${t("form.section_more")}</legend>
              <div class="grid">
                ${this._text("min_temperature_c", "field.min_temperature_c", "number")}
                ${this._text("root_depth_cm", "field.root_depth_cm", "number")}
                <label class="field wide">
                  <span>${t("field.tags")}</span>
                  <input .value=${this._state.tags} @input=${this._input("tags")} />
                  <small>${t("form.tags_hint")}</small>
                </label>
                <label class="field wide">
                  <span>${t("field.notes")}</span>
                  <textarea .value=${this._state.notes} @input=${this._input("notes")}></textarea>
                </label>
              </div>
            </fieldset>
          </div>
          <div class="dialog-actions">
            ${this._progress ? html`<span class="progress muted">${this._progress}</span>` : nothing}
            ${
              this._errors.length
                ? html`<ul class="errors error-text" role="alert">
                    ${this._errors.map((error) => html`<li>${error}</li>`)}
                  </ul>`
                : nothing
            }
            ${
              this._created
                ? nothing
                : html`<button type="button" class="button text" @click=${this.close}>
                    ${t("common.cancel")}
                  </button>`
            }
            <button type="submit" class="button" ?disabled=${this._busy}>
              ${
                this._created
                  ? t("form.continue", { name: this._created.name })
                  : editing
                    ? t("common.save")
                    : t("form.create")
              }
            </button>
          </div>
        </form>
      </dialog>
    `;
  }

  private _renderStart() {
    const { t } = this;
    return html`<fieldset ?disabled=${this._busy || Boolean(this._created)}>
      <legend>${t("form.section_start")}</legend>
      <div class="grid">
        <label class="field wide files">
          <span>${t("form.photos")}</span>
          <span class="file-button button secondary">
            ${icon(mdiImagePlusOutline)} ${t("detail.add_photos")}
            ${
              this._files.length
                ? html`<b>· ${t("form.photos_selected", { n: this._files.length })}</b>`
                : nothing
            }
          </span>
          <input
            class="sr-only"
            type="file"
            accept="image/*"
            multiple
            @change=${(event: Event) => {
              this._files = [...((event.target as HTMLInputElement).files ?? [])];
            }}
          />
          <small>${t("form.photos_hint")}</small>
        </label>
        <label class="field">
          <span>${t("form.height_cm")}</span>
          <input
            type="number"
            min="0"
            inputmode="decimal"
            .value=${this._height}
            @input=${(e: Event) => (this._height = (e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>${t("form.width_cm")}</span>
          <input
            type="number"
            min="0"
            inputmode="decimal"
            .value=${this._width}
            @input=${(e: Event) => (this._width = (e.target as HTMLInputElement).value)}
          />
        </label>
      </div>
    </fieldset>`;
  }

  static override styles = [
    shared,
    css`
      dialog {
        width: min(720px, calc(100vw - 24px));
      }
      fieldset {
        margin: 0 0 16px;
        padding: 0;
        border: none;
        min-width: 0;
      }
      legend {
        padding: 0;
        margin-bottom: 8px;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--pg-text-muted);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
      }
      .wide {
        grid-column: 1 / -1;
      }
      .age {
        display: grid;
        grid-template-columns: 1fr 1fr 1.4fr;
        gap: 12px;
      }
      .age .hint {
        grid-column: 1 / -1;
        font-size: 12px;
        color: var(--pg-text-muted);
      }
      .latin {
        font-style: italic;
      }
      .files {
        cursor: pointer;
      }
      .file-button {
        justify-self: start;
      }
      .files:focus-within .file-button {
        outline: 2px solid var(--pg-accent);
        outline-offset: 2px;
      }
      .dialog-actions {
        flex-wrap: wrap;
        align-items: center;
      }
      .progress {
        margin-right: auto;
      }
      .errors {
        flex-basis: 100%;
        margin: 0;
        padding-left: 18px;
      }
      @media (max-width: 520px) {
        .age {
          grid-template-columns: 1fr 1fr;
        }
      }
    `,
  ];
}

define("pg-plant-form", PgPlantForm);
