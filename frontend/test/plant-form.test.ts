import { describe, expect, it } from "vitest";

import {
  changedFields,
  emptyFormState,
  fieldsFromFormState,
  formStateFromPlant,
  parseNumber,
  plantFields,
} from "../src/util/plant-form";
import { makePlant } from "./fixtures";

describe("plant form", () => {
  it("turns form input into clean fields", () => {
    const state = {
      ...emptyFormState("2026-11-08"),
      name: "  Hortensie ",
      scientific_name: " ",
      min_temperature_c: "-15,5",
      root_depth_cm: "abc",
      age_years: "3",
      age_months: "2",
      tags: "Beet Süd, , schattig ",
      light: "partial_shade",
    };
    const fields = fieldsFromFormState(state);
    expect(fields.name).toBe("Hortensie");
    expect(fields.scientific_name).toBeNull();
    expect(fields.min_temperature_c).toBe(-15.5);
    expect(fields.root_depth_cm).toBeNull();
    expect(fields.age).toEqual({ age_months: 38, on: "2026-11-08" });
    expect(fields.tags).toEqual(["Beet Süd", "schattig"]);
    expect(fields.light).toBe("partial_shade");
    expect(fields.water_need).toBeNull();
  });

  it("has no age without years or months", () => {
    expect(fieldsFromFormState(emptyFormState()).age).toBeNull();
    const onlyMonths = { ...emptyFormState("2026-01-01"), age_months: "5" };
    expect(fieldsFromFormState(onlyMonths).age).toEqual({ age_months: 5, on: "2026-01-01" });
  });

  it("round-trips a plant through the form", () => {
    const plant = makePlant({
      scientific_name: "Hydrangea",
      age: { age_months: 38, on: "2026-05-01" },
      min_temperature_c: -20,
      tags: ["a", "b"],
    });
    expect(fieldsFromFormState(formStateFromPlant(plant))).toEqual(plantFields(plant));
  });

  it("sends only what has a value when creating", () => {
    const fields = fieldsFromFormState({ ...emptyFormState(), name: "Rose" });
    expect(changedFields(fields, null)).toEqual({
      name: "Rose",
      category: "other",
      location_type: "bed",
      status: "healthy",
    });
  });

  it("sends only changed fields when editing", () => {
    const plant = makePlant({ scientific_name: "Hydrangea", tags: ["a"] });
    const state = formStateFromPlant(plant);
    expect(changedFields(fieldsFromFormState(state), plantFields(plant))).toEqual({});

    const edited = { ...state, scientific_name: "", tags: "a, b", status: "problem" as const };
    expect(changedFields(fieldsFromFormState(edited), plantFields(plant))).toEqual({
      scientific_name: null,
      tags: ["a", "b"],
      status: "problem",
    });
  });

  it("edits the care profile without touching the other hints", () => {
    const plant = makePlant({ care_prune: "Im Frühjahr", care_water: "Mäßig" });
    const state = formStateFromPlant(plant);
    expect(state.care_prune).toBe("Im Frühjahr");
    const edited = { ...state, care_fertilize: " Kompost im März ", care_water: "" };
    expect(changedFields(fieldsFromFormState(edited), plantFields(plant))).toEqual({
      care_fertilize: "Kompost im März",
      care_water: null,
    });
  });

  it("parses decimal commas", () => {
    expect(parseNumber("1,5")).toBe(1.5);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("x")).toBeNull();
  });
});
