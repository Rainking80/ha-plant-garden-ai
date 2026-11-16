import {
  mdiAlertOutline,
  mdiArrowLeft,
  mdiCameraOutline,
  mdiCheck,
  mdiCreationOutline,
  mdiDeleteOutline,
  mdiImagePlusOutline,
} from "@mdi/js";
import { css, html, nothing } from "lit";

import {
  createDream,
  deleteDream,
  deleteDreamPicture,
  dreamConcept,
  dreamLook,
  dreamPicture,
  errorMessage,
  listDreams,
  plantDream,
} from "../api/client";
import type {
  DreamDesign,
  DreamImageInfo,
  DreamPlant,
  DreamStrength,
  DreamStyle,
} from "../api/types";
import { PgElement, define, icon } from "../components/base";
import type { PgConfirmDialog } from "../components/confirm-dialog";
import "../components/confirm-dialog";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatDate, formatLength, formatMoney } from "../util/format";
import { prepareImage } from "../util/image";
import { uploadErrorText } from "../util/upload";

const STRENGTHS: readonly DreamStrength[] = ["gentle", "medium", "bold"];

/**
 * Dream garden: upload a photo of the garden, let the AI describe it and ask
 * back, state wishes and a style, get a planting concept that fits the site -
 * and, after a cost warning, a picture of how it could look. Every AI step is a
 * button; the picture is the only expensive one and says so before it runs.
 */
export class PgDreamView extends PgElement {
  static override properties = {
    store: { attribute: false },
    prefix: { attribute: false },
    _designs: { state: true },
    _image: { state: true },
    _styles: { state: true },
    _openId: { state: true },
    _busy: { state: true },
    _error: { state: true },
    _wish: { state: true },
    _style: { state: true },
    _strength: { state: true },
    _keep: { state: true },
    _answers: { state: true },
    _chosen: { state: true },
    _instruction: { state: true },
    _shown: { state: true },
    _reveal: { state: true },
  };

  declare store: GardenStore;
  declare prefix: string;
  declare _designs: DreamDesign[] | null;
  declare _image: DreamImageInfo | null;
  declare _styles: DreamStyle[];
  declare _openId: string | null;
  /** which step is running: upload, look, concept, picture, plant */
  declare _busy: string;
  declare _error: string;
  declare _wish: string;
  declare _style: DreamStyle | null;
  declare _strength: DreamStrength;
  /** elements of the photo that must stay */
  declare _keep: ReadonlySet<string>;
  /** question -> answer */
  declare _answers: Record<string, string>;
  /** plants of the concept to show in the picture and to take over */
  declare _chosen: ReadonlySet<string>;
  declare _instruction: string;
  /** the picture shown in the before/after view */
  declare _shown: string | null;
  /** how much of the new picture the slider reveals, in % */
  declare _reveal: number;

  constructor() {
    super();
    this.prefix = "/plant-garden";
    this._designs = null;
    this._image = null;
    this._styles = [];
    this._openId = null;
    this._busy = "";
    this._error = "";
    this._wish = "";
    this._style = null;
    this._strength = "medium";
    this._keep = new Set();
    this._answers = {};
    this._chosen = new Set();
    this._instruction = "";
    this._shown = null;
    this._reveal = 50;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this._load();
  }

  private async _load(): Promise<void> {
    try {
      const listing = await listDreams(this.hass);
      this._designs = listing.designs;
      this._image = listing.image;
      this._styles = listing.styles;
    } catch (err) {
      this._error = errorMessage(err);
      this._designs = [];
    }
  }

  private get _design(): DreamDesign | null {
    return this._designs?.find((design) => design.id === this._openId) ?? null;
  }

  /** Put a design the backend answered with into the list. */
  private _take(design: DreamDesign): void {
    const others = (this._designs ?? []).filter((other) => other.id !== design.id);
    this._designs = [design, ...others].sort((a, b) => b.created.localeCompare(a.created));
  }

