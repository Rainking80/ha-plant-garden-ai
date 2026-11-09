/** Shapes of the data the backend sends (see custom_components/plant_garden/serialize.py). */

export const PLANT_CATEGORIES = [
  "perennial",
  "shrub",
  "tree",
  "hedge",
  "climber",
  "grass",
  "lawn",
  "bulb",
  "annual",
  "vegetable",
  "herb",
  "fruit",
  "succulent",
  "potted",
  "other",
] as const;
export const LOCATION_TYPES = [
  "bed",
  "raised_bed",
  "pot",
  "lawn",
  "greenhouse",
  "covered",
] as const;
export const LIGHTS = ["full_sun", "partial_shade", "shade"] as const;
export const WATER_NEEDS = ["very_low", "low", "moderate", "high"] as const;
export const SOIL_TYPES = [
  "sand",
  "loamy_sand",
  "sandy_loam",
  "loam",
  "silt_loam",
  "clay_loam",
  "clay",
  "potting_mix",
] as const;
export const PLANT_STATUSES = ["healthy", "watch", "problem", "dead", "removed"] as const;

export type PlantCategory = (typeof PLANT_CATEGORIES)[number];
export type LocationType = (typeof LOCATION_TYPES)[number];
export type Light = (typeof LIGHTS)[number];
export type WaterNeed = (typeof WATER_NEEDS)[number];
export type SoilType = (typeof SOIL_TYPES)[number];
export type PlantStatus = (typeof PLANT_STATUSES)[number];
export type Source = "user" | "ai" | "provider" | "default";

export interface FieldSource {
  source: Source;
  updated_at: string;
  confidence: number | null;
  model: string | null;
}

export interface AgeReference {
  age_months: number;
  /** ISO date */
  on: string;
}

export interface PhotoUrls {
  original: string;
  medium: string;
  thumb: string;
}

/** Fields a user can edit. */
export interface PlantFields {
  name: string;
  scientific_name: string | null;
  variety: string | null;
  family: string | null;
  notes: string | null;
  /** care profile: short hints, the AI can suggest them */
  care_water: string | null;
  care_fertilize: string | null;
  care_prune: string | null;
  category: PlantCategory;
  location_type: LocationType;
  light: Light | null;
  water_need: WaterNeed | null;
  soil_type: SoilType | null;
  status: PlantStatus;
  min_temperature_c: number | null;
  root_depth_cm: number | null;
  planted_on: string | null;
  age: AgeReference | null;
  tags: string[];
}

/**
 * Plan coordinates: metres east (x) and south (y) of the origin, the garden's
 * location (initially Home Assistant's home, can be moved).
 */
export interface Point {
  x: number;
  y: number;
}

export interface Plant extends PlantFields {
  id: string;
  created_at: string;
  updated_at: string;
  cover_photo_id: string | null;
  /** null = not placed on the plan yet */
  position: Point | null;
  /** Size drawn on the plan; null = derive from width or category. */
  crown_diameter_m: number | null;
  sources: Partial<Record<keyof PlantFields, FieldSource>>;
  age_months_now: number | null;
  photo_count: number;
  cover: { id: string; urls: PhotoUrls } | null;
  height_cm: number | null;
  height_cm_on: string | null;
  width_cm: number | null;
  width_cm_on: string | null;
}

export interface Photo {
  id: string;
  plant_id: string;
  /** ISO datetime (UTC) */
  taken_at: string;
  uploaded_at: string;
  width: number;
  height: number;
  size_bytes: number;
  tags: string[];
  note: string;
  urls: PhotoUrls;
}

export interface Measurement {
  id: string;
  plant_id: string;
  /** ISO date */
  measured_on: string;
  height_cm: number | null;
  width_cm: number | null;
  source: Source;
  confidence: number | null;
  photo_id: string | null;
  note: string;
}

export interface PlantDetail {
  plant: Plant;
  photos: Photo[];
  measurements: Measurement[];
}

