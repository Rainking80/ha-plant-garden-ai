import { mdiSprout } from "@mdi/js";
import { css, html, nothing, svg, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";

import type { Geometry, Plant, Point, PolygonGeometry, Shape } from "../api/types";
import {
  area,
  crownDiameter,
  distance,
  fromRectLocal,
  geometryBounds,
  insertPolygonVertex,
  labelPoint,
  movePolygonVertex,
  rectCorners,
  rectFromCorners,
  removePolygonVertex,
  resizeRect,
  rotationTowards,
  snap,
  snapPoint,
  translate,
  unionBounds,
  type Bounds,
  type Corner,
} from "../util/geometry";
import { formatNumber } from "../util/format";
import {
  DEFAULT_VIEWPORT,
  fitBounds,
  gridStep,
  metresPerPixel,
  panBy,
  scaleBar,
  screenToPlan,
  planToScreen,
  viewBox,
  zoomAt,
  type ScreenRect,
  type Viewport,
} from "../util/viewport";
import { PgElement, define } from "./base";

export type Mode = "view" | "edit";
export type Tool = "select" | "rect" | "circle" | "polygon";
export type Selection = { type: "plant" | "shape"; id: string } | null;

export type Handle =
  | { kind: "corner"; corner: Corner }
  | { kind: "rotate" }
  | { kind: "radius" }
  | { kind: "vertex"; index: number }
  | { kind: "midpoint"; index: number }
  | { kind: "crown" };

type Hit =
  | { type: "plant"; id: string }
  | { type: "shape"; id: string }
  | { type: "handle"; handle: Handle }
  | { type: "empty" };

type Gesture =
  | { kind: "pending"; startX: number; startY: number; hit: Hit; pointerType: string }
  | { kind: "pan"; lastX: number; lastY: number }
  | { kind: "move-plant"; plantId: string; from: Point; offset: Point }
  | { kind: "move-shape"; shapeId: string; from: Geometry; start: Point }
  | { kind: "shape-handle"; shapeId: string; handle: Handle; from: Geometry }
  | { kind: "crown"; plantId: string; from: number; centre: Point }
  | { kind: "draw"; tool: "rect" | "circle"; anchor: Point }
  | { kind: "pinch"; distance: number; midX: number; midY: number; viewport: Viewport };

interface Override {
  plantId?: string;
  position?: Point;
  crown?: number;
  shapeId?: string;
  geometry?: Geometry;
}

/** Event details fired by the canvas. */
export interface MovePlantDetail {
  plantId: string;
  from: Point | null;
  to: Point;
}
export interface CrownDetail {
  plantId: string;
  from: number | null;
  to: number;
}
export interface ShapeChangeDetail {
  shapeId: string;
  from: Geometry;
  to: Geometry;
}
export interface HoverDetail {
  plantId: string | null;
  x: number;
  y: number;
}

const DRAG_THRESHOLD = { mouse: 4, pen: 6, touch: 10 } as Record<string, number>;
const MIN_PLANT_PX = 9; // plants never shrink below this radius on screen
const LABEL_MAX_MPP = 0.06; // show plant names from ~17 px per metre
const ROTATE_HANDLE_PX = 28;
const ROTATE_STEP = 15;
const CLOSE_POLYGON_PX = 14;

function parseHandle(value: string): Handle | null {
  const [kind, arg] = value.split(":");
  switch (kind) {
    case "corner":
      return { kind, corner: arg as Corner };
    case "vertex":
    case "midpoint":
      return { kind, index: Number(arg) };
    case "rotate":
    case "radius":
    case "crown":
      return { kind };
    default:
      return null;
  }
}

/**
 * The garden plan as SVG in metre coordinates.
 *
 * The viewport is not reactive: panning and zooming change the viewBox and a
 * `--mpp` (metres per pixel) CSS variable directly, so large gardens stay
 * smooth. Everything else (data, selection, drags) renders through Lit.
 *
 * Fires: select, hover, move-plant, resize-crown, create-shape, change-shape,
 * place, delete-selection, viewport-change, cancel.
 */
export class PgGardenCanvas extends PgElement {
  static override properties = {
    plants: { attribute: false },
    shapes: { attribute: false },
    mode: { reflect: true },
    tool: {},
    selection: { attribute: false },
    snapStep: { attribute: false },
    armedPlantId: { attribute: false },
    _override: { state: true },
    _draft: { state: true },
    _polygon: { state: true },
    _cursor: { state: true },
    _settledMpp: { state: true },
  };

  declare plants: Plant[];
  declare shapes: Shape[];
  declare mode: Mode;
  declare tool: Tool;
  declare selection: Selection;
  declare snapStep: number;
  declare armedPlantId: string | null;
  declare _override: Override | null;
  declare _draft: Geometry | null;
  declare _polygon: Point[] | null;
  declare _cursor: Point | null;
  declare _settledMpp: number;

  private _vp: Viewport = { ...DEFAULT_VIEWPORT };
  private _hasViewport = false;
  private _gesture: Gesture | null = null;
  private readonly _pointers = new Map<number, { x: number; y: number }>();
  private _hoverId: string | null = null;
  private _settleTimer?: ReturnType<typeof setTimeout>;
  private _viewportTimer?: ReturnType<typeof setTimeout>;
  private _resizeObserver?: ResizeObserver;

  constructor() {
    super();
    this.plants = [];
    this.shapes = [];
    this.mode = "view";
    this.tool = "select";
    this.selection = null;
    this.snapStep = 0.5;
    this.armedPlantId = null;
    this._override = null;
    this._draft = null;
    this._polygon = null;
    this._cursor = null;
    this._settledMpp = 0.05;
  }

  // ------------------------------------------------------------ public API
  get viewport(): Viewport {
    return { ...this._vp };
  }

  /** True once a viewport was set or fitted (e.g. from saved preferences). */
  get hasViewport(): boolean {
    return this._hasViewport;
  }

  set viewport(vp: Viewport) {
    this._vp = { ...vp };
    this._hasViewport = true;
    this._applyViewport();
  }

  /** Show everything that is on the plan (or `bounds`). */
  fit(bounds: Bounds | null = this.contentBounds()): void {
    this.viewport = fitBounds(bounds, this._rect());
    this._emitViewport();
  }

  centerOn(point: Point, width = Math.min(this._vp.width, 12)): void {
    this.viewport = { cx: point.x, cy: point.y, width };
    this._emitViewport();
  }

  contentBounds(): Bounds | null {
    const items: Bounds[] = this.shapes.map((shape) => geometryBounds(shape.geometry));
    for (const plant of this.plants) {
      if (!plant.position) continue;
      const r = crownDiameter(plant) / 2;
      items.push({
        minX: plant.position.x - r,
        minY: plant.position.y - r,
        maxX: plant.position.x + r,
        maxY: plant.position.y + r,
      });
    }
    return unionBounds(items);
  }

  /** Plan coordinates for a screen position (used for drops from outside). */
  planPoint(clientX: number, clientY: number): Point {
    return screenToPlan(this._vp, this._rect(), clientX, clientY);
  }

  screenPoint(p: Point): { x: number; y: number } {
    return planToScreen(this._vp, this._rect(), p);
  }

  /** Finish a polygon that is being drawn (also bound to Enter / double click). */
  finishPolygon(): void {
    // a double click also produced taps: drop vertices that land on the previous one
    const tolerance = Math.max(this._mpp() * 4, 1e-6);
    const points = (this._polygon ?? []).filter(
      (p, i, all) => i === 0 || distance(p, all[i - 1] ?? p) > tolerance,
    );
    this._polygon = null;
    this._cursor = null;
    if (points.length >= 3) {
      const geometry: PolygonGeometry = { type: "polygon", points: points.map((p) => [p.x, p.y]) };
      this.fire("create-shape", { geometry });
    }
  }

  cancelDrawing(): void {
    this._polygon = null;
    this._cursor = null;
    this._draft = null;
  }

  // ------------------------------------------------------------ lifecycle
  override connectedCallback(): void {
    super.connectedCallback();
    // focusable, so keyboard shortcuts work after clicking into the plan
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.addEventListener("keydown", this._onKeyDown);
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this._applyViewport());
      this._resizeObserver.observe(this);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("keydown", this._onKeyDown);
    this._resizeObserver?.disconnect();
    clearTimeout(this._settleTimer);
    clearTimeout(this._viewportTimer);
  }

  protected override firstUpdated(): void {
    this._applyViewport();
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has("mode") || changed.has("tool")) {
      if (this.mode !== "edit" || this.tool !== "polygon") this.cancelDrawing();
    }
  }

  // ------------------------------------------------------------ viewport
  private get _svg(): SVGSVGElement | null {
    return this.renderRoot.querySelector("svg");
  }

  private _rect(): ScreenRect {
    const rect = this._svg?.getBoundingClientRect() ?? this.getBoundingClientRect();
    return rect.width > 0 ? rect : { left: rect.left, top: rect.top, width: 800, height: 600 };
  }

  private _mpp(): number {
    return metresPerPixel(this._vp, this._rect());
  }

  private _fmt(value: number): string {
    return formatNumber(value, this.language, 1);
  }

  private _applyViewport(): void {
    const svgEl = this._svg;
    if (!svgEl) return;
    const rect = this._rect();
    const box = viewBox(this._vp, rect);
    svgEl.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
    const mpp = metresPerPixel(this._vp, rect);
    svgEl.style.setProperty("--mpp", String(mpp));
    // an attribute, not a class: Lit owns the class attribute of this element
    svgEl.toggleAttribute("data-labels", mpp <= LABEL_MAX_MPP);
    this._drawGrid(box, mpp);
    this._drawScale(mpp);
    this.dispatchEvent(new Event("view-moved"));
    // sizes that depend on zoom (minimum plant size) re-render once zooming pauses
    clearTimeout(this._settleTimer);
    this._settleTimer = setTimeout(() => {
      if (Math.abs(this._settledMpp - mpp) / mpp > 0.05) this._settledMpp = mpp;
    }, 120);
  }

  private _drawGrid(box: { x: number; y: number; w: number; h: number }, mpp: number): void {
    const minor = this.renderRoot.querySelector<SVGPathElement>(".grid-minor");
    const major = this.renderRoot.querySelector<SVGPathElement>(".grid-major");
    if (!minor || !major) return;
    const step = gridStep(mpp);
    const majorStep = gridStep(mpp, 70);
    const lines = (spacing: number) => {
      const parts: string[] = [];
      const x0 = Math.floor(box.x / spacing) * spacing;
      const y0 = Math.floor(box.y / spacing) * spacing;
      for (let x = x0; x <= box.x + box.w; x += spacing) {
        parts.push(`M${x.toFixed(3)} ${box.y}V${box.y + box.h}`);
      }
      for (let y = y0; y <= box.y + box.h; y += spacing) {
        parts.push(`M${box.x} ${y.toFixed(3)}H${box.x + box.w}`);
      }
      return parts.join("");
    };
    minor.setAttribute("d", step === majorStep ? "" : lines(step));
    major.setAttribute("d", lines(majorStep));
  }

  private _drawScale(mpp: number): void {
    const bar = this.renderRoot.querySelector<HTMLElement>(".scale-bar");
    const label = this.renderRoot.querySelector<HTMLElement>(".scale-label");
    if (!bar || !label) return;
    const { metres, px } = scaleBar(mpp);
    bar.style.width = `${px}px`;
    label.textContent =
      metres >= 1000
        ? `${this._fmt(metres / 1000)} km`
        : metres >= 1
          ? `${this._fmt(metres)} m`
          : `${Math.round(metres * 100)} cm`;
  }

  private _setViewport(vp: Viewport): void {
    this._vp = vp;
    this._hasViewport = true;
    this._applyViewport();
    clearTimeout(this._viewportTimer);
    this._viewportTimer = setTimeout(() => this._emitViewport(), 300);
  }

  private _emitViewport(): void {
    this.fire("viewport-change", { viewport: this.viewport });
  }

  // ------------------------------------------------------------ hit testing
  private _hit(event: Event): Hit {
    const target = event.composedPath()[0] as Element | undefined;
    const handle = target?.closest?.("[data-handle]")?.getAttribute("data-handle");
    if (handle) {
      const parsed = parseHandle(handle);
      if (parsed) return { type: "handle", handle: parsed };
    }
    const plantId = target?.closest?.("[data-plant-id]")?.getAttribute("data-plant-id");
    if (plantId) return { type: "plant", id: plantId };
    const shapeId = target?.closest?.("[data-shape-id]")?.getAttribute("data-shape-id");
    if (shapeId) return { type: "shape", id: shapeId };
    return { type: "empty" };
  }

  private _point(event: PointerEvent | MouseEvent, snapIt = true): Point {
    const p = screenToPlan(this._vp, this._rect(), event.clientX, event.clientY);
    return snapIt && !event.altKey ? snapPoint(p, this.snapStep) : p;
  }

  private _plant(id: string): Plant | undefined {
    return this.plants.find((plant) => plant.id === id);
  }

  private _shape(id: string): Shape | undefined {
    return this.shapes.find((shape) => shape.id === id);
  }

  // ------------------------------------------------------------ pointer events
  /** Pointer capture keeps a drag alive outside the SVG; some engines throw for unknown ids. */
  private _capture(pointerId: number, capture: boolean): void {
    try {
      if (capture) this._svg?.setPointerCapture?.(pointerId);
      else this._svg?.releasePointerCapture?.(pointerId);
    } catch {
      // not capturable (e.g. synthetic events): dragging still works inside the SVG
    }
  }

  private _onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    this.focus({ preventScroll: true });
    this._capture(event.pointerId, true);
    this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this._setHover(null, event);

    if (this._pointers.size === 2) {
      this._startPinch();
      return;
    }
    if (this._pointers.size > 2) return;

    const editing = this.mode === "edit";
    if (editing && (this.tool === "rect" || this.tool === "circle") && !this.armedPlantId) {
      const anchor = this._point(event);
      this._gesture = { kind: "draw", tool: this.tool, anchor };
      this._draft = this._draftGeometry(this.tool, anchor, anchor);
      return;
    }
    this._gesture = {
      kind: "pending",
      startX: event.clientX,
      startY: event.clientY,
      hit: this._hit(event),
      pointerType: event.pointerType,
    };
  }

  private _onPointerMove(event: PointerEvent): void {
    if (this._pointers.has(event.pointerId)) {
      this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    const gesture = this._gesture;
    if (!gesture) {
      this._trackHover(event);
      return;
    }
    switch (gesture.kind) {
      case "pending": {
        const threshold = DRAG_THRESHOLD[gesture.pointerType] ?? 6;
        if (
          Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < threshold
        ) {
          return;
        }
        this._startDrag(gesture, event);
        this._onPointerMove(event);
        return;
      }
      case "pan": {
        this._setViewport(
          panBy(
            this._vp,
            this._rect(),
            event.clientX - gesture.lastX,
            event.clientY - gesture.lastY,
          ),
        );
        gesture.lastX = event.clientX;
        gesture.lastY = event.clientY;
        return;
      }
      case "pinch":
        this._movePinch();
        return;
      case "move-plant": {
        const p = this._point(event, false);
        const target = { x: p.x - gesture.offset.x, y: p.y - gesture.offset.y };
        this._override = {
          plantId: gesture.plantId,
          position: event.altKey ? target : snapPoint(target, this.snapStep),
        };
        return;
      }
      case "move-shape": {
        const p = this._point(event, false);
        const dx = p.x - gesture.start.x;
        const dy = p.y - gesture.start.y;
        const step = event.altKey ? 0 : this.snapStep;
        this._override = {
          shapeId: gesture.shapeId,
          geometry: translate(gesture.from, snap(dx, step), snap(dy, step)),
        };
        return;
      }
      case "shape-handle":
        this._override = {
          shapeId: gesture.shapeId,
          geometry: this._applyHandle(gesture.from, gesture.handle, event),
        };
        return;
      case "crown": {
        const p = this._point(event, false);
        const step = event.altKey ? 0 : Math.max(0.05, this.snapStep / 2);
        const diameter = Math.max(0.05, snap(distance(gesture.centre, p) * 2, step));
        this._override = { plantId: gesture.plantId, crown: diameter };
        return;
      }
      case "draw":
        this._draft = this._draftGeometry(gesture.tool, gesture.anchor, this._point(event));
        this._cursor = this._point(event);
        return;
    }
  }

  private _onPointerUp(event: PointerEvent): void {
    this._pointers.delete(event.pointerId);
    this._capture(event.pointerId, false);
    const gesture = this._gesture;
    if (gesture?.kind === "pinch") {
      // continue panning with the remaining finger
      const remaining = [...this._pointers.values()][0];
      this._gesture = remaining ? { kind: "pan", lastX: remaining.x, lastY: remaining.y } : null;
      return;
    }
    this._gesture = null;
    if (!gesture) return;
    if (event.type === "pointercancel") {
      this._override = null;
      this._draft = null;
      return;
    }
    switch (gesture.kind) {
      case "pending":
        this._tap(gesture.hit, event);
        return;
      case "move-plant": {
        const to = this._override?.position;
        this._override = null;
        if (to && (to.x !== gesture.from.x || to.y !== gesture.from.y)) {
          this.fire<MovePlantDetail>("move-plant", {
            plantId: gesture.plantId,
            from: gesture.from,
            to,
          });
        }
        return;
      }
      case "move-shape":
      case "shape-handle": {
        const to = this._override?.geometry;
        this._override = null;
        if (to && JSON.stringify(to) !== JSON.stringify(gesture.from)) {
          this.fire<ShapeChangeDetail>("change-shape", {
            shapeId: gesture.shapeId,
            from: gesture.from,
            to,
          });
        }
        return;
      }
      case "crown": {
        const to = this._override?.crown;
        this._override = null;
        const plant = this._plant(gesture.plantId);
        if (to && plant && to !== gesture.from) {
          this.fire<CrownDetail>("resize-crown", {
            plantId: gesture.plantId,
            from: plant.crown_diameter_m,
            to,
          });
        }
        return;
      }
      case "draw": {
        const draft = this._draft;
        this._draft = null;
        this._cursor = null;
        if (draft && this._bigEnough(draft)) this.fire("create-shape", { geometry: draft });
        return;
      }
      default:
        return;
    }
  }

  private _onDoubleClick(event: MouseEvent): void {
    if (this._polygon) {
      event.preventDefault();
      this.finishPolygon();
      return;
    }
    if (this.mode !== "edit") return;
    const hit = this._hit(event);
    // double click on a polygon vertex removes it
    if (hit.type === "handle" && hit.handle.kind === "vertex" && this.selection?.type === "shape") {
      const shape = this._shape(this.selection.id);
      if (shape?.geometry.type === "polygon" && shape.geometry.points.length > 3) {
        const to = removePolygonVertex(shape.geometry, hit.handle.index);
        this.fire<ShapeChangeDetail>("change-shape", {
          shapeId: shape.id,
          from: shape.geometry,
          to,
        });
      }
    }
  }

  private _onWheel(event: WheelEvent): void {
    event.preventDefault();
    const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    const factor = Math.exp(-pixels * (event.ctrlKey ? 0.01 : 0.0015));
    this._setViewport(zoomAt(this._vp, this._rect(), event.clientX, event.clientY, factor));
  }

  private readonly _onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      if (this._polygon || this._draft) this.cancelDrawing();
      else this.fire("cancel");
      return;
    }
    if (this._polygon) {
      if (event.key === "Enter") {
        event.preventDefault();
        this.finishPolygon();
      } else if (event.key === "Backspace") {
        event.preventDefault();
        this._polygon = this._polygon.length > 1 ? this._polygon.slice(0, -1) : null;
      }
      return;
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      this.mode === "edit" &&
      this.selection
    ) {
      event.preventDefault();
      this.fire("delete-selection", { selection: this.selection });
    }
  };

  private _onPointerLeave(event: PointerEvent): void {
    if (!this._gesture) this._setHover(null, event);
    if (this._polygon) this._cursor = null;
  }

  // ------------------------------------------------------------ gestures
  private _startPinch(): void {
    const [a, b] = [...this._pointers.values()];
    if (!a || !b) return;
    // a pinch cancels whatever the first finger started
    this._override = null;
    this._draft = null;
    this._gesture = {
      kind: "pinch",
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      viewport: { ...this._vp },
    };
  }

  private _movePinch(): void {
    const gesture = this._gesture;
    const [a, b] = [...this._pointers.values()];
    if (gesture?.kind !== "pinch" || !a || !b) return;
    const rect = this._rect();
    const factor = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, gesture.distance);
    const zoomed = zoomAt(gesture.viewport, rect, gesture.midX, gesture.midY, factor);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    this._setViewport(panBy(zoomed, rect, midX - gesture.midX, midY - gesture.midY));
  }

  private _startDrag(pending: Extract<Gesture, { kind: "pending" }>, event: PointerEvent): void {
    const { hit } = pending;
    const editing = this.mode === "edit" && !this.armedPlantId;
    const start = screenToPlan(this._vp, this._rect(), pending.startX, pending.startY);

    if (editing && hit.type === "handle") {
      const selection = this.selection;
      if (selection?.type === "plant" && hit.handle.kind === "crown") {
        const plant = this._plant(selection.id);
        if (plant?.position) {
          this._gesture = {
            kind: "crown",
            plantId: plant.id,
            from: crownDiameter(plant),
            centre: plant.position,
          };
          return;
        }
      }
      if (selection?.type === "shape") {
        const shape = this._shape(selection.id);
        if (shape && !shape.locked) {
          let from = shape.geometry;
          let handle = hit.handle;
          if (handle.kind === "midpoint" && from.type === "polygon") {
            // dragging a midpoint inserts a new vertex there
            from = insertPolygonVertex(from, handle.index, start);
            handle = { kind: "vertex", index: handle.index + 1 };
          }
          this._gesture = { kind: "shape-handle", shapeId: shape.id, handle, from };
          if (from !== shape.geometry) this._override = { shapeId: shape.id, geometry: from };
          return;
        }
      }
    }
    if (editing && hit.type === "plant") {
      const plant = this._plant(hit.id);
      if (plant?.position) {
        this.fire("select", { selection: { type: "plant", id: plant.id } });
        this._gesture = {
          kind: "move-plant",
          plantId: plant.id,
          from: plant.position,
          offset: { x: start.x - plant.position.x, y: start.y - plant.position.y },
        };
        return;
      }
    }
    if (editing && hit.type === "shape" && this.tool === "select") {
      const shape = this._shape(hit.id);
      if (shape && !shape.locked) {
        this.fire("select", { selection: { type: "shape", id: shape.id } });
        this._gesture = { kind: "move-shape", shapeId: shape.id, from: shape.geometry, start };
        return;
      }
    }
    this._gesture = { kind: "pan", lastX: pending.startX, lastY: pending.startY };
    void event;
  }

  private _tap(hit: Hit, event: PointerEvent): void {
    if (this.armedPlantId) {
      this.fire("place", { plantId: this.armedPlantId, at: this._point(event) });
      return;
    }
    if (this.mode === "edit" && this.tool === "polygon") {
      const p = this._point(event);
      const points = this._polygon ?? [];
      const first = points[0];
      if (first && points.length >= 3) {
        const firstScreen = this.screenPoint(first);
        if (
          Math.hypot(firstScreen.x - event.clientX, firstScreen.y - event.clientY) <
          CLOSE_POLYGON_PX
        ) {
          this.finishPolygon();
          return;
        }
      }
      this._polygon = [...points, p];
      return;
    }
    if (hit.type === "plant" || hit.type === "shape") {
      this.fire("select", { selection: { type: hit.type, id: hit.id } });
      if (hit.type === "plant" && event.pointerType !== "mouse") {
        // touch has no hover: a tap shows the info card
        this.fire<HoverDetail>("hover", { plantId: hit.id, x: event.clientX, y: event.clientY });
      }
      return;
    }
    if (hit.type === "empty") this.fire("select", { selection: null });
  }

  private _trackHover(event: PointerEvent): void {
    if (this._polygon) this._cursor = this._point(event);
    if (event.pointerType !== "mouse") return;
    const hit = this._hit(event);
    this._setHover(hit.type === "plant" ? hit.id : null, event);
  }

  private _setHover(plantId: string | null, event: PointerEvent): void {
    if (plantId === this._hoverId) return;
    this._hoverId = plantId;
    this.fire<HoverDetail>("hover", { plantId, x: event.clientX, y: event.clientY });
  }

  private _applyHandle(from: Geometry, handle: Handle, event: PointerEvent): Geometry {
    const p = this._point(event);
    const raw = this._point(event, false);
    if (from.type === "rect") {
      if (handle.kind === "corner") return resizeRect(from, handle.corner, p);
      if (handle.kind === "rotate") {
        return { ...from, rotation: rotationTowards(from, raw, event.altKey ? 0 : ROTATE_STEP) };
      }
    }
    if (from.type === "circle" && handle.kind === "radius") {
      const step = event.altKey ? 0 : Math.max(0.05, this.snapStep / 2);
      return { ...from, r: Math.max(0.05, snap(distance({ x: from.cx, y: from.cy }, raw), step)) };
    }
    if (from.type === "polygon" && handle.kind === "vertex") {
      return movePolygonVertex(from, handle.index, p);
    }
    return from;
  }

  private _draftGeometry(tool: "rect" | "circle", anchor: Point, current: Point): Geometry {
    if (tool === "rect") return rectFromCorners(anchor, current);
    return { type: "circle", cx: anchor.x, cy: anchor.y, r: distance(anchor, current) };
  }

  private _bigEnough(g: Geometry): boolean {
    if (g.type === "rect") return g.w >= 0.1 && g.h >= 0.1;
    if (g.type === "circle") return g.r >= 0.05;
    return true;
  }

  // ------------------------------------------------------------ rendering
  private _geometryOf(shape: Shape): Geometry {
    const o = this._override;
    return o?.shapeId === shape.id && o.geometry ? o.geometry : shape.geometry;
  }

  private _renderGeometry(g: Geometry, cls = "") {
    if (g.type === "rect") {
      return svg`<rect class=${cls} x=${-g.w / 2} y=${-g.h / 2} width=${g.w} height=${g.h}
        transform="translate(${g.cx} ${g.cy}) rotate(${g.rotation})"></rect>`;
    }
    if (g.type === "circle") {
      return svg`<circle class=${cls} cx=${g.cx} cy=${g.cy} r=${g.r}></circle>`;
    }
    return svg`<polygon class=${cls} points=${g.points.map(([x, y]) => `${x},${y}`).join(" ")}></polygon>`;
  }

  private _renderShape(shape: Shape) {
    const g = this._geometryOf(shape);
    const selected = this.selection?.type === "shape" && this.selection.id === shape.id;
    const label = labelPoint(g);
    return svg`<g class="shape kind-${shape.kind} ${selected ? "selected" : ""} ${shape.locked ? "locked" : ""}"
        data-shape-id=${shape.id}>
      ${this._renderGeometry(g, "body")}
      ${
        shape.label
          ? svg`<text class="shape-label" x=${label.x} y=${label.y}>${shape.label}</text>`
          : nothing
      }
    </g>`;
  }

  private _renderPlant(plant: Plant, mpp: number) {
    const o = this._override;
    const mine = o?.plantId === plant.id;
    const position = (mine && o?.position) || plant.position;
    if (!position) return nothing;
    const diameter = (mine && o?.crown) || crownDiameter(plant);
    const r = Math.max(diameter / 2, MIN_PLANT_PX * mpp);
    const selected = this.selection?.type === "plant" && this.selection.id === plant.id;
    return svg`<g class="plant status-${plant.status} ${selected ? "selected" : ""}"
        data-plant-id=${plant.id} transform="translate(${position.x} ${position.y})">
      <circle class="shadow" r=${r} cy=${r * 0.08}></circle>
      <circle class="crown" r=${r}></circle>
      ${
        plant.cover
          ? svg`<image href=${plant.cover.urls.thumb} x=${-r} y=${-r} width=${2 * r} height=${2 * r}
            preserveAspectRatio="xMidYMid slice" clip-path="url(#pg-round)"></image>`
          : svg`<path class="sprout" d=${mdiSprout}
            transform="translate(${-r * 0.6} ${-r * 0.6}) scale(${(r * 1.2) / 24})"></path>`
      }
      <circle class="ring" r=${r}></circle>
      <text class="plant-label" y=${r}>${plant.name}</text>
    </g>`;
  }

  private _handle(id: string, p: Point, cls = "") {
    // r attributes are a fallback for engines without the CSS `r` property;
    // where supported, the CSS rule keeps handles at a constant screen size.
    const mpp = this._settledMpp;
    return svg`<g class="handle-group ${cls}" data-handle=${id} transform="translate(${p.x} ${p.y})">
      <circle class="handle-hit" r=${16 * mpp}></circle><circle class="handle" r=${6 * mpp}></circle>
    </g>`;
  }

  private _renderSelection(mpp: number) {
    if (this.mode !== "edit" || !this.selection) return nothing;
    if (this.selection.type === "plant") {
      const plant = this._plant(this.selection.id);
      const o = this._override;
      const position = (o?.plantId === plant?.id && o?.position) || plant?.position;
      if (!plant || !position) return nothing;
      const diameter = (o?.plantId === plant.id && o?.crown) || crownDiameter(plant);
      const r = Math.max(diameter / 2, MIN_PLANT_PX * mpp);
      return svg`
        ${this._handle("crown", { x: position.x + r, y: position.y })}
        ${
          o?.plantId === plant.id && o.crown
            ? svg`<text class="measure" x=${position.x} y=${position.y - r}>Ø ${this._fmt(diameter)} m</text>`
            : nothing
        }`;
    }
    const shape = this._shape(this.selection.id);
    if (!shape || shape.locked) return nothing;
    const g = this._geometryOf(shape);
    if (g.type === "rect") {
      const corners = rectCorners(g);
      const names: Corner[] = ["nw", "ne", "se", "sw"];
      const topCentre = fromRectLocal(g, { x: 0, y: -g.h / 2 });
      const knob = fromRectLocal(g, { x: 0, y: -g.h / 2 - ROTATE_HANDLE_PX * mpp });
      return svg`
        <line class="rotate-arm" x1=${topCentre.x} y1=${topCentre.y} x2=${knob.x} y2=${knob.y}></line>
        ${corners.map((c, i) => this._handle(`corner:${names[i]}`, c))}
        ${this._handle("rotate", knob, "rotate")}
        ${this._renderMeasure(g)}`;
    }
    if (g.type === "circle") {
      return svg`${this._handle("radius", { x: g.cx + g.r, y: g.cy })}${this._renderMeasure(g)}`;
    }
    const points = g.points;
    return svg`
      ${points.map(([x, y], i) => {
        const [nx, ny] = points[(i + 1) % points.length] ?? [x, y];
        return this._handle(`midpoint:${i}`, { x: (x + nx) / 2, y: (y + ny) / 2 }, "midpoint");
      })}
      ${points.map(([x, y], i) => this._handle(`vertex:${i}`, { x, y }))}
      ${this._renderMeasure(g)}`;
  }

  private _renderMeasure(g: Geometry) {
    if (!this._override?.geometry && !this._draft) return nothing;
    const p = labelPoint(g);
    const text =
      g.type === "rect"
        ? `${this._fmt(g.w)} × ${this._fmt(g.h)} m`
        : g.type === "circle"
          ? `Ø ${this._fmt(g.r * 2)} m`
          : `${this._fmt(area(g))} m²`;
    return svg`<text class="measure" x=${p.x} y=${p.y}>${text}</text>`;
  }

  private _renderDraft() {
    if (this._draft) {
      return svg`<g class="draft">${this._renderGeometry(this._draft, "body")}${this._renderMeasure(this._draft)}</g>`;
    }
    if (this._polygon?.length) {
      const points = this._cursor ? [...this._polygon, this._cursor] : this._polygon;
      const [first] = this._polygon;
      return svg`<g class="draft">
        <polyline class="body" points=${points.map((p) => `${p.x},${p.y}`).join(" ")}></polyline>
        ${first ? this._handle("close", first, "close") : nothing}
      </g>`;
    }
    return nothing;
  }

  protected override render() {
    const mpp = this._settledMpp;
    const placed = this.plants
      .filter((plant) => plant.position)
      .sort((a, b) => crownDiameter(b) - crownDiameter(a)); // small plants on top
    return html`
      <svg
        class="mode-${this.mode} tool-${this.tool} ${this.armedPlantId ? "armed" : ""}"
        @pointerdown=${this._onPointerDown}
        @pointermove=${this._onPointerMove}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerUp}
        @pointerleave=${this._onPointerLeave}
        @dblclick=${this._onDoubleClick}
        @wheel=${this._onWheel}
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        <defs>
          <clipPath id="pg-round" clipPathUnits="objectBoundingBox">
            <circle cx="0.5" cy="0.5" r="0.5"></circle>
          </clipPath>
          <pattern id="pg-lawn" patternUnits="userSpaceOnUse" width="0.6" height="0.6">
            <rect width="0.6" height="0.6" class="lawn-base"></rect>
            <path
              class="lawn-blade"
              d="M0.1 0.45l0.05 -0.15M0.4 0.2l0.04 -0.14M0.32 0.55l0.03 -0.12"
            ></path>
          </pattern>
          <pattern
            id="pg-roof"
            patternUnits="userSpaceOnUse"
            width="0.5"
            height="0.5"
            patternTransform="rotate(45)"
          >
            <rect width="0.5" height="0.5" class="roof-base"></rect>
            <line x1="0" y1="0" x2="0" y2="0.5" class="roof-line"></line>
          </pattern>
        </defs>
        <rect class="ground" x="-100000" y="-100000" width="200000" height="200000"></rect>
        <path class="grid-minor"></path>
        <path class="grid-major"></path>
        <g class="shapes">
          ${repeat(
            this.shapes,
            (shape) => shape.id,
            (shape) => this._renderShape(shape),
          )}
        </g>
        <g class="plants">
          ${repeat(
            placed,
            (plant) => plant.id,
            (plant) => this._renderPlant(plant, mpp),
          )}
        </g>
        <g class="selection">${this._renderSelection(mpp)}</g>
        ${this._renderDraft()}
      </svg>
      <div class="overlay">
        <div class="north" aria-hidden="true">N</div>
        <div class="scale">
          <div class="scale-bar"></div>
          <span class="scale-label"></span>
        </div>
      </div>
    `;
  }

  static override styles = css`
    :host {
      position: relative;
      display: block;
      overflow: hidden;
      outline: none;
      --pg-ground: color-mix(in srgb, var(--pg-leaf-soft) 35%, var(--pg-surface));
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      cursor: grab;
      --mpp: 0.05;
    }
    svg.mode-edit.tool-rect,
    svg.mode-edit.tool-circle,
    svg.mode-edit.tool-polygon,
    svg.armed {
      cursor: crosshair;
    }
    .ground {
      fill: var(--pg-ground);
    }
    .grid-minor,
    .grid-major {
      fill: none;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    .grid-minor {
      stroke: color-mix(in srgb, var(--pg-text) 6%, transparent);
      stroke-width: 1;
    }
    .grid-major {
      stroke: color-mix(in srgb, var(--pg-text) 13%, transparent);
      stroke-width: 1;
    }

    /* ---------------------------------------------- shapes */
    .shape .body {
      vector-effect: non-scaling-stroke;
      stroke-width: 1.5;
      stroke: color-mix(in srgb, var(--kind-fill) 60%, #000);
      fill: var(--kind-fill);
      stroke-linejoin: round;
    }
    .shape {
      cursor: pointer;
    }
    .mode-edit .shape:not(.locked) {
      cursor: move;
    }
    .kind-bed {
      --kind-fill: #a07a5a;
    }
    .kind-raised_bed {
      --kind-fill: #8f6b4c;
    }
    .kind-raised_bed .body {
      stroke: #c49a6c;
      stroke-width: 4;
    }
    .kind-lawn {
      --kind-fill: #9ccc78;
    }
    .kind-lawn .body {
      fill: url(#pg-lawn);
    }
    .lawn-base {
      fill: #9ccc78;
    }
    .lawn-blade {
      stroke: #86b964;
      stroke-width: 0.03;
      stroke-linecap: round;
    }
    .kind-hedge {
      --kind-fill: #4c7d4f;
    }
    .kind-terrace {
      --kind-fill: #dccbaa;
    }
    .kind-path {
      --kind-fill: #d4cec4;
    }
    .kind-house {
      --kind-fill: #9a9a9a;
    }
    .kind-greenhouse {
      --kind-fill: rgba(190, 225, 235, 0.7);
    }
    .kind-roof {
      --kind-fill: #b9b9b9;
    }
    .kind-roof .body {
      fill: url(#pg-roof);
    }
    .roof-base {
      fill: rgba(185, 185, 185, 0.55);
    }
    .roof-line {
      stroke: rgba(120, 120, 120, 0.6);
      stroke-width: 0.05;
    }
    .kind-pond {
      --kind-fill: #7cbfe3;
    }
    .kind-other {
      --kind-fill: #c8c8c8;
    }
    .kind-boundary .body {
      fill: none;
      stroke: color-mix(in srgb, var(--pg-text) 55%, transparent);
      stroke-width: 2;
      stroke-dasharray: 8 5;
    }
    .shape.selected .body {
      stroke: var(--pg-accent);
      stroke-width: 2.5;
    }
    .shape-label,
    .plant-label,
    .measure {
      font-size: calc(var(--mpp) * 12px);
      text-anchor: middle;
      dominant-baseline: middle;
      pointer-events: none;
      paint-order: stroke;
      stroke: var(--pg-surface);
      stroke-width: calc(var(--mpp) * 3px);
      fill: var(--pg-text);
    }
    .shape-label {
      font-weight: 500;
      fill: color-mix(in srgb, var(--pg-text) 85%, transparent);
    }
    .measure {
      font-size: calc(var(--mpp) * 13px);
      font-weight: 600;
      fill: var(--pg-accent);
    }

    /* ---------------------------------------------- plants */
    .plant {
      cursor: pointer;
    }
    .mode-edit .plant {
      cursor: move;
    }
    .plant .shadow {
      fill: rgba(0, 0, 0, 0.18);
    }
    .plant .crown {
      fill: var(--pg-leaf-soft);
    }
    .plant .sprout {
      fill: var(--pg-leaf);
    }
    .plant .ring {
      fill: none;
      stroke: var(--ring, var(--success-color, #43a047));
      stroke-width: 2.5;
      vector-effect: non-scaling-stroke;
    }
    .plant.status-watch {
      --ring: var(--warning-color, #ffa600);
    }
    .plant.status-problem {
      --ring: var(--error-color, #db4437);
    }
    .plant.status-dead,
    .plant.status-removed {
      --ring: var(--disabled-text-color, #9e9e9e);
      opacity: 0.6;
    }
    .plant.selected .ring {
      stroke: var(--pg-accent);
      stroke-width: 4;
    }
    .plant-label {
      display: none;
      font-size: calc(var(--mpp) * 11px);
      dominant-baseline: hanging;
      transform: translateY(calc(var(--mpp) * 3px));
    }
    svg[data-labels] .plant-label,
    .plant.selected .plant-label,
    .plant:hover .plant-label {
      display: inline;
    }

    /* ---------------------------------------------- handles and drafts */
    .handle {
      r: calc(var(--mpp) * 6px);
      fill: var(--pg-surface);
      stroke: var(--pg-accent);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }
    .handle-hit {
      r: calc(var(--mpp) * 16px);
      fill: transparent;
    }
    .handle-group {
      cursor: grab;
    }
    .handle-group.midpoint .handle {
      r: calc(var(--mpp) * 4px);
      fill: var(--pg-accent);
      opacity: 0.6;
    }
    .handle-group.rotate .handle {
      fill: var(--pg-accent);
    }
    .handle-group.close .handle {
      r: calc(var(--mpp) * 8px);
      fill: color-mix(in srgb, var(--pg-accent) 30%, transparent);
    }
    .rotate-arm {
      stroke: var(--pg-accent);
      stroke-width: 1.5;
      vector-effect: non-scaling-stroke;
    }
    .draft .body {
      fill: color-mix(in srgb, var(--pg-accent) 18%, transparent);
      stroke: var(--pg-accent);
      stroke-width: 2;
      stroke-dasharray: 6 4;
      vector-effect: non-scaling-stroke;
    }

    /* ---------------------------------------------- overlay */
    .overlay {
      position: absolute;
      inset: auto auto 12px 12px;
      display: flex;
      align-items: flex-end;
      gap: 12px;
      pointer-events: none;
      color: var(--pg-text);
      font-size: 12px;
    }
    .north {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--pg-surface);
      box-shadow: var(--pg-shadow);
      font-weight: 700;
    }
    .scale {
      display: grid;
      gap: 2px;
      padding: 4px 8px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--pg-surface) 85%, transparent);
    }
    .scale-bar {
      height: 6px;
      border: 2px solid var(--pg-text);
      border-top: none;
    }
  `;
}

define("pg-garden-canvas", PgGardenCanvas);
