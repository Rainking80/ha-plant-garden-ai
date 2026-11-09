import {
  mdiAlertCircleOutline,
  mdiAxisArrow,
  mdiCheckboxMarkedCircleOutline,
  mdiCircleOutline,
  mdiClose,
  mdiCommentQuestionOutline,
  mdiCursorDefaultOutline,
  mdiDraw,
  mdiDeleteOutline,
  mdiEyeOutline,
  mdiFitToScreenOutline,
  mdiLayersOutline,
  mdiLayersTripleOutline,
  mdiMagnify,
  mdiMapMarkerPlusOutline,
  mdiMapMarkerRadiusOutline,
  mdiMapMarkerRemoveOutline,
  mdiOpenInNew,
  mdiPencilOutline,
  mdiPlus,
  mdiRectangleOutline,
  mdiRedo,
  mdiRulerSquareCompass,
  mdiSprinklerVariant,
  mdiSprout,
  mdiUndo,
  mdiVectorPolygon,
  mdiWater,
  mdiWaterOffOutline,
  mdiWaterOutline,
} from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import { css, html, nothing, svg, type PropertyValues } from "lit";

import {
  deleteMarker,
  deleteShape,
  errorMessage,
  movePlants,
  numericHistory,
  saveMarker,
  saveShape,
  setBackground,
  setOrigin,
  updatePlant,
} from "../api/client";
import {
  DEFAULT_EFFICIENCY,
  EMITTERS,
  SHAPE_KINDS,
  SOIL_TYPES,
  ZONE_ENTITY_DOMAINS,
  type Emitter,
  type Irrigation,
  type Background,
  type Geometry,
  type Marker,
  type Plant,
  type PlantBalance,
  type PlantCare,
  type Point,
  type Shape,
  type ShapeKind,
} from "../api/types";
import "../components/background-dialog";
import type { PgBackgroundDialog } from "../components/background-dialog";
import { PgElement, define, icon } from "../components/base";
import "../components/entity-picker";
import type { PgEntityPicker } from "../components/entity-picker";
import "../components/garden-canvas";
import type {
  Armed,
  CalibrateDetail,
  CrownDetail,
  HoverDetail,
  Layer,
  Mode,
  MoveBackgroundDetail,
  MoveMarkerDetail,
  MovePlantDetail,
  PgGardenCanvas,
  PlaceDetail,
  Selection,
  ShapeChangeDetail,
  Tool,
} from "../components/garden-canvas";
import "../components/number-dialog";
import type { PgNumberDialog } from "../components/number-dialog";
import "../components/origin-dialog";
import {
  formatDistance,
  type OriginChangeDetail,
  type PgOriginDialog,
} from "../components/origin-dialog";
import { plantPath } from "../components/plant-card";
import {
  footprints,
  isRunning,
  precipitationRate,
  rateField,
  zoneCoverage,
} from "../util/coverage";
import "../components/plant-form";
import type { PgPlantForm, PlantSavedDetail } from "../components/plant-form";
import type { TranslationKey } from "../i18n";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { sparklinePath } from "../util/chart";
import {
  formatAge,
  formatDate,
  formatDateTime,
  formatLength,
  formatLiters,
  formatNumber,
} from "../util/format";
import {
  PLAN_EXTENT_M,
  anchorPoints,
  area,
  crownDiameter,
  distance,
  insidePlan,
  labelPoint,
  snapPoint,
} from "../util/geometry";
import { History, type Command } from "../util/history";
import { markerName, markerValue } from "../util/markers";
import { navigate } from "../util/navigate";
import { ulid } from "../util/ulid";
import { MAX_SUGGESTION_DISTANCE_M } from "../util/upload";
import { isViewport, type Viewport } from "../util/viewport";
import { planToGeo, reproject, type GeoOrigin } from "../util/wms";
import { matchesQuery } from "./plants-view";

const VIEWPORT_KEY = "plant-garden.viewport.v1";
const ZONES_KEY = "plant-garden.zones.v1";
const NO_PLANTS: ReadonlySet<string> = new Set();
const NO_WATER: Record<string, PlantBalance> = {};
const NO_CARE: Record<string, PlantCare> = {};
const DRAWING_TOOLS: readonly Tool[] = ["rect", "circle", "polygon", "freehand"];

/** The kind of area a plant drawn as an area gets. */
export function areaKind(category: Plant["category"]): ShapeKind {
  if (category === "hedge") return "hedge";
  if (category === "lawn") return "lawn";
  return "bed";
}
const LAYER_KEY = "plant-garden.layer.v1";
const LAYERS: readonly Layer[] = ["plan", "deficit", "coverage"];

function defaultIrrigation(): Irrigation {
  return {
    entity_id: null,
    timer_entity_id: null,
    meter_entity_id: null,
    emitter: "spray",
    rate_mm_h: null,
    flow_l_min: null,
    drip_l_h: null,
    efficiency: null,
    include: [],
    exclude: [],
  };
}

/** A positive number from a form field, or null when empty or invalid. */
function positive(raw: string, max: number): number | null {
  const value = Number(raw.replace(",", ".").trim());
  return raw.trim() !== "" && value > 0 && value <= max ? value : null;
}

/** Entities a zone links to, and the domains the picker offers for each. */
const ZONE_PICKS = {
  entity_id: ZONE_ENTITY_DOMAINS as readonly string[],
  timer_entity_id: ["timer"],
  meter_entity_id: ["sensor"],
} as const;
type ZonePick = keyof typeof ZONE_PICKS;
const SNAP_KEY = "plant-garden.snap.v1";
const SNAP_STEPS = [0, 0.1, 0.25, 0.5, 1];

/**
 * From this distance between the view and the garden's location the plan
 * suggests moving the location (photo GPS suggestions stop working beyond it).
 */
const FAR_FROM_ORIGIN_M = MAX_SUGGESTION_DISTANCE_M;

/** Something would land further than PLAN_EXTENT_M from the garden's location. */
class OutOfPlanError extends Error {}

function checkInsidePlan(...points: Point[]): void {
  if (!points.every(insidePlan)) throw new OutOfPlanError("out of plan");
}

function errorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

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
  zone: 7,
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

/**
 * Scale an image background about plan point `a` so that the distance a-b
 * becomes `metres` (the user tapped two points with a known distance).
 */