export const SHAPE_KINDS = [
  "bed",
  "raised_bed",
  "lawn",
  "hedge",
  "terrace",
  "path",
  "house",
  "greenhouse",
  "roof",
  "pond",
  "boundary",
  "other",
  "zone",
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export interface RectGeometry {
  type: "rect";
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** degrees, clockwise */
  rotation: number;
}
export interface CircleGeometry {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
}
export interface PolygonGeometry {
  type: "polygon";
  points: [number, number][];
}
/** A sprinkler at (cx, cy) and the part of a circle it waters. */
export interface SectorGeometry {
  type: "sector";
  cx: number;
  cy: number;
  r: number;
  /** compass bearing of the arc's first edge: degrees clockwise from north (up) */
  start: number;
  /** angle of the arc, clockwise from `start`; 360 is a full circle */
  sweep: number;
}
/** A drip line laid from point to point, and the strip it wets. */
export interface LineGeometry {
  type: "line";
  points: [number, number][];
  /** metres */
  width: number;
}
export type Geometry =
  RectGeometry | CircleGeometry | PolygonGeometry | SectorGeometry | LineGeometry;

export interface Shape {
  id: string;
  kind: ShapeKind;
  geometry: Geometry;
  label: string | null;
  plant_id: string | null;
  soil_type: SoilType | null;
  locked: boolean;
  z: number;
  /** Only for kind "zone". */
  irrigation?: Irrigation | null;
}

export interface WmsBackground {
  type: "wms";
  preset?: string | null;
  url?: string | null;
  layers?: string | null;
  attribution?: string | null;
  opacity: number;
}

export interface ImageBackground {
  type: "image";
  image_id: string;
  width_px: number;
  height_px: number;
  /** top-left corner in plan metres (before rotation, which turns around the centre) */
  x: number;
  y: number;
  width_m: number;
  rotation: number;
  opacity: number;
  /** signed URL, added by the backend */
  url?: string;
}

export type Background = WmsBackground | ImageBackground;

/** A Home Assistant entity shown on the plan. */
export interface Marker {
  id: string;
  entity_id: string;
  x: number;
  y: number;
  label: string | null;
}

export interface Layout {
  origin: { latitude: number; longitude: number } | null;
  shapes: Shape[];
  background: Background | null;
  markers: Marker[];
}

export interface GardenChangeEvent {
  kind: "plant" | "plant_removed" | "layout" | "irrigation" | "water" | "ai" | "care";
  plant_id: string | null;
  shape_id: string | null;
}

// ------------------------------------------------------------ irrigation
export const EMITTERS = ["spray", "rotor", "drip_line", "drip", "manual"] as const;
export type Emitter = (typeof EMITTERS)[number];

/** Share of the water that reaches the roots; same defaults as the backend (D-023). */
export const DEFAULT_EFFICIENCY: Record<Emitter, number> = {
  rotor: 0.75,
  spray: 0.65,
  drip: 0.9,
  drip_line: 0.85,
  manual: 0.8,
};

/** Domains a zone can follow; the integration only reads them, it never switches. */
export const ZONE_ENTITY_DOMAINS = ["valve", "switch", "input_boolean", "binary_sensor"] as const;

export interface Irrigation {
  entity_id: string | null;
  timer_entity_id: string | null;
  meter_entity_id: string | null;
  emitter: Emitter;
  /** precipitation rate over the zone */
  rate_mm_h: number | null;
  /** flow, spread over the zone area */
  flow_l_min: number | null;
  /** drippers: litres per hour per plant */
  drip_l_h: number | null;
  /** a drip line: litres per hour per metre of hose */
  flow_l_h_m: number | null;
  /** null: DEFAULT_EFFICIENCY of the emitter */
  efficiency: number | null;
  include: string[];
  exclude: string[];
}

export interface WaterDay {
  day: string;
  liters: number;
  mm: number;
}

export interface PlantWaterStats {
  today_l: number;
  today_mm: number;
  total_l: number;
  last_watering: string | null;
  /** last 14 days, oldest first */
  days: WaterDay[];
}

export interface ZoneStats {
  runtime_today_s: number;
  liters_today: number;
  last_run: string | null;
  running_since: string | null;
}

export interface IrrigationSummary {
  plants: Record<string, PlantWaterStats>;
  zones: Record<string, ZoneStats>;
}

export interface IrrigationEvent {
  id: string;
  /** null: watered by hand */
  zone_id: string | null;
  started_at: string;
  ended_at: string;
  duration_s: number;
  day: string;
  source: "estimate" | "meter" | "manual" | "unknown";
  liters: number | null;
  depth_mm: number | null;
  uncertain: boolean;
  reconstructed: boolean;
  note: string;
  plants: { plant_id: string; liters: number; mm: number }[];
}

// ------------------------------------------------------------ weather and water balance
export interface WeatherDay {
  day: string;
  t_min: number | null;
  t_max: number | null;
  precip_mm: number | null;
  et0_mm: number | null;
  rain_probability: number | null;
  /** future day */
  forecast: boolean;
  /** where ET₀ came from: a source key, "penman_monteith" or "hargreaves" */
  et0_method: string | null;
  source: string;
}

export interface WeatherSourceStatus {
  source: "open_meteo" | "bright_sky" | "home_assistant";
  title: string;
  ok: boolean;
  error: string | null;
  days: number;
}

export interface BalanceDay {
  day: string;
  et0: number | null;
  kc: number;
  etc: number;
  rain: number;
  irrigation: number;
  depletion: number;
}

export interface PlantBalance {
  /** soil water deficit Dr in mm */
  depletion: number;
  /** total and readily available water of the root zone, mm */
  taw: number;
  raw: number;
  soil: string;
  root_depth_m: number;
  sheltered: boolean;
  needs_water: boolean;
  /** coldest forecast night below the plant's limit, °C */
  frost: number | null;
  days: BalanceDay[];
  /** today and the forecast days: when the plant needs water (forecast rain included) */
  outlook?: OutlookDay[];
}

export interface OutlookDay {
  day: string;
  /** soil water deficit at the end of the day, before watering, mm */
  depletion: number;
  /** the plant needs watering on this day */
  water: boolean;
}

export interface ZoneAdvice {
  recommended: boolean;
  minutes: number | null;
  reason: "dry" | "rain_expected" | "ok" | "no_plants" | "no_rate";
}

export interface WaterSummary {
  /** at least one weather source is set up */
  configured: boolean;
  updated: string | null;
  sources: WeatherSourceStatus[];
  weather: WeatherDay[];
  plants?: Record<string, PlantBalance>;
  zones?: Record<string, ZoneAdvice>;
}

// ------------------------------------------------------------ AI
export const ORGANS = ["leaf", "flower", "fruit", "bark", "auto"] as const;
export type Organ = (typeof ORGANS)[number];

export interface AIStatus {
  /** some provider can identify (a language model or Pl@ntNet) */
  available: boolean;
  /** title of the language model used for photos */
  identify: string | null;
  plantnet: boolean;
  currency: string;
}

export interface Suggestion {
  key: string;
  value: unknown;
  confidence: number;
  current: unknown;
  /** new: can be taken over; differs: the user set another value (kept) */
  state: "new" | "differs" | "same" | "accepted" | "rejected";
}

export interface SpeciesCandidate {
  scientific_name: string;
  common_name_de: string | null;
  common_name_en: string | null;
  variety: string | null;
  family: string | null;
  confidence: number;
  reason: string;
}

export interface Identification {
  created: string;
  photos: string[];
  model: string | null;
  provider: string | null;
  plantnet: {
    candidates: { scientific_name: string; family: string | null; score: number }[];
    remaining: number | null;
  } | null;
  result: {
    candidates: SpeciesCandidate[];
    health: { status: string; summary: string };
    size: { basis: string | null; confidence: number };
    care: { pruning: string | null };
    questions: string[];
  } | null;
  accepted: string[];
  rejected: string[];
  suggestions: Suggestion[];
}

export interface UsageTotals {
  requests: number;
  errors: number;
  input: number;
  cached_input: number;
  cache_write: number;
  output: number;
  reasoning: number;
  images: number;
  /** USD; null when no call had a known price */
  cost: number | null;
  unknown_cost: number;
  latency_ms: number;
}

export interface ProviderInfo {
  id: string;
  title: string;
  kind: string;
  model: string | null;
  base_url: string | null;
  /** masked, e.g. sk-…abcd */
  key: string | null;
  status: { ok: boolean; error: string | null; checked: string; remaining?: number | null } | null;
}

export interface UsageSummary {
  currency: string;
  /** USD -> display currency */
  rate: number;
  budget: number;
  budget_stop: boolean;
  today: UsageTotals;
  month: UsageTotals;
  total: UsageTotals;
  by: Record<"provider" | "model" | "feature" | "plant_id", (UsageTotals & { key: string })[]>;
  daily: { day: string; model: string; cost: number | null; requests: number }[];
  providers: ProviderInfo[];
}

export interface UsageRow {
  id: string;
  ts: string;
  feature: string;
  provider: string;
  provider_title: string;
  model: string;
  plant_id: string | null;
  status: string;
  error: string | null;
  input: number;
  cached_input: number;
  cache_write: number;
  output: number;
  reasoning: number;
  images: number;
  cost: number | null;
  cost_source: string;
  latency_ms: number;
  prompt: string | null;
  response: string | null;
}

export type Prices = Partial<
  Record<"input" | "cached_input" | "cache_write" | "output" | "per_image" | "per_request", number>
>;

export interface PricingInfo {
  as_of: string;
  sources: Record<string, string>;
  currency: string;
  prices: Record<string, Record<string, Prices>>;
  overrides: Record<string, Record<string, Prices>>;
}

export interface TechInfo {
  version: string;
  storage: Record<string, number>;
  entities: number;
  plants: number;
  weather: {
    updated: string | null;
    sources: { title: string; ok: boolean; error: string | null; days: number }[];
    last_error: string | null;
  };
  providers: ProviderInfo[];
}

// ------------------------------------------------------------ assistant (tasks, problems, chat)
export const TASK_KINDS = [
  "water",
  "fertilize",
  "prune",
  "repot",
  "pest_check",
  "harvest",
  "photo",
  "other",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export interface Repeat {
  every: number;
  unit: "days" | "weeks";
}

export interface Task {
  id: string;
  kind: TaskKind;
  title: string;
  notes: string;
  plant_id: string | null;
  problem_id: string | null;
  due: string | null;
  repeat: Repeat | null;
  months: number[];
  status: "open" | "done";
  source: "user" | "ai";
  created_at: string;
  done_at: string | null;
}

export interface TaskFields {
  kind?: TaskKind;
  title?: string;
  notes?: string;
  plant_id?: string | null;
  problem_id?: string | null;
  due?: string | null;
  repeat?: Repeat | null;
  months?: number[];
}

export const PROBLEM_STATUSES = ["open", "treating", "watching", "resolved"] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

export interface Diagnosis {
  summary: string;
  health: "healthy" | "watch" | "problem";
  symptoms: string[];
  causes: { name: string; type: string; confidence: number; evidence: string }[];
  actions: { text: string; urgency: "now" | "soon" | "later"; warning: string | null }[];
  monitoring: string[];
  missing_info: string[];
  follow_up_days: number | null;
  model?: string;
  created?: string;
  photo_ids?: string[];
}

export interface Problem {
  id: string;
  plant_id: string;
  title: string;
  status: ProblemStatus;
  observed_on: string;
  created_at: string;
  resolved_at: string | null;
  photo_ids: string[];
  diagnosis: Diagnosis | null;
}

export interface LogEntry {
  id: string;
  ts: string;
  kind: "note" | "action" | "status" | "diagnosis" | "photo";
  text: string;
}

export interface ProblemDetail {
  problem: Problem;
  log: LogEntry[];
}

export interface Question {
  id: string;
  plant_id: string | null;
  field: string | null;
  question: string;
  answer: string | null;
  status: "open" | "answered" | "dismissed";
  created_at: string;
  answered_at: string | null;
}

export interface ChatMessage {
  id: string;
  plant_id: string | null;
  role: "user" | "assistant";
  text: string;
  ts: string;
  model: string | null;
}

export interface Tip {
  id: string;
  title: string;
  text: string;
  plant_id: string | null;
  task: { kind: TaskKind; title: string; due_in_days: number | null; repeat: Repeat | null } | null;
  state: "new" | "accepted" | "dismissed" | null;
  task_id?: string;
}

export interface TipsRecord {
  created: string;
  model: string;
  weekly: boolean;
  tips: Tip[];
}

export interface PlantCare {
  open_tasks: number;
  overdue: number;
  prune_due: boolean;
  problem: ProblemStatus | null;
  questions: number;
}

export interface CareSummary {
  plants: Record<string, PlantCare>;
  garden: { open_tasks?: number; overdue?: number; problems?: number; questions?: number };
}
