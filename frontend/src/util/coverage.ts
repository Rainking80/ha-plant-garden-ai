/**
 * Which plants an irrigation zone reaches, and how much of each.
 *
 * Mirrors custom_components/plant_garden/geometry.py exactly (same sampling
 * grid), so the plan shows the same coverage the backend uses to share out
 * the water.
 */
import type { Emitter, Geometry, Irrigation, Plant, Shape } from "../api/types";
import { DEFAULT_EFFICIENCY } from "../api/types";
import { area, containsPoint, crownDiameter, geometryBounds } from "./geometry";

export const SAMPLES = 16;
const MIN_SHARE = 0.01;

export interface Footprint {
  plantId: string;
  geometries: Geometry[];
  area: number;
}

/** Evenly spread points inside a geometry (centres of a SAMPLES² grid over its bounds). */
export function samplePoints(g: Geometry): { x: number; y: number }[] {
  const b = geometryBounds(g);
  const stepX = (b.maxX - b.minX) / SAMPLES;
  const stepY = (b.maxY - b.minY) / SAMPLES;
  const points = [];
  for (let i = 0; i < SAMPLES; i++) {
    for (let j = 0; j < SAMPLES; j++) {
      const p = { x: b.minX + (i + 0.5) * stepX, y: b.minY + (j + 0.5) * stepY };
      if (containsPoint(g, p)) points.push(p);
    }
  }
  return points;
}

/** The ground each plant occupies: its linked areas (lawn, hedge …) or its crown circle. */
export function footprints(
  plants: Pick<
    Plant,
    "id" | "position" | "status" | "crown_diameter_m" | "width_cm" | "category"
  >[],
  shapes: Shape[],
): Map<string, Footprint> {
  const linked = new Map<string, Geometry[]>();
  for (const shape of shapes) {
    if (!shape.plant_id || shape.kind === "zone") continue;
    linked.set(shape.plant_id, [...(linked.get(shape.plant_id) ?? []), shape.geometry]);
  }
  const result = new Map<string, Footprint>();
  for (const plant of plants) {
    if (plant.status === "removed") continue;
    let geometries = linked.get(plant.id);
    if (!geometries && plant.position) {
      const r = crownDiameter(plant) / 2;
      geometries = [{ type: "circle", cx: plant.position.x, cy: plant.position.y, r }];
    }
    if (geometries) {
      result.set(plant.id, {
        plantId: plant.id,
        geometries,
        area: geometries.reduce((sum, g) => sum + area(g), 0),
      });
    }
  }
  return result;
}

/** Fraction (0 to 1) of a footprint's area inside the zone, area-weighted. */
export function shareInside(zone: Geometry, footprint: Footprint): number {
  if (footprint.area <= 0) return 0;
  let covered = 0;
  for (const g of footprint.geometries) {
    const points = samplePoints(g);
    if (!points.length) continue;
    const inside = points.filter((p) => containsPoint(zone, p)).length;
    covered += (area(g) * inside) / points.length;
  }
  const share = covered / footprint.area;
  return share >= MIN_SHARE ? Math.round(share * 10000) / 10000 : 0;
}

/** Plant id → share of the plant the zone reaches (manual include/exclude applied). */
export function zoneCoverage(zone: Shape, prints: Map<string, Footprint>): Map<string, number> {
  const include = new Set(zone.irrigation?.include ?? []);
  const exclude = new Set(zone.irrigation?.exclude ?? []);
  const result = new Map<string, number>();
  for (const [plantId, footprint] of prints) {
    if (exclude.has(plantId)) continue;
    const share = include.has(plantId) ? 1 : shareInside(zone.geometry, footprint);
    if (share > 0) result.set(plantId, share);
  }
  return result;
}

export function efficiencyOf(irrigation: Pick<Irrigation, "efficiency" | "emitter">): number {
  return irrigation.efficiency ?? DEFAULT_EFFICIENCY[irrigation.emitter];
}

/**
 * Precipitation rate over the zone in mm/h (what reaches the ground before
 * efficiency): the rate itself, or the flow spread over the area,
 * PR = Q · 60 / A. Null for drippers (they water plants, not the area) and
 * when nothing is set.
 */
export function precipitationRate(
  irrigation: Pick<Irrigation, "rate_mm_h" | "flow_l_min" | "emitter">,
  geometry: Geometry,
): number | null {
  if (irrigation.emitter === "drip") return null;
  if (irrigation.rate_mm_h !== null) return irrigation.rate_mm_h;
  const a = area(geometry);
  if (irrigation.flow_l_min !== null && a > 0) return (irrigation.flow_l_min * 60) / a;
  return null;
}

/** Which rate field an emitter uses in the zone settings. */
export function rateField(emitter: Emitter): "drip_l_h" | "rate_mm_h" {
  return emitter === "drip" ? "drip_l_h" : "rate_mm_h";
}

/** Entity states that mean "water is flowing" (same as the backend). */
export function isRunning(state: string | undefined): boolean {
  return state === "on" || state === "open" || state === "opening";
}