export function calibrateBackground(
  bg: Extract<Background, { type: "image" }>,
  a: Point,
  b: Point,
  metres: number,
): Extract<Background, { type: "image" }> {
  const factor = metres / distance(a, b);
  return {
    ...bg,
    x: a.x + (bg.x - a.x) * factor,
    y: a.y + (bg.y - a.y) * factor,
    width_m: bg.width_m * factor,
  };
}

interface TrayDrag {
  plantId: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  dragging: boolean;
}

interface MarkerHistory {
  entityId: string;
  points: [number, number][];
}

/**
 * The garden plan: canvas, mode and tool bar, plant tray, info cards and
 * properties, background and sensor markers. Every change is an undoable
 * command that updates the store optimistically and then the backend.
 */
export class PgGardenView extends PgElement {
  static override properties = {
    store: { attribute: false },
    prefix: {},
    focusPlantId: { attribute: false },
    _mode: { state: true },
    _tool: { state: true },
    _newKind: { state: true },
    _areaFor: { state: true },
    _snap: { state: true },
    _selection: { state: true },
    _hover: { state: true },
    _armed: { state: true },
    _query: { state: true },
    _error: { state: true },
    _drag: { state: true },
    _historyTick: { state: true },
    _markerHistory: { state: true },
    _farM: { state: true },
    _showZones: { state: true },
    _zonePick: { state: true },
    _layer: { state: true },
  };

  declare store: GardenStore;
  declare prefix: string;
  declare focusPlantId: string | null;
  declare _mode: Mode;
  declare _tool: Tool;
  declare _newKind: ShapeKind;
  /** A plant whose area (hedge, lawn …) is being drawn; the new shape is linked to it. */
  declare _areaFor: string | null;
  declare _snap: number;
  declare _selection: Selection;
  declare _hover: HoverDetail | null;
  declare _armed: Armed | null;
  declare _query: string;
  declare _error: string;
  declare _drag: TrayDrag | null;
  declare _historyTick: number;
  declare _markerHistory: MarkerHistory | null;
  /** Distance of the view from the garden's location when that is far (else 0). */
  declare _farM: number;
  declare _showZones: boolean;
  /** which entity of the selected zone the picker fills in */
  declare _zonePick: ZonePick | null;
  declare _layer: Layer;

