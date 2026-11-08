import {
  mdiCircleOutline,
  mdiClose,
  mdiCursorDefaultOutline,
  mdiDeleteOutline,
  mdiEyeOutline,
  mdiFitToScreenOutline,
  mdiMagnify,
  mdiMapMarkerRemoveOutline,
  mdiOpenInNew,
  mdiPencilOutline,
  mdiPlus,
  mdiRectangleOutline,
  mdiRedo,
  mdiSprout,
  mdiUndo,
  mdiVectorPolygon,
} from "@mdi/js";
import { css, html, nothing, type PropertyValues } from "lit";

import { deleteShape, errorMessage, movePlants, saveShape, updatePlant } from "../api/client";
import {
  SHAPE_KINDS,
  SOIL_TYPES,
  type Geometry,
  type Plant,
  type Point,
  type Shape,
  type ShapeKind,
} from "../api/types";
import { PgElement, define, icon } from "../components/base";
import type {
  CrownDetail,
  HoverDetail,
  Mode,
  MovePlantDetail,
  PgGardenCanvas,
  Selection,
  ShapeChangeDetail,
  Tool,
} from "../components/garden-canvas";
import "../components/garden-canvas";
import { plantPath } from "../components/plant-card";
import type { PgPlantForm, PlantSavedDetail } from "../components/plant-form";
import "../components/plant-form";
import type { TranslationKey } from "../i18n";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatAge, formatLength, formatNumber } from "../util/format";
import { area, crownDiameter, snapPoint } from "../util/geometry";
import { History, type Command } from "../util/history";
import { navigate } from "../util/navigate";
import { ulid } from "../util/ulid";
import { isViewport, type Viewport } from "../util/viewport";
import { matchesQuery } from "./plants-view";

const VIEWPORT_KEY = "plant-garden.viewport.v1";
const SNAP_KEY = "plant-garden.snap.v1";
const SNAP_STEPS = [0, 0.1, 0.25, 0.5, 1];

/** Drawing order of new shapes: ground cover below, buildings on top. */
const KIND_Z: Record<ShapeKind, number> = {
  boundary: -10,
  lawn: -6,
  terrace: -5,
  path: -4,
  pond: -3,
  bed: -2,
  raised_bed: -1,
  hedge: 0,
  other: 0,
  greenhouse: 4,
  house: 5,
  roof: 6,
};

function readStorage<T>(key: string, valid: (value: unknown) => value is T): T | null {
  try {
    const raw = localStorage.getItem(key);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return valid(value) ? value : null;
  } catch {
    return null; // storage blocked or corrupt
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode: keep working without persistence
  }
}

const isSnap = (value: unknown): value is number =>
  typeof value === "number" && SNAP_STEPS.includes(value);

interface TrayDrag {
  plantId: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  dragging: boolean;
}

/**
 * The garden plan: canvas, mode and tool bar, plant tray, info card and
 * properties. Every change is an undoable command that updates the store
 * optimistically and then the backend.
 */
export class PgGardenView extends PgElement {
  static override properties = {
    store: { attribute: false },
    prefix: {},
    focusPlantId: { attribute: false },
    _mode: { state: true },
    _tool: { state: true },
    _newKind: { state: true },
    _snap: { state: true },
    _selection: { state: true },
    _hover: { state: true },
    _armed: { state: true },
    _query: { state: true },
    _error: { state: true },
    _drag: { state: true },
    _historyTick: { state: true },
  };

  declare store: GardenStore;
  declare prefix: string;
  declare focusPlantId: string | null;
  declare _mode: Mode;
  declare _tool: Tool;
  declare _newKind: ShapeKind;
  declare _snap: number;
  declare _selection: Selection;
  declare _hover: HoverDetail | null;
  declare _armed: string | null;
  declare _query: string;
  declare _error: string;
  declare _drag: TrayDrag | null;
  declare _historyTick: number;

  private readonly _history = new History();
  private _fitted = false;
  private _focused: string | null = null;
  private _errorTimer?: ReturnType<typeof setTimeout>;

  private readonly _onStoreChange = () => {
    this.requestUpdate();
    this._initViewport();
  };
  private readonly _onHistoryChange = () => (this._historyTick += 1);

  constructor() {
    super();
    this.prefix = "/plant-garden";
    this.focusPlantId = null;
    this._mode = "view";
    this._tool = "select";
    this._newKind = "bed";
    this._snap = readStorage(SNAP_KEY, isSnap) ?? 0.25;
    this._selection = null;
    this._hover = null;
    this._armed = null;
    this._query = "";
    this._error = "";
    this._drag = null;
    this._historyTick = 0;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.store?.addEventListener("change", this._onStoreChange);
    this._history.addEventListener("change", this._onHistoryChange);
    this.addEventListener("keydown", this._onKeyDown);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.store?.removeEventListener("change", this._onStoreChange);
    this._history.removeEventListener("change", this._onHistoryChange);
    this.removeEventListener("keydown", this._onKeyDown);
    this._endTrayDrag();
    clearTimeout(this._errorTimer);
  }

