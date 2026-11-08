import type { HomeAssistant } from "../types/hass";
import type {
  GardenChangeEvent,
  Measurement,
  Photo,
  Plant,
  PlantDetail,
  PlantFields,
} from "./types";

export const WS_PREFIX = "plant_garden";
export const PHOTO_UPLOAD_URL = "/api/plant_garden/photos";

export interface GardenInfo {
  entry_id: string;
  garden_name: string;
  version: string;
  is_admin: boolean;
}

export function fetchInfo(hass: HomeAssistant): Promise<GardenInfo> {
  return hass.callWS<GardenInfo>({ type: `${WS_PREFIX}/info` });
}

/** Turn whatever a failed callWS rejects with into a readable message. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

// ------------------------------------------------------------ plants
export async function listPlants(hass: HomeAssistant): Promise<Plant[]> {
  const result = await hass.callWS<{ plants: Plant[] }>({ type: `${WS_PREFIX}/plants/list` });
  return result.plants;
}

export function getPlant(hass: HomeAssistant, plantId: string): Promise<PlantDetail> {
  return hass.callWS<PlantDetail>({ type: `${WS_PREFIX}/plants/get`, plant_id: plantId });
}

export function createPlant(
  hass: HomeAssistant,
  fields: Partial<PlantFields> & { name: string },
): Promise<Plant> {
  return hass.callWS<Plant>({ type: `${WS_PREFIX}/plants/create`, ...fields });
}

export function updatePlant(
  hass: HomeAssistant,
  plantId: string,
  fields: Partial<PlantFields>,
): Promise<Plant> {
  return hass.callWS<Plant>({ type: `${WS_PREFIX}/plants/update`, plant_id: plantId, ...fields });
}

export async function deletePlant(hass: HomeAssistant, plantId: string): Promise<void> {
  await hass.callWS<null>({ type: `${WS_PREFIX}/plants/delete`, plant_id: plantId });
}

export function setCover(
  hass: HomeAssistant,
  plantId: string,
  photoId: string | null,
): Promise<Plant> {
  return hass.callWS<Plant>({
    type: `${WS_PREFIX}/plants/set_cover`,
    plant_id: plantId,
    photo_id: photoId,
  });
}

export function subscribeGarden(
  hass: HomeAssistant,
  callback: (event: GardenChangeEvent) => void,
): Promise<() => Promise<void>> {
  return hass.connection.subscribeMessage<GardenChangeEvent>(callback, {
    type: `${WS_PREFIX}/subscribe`,
  });
}

// ------------------------------------------------------------ photos
export interface PhotoUpload {
  plantId: string;
  file: Blob;
  filename: string;
  takenAt: string | null;
  tags?: string[];
  note?: string;
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function uploadPhoto(hass: HomeAssistant, upload: PhotoUpload): Promise<Photo> {
  const form = new FormData();
  form.append("plant_id", upload.plantId);
  if (upload.takenAt) form.append("taken_at", upload.takenAt);
  if (upload.tags?.length) form.append("tags", upload.tags.join(","));
  if (upload.note) form.append("note", upload.note);
  form.append("file", upload.file, upload.filename);

  const response = await hass.fetchWithAuth(PHOTO_UPLOAD_URL, { method: "POST", body: form });
  if (!response.ok) {
    let code: string | null = null;
    let message = response.statusText;
    try {
      const body = (await response.json()) as { message?: string; code?: string };
      code = body.code ?? null;
      message = body.message ?? message;
    } catch {
      // body was not JSON
    }
    throw new UploadError(message, code, response.status);
  }
  return (await response.json()) as Photo;
}

export function updatePhoto(
  hass: HomeAssistant,
  photoId: string,
  changes: { tags?: string[]; note?: string; taken_at?: string },
): Promise<Photo> {
  return hass.callWS<Photo>({ type: `${WS_PREFIX}/photos/update`, photo_id: photoId, ...changes });
}

export async function deletePhoto(hass: HomeAssistant, photoId: string): Promise<void> {
  await hass.callWS<null>({ type: `${WS_PREFIX}/photos/delete`, photo_id: photoId });
}

// ------------------------------------------------------------ measurements
export interface MeasurementInput {
  measured_on: string;
  height_cm?: number | null;
  width_cm?: number | null;
  note?: string;
  photo_id?: string | null;
}

export function addMeasurement(
  hass: HomeAssistant,
  plantId: string,
  input: MeasurementInput,
): Promise<Measurement> {
  return hass.callWS<Measurement>({
    type: `${WS_PREFIX}/measurements/add`,
    plant_id: plantId,
    ...input,
  });
}

export async function deleteMeasurement(hass: HomeAssistant, measurementId: string): Promise<void> {
  await hass.callWS<null>({
    type: `${WS_PREFIX}/measurements/delete`,
    measurement_id: measurementId,
  });
}
