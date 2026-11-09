import { describe, expect, it } from "vitest";

import type { LineGeometry, SectorGeometry } from "../src/api/types";
import {
  aimSector,
  area,
  bearing,
  containsPoint,
  geometryBounds,
  labelPoint,
  lineLength,
  lineMiddle,
  moveSectorEdge,
  newSprinkler,
  removePolygonVertex,
  sectorPath,
  translate,
} from "../src/util/geometry";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

/** A quarter circle throwing from east to south (y points south on the plan). */
const quarter: SectorGeometry = { type: "sector", cx: 0, cy: 0, r: 2, start: 90, sweep: 90 };

const hose: LineGeometry = {
  type: "line",
  points: [
    [0, 0],
    [4, 0],
    [4, 3],
  ],
  width: 0.5,
};

describe("sprinklers", () => {
  it("measures bearings like a compass", () => {
    const o = { x: 0, y: 0 };
    close(bearing(o, { x: 0, y: -1 }), 0); // north is up
    close(bearing(o, { x: 1, y: 0 }), 90);
    close(bearing(o, { x: 0, y: 1 }), 180);
    close(bearing(o, { x: -1, y: 0 }), 270);
  });

  it("waters the part of the circle inside its arc", () => {
    expect(containsPoint(quarter, { x: 1, y: 1 })).toBe(true);
    expect(containsPoint(quarter, { x: 1, y: -1 })).toBe(false); // north-east
    expect(containsPoint(quarter, { x: 2, y: 2 })).toBe(false); // too far
    close(area(quarter), Math.PI);
    const bounds = geometryBounds(quarter);
    [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].forEach((v, i) =>
      close(v, [0, 0, 2, 2][i] ?? 0),
    );
    // an arc across north
    const north: SectorGeometry = { ...quarter, r: 1, start: 315 };
    expect(containsPoint(north, { x: 0, y: -0.5 })).toBe(true);
    expect(containsPoint(north, { x: 0, y: 0.5 })).toBe(false);
    close(geometryBounds(north).minY, -1);
    close(geometryBounds(north).maxY, 0);
    // a full circle
    const full: SectorGeometry = { ...north, sweep: 360 };
    expect(containsPoint(full, { x: 0, y: 0.9 })).toBe(true);
    close(area(full), Math.PI);
    expect(sectorPath(full)).toContain(" a 1 1 0 1 0 2 0");
  });

  it("draws the wedge clockwise and places the label inside it", () => {
    // from the sprinkler to the east end of the arc, a small clockwise arc to the south end
    expect(sectorPath(quarter)).toMatch(/^M 0 0 L 2 \S+ A 2 2 0 0 1 \S+ 2 Z$/);
    expect(sectorPath({ ...quarter, sweep: 270 })).toContain("A 2 2 0 1 1");
    const label = labelPoint(quarter);
    close(label.x, 1.2 * Math.SQRT1_2);
    close(label.y, 1.2 * Math.SQRT1_2);
    expect(labelPoint({ ...quarter, sweep: 360 })).toEqual({ x: 0, y: 1 }); // below the head
  });

  it("starts with 45° pointing north, or aimed where it was dragged", () => {
    expect(newSprinkler({ x: 1, y: 1 }, 45)).toEqual({
      type: "sector",
      cx: 1,
      cy: 1,
      r: 4,
      start: 337.5,
      sweep: 45,
    });
    const aimed = newSprinkler({ x: 0, y: 0 }, 45, { x: 3, y: 0 });
    expect(aimed).toMatchObject({ r: 3, start: 67.5, sweep: 45 });
    expect(newSprinkler({ x: 0, y: 0 }, 360, { x: 0, y: 5 })).toMatchObject({ r: 5, start: 0 });
  });

  it("opens and closes the arc at either edge", () => {
    // the end edge to the west: 90° to 270°
    expect(moveSectorEdge(quarter, "end", { x: -1, y: 0 })).toMatchObject({
      start: 90,
      sweep: 180,
    });
    // the start edge to the north, the end stays in the south
    expect(moveSectorEdge(quarter, "start", { x: 0, y: -1 })).toMatchObject({
      start: 0,
      sweep: 180,
    });
    // snapped to 5° steps
    expect(moveSectorEdge(quarter, "end", { x: 1, y: 1.1 }, 5).sweep).toBe(50); // 137.7° → 140°
    // edges that meet: the narrowest arc, or a full circle when it was wide
    expect(moveSectorEdge(quarter, "end", { x: 1, y: 0 }).sweep).toBe(5);
    expect(moveSectorEdge(quarter, "end", { x: 1, y: 0 }, 0, 350)).toMatchObject({
      start: 0,
      sweep: 360,
    });
  });

  it("aims the arc and sets the reach from its middle", () => {
    const aimed = aimSector(quarter, { x: 0, y: -3 });
    expect(aimed).toMatchObject({ r: 3, start: 315, sweep: 90 });
    expect(aimSector(quarter, { x: 0, y: -3.1 }, 0.5).r).toBe(3);
    // a circular sprinkler only changes its reach
    expect(aimSector({ ...quarter, start: 0, sweep: 360 }, { x: 0, y: 3 })).toMatchObject({
      r: 3,
      start: 0,
    });
  });
});

describe("drip lines", () => {
  it("wets a strip along the hose", () => {
    expect(lineLength(hose)).toBe(7);
    close(area(hose), 3.5);
    expect(containsPoint(hose, { x: 2, y: 0.2 })).toBe(true);
    expect(containsPoint(hose, { x: 4.2, y: 2 })).toBe(true);
    expect(containsPoint(hose, { x: 2, y: 0.3 })).toBe(false);
    expect(geometryBounds(hose)).toEqual({ minX: -0.25, minY: -0.25, maxX: 4.25, maxY: 3.25 });
  });

  it("puts its label halfway along and moves as a whole", () => {
    expect(lineMiddle(hose)).toEqual({ x: 3.5, y: 0 });
    expect(labelPoint(hose)).toEqual({ x: 3.5, y: 0 });
    expect(translate(hose, 1, 2)).toMatchObject({
      points: [
        [1, 2],
        [5, 2],
        [5, 5],
      ],
      width: 0.5,
    });
  });

  it("keeps at least two points", () => {
    const short = removePolygonVertex(hose, 1);
    expect(short.points).toEqual([
      [0, 0],
      [4, 3],
    ]);
    expect(removePolygonVertex(short, 0)).toBe(short);
  });
});
