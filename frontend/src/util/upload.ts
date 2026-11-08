import { UploadError, uploadPhoto } from "../api/client";
import type { Photo } from "../api/types";
import type { Localize, TranslationKey } from "../i18n";
import type { HomeAssistant } from "../types/hass";
import { prepareImage } from "./image";

const KNOWN_CODES = new Set(["invalid_image", "unsupported_format", "image_too_large"]);

export function uploadErrorText(err: unknown, t: Localize): string {
  if (err instanceof UploadError) {
    if (err.status === 413) return t("upload.too_large");
    if (err.code && KNOWN_CODES.has(err.code)) return t(`upload.${err.code}` as TranslationKey);
  }
  return t("upload.failed");
}

export interface UploadResult {
  photos: Photo[];
  errors: string[];
}

/** Upload files one after another; failures are collected, not thrown. */
export async function uploadFiles(
  hass: HomeAssistant,
  plantId: string,
  files: File[],
  t: Localize,
  onProgress?: (current: number, total: number) => void,
): Promise<UploadResult> {
  const result: UploadResult = { photos: [], errors: [] };
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
    } catch (err) {
      result.errors.push(`${file.name}: ${uploadErrorText(err, t)}`);
    }
  }
  return result;
}
