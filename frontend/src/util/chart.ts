import type { Measurement } from "../api/types";
import { parseLocalDate } from "./format";

export interface ChartPoint {
  x: number;
  y: number;
  value: number;
  date: string;
}

export interface ChartModel {
  height: ChartPoint[];
  width: ChartPoint[];
  ticks: { y: number; value: number }[];
  first: string | null;
  last: string | null;
}

export const PADDING = { top: 12, right: 16, bottom: 28, left: 48 };

/** Round up to 1, 2 or 5 times a power of ten so that `steps` ticks cover max. */
export function niceStep(max: number, steps = 4): number {
  if (max <= 0) return 1;
  const raw = max / steps;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  for (const factor of [1, 2, 5, 10]) {
    if (raw <= factor * magnitude) return factor * magnitude;
  }
  return 10 * magnitude;
}

export function buildChart(measurements: Measurement[], width: number, height: number): ChartModel {
  const sorted = [...measurements].sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const values = sorted.flatMap((m) => [m.height_cm ?? 0, m.width_cm ?? 0]);
  const step = niceStep(Math.max(0, ...values));
  const top = step * 4;

  const innerW = Math.max(1, width - PADDING.left - PADDING.right);
  const innerH = Math.max(1, height - PADDING.top - PADDING.bottom);
  const times = sorted.map((m) => parseLocalDate(m.measured_on).getTime());
  const t0 = times[0] ?? 0;
  const t1 = times[times.length - 1] ?? 0;
  const span = t1 - t0;

  const xOf = (time: number) =>
    PADDING.left + (span === 0 ? innerW / 2 : ((time - t0) / span) * innerW);
  const yOf = (value: number) => PADDING.top + innerH - (value / top) * innerH;

  const series = (key: "height_cm" | "width_cm"): ChartPoint[] =>
    sorted.flatMap((m, index) => {
      const value = m[key];
      return value === null
        ? []
        : [{ x: xOf(times[index] ?? t0), y: yOf(value), value, date: m.measured_on }];
    });

  return {
    height: series("height_cm"),
    width: series("width_cm"),
    ticks: [0, 1, 2, 3, 4].map((i) => ({ y: yOf(step * i), value: step * i })),
    first: sorted[0]?.measured_on ?? null,
    last: sorted.length > 1 ? (sorted[sorted.length - 1]?.measured_on ?? null) : null,
  };
}

/** SVG path of a small line chart for [time, value] pairs, scaled into width x height. */
export function sparklinePath(points: [number, number][], width: number, height: number): string {
  if (points.length < 2) return "";
  const times = points.map(([t]) => t);
  const values = points.map(([, v]) => v);
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const v0 = Math.min(...values);
  const v1 = Math.max(...values);
  const x = (t: number) => (t1 === t0 ? width / 2 : ((t - t0) / (t1 - t0)) * width);
  // flat series sit in the middle; otherwise keep 2 px off the edges
  const y = (v: number) =>
    v1 === v0 ? height / 2 : height - 2 - ((v - v0) / (v1 - v0)) * (height - 4);
  return points
    .map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
}

export function pathOf(points: ChartPoint[]): string {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}