  private _open(design: DreamDesign): void {
    this._openId = design.id;
    this._error = "";
    const brief = design.brief;
    this._wish = brief?.wish ?? "";
    this._style = brief?.style ?? null;
    this._strength = brief?.strength ?? "medium";
    this._keep = new Set(brief?.keep ?? []);
    this._answers = Object.fromEntries((brief?.answers ?? []).map((a) => [a.question, a.answer]));
    this._chosen = new Set((design.concept?.plants ?? []).map((plant) => plant.id));
    this._instruction = "";
    this._shown = design.pictures.at(-1)?.id ?? null;
    this._reveal = 50;
  }

  private async _run(step: string, action: () => Promise<DreamDesign>): Promise<void> {
    if (this._busy) return;
    this._busy = step;
    this._error = "";
    try {
      const design = await action();
      this._take(design);
      if (step === "concept") {
        this._chosen = new Set((design.concept?.plants ?? []).map((plant) => plant.id));
      }
      if (step === "picture") {
        this._shown = design.pictures.at(-1)?.id ?? null;
        this._reveal = 50;
        this._instruction = "";
      }
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = "";
    }
  }

  // ------------------------------------------------------------ steps
  private async _onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || this._busy) return;
    this._busy = "upload";
    this._error = "";
    try {
      const prepared = await prepareImage(file);
      const design = await createDream(this.hass, prepared.blob, prepared.filename);
      this._take(design);
      this._open(design);
    } catch (err) {
      this._error = uploadErrorText(err, this.t);
    } finally {
      this._busy = "";
    }
  }

  private _look(design: DreamDesign): Promise<void> {
    return this._run("look", () => dreamLook(this.hass, design.id));
  }

  private _concept(design: DreamDesign): Promise<void> {
    return this._run("concept", () =>
      dreamConcept(this.hass, design.id, {
        wish: this._wish.trim(),
        style: this._style,
        strength: this._strength,
        keep: [...this._keep],
        answers: Object.entries(this._answers)
          .filter(([, answer]) => answer.trim())
          .map(([question, answer]) => ({ question, answer })),
      }),
    );
  }

  /** The picture costs real money: say how much and ask before every one. */
  private async _picture(design: DreamDesign, refine: boolean): Promise<void> {
    const { t } = this;
    const confirm = this.renderRoot.querySelector<PgConfirmDialog>("pg-confirm-dialog");
    const ok = await confirm?.ask(
      t("dream.picture_confirm_title"),
      `${this._costText()} ${t("dream.picture_confirm")}`,
      t("dream.picture_go"),
    );
    if (!ok) return;
    const instruction = this._instruction.trim();
    await this._run("picture", () =>
      dreamPicture(this.hass, design.id, {
        plants: [...this._chosen],
        ...(refine && this._shown ? { base: this._shown } : {}),
        ...(instruction ? { instruction } : {}),
      }),
    );
  }

  private _costText(): string {
    const { t, language } = this;
    const image = this._image;
    if (!image?.available) return t("dream.no_image_provider");
    const who = t("dream.cost_who", { provider: image.provider ?? "", model: image.model ?? "" });
    if (image.cost === null || !image.cost_known) return `${t("dream.cost_unknown")} ${who}`;
    return `${t("dream.cost", { cost: formatMoney(image.cost, image.currency, language) })} ${who}`;
  }

  private async _plant(design: DreamDesign): Promise<void> {
    const open = (design.concept?.plants ?? [])
      .filter((plant) => this._chosen.has(plant.id) && !design.planted.includes(plant.id))
      .map((plant) => plant.id);
    if (!open.length || this._busy) return;
    this._busy = "plant";
    this._error = "";
    try {
      const result = await plantDream(this.hass, design.id, open);
      this._take(result.design);
      void this.store?.refresh();
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = "";
    }
  }

  private async _delete(design: DreamDesign): Promise<void> {
    const confirm = this.renderRoot.querySelector<PgConfirmDialog>("pg-confirm-dialog");
    const ok = await confirm?.ask(
      this.t("dream.delete_title"),
      this.t("dream.delete_text"),
      this.t("common.delete"),
    );
    if (!ok) return;
    try {
      await deleteDream(this.hass, design.id);
      this._designs = (this._designs ?? []).filter((other) => other.id !== design.id);
      this._openId = null;
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private async _deletePicture(design: DreamDesign, pictureId: string): Promise<void> {
    try {
      const updated = await deleteDreamPicture(this.hass, design.id, pictureId);
      this._take(updated);
      if (this._shown === pictureId) this._shown = updated.pictures.at(-1)?.id ?? null;
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private _toggle(set: ReadonlySet<string>, value: string): ReadonlySet<string> {
    const next = new Set(set);
    if (!next.delete(value)) next.add(value);
    return next;
  }

  // ------------------------------------------------------------ rendering
  private _renderGallery(designs: DreamDesign[]) {
    const { t, language } = this;
    return html`
      <section class="card intro">
        <h2>${t("dream.title")}</h2>
        <p>${t("dream.intro")}</p>
        <div class="actions">
          <label class="button upload">
            ${icon(mdiImagePlusOutline)}
            ${t(this._busy === "upload" ? "dream.uploading" : "dream.new")}
            <input type="file" accept="image/*" @change=${this._onFile} />
          </label>
          <label class="button secondary upload">
            ${icon(mdiCameraOutline)} ${t("walk.take_photo")}
            <input type="file" accept="image/*" capture="environment" @change=${this._onFile} />
          </label>
        </div>
        <p class="muted small">${t("dream.privacy")}</p>
      </section>
      ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
      ${
        designs.length
          ? html`<div class="gallery">
              ${designs.map((design) => {
                const picture = design.pictures.at(-1);
                const state = picture
                  ? "dream.state_picture"
                  : design.concept
                    ? "dream.state_concept"
                    : "dream.state_photo";
                return html`<button class="card tile" @click=${() => this._open(design)}>
                  <img src=${picture?.url ?? design.photo_url} alt="" loading="lazy" />
                  <span class="tile-text">
                    <strong
                      >${
                        design.concept?.summary || design.look?.description || t("dream.untitled")
                      }</strong
                    >
                    <span class="muted small">
                      ${formatDate(design.created, language)} · ${t(state)}
                    </span>
                  </span>
                </button>`;
              })}
            </div>`
          : nothing
      }
    `;
  }

  private _renderLook(design: DreamDesign) {
    const { t } = this;
    const look = design.look;
    if (!look) {
      return html`<section class="card step">
        <h3>${t("dream.step_look")}</h3>
        <p>${t("dream.look_intro")}</p>
        <button
          class="button look"
          ?disabled=${Boolean(this._busy)}
          @click=${() => this._look(design)}
        >
          ${icon(mdiCreationOutline)} ${t(this._busy === "look" ? "dream.looking" : "dream.look")}
        </button>
      </section>`;
    }
    return html`<section class="card step">
      <h3>${t("dream.step_look")}</h3>
      <p class="says">${look.description}</p>
      ${
        look.elements.length
          ? html`<p class="label">${t("dream.keep")}</p>
              <div class="chips keep" role="group" aria-label=${t("dream.keep")}>
                ${look.elements.map(
                  (element) =>
                    html`<button
                      class="chip"
                      aria-pressed=${this._keep.has(element)}
                      @click=${() => (this._keep = this._toggle(this._keep, element))}
                    >
                      ${element}
                    </button>`,
                )}
              </div>`
          : nothing
      }
      ${look.questions.map(
        (question) =>
          html`<div class="question">
            <p class="label">${question.question}</p>
            <div class="chips">
              ${question.options.map(
                (option) =>
                  html`<button
                    class="chip"
                    aria-pressed=${this._answers[question.question] === option}
                    @click=${() =>
                      (this._answers = { ...this._answers, [question.question]: option })}
                  >
                    ${option}
                  </button>`,
              )}
            </div>
            <input
              maxlength="300"
              placeholder=${t("dream.own_answer")}
              aria-label=${question.question}
              .value=${this._answers[question.question] ?? ""}
              @input=${(e: Event) =>
                (this._answers = {
                  ...this._answers,
                  [question.question]: (e.target as HTMLInputElement).value,
                })}
            />
          </div>`,
      )}
    </section>`;
  }

  private _renderBrief(design: DreamDesign) {
    const { t } = this;
    if (!design.look) return nothing;
    const suggested = new Set(design.look.styles);
    const label =
      this._busy === "concept"
        ? "dream.thinking"
        : design.concept
          ? "dream.concept_again"
          : "dream.concept";
    return html`<section class="card step">
      <h3>${t("dream.step_wish")}</h3>
      <label class="field">
        <span>${t("dream.wish")}</span>
        <textarea
          rows="3"
          maxlength="600"
          placeholder=${t("dream.wish_placeholder")}
          .value=${this._wish}
          @input=${(e: Event) => (this._wish = (e.target as HTMLTextAreaElement).value)}
        ></textarea>
      </label>
      <p class="label">${t("dream.style")}</p>
      <div class="chips styles" role="group" aria-label=${t("dream.style")}>
        ${this._styles.map(
          (style) =>
            html`<button
              class="chip ${suggested.has(style) ? "suggested" : ""}"
              aria-pressed=${this._style === style}
              title=${suggested.has(style) ? t("dream.style_suggested") : ""}
              @click=${() => (this._style = this._style === style ? null : style)}
            >
              ${t(`dream.style.${style}`)}
            </button>`,
        )}
      </div>
      <p class="label">${t("dream.strength")}</p>
      <div class="chips" role="group" aria-label=${t("dream.strength")}>
        ${STRENGTHS.map(
          (strength) =>
            html`<button
              class="chip"
              aria-pressed=${this._strength === strength}
              @click=${() => (this._strength = strength)}
            >
              ${t(`dream.strength.${strength}`)}
            </button>`,
        )}
      </div>
      <button
        class="button concept"
        ?disabled=${Boolean(this._busy)}
        @click=${() => this._concept(design)}
      >
        ${icon(mdiCreationOutline)} ${t(label)}
      </button>
      <p class="muted small">${t("dream.concept_hint")}</p>
    </section>`;
  }

  private _plantFacts(plant: DreamPlant): string {
    const { t, language } = this;
    return [
      plant.height_cm ? `${t("field.height")} ${formatLength(plant.height_cm, language)}` : "",
      plant.spacing_cm
        ? t("dream.spacing", { spacing: formatLength(plant.spacing_cm, language) })
        : "",
      plant.light ? t(`light.${plant.light}`) : "",
      plant.water_need ? t(`water.${plant.water_need}`) : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  private _renderConcept(design: DreamDesign) {
    const { t } = this;
    const concept = design.concept;
    if (!concept) return nothing;
    const open = concept.plants.filter(
      (plant) => this._chosen.has(plant.id) && !design.planted.includes(plant.id),
    );
    const steps = [...concept.changes, ...concept.hardscape];
    return html`<section class="card step">
      <h3>${t("dream.step_concept")}</h3>
      <p class="says">${concept.summary}</p>
      ${
        steps.length
          ? html`<ol class="changes">
              ${steps.map((step) => html`<li>${step}</li>`)}
            </ol>`
          : nothing
      }
      <p class="label">${t("dream.plants")}</p>
      <ul class="plants">
        ${concept.plants.map((plant) => {
          const planted = design.planted.includes(plant.id);
          return html`<li>
            <label>
              <input
                type="checkbox"
                .checked=${this._chosen.has(plant.id)}
                @change=${() => (this._chosen = this._toggle(this._chosen, plant.id))}
              />
              <span>
                <strong>${plant.quantity} × ${plant.name}</strong>
                ${plant.scientific_name ? html`<em>${plant.scientific_name}</em>` : nothing}
                ${
                  planted
                    ? html`<span class="taken">${icon(mdiCheck)} ${t("planner.taken")}</span>`
                    : nothing
                }
                ${plant.reason ? html`<span class="reason">${plant.reason}</span>` : nothing}
                <span class="muted small">${this._plantFacts(plant)}</span>
                ${
                  plant.caution
                    ? html`<span class="small caution"
                        >${icon(mdiAlertOutline)} ${plant.caution}</span
                      >`
                    : nothing
                }
              </span>
            </label>
          </li>`;
        })}
      </ul>
      <button
        class="button secondary plant"
        ?disabled=${!open.length || Boolean(this._busy)}
        @click=${() => this._plant(design)}
      >
        ${t("dream.plant", { count: open.length })}
      </button>
      <p class="muted small">${t("dream.plant_hint")}</p>
    </section>`;
  }

  private _renderPicture(design: DreamDesign) {
    const { t, language } = this;
    if (!design.concept) return nothing;
    const shown = design.pictures.find((picture) => picture.id === this._shown) ?? null;
    const able = Boolean(this._image?.available);
    const label =
      this._busy === "picture" ? "dream.painting" : shown ? "dream.picture_again" : "dream.picture";
    const was =
      shown && shown.cost !== null && this._image
        ? ` · ${t("dream.cost_was", { cost: formatMoney(shown.cost, this._image.currency, language) })}`
        : "";
    return html`<section class="card step">
      <h3>${t("dream.step_picture")}</h3>
      ${
        shown
          ? html`<div class="compare" style="--reveal: ${this._reveal}%">
                <img src=${design.photo_url} alt=${t("dream.before")} />
                <img class="after" src=${shown.url} alt=${t("dream.after")} />
                <span class="tag before">${t("dream.before")}</span>
                <span class="tag afterwards">${t("dream.after")}</span>
              </div>
              <input
                class="slider"
                type="range"
                min="0"
                max="100"
                .value=${String(this._reveal)}
                aria-label=${t("dream.slider")}
                @input=${(e: Event) =>
                  (this._reveal = Number((e.target as HTMLInputElement).value))}
              />
              <p class="muted small">${t("dream.idea_only")}${was}</p>`
          : html`<p>${t("dream.picture_intro")}</p>`
      }
      ${
        design.pictures.length > 1
          ? html`<div class="thumbs">
              ${design.pictures.map(
                (picture) =>
                  html`<span class="thumb ${picture.id === this._shown ? "current" : ""}">
                    <button
                      @click=${() => (this._shown = picture.id)}
                      aria-label=${t("dream.after")}
                    >
                      <img src=${picture.url} alt="" loading="lazy" />
                    </button>
                    <button
                      class="icon-button small"
                      aria-label=${t("common.delete")}
                      title=${t("common.delete")}
                      @click=${() => this._deletePicture(design, picture.id)}
                    >
                      ${icon(mdiDeleteOutline)}
                    </button>
                  </span>`,
              )}
            </div>`
          : nothing
      }
      <p class="cost ${able ? "" : "error-text"}">${icon(mdiAlertOutline)} ${this._costText()}</p>
      ${
        shown
          ? html`<label class="field">
              <span>${t("dream.refine")}</span>
              <input
                class="instruction"
                maxlength="600"
                placeholder=${t("dream.refine_placeholder")}
                .value=${this._instruction}
                @input=${(e: Event) => (this._instruction = (e.target as HTMLInputElement).value)}
              />
            </label>`
          : nothing
      }
      <div class="actions">
        <button
          class="button picture"
          ?disabled=${!able || Boolean(this._busy)}
          @click=${() => this._picture(design, false)}
        >
          ${icon(mdiCreationOutline)} ${t(label)}
        </button>
        ${
          shown
            ? html`<button
                class="button secondary refine"
                ?disabled=${!able || Boolean(this._busy) || !this._instruction.trim()}
                @click=${() => this._picture(design, true)}
              >
                ${t("dream.refine_go")}
              </button>`
            : nothing
        }
      </div>
    </section>`;
  }

  private _renderDesign(design: DreamDesign) {
    const { t } = this;
    return html`
      <div class="bar">
        <button class="button text back" @click=${() => (this._openId = null)}>
          ${icon(mdiArrowLeft)} ${t("dream.back")}
        </button>
        <button
          class="icon-button"
          aria-label=${t("dream.delete_title")}
          title=${t("dream.delete_title")}
          @click=${() => this._delete(design)}
        >
          ${icon(mdiDeleteOutline)}
        </button>
      </div>
      <section class="card photo">
        <img src=${design.photo_url} alt=${t("dream.before")} />
      </section>
      ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
      ${this._renderLook(design)} ${this._renderBrief(design)} ${this._renderConcept(design)}
      ${this._renderPicture(design)}
    `;
  }

  protected override render() {
    if (this._designs === null) {
      return html`<p class="muted loading">${this.t("panel.loading")}</p>`;
    }
    const design = this._design;
    return html`
      ${design ? this._renderDesign(design) : this._renderGallery(this._designs)}
      <pg-confirm-dialog .hass=${this.hass}></pg-confirm-dialog>
    `;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: block;
        max-width: 860px;
        margin: 0 auto;
      }
      .card {
        padding: 16px;
        margin-bottom: 16px;
      }
      h2,
      h3 {
        margin: 0 0 8px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 12px 0 8px;
      }
      .upload {
        position: relative;
        cursor: pointer;
      }
      .upload input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }
      .gallery {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 12px;
      }
      .tile {
        padding: 0;
        margin: 0;
        overflow: hidden;
        text-align: left;
        cursor: pointer;
        font: inherit;
        color: inherit;
        border: 1px solid var(--pg-divider);
      }
      .tile img {
        display: block;
        width: 100%;
        aspect-ratio: 3 / 2;
        object-fit: cover;
      }
      .tile-text {
        display: grid;
        gap: 4px;
        padding: 10px 12px;
      }
      .tile-text strong {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-weight: 500;
      }
      .bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      .photo {
        padding: 0;
        overflow: hidden;
      }
      .photo img {
        display: block;
        width: 100%;
        max-height: 60vh;
        object-fit: contain;
        background: #000;
      }
      .says {
        font-size: 1.05em;
        margin: 0 0 12px;
      }
      .label {
        margin: 12px 0 6px;
        font-weight: 500;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .chip.suggested {
        border-color: var(--pg-accent);
      }
      .question input {
        width: 100%;
        margin-top: 6px;
        box-sizing: border-box;
      }
      .field {
        width: 100%;
      }
      .concept,
      .plant {
        margin-top: 16px;
      }
      .changes {
        margin: 0 0 8px;
        padding-left: 20px;
      }
      .plants {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 2px;
      }
      .plants li {
        padding: 8px 0;
        border-top: 1px solid var(--pg-divider);
      }
      .plants label {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        cursor: pointer;
      }
      .plants label > span {
        display: grid;
        gap: 2px;
      }
      .plants em {
        color: var(--pg-muted);
        font-size: 13px;
      }
      .taken {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--pg-accent);
        font-size: 13px;
      }
      .caution {
        color: var(--pg-thirsty, #b86a10);
      }
      .compare {
        position: relative;
        border-radius: 8px;
        overflow: hidden;
        background: #000;
      }
      .compare img {
        display: block;
        width: 100%;
      }
      .compare .after {
        position: absolute;
        inset: 0;
        height: 100%;
        object-fit: cover;
        clip-path: inset(0 0 0 calc(100% - var(--reveal)));
      }
      .tag {
        position: absolute;
        bottom: 8px;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        font-size: 12px;
      }
      .tag.before {
        left: 8px;
      }
      .tag.afterwards {
        right: 8px;
      }
      .slider {
        width: 100%;
        margin: 8px 0 0;
      }
      .thumbs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 8px 0;
      }
      .thumb {
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }
      .thumb button:first-child {
        padding: 0;
        border: 2px solid transparent;
        border-radius: 6px;
        background: none;
        cursor: pointer;
        line-height: 0;
      }
      .thumb.current button:first-child {
        border-color: var(--pg-accent);
      }
      .thumb img {
        width: 72px;
        height: 48px;
        object-fit: cover;
        border-radius: 4px;
      }
      .cost {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 12px 0 0;
        padding: 8px 12px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--pg-thirsty, #b86a10) 12%, transparent);
      }
    `,
  ];
}

define("pg-dream-view", PgDreamView);
