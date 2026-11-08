import { readExif, type GpsPosition } from "./exif";

/** Longest edge sent to the server; the server stores at most 2560 px anyway. */
export const MAX_EDGE = 2560;
const PASS_THROUGH_BYTES = 4 * 1024 * 1024;

export interface PreparedImage {
  blob: Blob;
  filename: string;
  /** Capture time (see readExif) or the file's modification time. */
  takenAt: string | null;
  /** Only for suggesting a spot on the plan. Never stored: the server strips all metadata. */
  gps: GpsPosition | null;
}

export function scaledSize(width: number, height: number, maxEdge = MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return `${base}.jpg`;
}

async function encodeJpeg(bitmap: ImageBitmap, width: number, height: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encoding failed"))),
      "image/jpeg",
      0.9,
    ),
  );
}

/**
 * Shrink big photos before uploading (saves bandwidth on phones) and convert
 * formats the server cannot read (e.g. HEIC on Safari) to JPEG. Small JPEGs are
 * sent untouched; the server strips their metadata.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const exif = file.type === "image/jpeg" ? readExif(await file.arrayBuffer()) : null;
  const exifDate = exif?.takenAt ?? null;
  const gps = exif?.gps ?? null;
  const takenAt =
    exifDate ?? (file.lastModified ? new Date(file.lastModified).toISOString() : null);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // The browser cannot decode it; let the server decide and report.
    return { blob: file, filename: file.name, takenAt, gps };
  }
  try {
    const target = scaledSize(bitmap.width, bitmap.height);
    const untouched =
      file.type === "image/jpeg" &&
      file.size <= PASS_THROUGH_BYTES &&
      target.width === bitmap.width;
    if (untouched) return { blob: file, filename: file.name, takenAt, gps };
    const blob = await encodeJpeg(bitmap, target.width, target.height);
    return { blob, filename: jpegName(file.name), takenAt, gps };
  } finally {
    bitmap.close();
  }
}
