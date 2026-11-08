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

export interface Plant extends PlantFields {
  id: string;
  created_at: string;
  updated_at: string;
  cover_photo_id: string | null;
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

export interface GardenChangeEvent {
  kind: "plant" | "plant_removed";
  plant_id: string;
}
