import { describe, expect, it } from "vitest";

import type { PolygonGeometry, RectGeometry } from "../src/api/types";
import {
  area,
  containsPoint,
  crownDiameter,
  geometryBounds,
  insertPolygonVertex,
  labelPoint,
  movePolygonVertex,
  rectCorners,
  rectFromCorners,
  removePolygonVertex,
  resizeRect,
  rotationTowards,
  snapPoint,
  toRectLocal,
  fromRectLocal,
  translate,
  unionBounds,
} from "../src/util/geometry";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

const rect = (overrides: Partial<RectGeometry> = {}): RectGeometry => ({
  type: "rect",
  cx: 0,
  cy: 0,
  w: 4,
  h: 2,
  rotation: 0,
  ...overrides,
});

const square: PolygonGeometry = {
  type: "polygon",
  points: [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ],
};

describe("rectangles", () => {
  it("rotates clockwise like SVG (y points south)", () => {
    const [nw, ne] = rectCorners(rect({ rotation: 90 }));
    // the north-west corner (-2, -1) ends up at (1, -2) after 90° clockwise
    close(nw?.x ?? NaN, 1);
    close(nw?.y ?? NaN, -2);
    close(ne?.x ?? NaN, 1);
    close(ne?.y ?? NaN, 2);
  });

  it("converts between world and local coordinates", () => {
    const g = rect({ cx: 10, cy: 5, rotation: 33 });
    const p = { x: 11.3, y: 4.2 };
    const back = fromRectLocal(g, toRectLocal(g, p));
    close(back.x, p.x);
    close(back.y, p.y);
  });

  it("resizes from a corner, keeping the opposite corner fixed", () => {
    const g = rect({ cx: 2, cy: 1, w: 4, h: 2, rotation: 30 });
    const [nw, , se] = rectCorners(g);
    const target = { x: (se?.x ?? 0) + 1, y: (se?.y ?? 0) + 1 };
    const resized = resizeRect(g, "se", target);
    const [nw2] = rectCorners(resized);
    close(nw2?.x ?? NaN, nw?.x ?? NaN);
    close(nw2?.y ?? NaN, nw?.y ?? NaN);
    expect(resized.rotation).toBe(30);
    expect(resized.w).toBeGreaterThan(4);
  });

  it("never collapses below the minimum size", () => {
    const resized = resizeRect(rect(), "se", { x: -10, y: -10 });
    expect(resized.w).toBeCloseTo(0.1);
    expect(resized.h).toBeCloseTo(0.1);
  });

  it("points the rotation handle at the pointer, snapped", () => {
    const g = rect();
    expect(rotationTowards(g, { x: 0, y: -5 })).toBeCloseTo(0);
    expect(rotationTowards(g, { x: 5, y: 0 })).toBeCloseTo(90);
    expect(rotationTowards(g, { x: 5, y: 0.4 }, 15)).toBe(90);
    expect(rotationTowards(g, { x: -5, y: 0 })).toBeCloseTo(-90);
  });

  it("is drawn from two corners in any direction", () => {
    expect(rectFromCorners({ x: 4, y: 3 }, { x: 1, y: 1 })).toEqual({
      type: "rect",
      cx: 2.5,
      cy: 2,
      w: 3,
      h: 2,
      rotation: 0,
    });
  });
});

describe("hit testing and measures", () => {
  it("finds points inside every geometry type", () => {
    expect(containsPoint(rect({ rotation: 45 }), { x: 0, y: 0.9 })).toBe(true);
    expect(containsPoint(rect({ rotation: 45 }), { x: 1.9, y: 0 })).toBe(false);
    expect(containsPoint({ type: "circle", cx: 1, cy: 1, r: 1 }, { x: 1.5, y: 1.5 })).toBe(true);
    expect(containsPoint({ type: "circle", cx: 1, cy: 1, r: 1 }, { x: 2, y: 2 })).toBe(false);
    expect(containsPoint(square, { x: 2, y: 1 })).toBe(true);
    expect(containsPoint(square, { x: 5, y: 1 })).toBe(false);
  });

  it("measures areas", () => {
    expect(area(rect())).toBe(8);
    expect(area({ type: "circle", cx: 0, cy: 0, r: 1 })).toBeCloseTo(Math.PI);
    expect(area(square)).toBe(12);
  });

  it("computes bounds", () => {
    expect(geometryBounds(square)).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 3 });
    expect(geometryBounds({ type: "circle", cx: 1, cy: 1, r: 2 })).toEqual({
      minX: -1,
      minY: -1,
      maxX: 3,
      maxY: 3,
    });
    expect(unionBounds([])).toBeNull();
    expect(unionBounds([geometryBounds(square), { minX: -2, minY: 1, maxX: 1, maxY: 9 }])).toEqual({
      minX: -2,
      minY: 0,
      maxX: 4,
      maxY: 9,
    });
  });

  it("places labels", () => {
    expect(labelPoint(rect({ cx: 3, cy: 4 }))).toEqual({ x: 3, y: 4 });
    expect(labelPoint(square)).toEqual({ x: 2, y: 1.5 });
  });
});

describe("editing", () => {
  it("translates every geometry type", () => {
    expect(translate(rect(), 1, 2)).toMatchObject({ cx: 1, cy: 2 });
    expect(translate(square, 1, 1)).toEqual({
      type: "polygon",
      points: [
        [1, 1],
        [5, 1],
        [5, 4],
        [1, 4],
      ],
    });
  });

  it("moves, inserts and removes polygon vertices", () => {
    expect(movePolygonVertex(square, 2, { x: 5, y: 5 }).points[2]).toEqual([5, 5]);
    const more = insertPolygonVertex(square, 0, { x: 2, y: -1 });
    expect(more.points).toHaveLength(5);
    expect(more.points[1]).toEqual([2, -1]);
    expect(removePolygonVertex(more, 1)).toEqual(square);
    // a triangle keeps its three corners
    const triangle: PolygonGeometry = {
      type: "polygon",
      points: [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
    };
    expect(removePolygonVertex(triangle, 0)).toBe(triangle);
  });

  it("snaps to the grid", () => {
    expect(snapPoint({ x: 1.13, y: -0.38 }, 0.25)).toEqual({ x: 1.25, y: -0.5 });
    expect(snapPoint({ x: 1.13, y: -0.38 }, 0)).toEqual({ x: 1.13, y: -0.38 });
  });
});

describe("crownDiameter", () => {
  it("prefers the plan size, then the measured width, then a typical size", () => {
    expect(crownDiameter({ crown_diameter_m: 2.5, width_cm: 80, category: "tree" })).toBe(2.5);
    expect(crownDiameter({ crown_diameter_m: null, width_cm: 80, category: "tree" })).toBe(0.8);
    expect(crownDiameter({ crown_diameter_m: null, width_cm: null, category: "tree" })).toBe(4);
    expect(crownDiameter({ crown_diameter_m: null, width_cm: null, category: "herb" })).toBe(0.3);
  });
});
