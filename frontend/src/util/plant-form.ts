import type { LocationType, Plant, PlantCategory, PlantFields, PlantStatus } from "../api/types";
import { todayIso } from "./format";

/** Raw values of the plant form, all as strings like the inputs deliver them. */
export interface PlantFormState {
  name: string;
  scientific_name: string;
  variety: string;
  family: string;
  notes: string;
  category: PlantCategory;
  location_type: LocationType;
  light: string;
  water_need: string;
  soil_type: string;
  status: PlantStatus;
  min_temperature_c: string;
  root_depth_cm: string;
  planted_on: string;
  age_years: string;
  age_months: string;
  age_on: string;
  tags: string;
}

const str = (value: string | number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

export function emptyFormState(today = todayIso()): PlantFormState {
  return {
    name: "",
    scientific_name: "",
    variety: "",
    family: "",
    notes: "",
    category: "other",
    location_type: "bed",
    light: "",
    water_need: "",
    soil_type: "",
    status: "healthy",
    min_temperature_c: "",
    root_depth_cm: "",
    planted_on: "",
    age_years: "",
    age_months: "",
    age_on: today,
    tags: "",
  };
}

export function formStateFromPlant(plant: Plant, today = todayIso()): PlantFormState {
  return {
    name: plant.name,
    scientific_name: str(plant.scientific_name),
    variety: str(plant.variety),
    family: str(plant.family),
    notes: str(plant.notes),
    category: plant.category,
    location_type: plant.location_type,
    light: str(plant.light),
    water_need: str(plant.water_need),
    soil_type: str(plant.soil_type),
    status: plant.status,
    min_temperature_c: str(plant.min_temperature_c),
    root_depth_cm: str(plant.root_depth_cm),
    planted_on: str(plant.planted_on),
    age_years: plant.age ? str(Math.floor(plant.age.age_months / 12)) : "",
    age_months: plant.age ? str(plant.age.age_months % 12) : "",
    age_on: plant.age?.on ?? today,
    tags: plant.tags.join(", "),
  };
}

const text = (value: string) => value.trim() || null;

function number(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function wholeNumber(value: string): number {
  const parsed = number(value);
  return parsed === null ? 0 : Math.max(0, Math.round(parsed));
}

export function fieldsFromFormState(state: PlantFormState): PlantFields {
  const hasAge = state.age_years.trim() !== "" || state.age_months.trim() !== "";
  return {
    name: state.name.trim(),
    scientific_name: text(state.scientific_name),
    variety: text(state.variety),
    family: text(state.family),
    notes: text(state.notes),
    category: state.category,
    location_type: state.location_type,
    light: (text(state.light) as PlantFields["light"]) ?? null,
    water_need: (text(state.water_need) as PlantFields["water_need"]) ?? null,
    soil_type: (text(state.soil_type) as PlantFields["soil_type"]) ?? null,
    status: state.status,
    min_temperature_c: number(state.min_temperature_c),
    root_depth_cm: number(state.root_depth_cm),
    planted_on: text(state.planted_on),
    age: hasAge
      ? {
          age_months: wholeNumber(state.age_years) * 12 + wholeNumber(state.age_months),
          on: state.age_on || todayIso(),
        }
      : null,
    tags: state.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The fields to send. On create: everything that has a value. On edit: only
 * what changed, so that untouched fields keep their provenance (e.g. an AI
 * suggestion stays marked as such).
 */
export function changedFields(
  next: PlantFields,
  original: PlantFields | null,
): Partial<PlantFields> {
  const result: Partial<PlantFields> = {};
  for (const key of Object.keys(next) as (keyof PlantFields)[]) {
    const value = next[key];
    if (original) {
      if (!same(value, original[key])) Object.assign(result, { [key]: value });
    } else if (value !== null && !(Array.isArray(value) && value.length === 0)) {
      Object.assign(result, { [key]: value });
    }
  }
  return result;
}

export function plantFields(plant: Plant): PlantFields {
  const {
    name,
    scientific_name,
    variety,
    family,
    notes,
    category,
    location_type,
    light,
    water_need,
    soil_type,
    status,
    min_temperature_c,
    root_depth_cm,
    planted_on,
    age,
    tags,
  } = plant;
  return {
    name,
    scientific_name,
    variety,
    family,
    notes,
    category,
    location_type,
    light,
    water_need,
    soil_type,
    status,
    min_temperature_c,
    root_depth_cm,
    planted_on,
    age,
    tags,
  };
}

export { number as parseNumber };
