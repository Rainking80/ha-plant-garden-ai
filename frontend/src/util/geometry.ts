/**
 * Plan geometry. Coordinates are metres, x east, y south (SVG direction), so a
 * positive rotation turns clockwise on screen, exactly like SVG's rotate().
 * A sprinkler's angles are compass bearings: degrees clockwise from north (up).
 */
import type {
  Geometry,
  LineGeometry,
  Plant,
  PlantCategory,
  Point,
  PolygonGeometry,
  RectGeometry,
  SectorGeometry,
} from "../api/types";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const DEG = Math.PI / 180;

export function rotate(p: Point, degrees: number): Point {
  const a = degrees * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Corners in drawing order: nw, ne, se, sw (before rotation). */
export function rectCorners(g: RectGeometry): Point[] {
  const hw = g.w / 2;
  const hh = g.h / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((corner) => {
    const r = rotate(corner, g.rotation);
    return { x: g.cx + r.x, y: g.cy + r.y };
  });
}

/** A world point in the rectangle's own (unrotated, centred) coordinates. */
export function toRectLocal(g: RectGeometry, p: Point): Point {
  return rotate({ x: p.x - g.cx, y: p.y - g.cy }, -g.rotation);
}

export function fromRectLocal(g: RectGeometry, p: Point): Point {
  const r = rotate(p, g.rotation);
  return { x: g.cx + r.x, y: g.cy + r.y };
}

export function polygonPoints(g: PolygonGeometry | LineGeometry): Point[] {
  return g.points.map(([x, y]) => ({ x, y }));
}

export function outline(g: Geometry): Point[] {
  if (g.type === "rect") return rectCorners(g);
  if (g.type === "polygon" || g.type === "line") return polygonPoints(g);
  return [];
}

// ------------------------------------------------------------ sprinklers
/** Sprinklers start with this angle and reach (m); drip lines wet this wide a strip (m). */
export const DEFAULT_SWEEP = 45;
export const DEFAULT_REACH = 4;
export const DEFAULT_DRIP_WIDTH = 0.4;
/** The narrowest arc a sprinkler can be set to. */
export const MIN_SWEEP = 5;

export function normaliseAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** Compass bearing (0 to 360, clockwise from north = up) from `from` towards `to`. */
export function bearing(from: Point, to: Point): number {
  return normaliseAngle(Math.atan2(to.x - from.x, from.y - to.y) / DEG);
}

/** The point at a compass bearing on a sprinkler's arc (or at another distance). */
export function arcPoint(g: SectorGeometry, angle: number, r = g.r): Point {
  const a = angle * DEG;
  return { x: g.cx + r * Math.sin(a), y: g.cy - r * Math.cos(a) };
}

/** Does the sprinkler's arc include this compass bearing? */
export function inSweep(g: SectorGeometry, angle: number): boolean {
  return g.sweep >= 360 || normaliseAngle(angle - g.start) <= g.sweep;
}

/** SVG path of the wedge a sprinkler waters (the whole circle for 360°). */
export function sectorPath(g: SectorGeometry): string {
  const { cx, cy, r } = g;
  if (g.sweep >= 360) {
    return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  }
  const a = arcPoint(g, g.start);
  const b = arcPoint(g, g.start + g.sweep);
  // compass bearings grow clockwise, like SVG's positive arc direction
  return `M ${cx} ${cy} L ${a.x} ${a.y} A ${r} ${r} 0 ${g.sweep > 180 ? 1 : 0} 1 ${b.x} ${b.y} Z`;
}

/** Angles are kept to two decimals (no 337.49999…). */
export function tidyAngle(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A new sprinkler at `at`, aimed at `towards` and reaching it when given (else north). */
export function newSprinkler(
  at: Point,
  sweep: number,
  towards: Point | null = null,
  reach = DEFAULT_REACH,
): SectorGeometry {
  const r = towards ? Math.max(MIN_SIZE, distance(at, towards)) : reach;
  const heading = towards ? bearing(at, towards) : 0;
  return {
    type: "sector",
    cx: at.x,
    cy: at.y,
    r,
    start: sweep >= 360 ? 0 : tidyAngle(normaliseAngle(heading - sweep / 2)),
    sweep,
  };
}

/**
 * Drag one edge of a sprinkler's arc to `p`; the other edge stays where it is.
 * Edges that meet become a full circle when the arc was wide (`previous` > 180°).
 */
export function moveSectorEdge(
  g: SectorGeometry,
  edge: "start" | "end",
  p: Point,
  step = 0,
  previous = g.sweep,
): SectorGeometry {
  let angle = bearing({ x: g.cx, y: g.cy }, p);
  if (step > 0) angle = normaliseAngle(Math.round(angle / step) * step);
  const end = normaliseAngle(g.start + g.sweep);
  let sweep = tidyAngle(
    edge === "start" ? normaliseAngle(end - angle) : normaliseAngle(angle - g.start),
  );
  if (sweep < MIN_SWEEP) sweep = previous > 180 ? 360 : MIN_SWEEP;
  if (sweep >= 360) return { ...g, start: 0, sweep: 360 };
  const start = edge === "start" ? normaliseAngle(end - sweep) : g.start;
  return { ...g, start: tidyAngle(start) % 360, sweep };
}

/** Drag the middle of the arc: the reach and the direction change, the angle stays. */
export function aimSector(g: SectorGeometry, p: Point, step = 0, angleStep = 0): SectorGeometry {
  const centre = { x: g.cx, y: g.cy };
  const r = Math.max(MIN_SIZE, snap(distance(centre, p), step));
  if (g.sweep >= 360) return { ...g, r };
  let heading = bearing(centre, p);
  if (angleStep > 0) heading = Math.round(heading / angleStep) * angleStep;
  return { ...g, r, start: tidyAngle(normaliseAngle(heading - g.sweep / 2)) % 360 };
}

function sectorBounds(g: SectorGeometry): Bounds {
  if (g.sweep >= 360) {
    return { minX: g.cx - g.r, minY: g.cy - g.r, maxX: g.cx + g.r, maxY: g.cy + g.r };
  }
  // the sprinkler, both ends of the arc and the compass points the arc passes
  const angles = [g.start, g.start + g.sweep, ...[0, 90, 180, 270].filter((a) => inSweep(g, a))];
  return pointsBounds([{ x: g.cx, y: g.cy }, ...angles.map((a) => arcPoint(g, a))]);
}

// ------------------------------------------------------------ drip lines
export function lineLength(g: LineGeometry): number {
  let length = 0;
  for (let i = 1; i < g.points.length; i++) {
    const [x1, y1] = g.points[i - 1] ?? [0, 0];
    const [x2, y2] = g.points[i] ?? [0, 0];
    length += Math.hypot(x2 - x1, y2 - y1);
  }
  return length;
}

/** The point halfway along a line (where its label goes). */
export function lineMiddle(g: LineGeometry): Point {
  let left = lineLength(g) / 2;
  for (let i = 1; i < g.points.length; i++) {
    const [x1, y1] = g.points[i - 1] ?? [0, 0];
    const [x2, y2] = g.points[i] ?? [0, 0];
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length >= left && length > 0) {
      const t = left / length;
      return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
    }
    left -= length;
  }
  const [x, y] = g.points[0] ?? [0, 0];
  return { x, y };
}

function lineContains(g: LineGeometry, p: Point): boolean {
  const points = polygonPoints(g);
  for (let i = 1; i < points.length; i++) {
    if (segmentDistance(p, points[i - 1] as Point, points[i] as Point) <= g.width / 2) return true;
  }
  return false;
}

/**
 * How far from the origin (the garden's location) plan coordinates may go;
 * the backend enforces the same limit (PLAN_EXTENT_M in const.py).
 */
export const PLAN_EXTENT_M = 10000;

/** Points the backend stores for a shape: centre or polygon corners (sizes are extra). */
export function anchorPoints(g: Geometry): Point[] {
  return g.type === "polygon" || g.type === "line" ? polygonPoints(g) : [{ x: g.cx, y: g.cy }];
}

export function insidePlan(p: Point): boolean {
  return Math.abs(p.x) <= PLAN_EXTENT_M && Math.abs(p.y) <= PLAN_EXTENT_M;
}

export function geometryBounds(g: Geometry): Bounds {
  if (g.type === "circle") {
    return { minX: g.cx - g.r, minY: g.cy - g.r, maxX: g.cx + g.r, maxY: g.cy + g.r };
  }
  if (g.type === "sector") return sectorBounds(g);
  if (g.type === "line") {
    const b = pointsBounds(polygonPoints(g));
    const half = g.width / 2;
    return { minX: b.minX - half, minY: b.minY - half, maxX: b.maxX + half, maxY: b.maxY + half };
  }
  return pointsBounds(outline(g));
}

export function pointsBounds(points: Point[]): Bounds {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

export function unionBounds(items: Bounds[]): Bounds | null {
  if (!items.length) return null;
  return {
    minX: Math.min(...items.map((b) => b.minX)),
    minY: Math.min(...items.map((b) => b.minY)),
    maxX: Math.max(...items.map((b) => b.maxX)),
    maxY: Math.max(...items.map((b) => b.maxY)),
  };
}

function pointInPolygon(points: Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (!a || !b) continue;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function containsPoint(g: Geometry, p: Point): boolean {
  if (g.type === "circle") return distance({ x: g.cx, y: g.cy }, p) <= g.r;
  if (g.type === "rect") {
    const local = toRectLocal(g, p);
    return Math.abs(local.x) <= g.w / 2 && Math.abs(local.y) <= g.h / 2;
  }
  if (g.type === "sector") {
    return distance({ x: g.cx, y: g.cy }, p) <= g.r && inSweep(g, bearing({ x: g.cx, y: g.cy }, p));
  }
  if (g.type === "line") return lineContains(g, p);
  return pointInPolygon(polygonPoints(g), p);
}

/** Area in m² (for a drip line: the strip it wets). */
export function area(g: Geometry): number {
  if (g.type === "circle") return Math.PI * g.r * g.r;
  if (g.type === "rect") return g.w * g.h;
  if (g.type === "sector") return (Math.PI * g.r * g.r * Math.min(g.sweep, 360)) / 360;
  if (g.type === "line") return lineLength(g) * g.width;
  let sum = 0;
  const points = g.points;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i] ?? [0, 0];
    const [x2, y2] = points[(i + 1) % points.length] ?? [0, 0];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/**
 * Point for a label: centre of rect/circle, vertex average of polygons, inside a
 * sprinkler's arc (below the sprinkler for a full circle), halfway along a line.
 */
export function labelPoint(g: Geometry): Point {
  if (g.type === "sector") {
    return g.sweep >= 360
      ? { x: g.cx, y: g.cy + g.r * 0.5 }
      : arcPoint(g, g.start + g.sweep / 2, g.r * 0.6);
  }
  if (g.type === "line") return lineMiddle(g);
  if (g.type !== "polygon") return { x: g.cx, y: g.cy };
  const n = g.points.length || 1;
  return {
    x: g.points.reduce((s, [x]) => s + x, 0) / n,
    y: g.points.reduce((s, [, y]) => s + y, 0) / n,
  };
}

export function translate(g: Geometry, dx: number, dy: number): Geometry {
  if (g.type === "polygon" || g.type === "line") {
    return { ...g, points: g.points.map(([x, y]) => [x + dx, y + dy]) };
  }
  return { ...g, cx: g.cx + dx, cy: g.cy + dy };
}

export function snap(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value;
}

export function snapPoint(p: Point, step: number): Point {
  return { x: snap(p.x, step), y: snap(p.y, step) };
}

export type Corner = "nw" | "ne" | "se" | "sw";
const CORNER_SIGNS: Record<Corner, [number, number]> = {
  nw: [-1, -1],
  ne: [1, -1],
  se: [1, 1],
  sw: [-1, 1],
};

export const MIN_SIZE = 0.1;

/** Drag one corner of a (possibly rotated) rectangle; the opposite corner stays put. */
export function resizeRect(g: RectGeometry, corner: Corner, p: Point): RectGeometry {
  const [sx, sy] = CORNER_SIGNS[corner];
  const fixed = { x: (-sx * g.w) / 2, y: (-sy * g.h) / 2 };
  const moved = toRectLocal(g, p);
  // keep the dragged corner on its own side of the fixed one
  const qx = sx > 0 ? Math.max(moved.x, fixed.x + MIN_SIZE) : Math.min(moved.x, fixed.x - MIN_SIZE);
  const qy = sy > 0 ? Math.max(moved.y, fixed.y + MIN_SIZE) : Math.min(moved.y, fixed.y - MIN_SIZE);
  const centre = fromRectLocal(g, { x: (fixed.x + qx) / 2, y: (fixed.y + qy) / 2 });
  return { ...g, cx: centre.x, cy: centre.y, w: Math.abs(qx - fixed.x), h: Math.abs(qy - fixed.y) };
}

/** Rotation so that the handle above the top edge points at p; snapped to `step` degrees. */
export function rotationTowards(g: RectGeometry, p: Point, step = 0): number {
  const angle = Math.atan2(p.y - g.cy, p.x - g.cx) / DEG + 90;
  const normalised = (((angle % 360) + 540) % 360) - 180;
  return step > 0 ? Math.round(normalised / step) * step : normalised;
}

/** Axis-aligned rectangle spanned by two corners (used while drawing). */
export function rectFromCorners(a: Point, b: Point): RectGeometry {
  return {
    type: "rect",
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
    rotation: 0,
  };
}

/** Shapes made of points: polygons and drip lines. */
export type PointsGeometry = PolygonGeometry | LineGeometry;

export function movePolygonVertex<T extends PointsGeometry>(g: T, index: number, p: Point): T {
  return { ...g, points: g.points.map((pt, i) => (i === index ? [p.x, p.y] : pt)) };
}

export function insertPolygonVertex<T extends PointsGeometry>(
  g: T,
  afterIndex: number,
  p: Point,
): T {
  const points = [...g.points];
  points.splice(afterIndex + 1, 0, [p.x, p.y]);
  return { ...g, points };
}

/** The fewest points a shape keeps: three for a polygon, two for a line. */
export function minPoints(g: PointsGeometry): number {
  return g.type === "line" ? 2 : 3;
}

export function removePolygonVertex<T extends PointsGeometry>(g: T, index: number): T {
  if (g.points.length <= minPoints(g)) return g;
  return { ...g, points: g.points.filter((_, i) => i !== index) };
}

/** Distance of p from the segment a–b. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (length === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Ramer–Douglas–Peucker: drop points that stay within `tolerance` of the line. */
export function simplifyPath(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  const first = points[0] as Point;
  const last = points[points.length - 1] as Point;
  let index = 0;
  let farthest = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = segmentDistance(points[i] as Point, first, last);
    if (d > farthest) {
      farthest = d;
      index = i;
    }
  }
  if (farthest <= tolerance) return [first, last];
  const left = simplifyPath(points.slice(0, index + 1), tolerance);
  const right = simplifyPath(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

/** Smallest area (m²) a freehand stroke must enclose to become a shape. */
export const MIN_STROKE_AREA = 0.05;

/**
 * A closed polygon from a freehand stroke: smoothed to `tolerance` metres, the
 * end joined to the start. Null for a stroke that encloses (almost) nothing.
 */
export function polygonFromStroke(points: Point[], tolerance: number): PolygonGeometry | null {
  let simple = simplifyPath(points, tolerance);
  const [start] = simple;
  const end = simple[simple.length - 1];
  if (start && end && simple.length > 3 && distance(start, end) <= tolerance * 4) {
    simple = simple.slice(0, -1); // the user came back to where they started
  }
  if (simple.length < 3) return null;
  const geometry: PolygonGeometry = { type: "polygon", points: simple.map((p) => [p.x, p.y]) };
  return area(geometry) >= MIN_STROKE_AREA ? geometry : null;
}

/** Typical crown diameter in metres when nothing better is known. */
const DEFAULT_CROWN: Record<PlantCategory, number> = {
  tree: 4,
  shrub: 1.2,
  hedge: 1,
  fruit: 1.5,
  climber: 0.6,
  perennial: 0.5,
  grass: 0.6,
  lawn: 1,
  potted: 0.6,
  vegetable: 0.4,
  herb: 0.3,
  annual: 0.3,
  succulent: 0.3,
  bulb: 0.2,
  other: 0.5,
};

/** Diameter drawn on the plan: explicit plan size, else measured width, else typical. */
export function crownDiameter(
  plant: Pick<Plant, "crown_diameter_m" | "width_cm" | "category">,
): number {
  if (plant.crown_diameter_m) return plant.crown_diameter_m;
  if (plant.width_cm) return plant.width_cm / 100;
  return DEFAULT_CROWN[plant.category] ?? 0.5;
}
