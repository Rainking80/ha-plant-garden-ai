import { describe, expect, it } from "vitest";

import type { Irrigation, Shape } from "../src/api/types";
import {
  efficiencyOf,
  type Footprint,
  footprints,
  isRunning,
  precipitationRate,
  rateField,
  samplePoints,
  shareInside,
  zoneCoverage,
} from "../src/util/coverage";
import { makePlant } from "./fixtures";

const SQUARE = { type: "rect", cx: 0, cy: 0, w: 4, h: 4, rotation: 0 } as const;

function zone(irrigation: Partial<Shape["irrigation"]> = {}): Shape {
  return {
    id: "Z",
    kind: "zone",
    geometry: SQUARE,
    label: null,
    plant_id: null,
    soil_type: null,
    locked: false,
    z: 7,
    irrigation: {
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
      ...irrigation,
    },
  };
}

const plant = (id: string, x: number, y: number) =>
  makePlant({ id, position: { x, y }, crown_diameter_m: 1 });

describe("coverage (same numbers as the backend's geometry.py)", () => {
  it("samples a circle evenly", () => {
    const points = samplePoints({ type: "circle", cx: 0, cy: 0, r: 1 });
    // a 16 x 16 grid over the bounding square keeps about π/4 of its points
    expect(points.length).toBeGreaterThan(190);
    expect(points.length).toBeLessThan(215);
  });

  it("shares plants by how much of their crown lies inside", () => {
    const prints = footprints([plant("in", 0, 0), plant("edge", 2, 0), plant("out", 9, 9)], []);
    expect(shareInside(SQUARE, prints.get("in") as Footprint)).toBe(1);
    expect(shareInside(SQUARE, prints.get("edge") as Footprint)).toBeCloseTo(0.5, 1);
    expect(shareInside(SQUARE, prints.get("out") as Footprint)).toBe(0);

    const coverage = zoneCoverage(zone({ include: ["out"], exclude: ["in"] }), prints);
    expect([...coverage.keys()].sort()).toEqual(["edge", "out"]);
    expect(coverage.get("out")).toBe(1);
  });

  it("uses linked areas as footprint and skips removed plants", () => {
    const lawn = makePlant({ id: "lawn", position: { x: 50, y: 50 } });
    const gone = makePlant({ id: "gone", position: { x: 0, y: 0 }, status: "removed" });
    const area: Shape = {
      ...zone(),
      id: "L",
      kind: "lawn",
      plant_id: "lawn",
      geometry: { type: "rect", cx: 0, cy: 0, w: 2, h: 2, rotation: 0 },
      irrigation: null,
    };
    const prints = footprints([lawn, gone, makePlant({ id: "loose" })], [area]);
    expect(prints.get("lawn")?.area).toBe(4);
    expect(prints.has("gone")).toBe(false);
    expect(prints.has("loose")).toBe(false);
    expect(zoneCoverage(zone(), prints).get("lawn")).toBe(1);
  });

  it("derives the precipitation rate and efficiency", () => {
    const settings = zone().irrigation as Irrigation;
    expect(precipitationRate(settings, SQUARE)).toBeNull();
    expect(precipitationRate({ ...settings, rate_mm_h: 12 }, SQUARE)).toBe(12);
    // 8 L/min over 16 m² = 30 mm/h
    expect(precipitationRate({ ...settings, flow_l_min: 8 }, SQUARE)).toBe(30);
    expect(precipitationRate({ ...settings, emitter: "drip", rate_mm_h: 12 }, SQUARE)).toBeNull();
    expect(efficiencyOf(settings)).toBe(0.65);
    expect(efficiencyOf({ ...settings, efficiency: 0.5 })).toBe(0.5);
    expect(rateField("drip")).toBe("drip_l_h");
    expect(rateField("rotor")).toBe("rate_mm_h");
  });

  it("knows running states", () => {
    expect(["on", "open", "opening"].every((s) => isRunning(s))).toBe(true);
    expect(["off", "closed", "closing", "unavailable", undefined].some((s) => isRunning(s))).toBe(
      false,
    );
  });
});
