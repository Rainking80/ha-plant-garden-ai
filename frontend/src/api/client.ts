import type { HomeAssistant } from "../types/hass";
import type {
  Background,
  GardenChangeEvent,
  IrrigationEvent,
  IrrigationSummary,
  WaterSummary,
  AIStatus,
  Identification,
  Organ,
  PricingInfo,
  Prices,
  TechInfo,
  UsageRow,
  UsageSummary,
  Layout,
  Marker,
  Measurement,
  Photo,
  Plant,
  PlantDetail,
  PlantFields,
  Point,
  Shape,
  CareSummary,
  ChatMessage,
  Problem,
  ProblemDetail,
  Question,
  Task,
  TaskFields,
  TipsRecord,
  PlantKnowledge,
  ResearchSchedule,
  ResearchSummary,
  PhotoComparison,
} from "./types";

export const WS_PREFIX = "plant_garden";
export const PHOTO_UPLOAD_URL = "/api/plant_garden/photos";
export const BACKGROUND_UPLOAD_URL = "/api/plant_garden/backgrounds";

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
  fields: Partial<PlantFields> & { crown_diameter_m?: number | null },
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

export async function movePlants(
  hass: HomeAssistant,
  moves: { plant_id: string; position: Point | null }[],
): Promise<void> {
  await hass.callWS<unknown>({ type: `${WS_PREFIX}/plants/move`, moves });
}

// ------------------------------------------------------------ layout
export function getLayout(hass: HomeAssistant): Promise<Layout> {
  return hass.callWS<Layout>({ type: `${WS_PREFIX}/layout/get` });
}

export function saveShape(hass: HomeAssistant, shape: Shape): Promise<Shape> {
  return hass.callWS<Shape>({ type: `${WS_PREFIX}/layout/shapes/save`, shape });
}

export async function deleteShape(hass: HomeAssistant, shapeId: string): Promise<void> {
  await hass.callWS<null>({ type: `${WS_PREFIX}/layout/shapes/delete`, shape_id: shapeId });
}

/** Set the plan background; `null` removes it. Returns the updated layout. */
export function setBackground(hass: HomeAssistant, background: Background | null): Promise<Layout> {
  let payload: object = { type: "none" };
  if (background?.type === "image") {
    // the signed URL is added by the backend on every read, it is not stored
    const { url: _signedUrl, ...stored } = background;
    payload = stored;
  } else if (background) {
    payload = background;
  }
  return hass.callWS<Layout>({ type: `${WS_PREFIX}/layout/set_background`, background: payload });
}

/**
 * Move the plan origin (the garden's location). Without `moveContent`
 * everything keeps its place on the map; with it the drawing moves along.
 * Returns the updated layout; plant positions change as well.
 */
export function setOrigin(
  hass: HomeAssistant,
  latitude: number,
  longitude: number,
  moveContent: boolean,
): Promise<Layout> {
  return hass.callWS<Layout>({
    type: `${WS_PREFIX}/layout/set_origin`,
    latitude,
    longitude,
    move_content: moveContent,
  });
}

export interface UploadedBackground {
  image_id: string;
  width_px: number;
  height_px: number;
  url: string;
}

export async function uploadBackground(
  hass: HomeAssistant,
  file: Blob,
): Promise<UploadedBackground> {
  const form = new FormData();
  form.append("file", file, "background.jpg");
  const response = await hass.fetchWithAuth(BACKGROUND_UPLOAD_URL, { method: "POST", body: form });
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
  return (await response.json()) as UploadedBackground;
}

export function saveMarker(hass: HomeAssistant, marker: Marker): Promise<Marker> {
  return hass.callWS<Marker>({ type: `${WS_PREFIX}/layout/markers/save`, marker });
}

export async function deleteMarker(hass: HomeAssistant, markerId: string): Promise<void> {
  await hass.callWS<null>({ type: `${WS_PREFIX}/layout/markers/delete`, marker_id: markerId });
}

// ------------------------------------------------------------ Home Assistant core
export interface TodoItem {
  uid: string;
  summary: string;
  status: "needs_action" | "completed";
  description?: string | null;
}

