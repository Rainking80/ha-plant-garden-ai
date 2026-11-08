import { UploadError, uploadPhoto } from "../api/client";
import type { Photo, Point } from "../api/types";
import type { Localize, TranslationKey } from "../i18n";
import type { HomeAssistant } from "../types/hass";
import type { GpsPosition } from "./exif";
import { readExif } from "./exif";
import { prepareImage } from "./image";
import { geoToPlan, type GeoOrigin } from "./wms";

const KNOWN_CODES = new Set(["invalid_image", "unsupported_format", "image_too_large"]);

/** GPS positions further away than this from home are not suggested (wrong photo, holiday). */
export const MAX_SUGGESTION_DISTANCE_M = 1000;

export function uploadErrorText(err: unknown, t: Localize): string {
  if (err instanceof UploadError) {
    if (err.status === 413) return t("upload.too_large");
    if (err.code && KNOWN_CODES.has(err.code)) return t(`upload.${err.code}` as TranslationKey);
  }
  return t("upload.failed");
}

/** Plan position for a photo's GPS, if it is plausibly in this garden. */
export function suggestedPosition(
  gps: GpsPosition | null,
  origin: GeoOrigin | null | undefined,
): Point | null {
  if (!gps || !origin) return null;
  const p = geoToPlan(origin, gps.latitude, gps.longitude);
  if (Math.hypot(p.x, p.y) > MAX_SUGGESTION_DISTANCE_M) return null;
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
}

/** The first plausible GPS position among files (read before anything is uploaded). */
export async function positionFromFiles(
  files: File[],
  origin: GeoOrigin | null | undefined,
): Promise<Point | null> {
  for (const file of files) {
    if (file.type !== "image/jpeg") continue;
    const position = suggestedPosition(readExif(await file.arrayBuffer()).gps, origin);
    if (position) return position;
  }
  return null;
}

export interface UploadResult {
  photos: Photo[];
  errors: string[];
  /** GPS of the first uploaded photo that had one (for a position suggestion). */
  gps: GpsPosition | null;
}

/** Upload files one after another; failures are collected, not thrown. */
export async function uploadFiles(
  hass: HomeAssistant,
  plantId: string,
  files: File[],
  t: Localize,
  onProgress?: (current: number, total: number) => void,
): Promise<UploadResult> {
  const result: UploadResult = { photos: [], errors: [], gps: null };
  for (const [index, file] of files.entries()) {
    onProgress?.(index + 1, files.length);
    try {
      const prepared = await prepareImage(file);
      result.photos.push(
        await uploadPhoto(hass, {
          plantId,
          file: prepared.blob,
          filename: prepared.filename,
          takenAt: prepared.takenAt,
        }),
      );
      result.gps ??= prepared.gps;
    } catch (err) {
      result.errors.push(`${file.name}: ${uploadErrorText(err, t)}`);
    }
  }
  return result;
}