  protected override firstUpdated(): void {
    const saved = readStorage(VIEWPORT_KEY, isViewport);
    if (saved && this._canvas) {
      this._canvas.viewport = saved;
      this._fitted = true;
    }
    this._initViewport();
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has("focusPlantId")) this._focusPlant();
  }

  private get _canvas(): PgGardenCanvas | null {
    return this.renderRoot.querySelector("pg-garden-canvas");
  }

  private get _plants(): Plant[] {
    return this.store?.plants ?? [];
  }

  private get _shapes(): Shape[] {
    return this.store?.layout?.shapes ?? [];
  }

  /** On first visit: show the whole garden. */
  private _initViewport(): void {
    if (this._fitted || !this.store?.loaded || !this._canvas) return;
    this._fitted = true;
    void this.updateComplete.then(() => this._canvas?.fit());
  }

  private _focusPlant(): void {
    const id = this.focusPlantId;
    if (!id || id === this._focused) return;
    const plant = this.store?.getPlant(id);
    if (!plant?.position || !this._canvas) return;
    this._focused = id;
    this._fitted = true;
    this._canvas.centerOn(plant.position, Math.max(8, crownDiameter(plant) * 6));
    this._selection = { type: "plant", id };
  }

  // ------------------------------------------------------------ commands
  private async _execute(command: Command): Promise<void> {
    try {
      await this._history.execute(command);
    } catch (err) {
      this._showError(err);
    }
  }

  private _showError(err: unknown): void {
    this._error = this.t("plan.save_failed", { message: errorMessage(err) });
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => (this._error = ""), 6000);
  }

  private async _setPosition(plantId: string, position: Point | null): Promise<void> {
    const before = this.store.getPlant(plantId)?.position ?? null;
    this.store.patchPlant(plantId, { position });
    try {
      await movePlants(this.hass, [{ plant_id: plantId, position }]);
    } catch (err) {
      this.store.patchPlant(plantId, { position: before });
      throw err;
    }
  }

  private async _setCrown(plantId: string, crown: number | null): Promise<void> {
    const before = this.store.getPlant(plantId)?.crown_diameter_m ?? null;
    this.store.patchPlant(plantId, { crown_diameter_m: crown });
    try {
      await updatePlant(this.hass, plantId, { crown_diameter_m: crown });
    } catch (err) {
      this.store.patchPlant(plantId, { crown_diameter_m: before });
      throw err;
    }
  }

  private async _putShape(shape: Shape): Promise<void> {
    const before = this.store.getShape(shape.id);
    this.store.putShape(shape);
    try {
      await saveShape(this.hass, shape);
    } catch (err) {
      if (before) this.store.putShape(before);
      else this.store.removeShape(shape.id);
      throw err;
    }
  }

  private async _removeShape(shape: Shape): Promise<void> {
    this.store.removeShape(shape.id);
    try {
      await deleteShape(this.hass, shape.id);
    } catch (err) {
      this.store.putShape(shape);
      throw err;
    }
  }

  private _movePlant(plantId: string, from: Point | null, to: Point | null): Promise<void> {
    return this._execute({
      label: "move-plant",
      run: () => this._setPosition(plantId, to),
      undo: () => this._setPosition(plantId, from),
    });
  }

  private _replaceShape(from: Shape, to: Shape): Promise<void> {
    return this._execute({
      label: "change-shape",
      run: () => this._putShape(to),
      undo: () => this._putShape(from),
    });
  }

  // ------------------------------------------------------------ canvas events
  private _onSelect(event: CustomEvent<{ selection: Selection }>): void {
    this._selection = event.detail.selection;
    if (!event.detail.selection) this._hover = null;
  }

  private _onHover(event: CustomEvent<HoverDetail>): void {
    this._hover = event.detail.plantId ? event.detail : null;
  }

  private _onMovePlant(event: CustomEvent<MovePlantDetail>): void {
    const { plantId, from, to } = event.detail;
    void this._movePlant(plantId, from, to);
  }

  private _onResizeCrown(event: CustomEvent<CrownDetail>): void {
    const { plantId, from, to } = event.detail;
    void this._execute({
      label: "crown",
      run: () => this._setCrown(plantId, to),
      undo: () => this._setCrown(plantId, from),
    });
  }

  private _onCreateShape(event: CustomEvent<{ geometry: Geometry }>): void {
    const shape: Shape = {
      id: ulid(),
      kind: this._newKind,
      geometry: event.detail.geometry,
      label: null,
      plant_id: null,
      soil_type: null,
      locked: false,
      z: KIND_Z[this._newKind],
    };
    this._tool = "select";
    this._selection = { type: "shape", id: shape.id };
    void this._execute({
      label: "create-shape",
      run: () => this._putShape(shape),
      undo: () => this._removeShape(shape),
    });
  }

  private _onChangeShape(event: CustomEvent<ShapeChangeDetail>): void {
    const shape = this.store.getShape(event.detail.shapeId);
    if (!shape) return;
    void this._replaceShape(
      { ...shape, geometry: event.detail.from },
      { ...shape, geometry: event.detail.to },
    );
  }

  private _onPlace(event: CustomEvent<{ plantId: string; at: Point }>): void {
    const plant = this.store.getPlant(event.detail.plantId);
    this._armed = null;
    if (!plant) return;
    this._selection = { type: "plant", id: plant.id };
    void this._movePlant(plant.id, plant.position, event.detail.at);
  }

  private _onDeleteSelection(): void {
    const selection = this._selection;
    if (!selection) return;
    this._selection = null;
    if (selection.type === "shape") {
      const shape = this.store.getShape(selection.id);
      if (!shape) return;
      void this._execute({
        label: "delete-shape",
        run: () => this._removeShape(shape),
        undo: () => this._putShape(shape),
      });
    } else {
      const plant = this.store.getPlant(selection.id);
      if (plant?.position) void this._movePlant(plant.id, plant.position, null);
    }
  }

  private _onCancel(): void {
    this._armed = null;
    this._selection = null;
    this._hover = null;
  }

  private _onViewport(event: CustomEvent<{ viewport: Viewport }>): void {
    writeStorage(VIEWPORT_KEY, event.detail.viewport);
  }

  private readonly _onKeyDown = (event: KeyboardEvent): void => {
    const target = event.composedPath()[0] as HTMLElement | undefined;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      void (event.shiftKey ? this._history.redo() : this._history.undo());
    } else if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      void this._history.redo();
    }
  };

  // ------------------------------------------------------------ toolbar
  private _setMode(mode: Mode): void {
    this._mode = mode;
    this._tool = "select";
    this._armed = null;
    this._hover = null;
  }

  private _setSnap(event: Event): void {
    this._snap = Number((event.target as HTMLSelectElement).value);
    writeStorage(SNAP_KEY, this._snap);
  }

  // ------------------------------------------------------------ tray
  private _arm(plantId: string): void {
    this._armed = this._armed === plantId ? null : plantId;
    this._selection = null;
  }

  private _onTrayPointerDown(event: PointerEvent, plantId: string): void {
    if (event.button !== 0) return;
    this._drag = {
      plantId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    window.addEventListener("pointermove", this._onTrayPointerMove);
    window.addEventListener("pointerup", this._onTrayPointerUp);
    window.addEventListener("pointercancel", this._onTrayPointerCancel);
  }

  private readonly _onTrayPointerMove = (event: PointerEvent): void => {
    const drag = this._drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    // touch keeps scrolling the tray; only mouse and pen drag plants out of it
    const dragging = drag.dragging || (event.pointerType !== "touch" && moved > 5);
    this._drag = { ...drag, x: event.clientX, y: event.clientY, dragging };
  };

  private readonly _onTrayPointerUp = (event: PointerEvent): void => {
    const drag = this._drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this._endTrayDrag();
    if (!drag.dragging) {
      this._arm(drag.plantId);
      return;
    }
    const canvas = this._canvas;
    const rect = canvas?.getBoundingClientRect();
    if (
      canvas &&
      rect &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    ) {
      const at = snapPoint(canvas.planPoint(event.clientX, event.clientY), this._snap);
      this._onPlace(new CustomEvent("place", { detail: { plantId: drag.plantId, at } }));
    }
  };

  private readonly _onTrayPointerCancel = (): void => this._endTrayDrag();

  private _endTrayDrag(): void {
    this._drag = null;
    window.removeEventListener("pointermove", this._onTrayPointerMove);
    window.removeEventListener("pointerup", this._onTrayPointerUp);
    window.removeEventListener("pointercancel", this._onTrayPointerCancel);
  }

  private _onPlantSaved(event: CustomEvent<PlantSavedDetail>): void {
    void this.store.refresh();
    if (event.detail.created) this._armed = event.detail.plant.id;
  }

  // ------------------------------------------------------------ rendering
  protected override render() {
    const editing = this._mode === "edit";
    return html`
      <div class="layout ${editing ? "editing" : ""}">
        <div class="stage">
          <pg-garden-canvas
            .hass=${this.hass}
            .plants=${this._plants}
            .shapes=${this._shapes}
            .mode=${this._mode}
            .tool=${this._tool}
            .selection=${this._selection}
            .snapStep=${this._snap}
            .armedPlantId=${this._armed}
            @select=${this._onSelect}
            @hover=${this._onHover}
            @move-plant=${this._onMovePlant}
            @resize-crown=${this._onResizeCrown}
            @create-shape=${this._onCreateShape}
            @change-shape=${this._onChangeShape}
            @place=${this._onPlace}
            @delete-selection=${this._onDeleteSelection}
            @cancel=${this._onCancel}
            @viewport-change=${this._onViewport}
            @view-moved=${() => {
              // keep the pinned info card next to its plant while panning
              if (this._selection) this.requestUpdate();
            }}
          ></pg-garden-canvas>
          ${this._renderToolbar()} ${this._renderHint()}
          ${editing ? nothing : this._renderInfoCard()}
          ${this._error ? html`<div class="toast error-text" role="alert">${this._error}</div>` : nothing}
        </div>
        ${editing ? this._renderSide() : nothing}
      </div>
      ${this._renderGhost()}
      <pg-plant-form .hass=${this.hass} @plant-saved=${this._onPlantSaved}></pg-plant-form>
    `;
  }

  private _renderToolbar() {
    const { t } = this;
    const editing = this._mode === "edit";
    const tools: [Tool, string, TranslationKey][] = [
      ["select", mdiCursorDefaultOutline, "plan.tool_select"],
      ["rect", mdiRectangleOutline, "plan.tool_rect"],
      ["circle", mdiCircleOutline, "plan.tool_circle"],
      ["polygon", mdiVectorPolygon, "plan.tool_polygon"],
    ];
    return html`<div class="toolbar">
      <div class="group segmented" role="group" aria-label=${t("plan.mode")}>
        <button
          class="seg"
          aria-pressed=${!editing}
          @click=${() => this._setMode("view")}
          title=${t("plan.mode_view")}
        >
          ${icon(mdiEyeOutline)}<span>${t("plan.mode_view")}</span>
        </button>
        <button
          class="seg"
          aria-pressed=${editing}
          @click=${() => this._setMode("edit")}
          title=${t("plan.mode_edit")}
        >
          ${icon(mdiPencilOutline)}<span>${t("plan.mode_edit")}</span>
        </button>
      </div>
      ${
        editing
          ? html`<div class="group" role="group">
                ${tools.map(
                  ([tool, path, label]) =>
                    html`<button
                      class="tool"
                      aria-pressed=${this._tool === tool}
                      @click=${() => {
                        this._tool = tool;
                        this._armed = null;
                      }}
                      aria-label=${t(label)}
                      title=${t(label)}
                    >
                      ${icon(path)}
                    </button>`,
                )}
              </div>
              ${
                this._tool !== "select"
                  ? html`<label class="group compact">
                      <span class="sr-only">${t("plan.new_kind")}</span>
                      <select
                        .value=${this._newKind}
                        @change=${(e: Event) =>
                          (this._newKind = (e.target as HTMLSelectElement).value as ShapeKind)}
                      >
                        ${SHAPE_KINDS.map(
                          (kind) =>
                            html`<option value=${kind} ?selected=${kind === this._newKind}>
                              ${t(`kind.${kind}`)}
                            </option>`,
                        )}
                      </select>
                    </label>`
                  : nothing
              }
              <label class="group compact">
                <span class="label-text">${t("plan.snap")}</span>
                <select @change=${this._setSnap}>
                  ${SNAP_STEPS.map(
                    (step) =>
                      html`<option value=${step} ?selected=${step === this._snap}>
                        ${step === 0 ? t("plan.snap_off") : formatLength(step * 100, this.language)}
                      </option>`,
                  )}
                </select>
              </label>
              <div class="group" role="group">
                <button
                  class="tool"
                  ?disabled=${!this._history.canUndo}
                  @click=${() => void this._history.undo()}
                  aria-label=${t("plan.undo")}
                  title=${t("plan.undo")}
                >
                  ${icon(mdiUndo)}
                </button>
                <button
                  class="tool"
                  ?disabled=${!this._history.canRedo}
                  @click=${() => void this._history.redo()}
                  aria-label=${t("plan.redo")}
                  title=${t("plan.redo")}
                >
                  ${icon(mdiRedo)}
                </button>
              </div>`
          : nothing
      }
      <button
        class="tool group fit"
        @click=${() => this._canvas?.fit()}
        aria-label=${t("plan.fit")}
        title=${t("plan.fit")}
      >
        ${icon(mdiFitToScreenOutline)}
      </button>
    </div>`;
  }

  private _renderHint() {
    const { t } = this;
    let text = "";
    if (this._armed) {
      text = t("plan.place_hint", { name: this.store.getPlant(this._armed)?.name ?? "" });
    } else if (this._mode === "edit" && this._tool === "polygon") {
      text = t("plan.polygon_hint");
    } else if (this._mode === "edit" && this._tool !== "select") {
      text = t("plan.draw_hint");
    } else if (
      this._mode === "view" &&
      !this._shapes.length &&
      !this._plants.some((p) => p.position)
    ) {
      text = t("plan.empty_hint");
    }
    if (!text) return nothing;
    return html`<div class="hint" role="status">
      <span>${text}</span>
      ${
        this._armed
          ? html`<button class="button text" @click=${() => (this._armed = null)}>
              ${t("plan.cancel")}
            </button>`
          : nothing
      }
    </div>`;
  }

  private _infoPlant(): { plant: Plant; x: number; y: number; pinned: boolean } | null {
    const stage = this.renderRoot.querySelector<HTMLElement>(".stage")?.getBoundingClientRect();
    if (!stage) return null;
    if (this._selection?.type === "plant") {
      const plant = this.store.getPlant(this._selection.id);
      if (plant?.position && this._canvas) {
        const p = this._canvas.screenPoint(plant.position);
        return { plant, x: p.x - stage.left, y: p.y - stage.top, pinned: true };
      }
    }
    if (this._hover?.plantId) {
      const plant = this.store.getPlant(this._hover.plantId);
      if (plant) {
        return {
          plant,
          x: this._hover.x - stage.left,
          y: this._hover.y - stage.top,
          pinned: false,
        };
      }
    }
    return null;
  }

  private _renderInfoCard() {
    const shape =
      this._selection?.type === "shape" ? this.store.getShape(this._selection.id) : null;
    if (shape) return this._renderShapeCard(shape);
    const info = this._infoPlant();
    if (!info) return nothing;
    const { plant, x, y, pinned } = info;
    const { t, language } = this;
    const facts = [
      formatAge(plant.age_months_now, t),
      plant.height_cm !== null
        ? `${t("field.height")} ${formatLength(plant.height_cm, language)}`
        : "",
      `Ø ${formatLength(crownDiameter(plant) * 100, language)}`,
    ].filter(Boolean);
    const style = `--x: ${Math.round(x)}px; --y: ${Math.round(y)}px`;
    return html`<article class="card info ${pinned ? "pinned" : "hover"}" style=${style}>
      <div class="info-photo">
        ${
          plant.cover
            ? html`<img src=${plant.cover.urls.medium} alt="" />`
            : html`<span class="placeholder">${icon(mdiSprout)}</span>`
        }
      </div>
      <div class="info-body">
        <div class="info-title">
          <h3>${plant.name}</h3>
          ${
            pinned
              ? html`<button
                  class="icon-button small"
                  @click=${() => (this._selection = null)}
                  aria-label=${t("common.close")}
                >
                  ${icon(mdiClose)}
                </button>`
              : nothing
          }
        </div>
        ${plant.scientific_name ? html`<p class="latin">${plant.scientific_name}</p>` : nothing}
        <p class="status status-${plant.status}">${t(`status.${plant.status}`)}</p>
        <p class="muted facts">${facts.join(" · ")}</p>
        ${
          pinned
            ? html`<button
                class="button secondary"
                @click=${() => navigate(plantPath(plant, this.prefix))}
              >
                ${icon(mdiOpenInNew)} ${t("plan.details")}
              </button>`
            : nothing
        }
      </div>
    </article>`;
  }

  private _renderShapeCard(shape: Shape) {
    const { t, language } = this;
    const plant = shape.plant_id ? this.store.getPlant(shape.plant_id) : undefined;
    return html`<article class="card info pinned shape-card" style="--x: 50%; --y: 0px">
      <div class="info-body">
        <div class="info-title">
          <h3>${shape.label ?? t(`kind.${shape.kind}`)}</h3>
          <button
            class="icon-button small"
            @click=${() => (this._selection = null)}
            aria-label=${t("common.close")}
          >
            ${icon(mdiClose)}
          </button>
        </div>
        <p class="muted">
          ${t(`kind.${shape.kind}`)} · ${formatNumber(area(shape.geometry), language, 1)} m²
        </p>
        ${
          plant
            ? html`<button
                class="button secondary"
                @click=${() => navigate(plantPath(plant, this.prefix))}
              >
                ${icon(mdiSprout)} ${plant.name}
              </button>`
            : nothing
        }
      </div>
    </article>`;
  }

  private _renderSide() {
    return html`<aside class="side">${this._renderProperties()} ${this._renderTray()}</aside>`;
  }

  private _renderProperties() {
    const selection = this._selection;
    if (!selection) return nothing;
    if (selection.type === "plant") {
      const plant = this.store.getPlant(selection.id);
      return plant ? this._renderPlantProperties(plant) : nothing;
    }
    const shape = this.store.getShape(selection.id);
    return shape ? this._renderShapeProperties(shape) : nothing;
  }

  private _renderPlantProperties(plant: Plant) {
    const { t, language } = this;
    return html`<section class="props">
      <div class="props-title">
        <h3>${plant.name}</h3>
        <button
          class="icon-button small"
          @click=${() => (this._selection = null)}
          aria-label=${t("common.close")}
        >
          ${icon(mdiClose)}
        </button>
      </div>
      <label class="field">
        <span>${t("plan.crown")}</span>
        <input
          type="number"
          min="0.05"
          step="0.05"
          inputmode="decimal"
          .value=${plant.crown_diameter_m === null ? "" : String(plant.crown_diameter_m)}
          placeholder=${t("plan.crown_auto", {
            size: formatLength(crownDiameter({ ...plant, crown_diameter_m: null }) * 100, language),
          })}
          @change=${(e: Event) => {
            const raw = (e.target as HTMLInputElement).value.replace(",", ".");
            const value = raw.trim() === "" ? null : Number(raw);
            if (value !== null && !(value >= 0.05 && value <= 100)) return;
            const from = plant.crown_diameter_m;
            void this._execute({
              label: "crown",
              run: () => this._setCrown(plant.id, value),
              undo: () => this._setCrown(plant.id, from),
            });
          }}
        />
      </label>
      <div class="props-actions">
        <button class="button secondary" @click=${() => navigate(plantPath(plant, this.prefix))}>
          ${icon(mdiOpenInNew)} ${t("plan.details")}
        </button>
        ${
          plant.position
            ? html`<button
                class="button text danger"
                @click=${() => {
                  this._selection = null;
                  void this._movePlant(plant.id, plant.position, null);
                }}
              >
                ${icon(mdiMapMarkerRemoveOutline)} ${t("plan.unplace")}
              </button>`
            : nothing
        }
      </div>
    </section>`;
  }

  private _renderShapeProperties(shape: Shape) {
    const { t, language } = this;
    const update = (changes: Partial<Shape>) =>
      void this._replaceShape(shape, { ...shape, ...changes });
    const soil = shape.kind === "bed" || shape.kind === "raised_bed";
    return html`<section class="props">
      <div class="props-title">
        <h3>${shape.label ?? t(`kind.${shape.kind}`)}</h3>
        <button
          class="icon-button small"
          @click=${() => (this._selection = null)}
          aria-label=${t("common.close")}
        >
          ${icon(mdiClose)}
        </button>
      </div>
      <label class="field">
        <span>${t("plan.kind")}</span>
        <select
          @change=${(e: Event) => {
            const kind = (e.target as HTMLSelectElement).value as ShapeKind;
            update({ kind, z: KIND_Z[kind] });
          }}
        >
          ${SHAPE_KINDS.map(
            (kind) =>
              html`<option value=${kind} ?selected=${kind === shape.kind}>
                ${t(`kind.${kind}`)}
              </option>`,
          )}
        </select>
      </label>
      <label class="field">
        <span>${t("plan.label")}</span>
        <input
          maxlength="100"
          .value=${shape.label ?? ""}
          @change=${(e: Event) => update({ label: (e.target as HTMLInputElement).value.trim() || null })}
        />
      </label>
      <label class="field">
        <span>${t("plan.linked_plant")}</span>
        <select
          @change=${(e: Event) => update({ plant_id: (e.target as HTMLSelectElement).value || null })}
        >
          <option value="" ?selected=${!shape.plant_id}>${t("plan.no_plant")}</option>
          ${this._plants.map(
            (plant) =>
              html`<option value=${plant.id} ?selected=${plant.id === shape.plant_id}>
                ${plant.name}
              </option>`,
          )}
        </select>
      </label>
      ${
        soil
          ? html`<label class="field">
              <span>${t("field.soil_type")}</span>
              <select
                @change=${(e: Event) =>
                  update({
                    soil_type: ((e.target as HTMLSelectElement).value ||
                      null) as Shape["soil_type"],
                  })}
              >
                <option value="" ?selected=${!shape.soil_type}>${t("common.not_set")}</option>
                ${SOIL_TYPES.map(
                  (type) =>
                    html`<option value=${type} ?selected=${type === shape.soil_type}>
                      ${t(`soil.${type}`)}
                    </option>`,
                )}
              </select>
            </label>`
          : nothing
      }
      <label class="check">
        <input
          type="checkbox"
          .checked=${shape.locked}
          @change=${(e: Event) => update({ locked: (e.target as HTMLInputElement).checked })}
        />
        <span>${t("plan.locked")}</span>
      </label>
      <p class="muted">${t("plan.area")}: ${formatNumber(area(shape.geometry), language, 1)} m²</p>
      <div class="props-actions">
        <button class="button text danger" @click=${this._onDeleteSelection}>
          ${icon(mdiDeleteOutline)} ${t("plan.delete_shape")}
        </button>
      </div>
    </section>`;
  }

  private _renderTray() {
    const { t } = this;
    const plants = this._plants.filter((plant) => matchesQuery(plant, this._query));
    const unplaced = plants.filter((plant) => !plant.position);
    const placed = plants.filter((plant) => plant.position);
    const item = (plant: Plant) =>
      html`<li>
        <button
          class="tray-item ${this._armed === plant.id ? "armed" : ""}"
          @pointerdown=${(e: PointerEvent) => this._onTrayPointerDown(e, plant.id)}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              this._arm(plant.id);
            }
          }}
          aria-pressed=${this._armed === plant.id}
        >
          ${
            plant.cover
              ? html`<img src=${plant.cover.urls.thumb} alt="" loading="lazy" draggable="false" />`
              : html`<span class="thumb-placeholder">${icon(mdiSprout)}</span>`
          }
          <span class="tray-name">${plant.name}</span>
        </button>
      </li>`;
    return html`<section class="tray">
      <div class="props-title">
        <h3>${t("plan.tray")}</h3>
        <button
          class="button text"
          @click=${() => this.renderRoot.querySelector<PgPlantForm>("pg-plant-form")?.open()}
        >
          ${icon(mdiPlus)} ${t("plan.new_plant")}
        </button>
      </div>
      <label class="search">
        ${icon(mdiMagnify)}
        <span class="sr-only">${t("plants.search")}</span>
        <input
          type="search"
          placeholder=${t("plants.search")}
          .value=${this._query}
          @input=${(e: Event) => (this._query = (e.target as HTMLInputElement).value)}
        />
      </label>
      <p class="muted small">${t("plan.tray_hint")}</p>
      ${!this._plants.length ? html`<p class="muted">${t("plan.tray_empty")}</p>` : nothing}
      ${
        unplaced.length
          ? html`<h4>${t("plan.tray_unplaced")}</h4>
              <ul>
                ${unplaced.map(item)}
              </ul>`
          : nothing
      }
      ${
        placed.length
          ? html`<h4>${t("plan.tray_placed")}</h4>
              <ul>
                ${placed.map(item)}
              </ul>`
          : nothing
      }
    </section>`;
  }

  private _renderGhost() {
    const drag = this._drag;
    if (!drag?.dragging) return nothing;
    const plant = this.store.getPlant(drag.plantId);
    if (!plant) return nothing;
    return html`<div class="ghost" style="left: ${drag.x}px; top: ${drag.y}px">
      ${
        plant.cover
          ? html`<img src=${plant.cover.urls.thumb} alt="" />`
          : html`<span class="thumb-placeholder">${icon(mdiSprout)}</span>`
      }
    </div>`;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: block;
        height: 100%;
      }
      .layout {
        display: flex;
        height: 100%;
      }
      .stage {
        position: relative;
        flex: 1;
        min-width: 0;
      }
      pg-garden-canvas {
        position: absolute;
        inset: 0;
      }

      /* ---------------------------------------------- toolbar */
      .toolbar {
        position: absolute;
        top: 12px;
        left: 12px;
        right: 12px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        pointer-events: none;
      }
      .group {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 3px;
        border-radius: 12px;
        background: var(--pg-surface);
        box-shadow: var(--pg-shadow);
        pointer-events: auto;
      }
      .group.compact {
        padding: 3px 8px;
        gap: 6px;
        font-size: 13px;
      }
      .group.compact select {
        min-height: 34px;
        padding: 4px 8px;
        width: auto;
      }
      .label-text {
        color: var(--pg-text-muted);
      }
      .fit {
        margin-left: auto;
      }
      .seg,
      .tool {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 40px;
        height: 36px;
        padding: 0 10px;
        border: none;
        border-radius: 9px;
        background: transparent;
        color: var(--pg-text);
        font: inherit;
        font-size: 14px;
        cursor: pointer;
        justify-content: center;
      }
      .tool {
        padding: 0 8px;
      }
      .seg[aria-pressed="true"],
      .tool[aria-pressed="true"] {
        background: color-mix(in srgb, var(--pg-accent) 16%, transparent);
        color: var(--pg-accent);
      }
      .tool:disabled {
        opacity: 0.35;
        cursor: default;
      }
      .seg:focus-visible,
      .tool:focus-visible {
        outline: 2px solid var(--pg-accent);
      }
      .seg .icon,
      .tool .icon {
        width: 20px;
        height: 20px;
      }

      /* ---------------------------------------------- hint and toast */
      .hint,
      .toast {
        position: absolute;
        left: 50%;
        bottom: 16px;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: calc(100% - 32px);
        padding: 8px 16px;
        border-radius: 999px;
        background: var(--pg-surface);
        box-shadow: var(--pg-shadow);
        font-size: 14px;
      }
      .toast {
        bottom: 64px;
        border-radius: 12px;
      }

      /* ---------------------------------------------- info card */
      .info {
        position: absolute;
        left: clamp(8px, calc(var(--x) + 18px), calc(100% - 288px));
        top: clamp(64px, calc(var(--y) - 40px), calc(100% - 300px));
        width: 280px;
        overflow: hidden;
        z-index: 2;
        animation: pop 140ms ease-out;
      }
      .info.hover {
        pointer-events: none;
      }
      .shape-card {
        left: auto;
        right: 12px;
        top: 64px;
      }
      @keyframes pop {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
      }
      .info-photo {
        aspect-ratio: 16 / 10;
        background: var(--pg-leaf-soft);
      }
      .info-photo img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .placeholder,
      .thumb-placeholder {
        display: grid;
        place-items: center;
        height: 100%;
        color: var(--pg-leaf);
      }
      .info-body {
        display: grid;
        gap: 4px;
        padding: 12px 14px 14px;
      }
      .info-title,
      .props-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .info h3,
      .props h3,
      .tray h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
      }
      .info p {
        margin: 0;
      }
      .latin {
        font-style: italic;
        color: var(--pg-text-muted);
        font-size: 13px;
      }
      .facts {
        font-size: 13px;
      }
      .info .button {
        margin-top: 6px;
        justify-self: start;
      }
      .icon-button.small {
        width: 32px;
        height: 32px;
      }
      .icon-button.small .icon {
        width: 18px;
        height: 18px;
      }

      /* ---------------------------------------------- side panel */
      .side {
        width: 300px;
        flex: none;
        overflow: auto;
        border-left: 1px solid var(--pg-divider);
        background: var(--pg-surface);
      }
      .props,
      .tray {
        display: grid;
        gap: 10px;
        padding: 14px 16px;
      }
      .props {
        border-bottom: 1px solid var(--pg-divider);
        background: color-mix(in srgb, var(--pg-accent) 5%, var(--pg-surface));
      }
      .props-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .check {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
      }
      .check input {
        width: 18px;
        min-height: 18px;
        height: 18px;
      }
      .props p {
        margin: 0;
        font-size: 13px;
      }
      .search {
        position: relative;
      }
      .search .icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 18px;
        height: 18px;
        color: var(--pg-text-muted);
      }
      .search input {
        padding-left: 34px;
        border-radius: 999px;
      }
      .small {
        font-size: 12px;
        margin: 0;
      }
      .tray h4 {
        margin: 6px 0 0;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--pg-text-muted);
      }
      .tray ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 6px;
      }
      .tray-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 6px 8px;
        border: 1px solid var(--pg-divider);
        border-radius: 12px;
        background: var(--pg-surface);
        color: var(--pg-text);
        font: inherit;
        text-align: left;
        cursor: grab;
      }
      .tray-item:hover {
        border-color: color-mix(in srgb, var(--pg-accent) 40%, transparent);
      }
      .tray-item.armed {
        border-color: var(--pg-accent);
        background: color-mix(in srgb, var(--pg-accent) 10%, var(--pg-surface));
      }
      .tray-item img,
      .tray-item .thumb-placeholder,
      .ghost img,
      .ghost .thumb-placeholder {
        width: 40px;
        height: 40px;
        flex: none;
        border-radius: 50%;
        object-fit: cover;
        background: var(--pg-leaf-soft);
      }
      .tray-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ghost {
        position: fixed;
        z-index: 10;
        transform: translate(-50%, -50%);
        pointer-events: none;
        filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.3));
      }
      .ghost img,
      .ghost .thumb-placeholder {
        width: 52px;
        height: 52px;
        border: 3px solid var(--pg-accent);
      }

      @media (max-width: 760px) {
        .layout.editing {
          flex-direction: column;
        }
        .layout.editing .stage {
          flex: 1 1 60%;
        }
        .side {
          width: auto;
          flex: 0 1 40%;
          border-left: none;
          border-top: 1px solid var(--pg-divider);
        }
        .seg span {
          display: none;
        }
        .info {
          left: 8px;
          right: 8px;
          top: auto;
          bottom: 8px;
          width: auto;
          display: grid;
          grid-template-columns: 110px 1fr;
        }
        .info-photo {
          aspect-ratio: auto;
        }
        .shape-card {
          grid-template-columns: 1fr;
        }
        .hint {
          bottom: 72px;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .info {
          animation: none;
        }
      }
    `,
  ];
}

define("pg-garden-view", PgGardenView);