export async function listTodoItems(hass: HomeAssistant, entityId: string): Promise<TodoItem[]> {
  const result = await hass.callWS<{ items: TodoItem[] }>({
    type: "todo/item/list",
    entity_id: entityId,
  });
  return result.items;
}

/** Numeric history of one entity as [epoch ms, value] pairs (non-numeric states skipped). */
export async function numericHistory(
  hass: HomeAssistant,
  entityId: string,
  hours = 24,
): Promise<[number, number][]> {
  const start = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const result = await hass.callWS<Record<string, { s: string; lu: number }[]>>({
    type: "history/history_during_period",
    start_time: start,
    entity_ids: [entityId],
    minimal_response: true,
    no_attributes: true,
  });
  return (result[entityId] ?? []).flatMap((item) => {
    const value = Number(item.s);
    return item.s.trim() !== "" && Number.isFinite(value)
      ? [[item.lu * 1000, value] as [number, number]]
      : [];
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

// ------------------------------------------------------------ irrigation
export function irrigationSummary(hass: HomeAssistant): Promise<IrrigationSummary> {
  return hass.callWS<IrrigationSummary>({ type: `${WS_PREFIX}/irrigation/summary` });
}

export async function irrigationEvents(
  hass: HomeAssistant,
  filter: { zone_id?: string; plant_id?: string; limit?: number } = {},
): Promise<IrrigationEvent[]> {
  const result = await hass.callWS<{ events: IrrigationEvent[] }>({
    type: `${WS_PREFIX}/irrigation/events`,
    ...filter,
  });
  return result.events;
}

/** Watering by hand: litres per plant. */
export function logWatering(
  hass: HomeAssistant,
  plants: { plant_id: string; liters: number }[],
  note = "",
): Promise<IrrigationEvent> {
  return hass.callWS<IrrigationEvent>({ type: `${WS_PREFIX}/irrigation/log`, plants, note });
}

/** A zone run that was not seen live (e.g. watered with the hose over the zone). */
export function logZoneRun(
  hass: HomeAssistant,
  zoneId: string,
  minutes: number,
): Promise<IrrigationEvent> {
  return hass.callWS<IrrigationEvent>({
    type: `${WS_PREFIX}/irrigation/log_zone`,
    zone_id: zoneId,
    minutes,
  });
}

export async function deleteIrrigationEvent(hass: HomeAssistant, eventId: string): Promise<void> {
  await hass.callWS<null>({ type: `${WS_PREFIX}/irrigation/delete`, event_id: eventId });
}

// ------------------------------------------------------------ weather and water balance
export function waterSummary(hass: HomeAssistant): Promise<WaterSummary> {
  return hass.callWS<WaterSummary>({ type: `${WS_PREFIX}/water/summary` });
}

/** Fetch the weather now (the backend does it hourly). */
export function refreshWater(hass: HomeAssistant): Promise<WaterSummary> {
  return hass.callWS<WaterSummary>({ type: `${WS_PREFIX}/water/refresh` });
}

// ------------------------------------------------------------ AI and tech page
export function aiStatus(hass: HomeAssistant): Promise<AIStatus> {
  return hass.callWS<AIStatus>({ type: `${WS_PREFIX}/ai/status` });
}

export function identifyPlant(
  hass: HomeAssistant,
  plantId: string,
  photos: { photo_id: string; organ: Organ }[],
): Promise<Identification> {
  return hass.callWS<Identification>({
    type: `${WS_PREFIX}/ai/identify`,
    plant_id: plantId,
    photos,
  });
}

export function getIdentification(
  hass: HomeAssistant,
  plantId: string,
): Promise<Identification | null> {
  return hass.callWS<Identification | null>({
    type: `${WS_PREFIX}/ai/identification`,
    plant_id: plantId,
  });
}

export function decideSuggestion(
  hass: HomeAssistant,
  plantId: string,
  key: string,
  accept: boolean,
): Promise<Identification> {
  return hass.callWS<Identification>({
    type: `${WS_PREFIX}/ai/decide`,
    plant_id: plantId,
    key,
    accept,
  });
}

export function estimateIdentify(
  hass: HomeAssistant,
  photos: number,
): Promise<{ cost: number | null; currency: string }> {
  return hass.callWS({ type: `${WS_PREFIX}/ai/estimate`, photos });
}

export function usageSummary(hass: HomeAssistant): Promise<UsageSummary> {
  return hass.callWS<UsageSummary>({ type: `${WS_PREFIX}/ai/usage/summary` });
}

export async function usageLog(
  hass: HomeAssistant,
  filter: { limit?: number; offset?: number; feature?: string; status?: string } = {},
): Promise<UsageRow[]> {
  const result = await hass.callWS<{ rows: UsageRow[] }>({
    type: `${WS_PREFIX}/ai/usage/log`,
    ...filter,
  });
  return result.rows;
}

export function getPricing(hass: HomeAssistant): Promise<PricingInfo> {
  return hass.callWS<PricingInfo>({ type: `${WS_PREFIX}/ai/pricing/get` });
}

export function setPrice(
  hass: HomeAssistant,
  kind: string,
  model: string,
  prices: Prices | null,
): Promise<PricingInfo> {
  return hass.callWS<PricingInfo>({ type: `${WS_PREFIX}/ai/pricing/set`, kind, model, prices });
}

export function testProvider(
  hass: HomeAssistant,
  providerId: string,
): Promise<{ ok: boolean; error: string | null }> {
  return hass.callWS({ type: `${WS_PREFIX}/ai/test`, provider_id: providerId });
}

export function techInfo(hass: HomeAssistant): Promise<TechInfo> {
  return hass.callWS<TechInfo>({ type: `${WS_PREFIX}/tech/info` });
}

// ------------------------------------------------------------ assistant: tasks
export function careSummary(hass: HomeAssistant): Promise<CareSummary> {
  return hass.callWS<CareSummary>({ type: `${WS_PREFIX}/care/summary` });
}

export async function listTasks(hass: HomeAssistant, plantId?: string): Promise<Task[]> {
  const result = await hass.callWS<{ tasks: Task[] }>({
    type: `${WS_PREFIX}/tasks/list`,
    ...(plantId ? { plant_id: plantId } : {}),
  });
  return result.tasks;
}

export function createTask(
  hass: HomeAssistant,
  fields: TaskFields & { title: string },
): Promise<Task> {
  return hass.callWS<Task>({ type: `${WS_PREFIX}/tasks/create`, ...fields });
}

export function updateTask(hass: HomeAssistant, taskId: string, fields: TaskFields): Promise<Task> {
  return hass.callWS<Task>({ type: `${WS_PREFIX}/tasks/update`, task_id: taskId, ...fields });
}

export function completeTask(hass: HomeAssistant, taskId: string): Promise<{ next: Task | null }> {
  return hass.callWS({ type: `${WS_PREFIX}/tasks/complete`, task_id: taskId });
}

export function reopenTask(hass: HomeAssistant, taskId: string): Promise<Task> {
  return hass.callWS<Task>({ type: `${WS_PREFIX}/tasks/reopen`, task_id: taskId });
}

export async function deleteTask(hass: HomeAssistant, taskId: string): Promise<void> {
  await hass.callWS<null>({ type: `${WS_PREFIX}/tasks/delete`, task_id: taskId });
}

// ------------------------------------------------------------ assistant: problems
export async function listProblems(
  hass: HomeAssistant,
  filter: { plantId?: string; activeOnly?: boolean } = {},
): Promise<Problem[]> {
  const result = await hass.callWS<{ problems: Problem[] }>({
    type: `${WS_PREFIX}/problems/list`,
    ...(filter.plantId ? { plant_id: filter.plantId } : {}),
    active_only: filter.activeOnly ?? false,
  });
  return result.problems;
}

export function getProblem(hass: HomeAssistant, problemId: string): Promise<ProblemDetail> {
  return hass.callWS<ProblemDetail>({ type: `${WS_PREFIX}/problems/get`, problem_id: problemId });
}

export function createProblem(
  hass: HomeAssistant,
  fields: { plant_id: string; title: string; note?: string; photo_ids?: string[] },
): Promise<ProblemDetail> {
  return hass.callWS<ProblemDetail>({ type: `${WS_PREFIX}/problems/create`, ...fields });
}

export function updateProblem(
  hass: HomeAssistant,
  problemId: string,
  fields: { title?: string; status?: string },
): Promise<ProblemDetail> {
  return hass.callWS<ProblemDetail>({
    type: `${WS_PREFIX}/problems/update`,
    problem_id: problemId,
    ...fields,
  });
}

export function logProblem(
  hass: HomeAssistant,
  problemId: string,
  kind: "note" | "action",
  text: string,
): Promise<ProblemDetail> {
  return hass.callWS<ProblemDetail>({
    type: `${WS_PREFIX}/problems/log`,
    problem_id: problemId,
    kind,
    text,
  });
}

export async function deleteProblem(hass: HomeAssistant, problemId: string): Promise<void> {
  await hass.callWS<null>({ type: `${WS_PREFIX}/problems/delete`, problem_id: problemId });
}

export function diagnoseProblem(hass: HomeAssistant, problemId: string): Promise<ProblemDetail> {
  return hass.callWS<ProblemDetail>({
    type: `${WS_PREFIX}/problems/diagnose`,
    problem_id: problemId,
  });
}

// ------------------------------------------------------------ assistant: questions, tips, chat
export async function listQuestions(hass: HomeAssistant, plantId?: string): Promise<Question[]> {
  const result = await hass.callWS<{ questions: Question[] }>({
    type: `${WS_PREFIX}/questions/list`,
    ...(plantId ? { plant_id: plantId } : {}),
  });
  return result.questions;
}

export function answerQuestion(
  hass: HomeAssistant,
  questionId: string,
  answer: { answer?: string; dismiss?: boolean },
): Promise<Question> {
  return hass.callWS<Question>({
    type: `${WS_PREFIX}/questions/answer`,
    question_id: questionId,
    ...answer,
  });
}

const plantArg = (plantId: string | null | undefined) => (plantId ? { plant_id: plantId } : {});

export function getTips(hass: HomeAssistant, plantId?: string | null): Promise<TipsRecord | null> {
  return hass.callWS<TipsRecord | null>({
    type: `${WS_PREFIX}/assistant/tips`,
    ...plantArg(plantId),
  });
}

export function createTips(hass: HomeAssistant, plantId?: string | null): Promise<TipsRecord> {
  return hass.callWS<TipsRecord>({
    type: `${WS_PREFIX}/assistant/tips/create`,
    ...plantArg(plantId),
  });
}

export function decideTip(
  hass: HomeAssistant,
  plantId: string | null | undefined,
  tipId: string,
  accept: boolean,
): Promise<TipsRecord> {
  return hass.callWS<TipsRecord>({
    type: `${WS_PREFIX}/assistant/tips/decide`,
    ...plantArg(plantId),
    tip_id: tipId,
    accept,
  });
}

export async function chatHistory(
  hass: HomeAssistant,
  plantId?: string | null,
): Promise<ChatMessage[]> {
  const result = await hass.callWS<{ messages: ChatMessage[] }>({
    type: `${WS_PREFIX}/assistant/chat/history`,
    ...plantArg(plantId),
  });
  return result.messages;
}

export async function clearChat(hass: HomeAssistant, plantId?: string | null): Promise<void> {
  await hass.callWS<null>({ type: `${WS_PREFIX}/assistant/chat/clear`, ...plantArg(plantId) });
}

export type ChatEvent =
  { delta: string } | { done: true; message: ChatMessage } | { error: string; code: string };

/**
 * Ask the assistant; `onEvent` gets the answer piece by piece (`delta`), then
 * `done` or `error`. Resolves when the answer is complete.
 */
export async function askAssistant(
  hass: HomeAssistant,
  plantId: string | null | undefined,
  text: string,
  onDelta: (text: string) => void,
): Promise<ChatMessage> {
  let unsubscribe: (() => Promise<void>) | undefined;
  try {
    return await new Promise<ChatMessage>((resolve, reject) => {
      hass.connection
        .subscribeMessage<ChatEvent>(
          (event) => {
            if ("delta" in event) onDelta(event.delta);
            else if ("done" in event) resolve(event.message);
            else reject(Object.assign(new Error(event.error), { code: event.code }));
          },
          { type: `${WS_PREFIX}/assistant/chat`, ...plantArg(plantId), text },
        )
        .then((unsub) => {
          unsubscribe = unsub;
        }, reject);
    });
  } finally {
    // the backend ends the subscription itself; this only cleans up the client side
    void unsubscribe?.().catch(() => undefined);
  }
}

// ------------------------------------------------------------ export / import
export const EXPORT_URL = "/api/plant_garden/export";
export const IMPORT_URL = "/api/plant_garden/import";

export interface ImportSummary {
  garden: string | null;
  plants: number;
  areas: number;
  zones: number;
  markers: number;
  measurements: number;
  tasks: number;
  background: string | null;
}

async function failure(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { message?: string };
    return new Error(body.message ?? response.statusText);
  } catch {
    return new Error(response.statusText || `HTTP ${response.status}`);
  }
}

/** The garden as a JSON file (plan, plants, measurements, open tasks; no photos). */
export async function exportGarden(hass: HomeAssistant): Promise<Blob> {
  const response = await hass.fetchWithAuth(EXPORT_URL);
  if (!response.ok) throw await failure(response);
  return response.blob();
}

/** Import an export into this garden; the backend refuses a garden that is not empty. */
export async function importGarden(hass: HomeAssistant, file: Blob): Promise<ImportSummary> {
  const form = new FormData();
  form.append("file", file, "garden.json");
  const response = await hass.fetchWithAuth(IMPORT_URL, { method: "POST", body: form });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as ImportSummary;
}

// ------------------------------------------------------------ assistant: plant knowledge
export function researchSummary(hass: HomeAssistant): Promise<ResearchSummary> {
  return hass.callWS<ResearchSummary>({ type: `${WS_PREFIX}/research/summary` });
}

/** Research one plant now (an AI call with costs); answers with what was found. */
export function researchPlant(hass: HomeAssistant, plantId: string): Promise<PlantKnowledge> {
  return hass.callWS<PlantKnowledge>({ type: `${WS_PREFIX}/research/run`, plant_id: plantId });
}

/** Forget a plant's knowledge: it will be researched again. */
export async function deleteKnowledge(hass: HomeAssistant, plantId: string): Promise<void> {
  await hass.callWS<null>({ type: `${WS_PREFIX}/research/delete`, plant_id: plantId });
}

/** How often plants are researched without being asked (admins). */
export function setResearchSchedule(
  hass: HomeAssistant,
  schedule: ResearchSchedule,
): Promise<ResearchSummary> {
  return hass.callWS<ResearchSummary>({ type: `${WS_PREFIX}/research/schedule`, schedule });
}

/** Take a job of a plant's care calendar over as a yearly task. */
export function calendarTask(
  hass: HomeAssistant,
  plantId: string,
  index: number,
): Promise<PlantKnowledge> {
  return hass.callWS<PlantKnowledge>({
    type: `${WS_PREFIX}/research/calendar_task`,
    plant_id: plantId,
    index,
  });
}

// ------------------------------------------------------------ assistant: photo comparison
export function photoComparison(
  hass: HomeAssistant,
  plantId: string,
): Promise<PhotoComparison | null> {
  return hass.callWS<PhotoComparison | null>({
    type: `${WS_PREFIX}/assistant/comparison`,
    plant_id: plantId,
  });
}

/** Compare a photo with an earlier one of its plant (an AI call with costs). */
export function comparePhoto(hass: HomeAssistant, photoId: string): Promise<PhotoComparison> {
  return hass.callWS<PhotoComparison>({
    type: `${WS_PREFIX}/assistant/compare`,
    photo_id: photoId,
  });
}
