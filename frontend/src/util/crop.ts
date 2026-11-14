/**
 * Cropping a photo: a box as fractions (0..1) of the photo after turning it,
 * the same shape the backend stores (D-041). Pure functions, no DOM.
 */

export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Rotation = 0 | 90 | 180 | 270;

/** What is dragged: the whole box, an edge (n, e, s, w) or a corner. */
export type Handle = "move" | "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

export const FULL: CropBox = { x: 0, y: 0, w: 1, h: 1 };
/** Smallest crop, as a fraction of the width and of the height (as in the backend). */
export const MIN_CROP = 0.05;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function turnedSize(width: number, height: number, rotate: Rotation) {
  return rotate % 180 ? { width: height, height: width } : { width, height };
}

/** Inside the image and at least MIN_CROP large. */
export function clampBox(box: CropBox): CropBox {
  const w = clamp(box.w, MIN_CROP, 1);
  const h = clamp(box.h, MIN_CROP, 1);
  return { x: clamp(box.x, 0, 1 - w), y: clamp(box.y, 0, 1 - h), w, h };
}

export function isFull(box: CropBox): boolean {
  const eps = 0.001;
  return box.x < eps && box.y < eps && box.w > 1 - eps && box.h > 1 - eps;
}

/** The same part of the photo after turning it a quarter clockwise. */
export function turnBox(box: CropBox): CropBox {
  return { x: 1 - box.y - box.h, y: box.x, w: box.h, h: box.w };
}

/**
 * Box width / height in fractions for a pixel shape: a square on a photo of
 * width x height is `ratioFor(1, width, height)`.
 */
export function ratioFor(pixelRatio: number, width: number, height: number): number {
  return (pixelRatio * height) / width;
}

/** The largest box of the given ratio (fractions) inside `box`, around its centre. */
export function fitRatio(box: CropBox, ratio: number): CropBox {
  const w = Math.min(box.w, box.h * ratio);
  const h = w / ratio;
  return clampBox({ x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h });
}

/**
 * Drag a handle by dx, dy (fractions of the image). With a ratio, corners keep
 * it and edges are not used.
 */
export function dragBox(
  start: CropBox,
  handle: Handle,
  dx: number,
  dy: number,
  ratio: number | null = null,
): CropBox {
  if (handle === "move") {
    return {
      ...start,
      x: clamp(start.x + dx, 0, 1 - start.w),
      y: clamp(start.y + dy, 0, 1 - start.h),
    };
  }
  const east = handle.includes("e");
  const west = handle.includes("w");
  const south = handle.includes("s");
  const north = handle.includes("n");
  if (ratio !== null && (east || west) && (north || south)) {
    // the opposite corner stays where it is
    const anchorX = east ? start.x : start.x + start.w;
    const anchorY = south ? start.y : start.y + start.h;
    const byWidth = start.w + (east ? dx : -dx);
    const byHeight = (start.h + (south ? dy : -dy)) * ratio;
    let w = Math.abs(dx) >= Math.abs(dy) * ratio ? byWidth : byHeight;
    const most = Math.min(east ? 1 - anchorX : anchorX, (south ? 1 - anchorY : anchorY) * ratio);
    const least = Math.min(Math.max(MIN_CROP, MIN_CROP * ratio), most);
    w = clamp(w, least, most);
    const h = w / ratio;
    return { x: east ? anchorX : anchorX - w, y: south ? anchorY : anchorY - h, w, h };
  }
  let { x, y, w, h } = start;
  if (east) w = clamp(start.w + dx, MIN_CROP, 1 - start.x);
  if (west) {
    x = clamp(start.x + dx, 0, start.x + start.w - MIN_CROP);
    w = start.x + start.w - x;
  }
  if (south) h = clamp(start.h + dy, MIN_CROP, 1 - start.y);
  if (north) {
    y = clamp(start.y + dy, 0, start.y + start.h - MIN_CROP);
    h = start.y + start.h - y;
  }
  return { x, y, w, h };
}

/** RGBA pixels, as from a canvas' getImageData. */
export interface Pixels {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/** How much a colour looks like a plant: leaves (green) or flowers and fruit (vivid). */
export function plantness(r: number, g: number, b: number): number {
  const excessGreen = 2 * g - r - b;
  if (excessGreen > 24) return Math.min(1, excessGreen / 120);
  const max = Math.max(r, g, b);
  const saturation = max ? (max - Math.min(r, g, b)) / max : 0;
  // vivid and bright, but not sky blue; soil, wood and walls stay below this
  if (saturation > 0.6 && max > 140 && !(b > r && b >= g)) return 0.6 * saturation;
  return 0;
}

const CENTRE_SIGMA = 0.4; // photos usually have the plant near the middle
const TAIL = 0.03; // ignore the outer 3 % of the plant on each side
const MARGIN = 0.08; // and leave some room around it

/** Where the weight of a histogram lies, without its tails: [start, end) as fractions. */
function spread(histogram: Float64Array, total: number): [number, number] {
  const at = (i: number) => histogram[i] ?? 0;
  let sum = 0;
  let start = 0;
  while (start < histogram.length - 1 && sum + at(start) < total * TAIL) {
    sum += at(start);
    start++;
  }
  sum = 0;
  let end = histogram.length - 1;
  while (end > start && sum + at(end) < total * TAIL) {
    sum += at(end);
    end--;
  }
  return [start / histogram.length, (end + 1) / histogram.length];
}

/**
 * A crop around the plant, from colours alone - no AI, nothing leaves the
 * browser. Null when too little of the photo looks like a plant.
 */
export function suggestCrop(pixels: Pixels): CropBox | null {
  const { data, width, height } = pixels;
  const columns = new Float64Array(width);
  const rows = new Float64Array(height);
  let total = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    const dy = (y + 0.5) / height - 0.5;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const weight = plantness(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
      if (weight <= 0) continue;
      count++;
      const dx = (x + 0.5) / width - 0.5;
      const w = weight * Math.exp(-(dx * dx + dy * dy) / (2 * CENTRE_SIGMA ** 2));
      columns[x] = (columns[x] ?? 0) + w;
      rows[y] = (rows[y] ?? 0) + w;
      total += w;
    }
  }
  if (count < 0.02 * width * height || total <= 0) return null;
  const [x0, x1] = spread(columns, total);
  const [y0, y1] = spread(rows, total);
  const mx = (x1 - x0) * MARGIN;
  const my = (y1 - y0) * MARGIN;
  const x = Math.max(0, x0 - mx);
  const y = Math.max(0, y0 - my);
  return clampBox({ x, y, w: Math.min(1, x1 + mx) - x, h: Math.min(1, y1 + my) - y });
}
