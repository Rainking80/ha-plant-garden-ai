/**
 * Plan geometry. Coordinates are metres, x east, y south (SVG direction), so a
 * positive rotation turns clockwise on screen, exactly like SVG's rotate().
 */
import type {
  Geometry,
  Plant,
  PlantCategory,
  Point,
  PolygonGeometry,
  RectGeometry,
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

export function polygonPoints(g: PolygonGeometry): Point[] {
  return g.points.map(([x, y]) => ({ x, y }));
}

export function outline(g: Geometry): Point[] {
  if (g.type === "rect") return rectCorners(g);
  if (g.type === "polygon") return polygonPoints(g);
  return [];
}

export function geometryBounds(g: Geometry): Bounds {
  if (g.type === "circle") {
    return { minX: g.cx - g.r, minY: g.cy - g.r, maxX: g.cx + g.r, maxY: g.cy + g.r };
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
  return pointInPolygon(polygonPoints(g), p);
}

/** Area in m². */
export function area(g: Geometry): number {
  if (g.type === "circle") return Math.PI * g.r * g.r;
  if (g.type === "rect") return g.w * g.h;
  let sum = 0;
  const points = g.points;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i] ?? [0, 0];
    const [x2, y2] = points[(i + 1) % points.length] ?? [0, 0];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Point for a label: centre of rect/circle, vertex average of polygons. */
export function labelPoint(g: Geometry): Point {
  if (g.type !== "polygon") return { x: g.cx, y: g.cy };
  const n = g.points.length || 1;
  return {
    x: g.points.reduce((s, [x]) => s + x, 0) / n,
    y: g.points.reduce((s, [, y]) => s + y, 0) / n,
  };
}

export function translate(g: Geometry, dx: number, dy: number): Geometry {
  if (g.type === "polygon") {
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

export function movePolygonVertex(g: PolygonGeometry, index: number, p: Point): PolygonGeometry {
  return { ...g, points: g.points.map((pt, i) => (i === index ? [p.x, p.y] : pt)) };
}

export function insertPolygonVertex(
  g: PolygonGeometry,
  afterIndex: number,
  p: Point,
): PolygonGeometry {
  const points = [...g.points];
  points.splice(afterIndex + 1, 0, [p.x, p.y]);
  return { ...g, points };
}

export function removePolygonVertex(g: PolygonGeometry, index: number): PolygonGeometry {
  if (g.points.length <= 3) return g;
  return { ...g, points: g.points.filter((_, i) => i !== index) };
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