  private readonly _history = new History();
  private _fitted = false;
  private _focused: string | null = null;
  private _errorTimer?: ReturnType<typeof setTimeout>;
  private _states: Record<string, HassEntity | undefined> = {};
  private _highlightMemo: {
    zone: Shape;
    plants: Plant[];
    shapes: Shape[];
    set: ReadonlySet<string>;
  } | null = null;

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
    this._areaFor = null;
    this._snap = readStorage(SNAP_KEY, isSnap) ?? 0.25;
    this._selection = null;
    this._hover = null;
    this._armed = null;
    this._query = "";
    this._error = "";
    this._drag = null;
    this._historyTick = 0;
    this._markerHistory = null;
    this._farM = 0;
    this._showZones = readStorage(ZONES_KEY, (v): v is boolean => typeof v === "boolean") ?? true;
    this._zonePick = null;
    this._layer = readStorage(LAYER_KEY, (v): v is Layer => LAYERS.includes(v as Layer)) ?? "plan";
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
      this._trackDistance(saved);
    }
    this._initViewport();
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has("focusPlantId")) this._focusPlant();
    if (changed.has("_selection")) void this._loadMarkerHistory();
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

  private get _markers(): Marker[] {
    return this.store?.layout?.markers ?? [];
  }

  private get _background(): Background | null {
    return this.store?.layout?.background ?? null;
  }

  /**
   * States of the marker entities. A new object only when one of them changed,
   * so the canvas does not re-render for every state change in the house.
   */
  private _markerStates(): Record<string, HassEntity | undefined> {
    const ids = new Set(this._markers.map((marker) => marker.entity_id));
    for (const shape of this._shapes) {
      const zone = shape.irrigation;
      if (zone?.entity_id) ids.add(zone.entity_id);
      if (zone?.timer_entity_id) ids.add(zone.timer_entity_id);
    }
    const next: Record<string, HassEntity | undefined> = {};
    let changed = Object.keys(this._states).length !== ids.size;
    for (const id of ids) {
      const state = this.hass?.states[id];
      next[id] = state;
      if (this._states[id] !== state) changed = true;
    }
    if (changed) this._states = next;
    return this._states;
  }

  /** Plants the selected zone reaches (shown with a water ring). */
  private _highlight(): ReadonlySet<string> {
    const selection = this._selection;
    const zone = selection?.type === "shape" ? this.store?.getShape(selection.id) : undefined;
    if (zone?.kind !== "zone") return NO_PLANTS;
    // the store replaces its arrays on every change, so identity tells when to recompute
    const memo = this._highlightMemo;
    if (memo?.zone !== zone || memo.plants !== this._plants || memo.shapes !== this._shapes) {
      const set = new Set(this._coverage(zone).keys());
      this._highlightMemo = { zone, plants: this._plants, shapes: this._shapes, set };
      return set;
    }
    return memo.set;
  }

  private _coverage(zone: Shape): Map<string, number> {
    return zoneCoverage(zone, footprints(this._plants, this._shapes));
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

  private async _loadMarkerHistory(): Promise<void> {
    const selection = this._selection;
    if (selection?.type !== "marker" || this._mode !== "view") {
      this._markerHistory = null;
      return;
    }
    const marker = this.store.getMarker(selection.id);
    if (!marker) return;
    try {
      const points = await numericHistory(this.hass, marker.entity_id);
      if (this._selection?.id === selection.id) {
        this._markerHistory = { entityId: marker.entity_id, points };
      }
    } catch {
      this._markerHistory = { entityId: marker.entity_id, points: [] };
    }
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
    const extent = formatDistance(PLAN_EXTENT_M, this.language);
    if (err instanceof OutOfPlanError) {
      this._error = this.t("plan.too_far", { extent });
    } else if (errorCode(err) === "out_of_range") {
      this._error = this.t("origin.too_far", { extent });
    } else {
      this._error = this.t("plan.save_failed", { message: errorMessage(err) });
    }
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => (this._error = ""), 8000);
  }

  private async _setPosition(plantId: string, position: Point | null): Promise<void> {
    if (position) checkInsidePlan(position);
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
    checkInsidePlan(...anchorPoints(shape.geometry));
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

  private async _putMarker(marker: Marker): Promise<void> {
    checkInsidePlan(marker);
    const before = this.store.getMarker(marker.id);
    this.store.putMarker(marker);
    try {
      await saveMarker(this.hass, marker);
    } catch (err) {
      if (before) this.store.putMarker(before);
      else this.store.removeMarker(marker.id);
      throw err;
    }
  }

  private async _removeMarker(marker: Marker): Promise<void> {
    this.store.removeMarker(marker.id);
    try {
      await deleteMarker(this.hass, marker.id);
    } catch (err) {
      this.store.putMarker(marker);
      throw err;
    }
  }

  private async _applyBackground(background: Background | null): Promise<void> {
    if (background?.type === "image") checkInsidePlan(background);
    const before = this._background;
    this.store.setBackground(background);
    try {
      // the answer carries a fresh signed URL for image backgrounds
      const layout = await setBackground(this.hass, background);
      this.store.setBackground(layout.background);
    } catch (err) {
      this.store.setBackground(before);
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

  private _replaceMarker(from: Marker, to: Marker): Promise<void> {
    return this._execute({
      label: "change-marker",
      run: () => this._putMarker(to),
      undo: () => this._putMarker(from),
    });
  }

  private _changeBackground(to: Background | null): Promise<void> {
    const from = this._background;
    return this._execute({
      label: "background",
      run: () => this._applyBackground(to),
      undo: () => this._applyBackground(from),
    });
  }

  /**
   * Move the garden's location from `from` to `to`. The view stays on the same
   * spot of the map; with `moveContent` the drawing travels to the new place.
   */
  private async _applyOrigin(from: GeoOrigin, to: GeoOrigin, moveContent: boolean): Promise<void> {
    const layout = await setOrigin(this.hass, to.latitude, to.longitude, moveContent);
    await this.store.applyLayout(layout);
    const canvas = this._canvas;
    if (!canvas) return;
    const view = canvas.viewport;
    const center = reproject(from, to, { x: view.cx, y: view.cy });
    canvas.centerOn(insidePlan(center) ? center : { x: 0, y: 0 }, view.width);
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
      plant_id: this._newKind === "zone" ? null : this._areaFor,
      soil_type: null,
      locked: false,
      z: KIND_Z[this._newKind],
      irrigation: this._newKind === "zone" ? defaultIrrigation() : null,
    };
    this._tool = "select";
    this._areaFor = null;
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

  private _onMoveMarker(event: CustomEvent<MoveMarkerDetail>): void {
    const marker = this.store.getMarker(event.detail.markerId);
    if (!marker) return;
    const { from, to } = event.detail;
    void this._replaceMarker({ ...marker, ...from }, { ...marker, ...to });
  }

  private _onMoveBackground(event: CustomEvent<MoveBackgroundDetail>): void {
    const bg = this._background;
    if (bg?.type !== "image") return;
    void this._changeBackground({ ...bg, x: event.detail.to.x, y: event.detail.to.y });
  }

  private async _onCalibrate(event: CustomEvent<CalibrateDetail>): Promise<void> {
    const bg = this._background;
    if (bg?.type !== "image") return;
    const { a, b } = event.detail;
    const dialog = this.renderRoot.querySelector<PgNumberDialog>("pg-number-dialog");
    const metres = await dialog?.ask(
      this.t("plan.calibrate_title"),
      this.t("plan.calibrate_label"),
      this.t("plan.calibrate_measured", {
        length: formatNumber(distance(a, b), this.language, 2),
      }),
    );
    if (!metres) return;
    this._tool = "select";
    void this._changeBackground(calibrateBackground(bg, a, b, metres));
  }

  private _onPlace(event: CustomEvent<PlaceDetail>): void {
    const { armed, at } = event.detail;
    this._armed = null;
    if (armed.kind === "marker") {
      const marker: Marker = {
        id: ulid(),
        entity_id: armed.entityId,
        x: at.x,
        y: at.y,
        label: null,
      };
      this._selection = { type: "marker", id: marker.id };
      void this._execute({
        label: "create-marker",
        run: () => this._putMarker(marker),
        undo: () => this._removeMarker(marker),
      });
      return;
    }
    const plant = this.store.getPlant(armed.plantId);
    if (!plant) return;
    this._selection = { type: "plant", id: plant.id };
    void this._movePlant(plant.id, plant.position, at);
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
    } else if (selection.type === "marker") {
      const marker = this.store.getMarker(selection.id);
      if (!marker) return;
      void this._execute({
        label: "delete-marker",
        run: () => this._removeMarker(marker),
        undo: () => this._putMarker(marker),
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
    this._trackDistance(event.detail.viewport);
  }

  private _trackDistance(viewport: Viewport): void {
    const metres = Math.hypot(viewport.cx, viewport.cy);
    this._farM = metres > FAR_FROM_ORIGIN_M ? Math.round(metres / 100) * 100 : 0;
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
    this._areaFor = null;
    this._armed = null;
    this._hover = null;
    this._selection = null;
  }

  private _setTool(tool: Tool): void {
    this._tool = tool;
    this._armed = null;
    if (!DRAWING_TOOLS.includes(tool)) this._areaFor = null;
  }

  /** Is an irrigation zone about to be drawn? */
  private get _drawingZone(): boolean {
    return DRAWING_TOOLS.includes(this._tool) && this._newKind === "zone";
  }

  /** Start drawing an irrigation zone: rectangle by default, the zone layer visible. */
  private _drawZone(): void {
    this._newKind = "zone";
    this._areaFor = null;
    this._armed = null;
    this._selection = null;
    if (!DRAWING_TOOLS.includes(this._tool)) this._tool = "rect";
    this._showZonesLayer();
  }

  private _showZonesLayer(): void {
    if (this._showZones) return;
    this._showZones = true;
    writeStorage(ZONES_KEY, true);
  }

  /** Draw a plant as an area instead of placing it as one crown (a hedge, the lawn). */
  private _drawAreaFor(plant: Plant): void {
    this._areaFor = plant.id;
    this._newKind = areaKind(plant.category);
    this._tool = "freehand";
    this._armed = null;
    this._selection = null;
  }

  private _setSnap(event: Event): void {
    this._snap = Number((event.target as HTMLSelectElement).value);
    writeStorage(SNAP_KEY, this._snap);
  }

  private _openBackground(): void {
    const dialog = this.renderRoot.querySelector<PgBackgroundDialog>("pg-background-dialog");
    dialog?.open(this._canvas?.viewport ?? { cx: 0, cy: 0, width: 40 });
  }

  private _onBackgroundChange(event: CustomEvent<{ background: Background | null }>): void {
    void this._changeBackground(event.detail.background);
  }

  private _openOrigin(): void {
    const origin = this.store?.layout?.origin;
    const view = this._canvas?.viewport;
    const center = origin && view ? planToGeo(origin, { x: view.cx, y: view.cy }) : null;
    this.renderRoot.querySelector<PgOriginDialog>("pg-origin-dialog")?.open(center);
  }

  private _onOriginChange(event: CustomEvent<OriginChangeDetail>): void {
    const from = this.store?.layout?.origin;
    if (!from) return;
    const { latitude, longitude, moveContent } = event.detail;
    const to = { latitude, longitude };
    this._selection = null;
    void this._execute({
      label: "origin",
      run: () => this._applyOrigin(from, to, moveContent),
      undo: () => this._applyOrigin(to, from, moveContent),
    });
  }

  private _openEntityPicker(): void {
    this.renderRoot.querySelector<PgEntityPicker>("pg-entity-picker.marker-picker")?.open();
  }

  private _onEntityPicked(event: CustomEvent<{ entityId: string }>): void {
    this._tool = "select";
    this._selection = null;
    this._armed = { kind: "marker", entityId: event.detail.entityId };
  }

  // ------------------------------------------------------------ tray
  private _arm(plantId: string): void {
    const armed = this._armed;
    this._armed =
      armed?.kind === "plant" && armed.plantId === plantId ? null : { kind: "plant", plantId };
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
      this._onPlace(
        new CustomEvent("place", {
          detail: { armed: { kind: "plant", plantId: drag.plantId }, at },
        }),
      );
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
    const plant = event.detail.plant;
    if (event.detail.created && !plant.position) this._armed = { kind: "plant", plantId: plant.id };
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
            .markers=${this._markers}
            .states=${this._markerStates()}
            .background=${this._background}
            .origin=${this.store?.layout?.origin ?? null}
            .mode=${this._mode}
            .tool=${this._tool}
            .selection=${this._selection}
            .snapStep=${this._snap}
            .armed=${this._armed}
            .highlight=${this._highlight()}
            .showZones=${this._showZones}
            .water=${this.store?.water?.plants ?? NO_WATER}
            .care=${this.store?.care?.plants ?? NO_CARE}
            .layer=${this._layer}
            @select=${this._onSelect}
            @hover=${this._onHover}
            @move-plant=${this._onMovePlant}
            @resize-crown=${this._onResizeCrown}
            @create-shape=${this._onCreateShape}
            @change-shape=${this._onChangeShape}
            @move-marker=${this._onMoveMarker}
            @move-background=${this._onMoveBackground}
            @calibrate=${this._onCalibrate}
            @place=${this._onPlace}
            @delete-selection=${this._onDeleteSelection}
            @cancel=${this._onCancel}
            @viewport-change=${this._onViewport}
            @view-moved=${() => {
              // keep a pinned info card next to its element while panning
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
      <pg-plant-form
        .hass=${this.hass}
        .origin=${this.store?.layout?.origin ?? null}
        @plant-saved=${this._onPlantSaved}
      ></pg-plant-form>
      <pg-background-dialog
        .hass=${this.hass}
        .background=${this._background}
        .origin=${this.store?.layout?.origin ?? null}
        @background-change=${this._onBackgroundChange}
      ></pg-background-dialog>
      <pg-origin-dialog
        .hass=${this.hass}
        .origin=${this.store?.layout?.origin ?? null}
        @origin-change=${this._onOriginChange}
      ></pg-origin-dialog>
      <pg-entity-picker
        class="marker-picker"
        .hass=${this.hass}
        .heading=${this.t("plan.add_marker")}
        @entity-picked=${this._onEntityPicked}
      ></pg-entity-picker>
      <pg-entity-picker
        class="zone-picker"
        .hass=${this.hass}
        .domains=${this._zonePick ? [...ZONE_PICKS[this._zonePick]] : undefined}
        .heading=${this._zonePick ? this.t(`zone.${this._zonePick}`) : ""}
        @entity-picked=${this._onZoneEntityPicked}
      ></pg-entity-picker>
      <pg-number-dialog .hass=${this.hass}></pg-number-dialog>
    `;
  }

  private _toolButton(tool: Tool, path: string, label: TranslationKey) {
    return html`<button
      class="tool"
      aria-pressed=${this._tool === tool}
      @click=${() => this._setTool(tool)}
      aria-label=${this.t(label)}
      title=${this.t(label)}
    >
      ${icon(path)}
    </button>`;
  }

  private _renderToolbar() {
    const { t } = this;
    const editing = this._mode === "edit";
    const imageBackground = this._background?.type === "image";
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
                ${this._toolButton("select", mdiCursorDefaultOutline, "plan.tool_select")}
                ${this._toolButton("rect", mdiRectangleOutline, "plan.tool_rect")}
                ${this._toolButton("circle", mdiCircleOutline, "plan.tool_circle")}
                ${this._toolButton("polygon", mdiVectorPolygon, "plan.tool_polygon")}
                ${this._toolButton("freehand", mdiDraw, "plan.tool_freehand")}
              </div>
              <div class="group" role="group">
                <button
                  class="seg zone-tool"
                  aria-pressed=${this._drawingZone}
                  @click=${this._drawZone}
                  title=${t("plan.tool_zone_hint")}
                >
                  ${icon(mdiSprinklerVariant)}<span>${t("plan.tool_zone")}</span>
                </button>
              </div>
              ${
                DRAWING_TOOLS.includes(this._tool)
                  ? html`<label class="group compact">
                      <span class="sr-only">${t("plan.new_kind")}</span>
                      <select
                        @change=${(e: Event) => {
                          this._newKind = (e.target as HTMLSelectElement).value as ShapeKind;
                          if (this._newKind === "zone") this._showZonesLayer();
                        }}
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
              <div class="group" role="group">
                <button
                  class="tool"
                  @click=${this._openBackground}
                  aria-label=${t("plan.background")}
                  title=${t("plan.background")}
                >
                  ${icon(mdiLayersOutline)}
                </button>
                <button
                  class="tool"
                  @click=${this._openOrigin}
                  aria-label=${t("origin.title")}
                  title=${t("origin.title")}
                >
                  ${icon(mdiMapMarkerRadiusOutline)}
                </button>
                ${
                  imageBackground
                    ? html`${this._toolButton("calibrate", mdiRulerSquareCompass, "plan.tool_calibrate")}
                      ${this._toolButton("background", mdiAxisArrow, "plan.tool_background")}`
                    : nothing
                }
                <button
                  class="tool"
                  @click=${this._openEntityPicker}
                  aria-label=${t("plan.add_marker")}
                  title=${t("plan.add_marker")}
                >
                  ${icon(mdiMapMarkerPlusOutline)}
                </button>
              </div>
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
      <div class="group fit" role="group">
        ${this._renderLayerSelect()}
        ${
          this._shapes.some((shape) => shape.kind === "zone")
            ? html`<button
                class="tool"
                aria-pressed=${this._showZones}
                @click=${this._toggleZones}
                aria-label=${t("zone.layer")}
                title=${t("zone.layer")}
              >
                ${icon(this._showZones ? mdiWater : mdiWaterOffOutline)}
              </button>`
            : nothing
        }
        <button
          class="tool"
          @click=${() => this._canvas?.fit()}
          aria-label=${t("plan.fit")}
          title=${t("plan.fit")}
        >
          ${icon(mdiFitToScreenOutline)}
        </button>
      </div>
    </div>`;
  }

  /** Plan, deficit heatmap or zone coverage; only what there is data for. */
  private _renderLayerSelect() {
    const { t } = this;
    const available = LAYERS.filter(
      (layer) =>
        layer === "plan" ||
        (layer === "deficit" && Object.keys(this.store?.water?.plants ?? {}).length > 0) ||
        (layer === "coverage" && this._shapes.some((shape) => shape.kind === "zone")),
    );
    if (available.length < 2) return nothing;
    return html`<label class="layer-select" title=${t("layer.title")}>
      <span class="sr-only">${t("layer.title")}</span>
      ${icon(mdiLayersTripleOutline)}
      <select
        @change=${(e: Event) => {
          this._layer = (e.target as HTMLSelectElement).value as Layer;
          writeStorage(LAYER_KEY, this._layer);
        }}
      >
        ${available.map(
          (layer) =>
            html`<option value=${layer} ?selected=${layer === this._layer}>
              ${t(`layer.${layer}`)}
            </option>`,
        )}
      </select>
    </label>`;
  }

  private _toggleZones(): void {
    this._showZones = !this._showZones;
    writeStorage(ZONES_KEY, this._showZones);
    if (!this._showZones && this.store.getShape(this._selection?.id ?? "")?.kind === "zone") {
      this._selection = null;
    }
  }

  private _renderHint() {
    const { t } = this;
    const armed = this._armed;
    const editing = this._mode === "edit";
    let text = "";
    if (armed?.kind === "plant") {
      text = t("plan.place_hint", { name: this.store.getPlant(armed.plantId)?.name ?? "" });
    } else if (armed?.kind === "marker") {
      text = t("plan.marker_place_hint", {
        name: markerName(this.hass?.states[armed.entityId], armed.entityId),
      });
    } else if (editing && this._farM > PLAN_EXTENT_M) {
      // drawing here would fail, so this beats the drawing instructions
      return this._renderFarHint();
    } else if (editing && this._drawingZone) {
      text = t("plan.zone_draw_hint");
    } else if (editing && this._areaFor && DRAWING_TOOLS.includes(this._tool)) {
      text = t("plan.area_for_hint", { name: this.store.getPlant(this._areaFor)?.name ?? "" });
    } else if (editing && this._tool === "freehand") {
      text = t("plan.freehand_hint");
    } else if (editing && this._tool === "polygon") {
      text = t("plan.polygon_hint");
    } else if (editing && (this._tool === "rect" || this._tool === "circle")) {
      text = t("plan.draw_hint");
    } else if (editing && this._tool === "calibrate") {
      text = t("plan.calibrate_hint");
    } else if (editing && this._tool === "background") {
      text = t("plan.background_hint");
    } else if (editing && this._farM > 0) {
      return this._renderFarHint();
    } else if (
      !editing &&
      !this._shapes.length &&
      !this._markers.length &&
      !this._plants.some((p) => p.position)
    ) {
      text = t("plan.empty_hint");
    }
    if (!text) return nothing;
    return html`<div class="hint" role="status">
      <span>${text}</span>
      ${
        armed
          ? html`<button class="button text" @click=${() => (this._armed = null)}>
              ${t("plan.cancel")}
            </button>`
          : this._areaFor && editing
            ? html`<button class="button text" @click=${() => this._setTool("select")}>
                ${t("plan.cancel")}
              </button>`
            : nothing
      }
    </div>`;
  }

  private _renderFarHint() {
    const distance = formatDistance(this._farM, this.language);
    return html`<div class="hint" role="status">
      <span>${this.t("plan.far_hint", { distance })}</span>
      <button class="button text" @click=${this._openOrigin}>${this.t("plan.far_action")}</button>
    </div>`;
  }

  /** Where a plant is on the plan: its position, else the middle of its area. */
  private _plantAnchor(plant: Plant): Point | null {
    if (plant.position) return plant.position;
    const area = this._shapes.find((s) => s.plant_id === plant.id && s.kind !== "zone");
    return area ? labelPoint(area.geometry) : null;
  }

  /** Screen position of a plan point relative to the stage. */
  private _stagePoint(p: Point): { x: number; y: number } | null {
    const stage = this.renderRoot.querySelector<HTMLElement>(".stage")?.getBoundingClientRect();
    if (!stage || !this._canvas) return null;
    const s = this._canvas.screenPoint(p);
    return { x: s.x - stage.left, y: s.y - stage.top };
  }

  private _infoPlant(): { plant: Plant; x: number; y: number; pinned: boolean } | null {
    if (this._selection?.type === "plant") {
      const plant = this.store.getPlant(this._selection.id);
      const anchor = plant ? this._plantAnchor(plant) : null;
      const at = anchor ? this._stagePoint(anchor) : null;
      if (plant && at) return { plant, ...at, pinned: true };
    }
    if (this._hover?.plantId) {
      const plant = this.store.getPlant(this._hover.plantId);
      const stage = this.renderRoot.querySelector<HTMLElement>(".stage")?.getBoundingClientRect();
      if (plant && stage) {
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
    const selection = this._selection;
    if (selection?.type === "shape") {
      const shape = this.store.getShape(selection.id);
      if (shape) return this._renderShapeCard(shape);
    }
    if (selection?.type === "marker") {
      const marker = this.store.getMarker(selection.id);
      if (marker) return this._renderMarkerCard(marker);
    }
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
        ${this._renderWaterFacts(plant.id)} ${this._renderCareFacts(plant.id)}
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

  private _renderWaterFacts(plantId: string) {
    const water = this.store.irrigation.plants[plantId];
    const balance = this.store.water?.plants?.[plantId];
    const { t, language } = this;
    return html`
      ${
        balance
          ? html`<p class="small soil-state ${balance.needs_water ? "thirsty" : ""}">
              ${t(balance.needs_water ? "balance.thirsty" : "balance.fine", {
                used: formatNumber(balance.depletion, language, 0),
                total: formatNumber(balance.taw, language, 0),
              })}
            </p>`
          : nothing
      }
      ${
        balance?.frost !== null && balance?.frost !== undefined
          ? html`<p class="small frost-note">
              ${t("balance.frost", { temp: formatNumber(balance.frost, language, 0) })}
            </p>`
          : nothing
      }
      ${
        water?.last_watering
          ? html`<p class="muted small water-facts">
              ${icon(mdiWaterOutline)}
              ${t("water.last", { time: formatDateTime(water.last_watering, language) })}
              ${water.today_l > 0 ? ` · ${t("water.today", { liters: formatLiters(water.today_l, language) })}` : ""}
            </p>`
          : nothing
      }
    `;
  }

  /** Open problem, tasks and questions of the assistant (spec 4.7). */
  private _renderCareFacts(plantId: string) {
    const care = this.store.care?.plants?.[plantId];
    if (!care) return nothing;
    const { t } = this;
    return html`
      ${
        care.problem
          ? html`<p class="small care-problem">
              ${icon(mdiAlertCircleOutline)}
              ${t("plan.problem", { status: t(`problem_status.${care.problem}`) })}
            </p>`
          : nothing
      }
      ${
        care.open_tasks
          ? html`<p class="small care-tasks ${care.overdue ? "overdue" : ""}">
              ${icon(mdiCheckboxMarkedCircleOutline)}
              ${t("plan.tasks", { n: care.open_tasks })}${care.overdue ? ` · ${t("plan.overdue", { n: care.overdue })}` : ""}
              ${care.prune_due ? ` · ${t("plan.prune_due")}` : ""}
            </p>`
          : nothing
      }
      ${
        care.questions
          ? html`<p class="small care-questions">
              ${icon(mdiCommentQuestionOutline)} ${t("plan.questions", { n: care.questions })}
            </p>`
          : nothing
      }
    `;
  }

  private _renderZoneAdvice(zoneId: string) {
    const advice = this.store.water?.zones?.[zoneId];
    if (!advice || advice.reason === "no_plants") return nothing;
    const { t, language } = this;
    const text =
      advice.reason === "dry"
        ? t("advice.dry", { minutes: formatNumber(advice.minutes ?? 0, language, 0) })
        : t(`advice.${advice.reason}`);
    return html`<p class="small zone-advice ${advice.recommended ? "recommended" : ""}">
      ${text}
    </p>`;
  }

  private _renderShapeCard(shape: Shape) {
    if (shape.kind === "zone" && shape.irrigation)
      return this._renderZoneCard(shape, shape.irrigation);
    const { t, language } = this;
    const plant = shape.plant_id ? this.store.getPlant(shape.plant_id) : undefined;
    return html`<article class="card info pinned side-card">
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

  private _renderMarkerCard(marker: Marker) {
    const { t, language } = this;
    const state = this.hass?.states[marker.entity_id];
    const history = this._markerHistory?.entityId === marker.entity_id ? this._markerHistory : null;
    const path = history ? sparklinePath(history.points, 240, 44) : "";
    return html`<article class="card info pinned side-card">
      <div class="info-body">
        <div class="info-title">
          <h3>${marker.label ?? markerName(state, marker.entity_id)}</h3>
          <button
            class="icon-button small"
            @click=${() => (this._selection = null)}
            aria-label=${t("common.close")}
          >
            ${icon(mdiClose)}
          </button>
        </div>
        <p class="marker-value">${markerValue(state, language, t)}</p>
        ${
          state?.last_changed
            ? html`<p class="muted small">
                ${t("plan.marker_changed", { time: formatDate(state.last_changed, language) })}
                ${new Date(state.last_changed).toLocaleTimeString(language, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>`
            : nothing
        }
        ${
          path
            ? html`<svg
                  class="sparkline"
                  viewBox="0 0 240 44"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label=${t("plan.marker_history")}
                >
                  ${svg`<path d=${path}></path>`}
                </svg>
                <p class="muted small">${t("plan.marker_history")}</p>`
            : nothing
        }
        <button
          class="button secondary"
          @click=${() => this.fire("hass-more-info", { entityId: marker.entity_id })}
        >
          ${icon(mdiOpenInNew)} ${t("plan.details")}
        </button>
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
    if (selection.type === "marker") {
      const marker = this.store.getMarker(selection.id);
      return marker ? this._renderMarkerProperties(marker) : nothing;
    }
    const shape = this.store.getShape(selection.id);
    return shape ? this._renderShapeProperties(shape) : nothing;
  }

  private _closeButton() {
    return html`<button
      class="icon-button small"
      @click=${() => (this._selection = null)}
      aria-label=${this.t("common.close")}
    >
      ${icon(mdiClose)}
    </button>`;
  }

  private _renderPlantProperties(plant: Plant) {
    const { t, language } = this;
    return html`<section class="props">
      <div class="props-title">
        <h3>${plant.name}</h3>
        ${this._closeButton()}
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
        ${this._closeButton()}
      </div>
      <label class="field">
        <span>${t("plan.kind")}</span>
        <select
          @change=${(e: Event) => {
            const kind = (e.target as HTMLSelectElement).value as ShapeKind;
            const irrigation = kind === "zone" ? (shape.irrigation ?? defaultIrrigation()) : null;
            update({ kind, z: KIND_Z[kind], irrigation });
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
      ${
        shape.kind === "zone" && shape.irrigation
          ? this._renderZoneSettings(shape, shape.irrigation)
          : this._renderAreaSettings(shape, soil)
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

  private _renderAreaSettings(shape: Shape, soil: boolean) {
    const { t } = this;
    const update = (changes: Partial<Shape>) =>
      void this._replaceShape(shape, { ...shape, ...changes });
    return html`
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
    `;
  }

  private _entityLabel(entityId: string | null): string {
    if (!entityId) return this.t("zone.none");
    return markerName(this.hass?.states[entityId], entityId);
  }

  private _renderZoneSettings(shape: Shape, zone: Irrigation) {
    const { t, language } = this;
    const set = (changes: Partial<Irrigation>) =>
      void this._replaceShape(shape, { ...shape, irrigation: { ...zone, ...changes } });
    const pick = (field: ZonePick) => html`
      <div class="field">
        <span>${t(`zone.${field}`)}</span>
        <div class="pick">
          <button class="button secondary pick-button" @click=${() => this._openZonePicker(field)}>
            ${this._entityLabel(zone[field])}
          </button>
          ${
            zone[field]
              ? html`<button
                  class="icon-button small"
                  aria-label=${t("zone.unlink")}
                  title=${t("zone.unlink")}
                  @click=${() => set({ [field]: null })}
                >
                  ${icon(mdiClose)}
                </button>`
              : nothing
          }
        </div>
      </div>
    `;
    const drip = zone.emitter === "drip";
    const rateKey = rateField(zone.emitter);
    const pr = precipitationRate(zone, shape.geometry);
    const coverage = this._coverage(shape);
    const listed = this._plants.filter(
      (plant) => coverage.has(plant.id) || zone.exclude.includes(plant.id),
    );
    const others = this._plants.filter((plant) => !listed.includes(plant));
    return html`
      ${pick("entity_id")}
      <label class="field">
        <span>${t("zone.emitter")}</span>
        <select
          @change=${(e: Event) => set({ emitter: (e.target as HTMLSelectElement).value as Emitter })}
        >
          ${EMITTERS.map(
            (emitter) =>
              html`<option value=${emitter} ?selected=${emitter === zone.emitter}>
                ${t(`emitter.${emitter}`)}
              </option>`,
          )}
        </select>
      </label>
      <div class="field-row">
        <label class="field">
          <span>${t(drip ? "zone.drip_l_h" : "zone.rate_mm_h")}</span>
          <input
            type="number"
            min="0"
            step="0.1"
            inputmode="decimal"
            .value=${zone[rateKey] === null ? "" : String(zone[rateKey])}
            @change=${(e: Event) => set({ [rateKey]: positive((e.target as HTMLInputElement).value, 500) })}
          />
        </label>
        <label class="field">
          <span>${t("zone.flow_l_min")}</span>
          <input
            type="number"
            min="0"
            step="0.1"
            inputmode="decimal"
            .value=${zone.flow_l_min === null ? "" : String(zone.flow_l_min)}
            @change=${(e: Event) =>
              set({ flow_l_min: positive((e.target as HTMLInputElement).value, 1000) })}
          />
        </label>
      </div>
      <p class="muted small">
        ${
          pr !== null
            ? t("zone.rate_result", { rate: formatNumber(pr, language, 1) })
            : t(drip ? "zone.drip_hint" : "zone.rate_hint")
        }
      </p>
      <label class="field">
        <span>${t("zone.efficiency")}</span>
        <input
          type="number"
          min="10"
          max="100"
          step="5"
          inputmode="numeric"
          .value=${zone.efficiency === null ? "" : String(Math.round(zone.efficiency * 100))}
          placeholder=${t("zone.efficiency_default", {
            percent: Math.round(DEFAULT_EFFICIENCY[zone.emitter] * 100),
          })}
          @change=${(e: Event) => {
            const percent = positive((e.target as HTMLInputElement).value, 100);
            set({ efficiency: percent === null ? null : Math.max(0.1, percent / 100) });
          }}
        />
      </label>
      ${pick("timer_entity_id")} ${pick("meter_entity_id")}
      <div class="field">
        <span>${t("zone.plants", { count: coverage.size })}</span>
        <ul class="zone-plants">
          ${listed.map((plant) => {
            const share = coverage.get(plant.id);
            const excluded = zone.exclude.includes(plant.id);
            return html`<li>
              <label class="check">
                <input
                  type="checkbox"
                  .checked=${!excluded}
                  @change=${(e: Event) => {
                    const on = (e.target as HTMLInputElement).checked;
                    set({
                      exclude: on
                        ? zone.exclude.filter((id) => id !== plant.id)
                        : [...zone.exclude, plant.id],
                      include: on ? zone.include : zone.include.filter((id) => id !== plant.id),
                    });
                  }}
                />
                <span>${plant.name}</span>
              </label>
              <span class="muted small">
                ${
                  excluded
                    ? t("zone.excluded")
                    : zone.include.includes(plant.id)
                      ? t("zone.included")
                      : `${Math.round((share ?? 0) * 100)} %`
                }
              </span>
            </li>`;
          })}
        </ul>
        ${
          others.length
            ? html`<select
                class="add-plant"
                @change=${(e: Event) => {
                  const id = (e.target as HTMLSelectElement).value;
                  if (id) set({ include: [...zone.include, id] });
                }}
              >
                <option value="" selected>${t("zone.add_plant")}</option>
                ${others.map((plant) => html`<option value=${plant.id}>${plant.name}</option>`)}
              </select>`
            : nothing
        }
      </div>
    `;
  }

  private _openZonePicker(field: ZonePick): void {
    this._zonePick = field;
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<PgEntityPicker>("pg-entity-picker.zone-picker")?.open(),
    );
  }

  private _onZoneEntityPicked(event: CustomEvent<{ entityId: string }>): void {
    const selection = this._selection;
    const shape = selection?.type === "shape" ? this.store.getShape(selection.id) : undefined;
    const field = this._zonePick;
    if (!shape?.irrigation || !field) return;
    void this._replaceShape(shape, {
      ...shape,
      irrigation: { ...shape.irrigation, [field]: event.detail.entityId },
    });
  }

  private _renderZoneCard(shape: Shape, zone: Irrigation) {
    const { t, language } = this;
    const state = zone.entity_id ? this.hass?.states[zone.entity_id] : undefined;
    const running = isRunning(state?.state);
    const stats = this.store.irrigation.zones[shape.id];
    const pr = precipitationRate(zone, shape.geometry);
    const covered = [...this._coverage(shape).keys()]
      .map((id) => this.store.getPlant(id)?.name)
      .filter(Boolean);
    const minutes = (stats?.runtime_today_s ?? 0) / 60;
    return html`<article class="card info pinned side-card zone-card">
      <div class="info-body">
        <div class="info-title">
          <h3>${shape.label ?? t("kind.zone")}</h3>
          <button
            class="icon-button small"
            @click=${() => (this._selection = null)}
            aria-label=${t("common.close")}
          >
            ${icon(mdiClose)}
          </button>
        </div>
        <p class="zone-state ${running ? "running" : ""}">
          ${icon(running ? mdiWater : mdiWaterOffOutline)}
          ${
            zone.entity_id
              ? `${this._entityLabel(zone.entity_id)}: ${
                  state ? markerValue(state, language, t) : t("zone.missing")
                }`
              : t("zone.no_entity")
          }
        </p>
        <p class="muted small">
          ${t(`emitter.${zone.emitter}`)}
          ${pr !== null ? ` · ${formatNumber(pr, language, 1)} mm/h` : ""}
          ${zone.emitter === "drip" && zone.drip_l_h !== null ? ` · ${formatNumber(zone.drip_l_h, language, 1)} L/h` : ""}
        </p>
        <p>
          ${t("zone.today", {
            minutes: formatNumber(minutes, language, 0),
            liters: formatNumber(stats?.liters_today ?? 0, language, 0),
          })}
        </p>
        ${
          stats?.last_run
            ? html`<p class="muted small">
                ${t("zone.last_run", { time: formatDateTime(stats.last_run, language) })}
              </p>`
            : nothing
        }
        <p class="muted small">
          ${covered.length ? t("zone.covers", { plants: covered.join(", ") }) : t("zone.covers_none")}
        </p>
        ${this._renderZoneAdvice(shape.id)}
        ${
          zone.entity_id
            ? html`<button
                class="button secondary"
                @click=${() => this.fire("hass-more-info", { entityId: zone.entity_id })}
              >
                ${icon(mdiOpenInNew)} ${t("plan.details")}
              </button>`
            : nothing
        }
      </div>
    </article>`;
  }

  private _renderMarkerProperties(marker: Marker) {
    const { t, language } = this;
    const state = this.hass?.states[marker.entity_id];
    return html`<section class="props">
      <div class="props-title">
        <h3>${marker.label ?? markerName(state, marker.entity_id)}</h3>
        ${this._closeButton()}
      </div>
      <p class="muted">${marker.entity_id} · ${markerValue(state, language, t)}</p>
      <label class="field">
        <span>${t("plan.marker_label")}</span>
        <input
          maxlength="60"
          .value=${marker.label ?? ""}
          placeholder=${markerName(state, marker.entity_id)}
          @change=${(e: Event) =>
            void this._replaceMarker(marker, {
              ...marker,
              label: (e.target as HTMLInputElement).value.trim() || null,
            })}
        />
      </label>
      <div class="props-actions">
        <button class="button text danger" @click=${this._onDeleteSelection}>
          ${icon(mdiDeleteOutline)} ${t("plan.delete_marker")}
        </button>
      </div>
    </section>`;
  }

  private _renderTray() {
    const { t } = this;
    const plants = this._plants.filter((plant) => matchesQuery(plant, this._query));
    const areas = new Set(
      this._shapes.filter((s) => s.plant_id && s.kind !== "zone").map((s) => s.plant_id),
    );
    const onPlan = (plant: Plant) => Boolean(plant.position) || areas.has(plant.id);
    const unplaced = plants.filter((plant) => !onPlan(plant));
    const placed = plants.filter(onPlan);
    const armed = this._armed;
    const item = (plant: Plant) => {
      const isArmed = armed?.kind === "plant" && armed.plantId === plant.id;
      return html`<li>
        <button
          class="tray-item ${isArmed ? "armed" : ""}"
          @pointerdown=${(e: PointerEvent) => this._onTrayPointerDown(e, plant.id)}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              this._arm(plant.id);
            }
          }}
          aria-pressed=${isArmed}
        >
          ${
            plant.cover
              ? html`<img src=${plant.cover.urls.thumb} alt="" loading="lazy" draggable="false" />`
              : html`<span class="thumb-placeholder">${icon(mdiSprout)}</span>`
          }
          <span class="tray-name">${plant.name}</span>
        </button>
        <button
          class="icon-button small tray-area ${this._areaFor === plant.id ? "active" : ""}"
          title=${t("plan.draw_area", { name: plant.name })}
          aria-label=${t("plan.draw_area", { name: plant.name })}
          aria-pressed=${this._areaFor === plant.id}
          @click=${() => this._drawAreaFor(plant)}
        >
          ${icon(mdiDraw)}
        </button>
      </li>`;
    };
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
        bottom: 28px;
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
        bottom: 76px;
        border-radius: 12px;
      }

      /* ---------------------------------------------- info cards */
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
      .side-card {
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
      .marker-value {
        font-size: 28px;
        font-weight: 500;
      }
      .sparkline {
        width: 100%;
        height: 44px;
        margin-top: 6px;
      }
      .sparkline path {
        fill: none;
        stroke: var(--pg-water);
        stroke-width: 2;
        vector-effect: non-scaling-stroke;
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

      /* ---------------------------------------------- irrigation zones */
      .pick {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .pick-button {
        flex: 1;
        min-width: 0;
        justify-content: flex-start;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .field-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .zone-plants {
        list-style: none;
        margin: 4px 0;
        padding: 0;
        display: grid;
        gap: 4px;
        max-height: 180px;
        overflow: auto;
      }
      .zone-plants li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .zone-state {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 500;
      }
      .zone-state .icon {
        width: 18px;
        height: 18px;
        color: var(--pg-text-muted);
      }
      .zone-state.running .icon {
        color: var(--pg-water);
      }
      .water-facts {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .water-facts .icon {
        width: 16px;
        height: 16px;
        color: var(--pg-water);
      }
      .soil-state.thirsty,
      .zone-advice.recommended {
        color: var(--pg-thirsty, #b86a10);
        font-weight: 500;
      }
      .care-problem,
      .care-tasks.overdue {
        color: var(--error-color, #db4437);
      }
      .care-problem .icon,
      .care-tasks .icon,
      .care-questions .icon {
        width: 14px;
        height: 14px;
        vertical-align: -2px;
      }
      .frost-note {
        color: var(--pg-frost-text, #2a7ab8);
      }
      .layer-select {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0 4px;
        font-size: 13px;
      }
      .layer-select .icon {
        width: 18px;
        height: 18px;
        color: var(--pg-text-muted);
      }
      .layer-select select {
        min-height: 34px;
        padding: 4px 6px;
        width: auto;
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
      .tray li {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      .tray li .tray-item {
        flex: 1;
        min-width: 0;
      }
      .tray-area.active {
        color: var(--pg-accent);
        background: color-mix(in srgb, var(--pg-accent) 14%, transparent);
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
          bottom: 28px;
          width: auto;
          display: grid;
          grid-template-columns: 110px 1fr;
        }
        .info-photo {
          aspect-ratio: auto;
        }
        .side-card {
          grid-template-columns: 1fr;
        }
        .hint {
          bottom: 84px;
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
