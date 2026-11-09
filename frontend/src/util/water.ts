/** Helpers for showing soil water, advice and the weather chart. */
import type { PlantBalance, WeatherDay } from "../api/types";

/** How empty the root zone is: 0 = field capacity, 1 = wilting point. */
export function deficitFraction(balance: Pick<PlantBalance, "depletion" | "taw">): number {
  return balance.taw > 0 ? Math.min(1, Math.max(0, balance.depletion / balance.taw)) : 0;
}

/**
 * Colour of the deficit heatmap: green while the plant has enough, yellow at
 * the point where it needs water (RAW), red when the soil is empty.
 */
export function deficitColor(balance: Pick<PlantBalance, "depletion" | "taw" | "raw">): string {
  const fraction = deficitFraction(balance);
  const threshold = balance.taw > 0 ? balance.raw / balance.taw : 0.5;
  // hue 130 (green) -> 50 (yellow) at the threshold -> 0 (red) when empty
  const hue =
    fraction <= threshold
      ? 130 - (80 * fraction) / Math.max(threshold, 0.01)
      : 50 - (50 * (fraction - threshold)) / Math.max(1 - threshold, 0.01);
  return `hsl(${Math.round(hue)} 70% 45%)`;
}

export interface ChartBar {
  x: number;
  w: number;
  y: number;
  h: number;
}

export interface WeatherChart {
  rain: (ChartBar & { day: WeatherDay })[];
  /** SVG path of ET₀ */
  et0: string;
  /** x where the forecast starts (null: no forecast) */
  forecastX: number | null;
  /** value of the top of the scale, mm */
  top: number;
}

/** Rain bars and an ET₀ line over the same mm scale. */
export function weatherChart(days: WeatherDay[], width: number, height: number): WeatherChart {
  const values = days.flatMap((day) => [day.precip_mm ?? 0, day.et0_mm ?? 0]);
  const top = Math.max(5, Math.ceil(Math.max(0, ...values)));
  const slot = days.length ? width / days.length : width;
  const y = (mm: number) => height - (mm / top) * height;
  const rain = days.map((day, i) => {
    const h = ((day.precip_mm ?? 0) / top) * height;
    return { x: i * slot + slot * 0.2, w: slot * 0.6, y: height - h, h, day };
  });
  const points = days
    .map((day, i) => (day.et0_mm === null ? null : `${(i + 0.5) * slot},${y(day.et0_mm)}`))
    .filter((p): p is string => p !== null);
  const firstForecast = days.findIndex((day) => day.forecast);
  return {
    rain,
    et0: points.length ? `M${points.join("L")}` : "",
    forecastX: firstForecast >= 0 ? firstForecast * slot : null,
    top,
  };
}

/** Day → ids of the plants that need watering that day (today and the forecast). */
export function wateringDays(plants: Record<string, PlantBalance>): Map<string, string[]> {
  const days = new Map<string, string[]>();
  for (const [plantId, balance] of Object.entries(plants)) {
    for (const day of balance.outlook ?? []) {
      if (day.water) days.set(day.day, [...(days.get(day.day) ?? []), plantId]);
    }
  }
  return days;
}

/** The first day the plant needs water, from today on (null: not within the forecast). */
export function nextWatering(balance: PlantBalance): string | null {
  return balance.outlook?.find((day) => day.water)?.day ?? null;
}

/** Spacing of the spiral: unit circles stay apart (closest centres 2.09 apart). */
const CLOUD_SPACING = 1.35;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Centres of `count` circles of radius 1 packed in a round cloud (a sunflower
 * spiral, densest in the middle), and the radius the cloud needs.
 */
export function cloudLayout(count: number): { points: { x: number; y: number }[]; radius: number } {
  const points = Array.from({ length: count }, (_, i) => {
    const r = count === 1 ? 0 : CLOUD_SPACING * Math.sqrt(i + 0.5);
    return { x: r * Math.cos(i * GOLDEN_ANGLE), y: r * Math.sin(i * GOLDEN_ANGLE) };
  });
  const radius = Math.max(1, ...points.map((p) => Math.hypot(p.x, p.y) + 1));
  return { points, radius };
}
