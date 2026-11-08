import type { Point } from "../api/types";
import type { Bounds } from "./geometry";

/** The visible part of the plan: centre and width in metres. */
export interface Viewport {
  cx: number;
  cy: number;
  width: number;
}

/** Size and position of the drawing area on screen (a DOMRect is fine). */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const MIN_WIDTH = 1; // m
export const MAX_WIDTH = 5000; // m
export const DEFAULT_VIEWPORT: Viewport = { cx: 0, cy: 0, width: 40 };

const clampWidth = (width: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));

/** Metres per screen pixel. */
export function metresPerPixel(vp: Viewport, rect: ScreenRect): number {
  return vp.width / Math.max(1, rect.width);
}

export function viewBox(vp: Viewport, rect: ScreenRect) {
  const height = vp.width * (Math.max(1, rect.height) / Math.max(1, rect.width));
  return { x: vp.cx - vp.width / 2, y: vp.cy - height / 2, w: vp.width, h: height };
}

export function screenToPlan(
  vp: Viewport,
  rect: ScreenRect,
  clientX: number,
  clientY: number,
): Point {
  const box = viewBox(vp, rect);
  const mpp = metresPerPixel(vp, rect);
  return { x: box.x + (clientX - rect.left) * mpp, y: box.y + (clientY - rect.top) * mpp };
}

export function planToScreen(vp: Viewport, rect: ScreenRect, p: Point): { x: number; y: number } {
  const box = viewBox(vp, rect);
  const mpp = metresPerPixel(vp, rect);
  return { x: rect.left + (p.x - box.x) / mpp, y: rect.top + (p.y - box.y) / mpp };
}

/** Zoom by `factor` (>1 = closer) keeping the plan point under the cursor in place. */
export function zoomAt(
  vp: Viewport,
  rect: ScreenRect,
  clientX: number,
  clientY: number,
  factor: number,
): Viewport {
  const anchor = screenToPlan(vp, rect, clientX, clientY);
  const width = clampWidth(vp.width / factor);
  const scale = width / vp.width;
  return {
    width,
    cx: anchor.x + (vp.cx - anchor.x) * scale,
    cy: anchor.y + (vp.cy - anchor.y) * scale,
  };
}

/** Move the view by a screen distance (content follows the pointer). */
export function panBy(vp: Viewport, rect: ScreenRect, dxPx: number, dyPx: number): Viewport {
  const mpp = metresPerPixel(vp, rect);
  return { ...vp, cx: vp.cx - dxPx * mpp, cy: vp.cy - dyPx * mpp };
}

/** Show `bounds` with a margin; falls back to the default view. */
export function fitBounds(bounds: Bounds | null, rect: ScreenRect, margin = 0.12): Viewport {
  if (!bounds) return DEFAULT_VIEWPORT;
  const w = Math.max(bounds.maxX - bounds.minX, 2);
  const h = Math.max(bounds.maxY - bounds.minY, 2);
  const aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
  const width = clampWidth(Math.max(w, h * aspect) * (1 + 2 * margin));
  return { cx: (bounds.minX + bounds.maxX) / 2, cy: (bounds.minY + bounds.maxY) / 2, width };
}

const STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500];

/** Smallest grid step that is at least `minPx` pixels on screen. */
export function gridStep(mpp: number, minPx = 14): number {
  return STEPS.find((step) => step / mpp >= minPx) ?? STEPS[STEPS.length - 1] ?? 500;
}

/** A round length for the scale bar that is at most `maxPx` wide. */
export function scaleBar(mpp: number, maxPx = 120): { metres: number; px: number } {
  const candidates = [...STEPS, 1000, 2000].filter((step) => step / mpp <= maxPx);
  const metres = candidates[candidates.length - 1] ?? 0.1;
  return { metres, px: metres / mpp };
}

export function isViewport(value: unknown): value is Viewport {
  const v = value as Viewport;
  return (
    typeof v === "object" &&
    v !== null &&
    [v.cx, v.cy, v.width].every((n) => typeof n === "number" && Number.isFinite(n)) &&
    v.width >= MIN_WIDTH &&
    v.width <= MAX_WIDTH
  );
}
