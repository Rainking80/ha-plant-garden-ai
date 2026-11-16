// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IrrigationEvent } from "../src/api/types";
import type { PgConfirmDialog } from "../src/components/confirm-dialog";
import type { PgNumberDialog } from "../src/components/number-dialog";
import "../src/components/water-panel";
import { waterBars, type PgWaterPanel } from "../src/components/water-panel";
import { GardenStore } from "../src/state/garden-store";
import { deepGet, deepText, fakeBackend, makePlant } from "./fixtures";

const ZONE_RUN: IrrigationEvent = {
  id: "EVZONE",
  zone_id: "Z",
  started_at: "2026-06-01T06:00:00Z",
  ended_at: "2026-06-01T06:30:00Z",
  duration_s: 1800,
  day: "2026-06-01",
  source: "estimate",
  liters: 80,
  depth_mm: 3.75,
  uncertain: false,
  reconstructed: true,
  note: "",
  plants: [{ plant_id: "R", liters: 2.95, mm: 3.75 }],
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("waterBars", () => {
  it("scales to the wettest day, at least 5 mm", () => {
    const days = [
      { day: "a", liters: 0, mm: 0 },
      { day: "b", liters: 1, mm: 2.5 },
    ];
    const bars = waterBars(days, 100, 50);
    expect(bars.map((bar) => bar.h)).toEqual([0, 25]);
    expect(bars[1]?.x).toBeCloseTo(57.5);
    expect(waterBars([{ day: "c", liters: 9, mm: 10 }], 100, 50)[0]?.h).toBe(50);
    expect(waterBars([], 100, 50)).toEqual([]);
  });
});

describe("pg-water-panel", () => {
  it("shows the plant's water, logs and deletes waterings", async () => {
    const backend = fakeBackend({
      plants: [makePlant({ id: "R", name: "Rose" })],
      events: [ZONE_RUN],
      irrigation: {
        plants: {
          R: {
            today_l: 2.95,
            today_mm: 3.75,
            total_l: 12,
            last_watering: ZONE_RUN.ended_at,
            days: [{ day: "2026-06-01", liters: 2.95, mm: 3.75 }],
          },
        },
        zones: {},
      },
    });
    backend.shapes = [
      {
        id: "Z",
        kind: "zone",
        geometry: { type: "circle", cx: 0, cy: 0, r: 2 },
        label: "Rasen",
        plant_id: null,
        soil_type: null,
        locked: false,
        z: 7,
        irrigation: null,
      },
    ];
    const store = new GardenStore(() => backend.hass);
    await store.refresh();
    const panel = document.createElement("pg-water-panel") as PgWaterPanel;
    panel.hass = backend.hass;
    panel.store = store;
    panel.plantId = "R";
    document.body.append(panel);
    await vi.waitFor(() => expect(deepText(panel)).toContain("Rasen"));
    const text = deepText(panel);
    expect(text).toContain("Heute 3 L (3,8 mm) · insgesamt 12 L");
    expect(text).toContain("geschätzt · nachgetragen");
    expect(text).toMatch(/Rasen.*3 L/);
    expect(panel.shadowRoot?.querySelectorAll(".bars rect")).toHaveLength(1);

    // log 5 L with the watering can
    const numbers = deepGet<PgNumberDialog>(panel, "pg-number-dialog");
    vi.spyOn(numbers, "ask").mockResolvedValue(5);
    deepGet<HTMLButtonElement>(panel, ".block-header button").click();
    await vi.waitFor(() => expect(deepText(panel)).toContain("Von Hand"));
    expect(backend.callWS).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "plant_garden/irrigation/log",
        plants: [{ plant_id: "R", liters: 5 }],
      }),
    );

    // delete the zone run after confirming
    const confirm = deepGet<PgConfirmDialog>(panel, "pg-confirm-dialog");
    const ask = vi.spyOn(confirm, "ask").mockResolvedValue(true);
    const deleteButtons = panel.shadowRoot?.querySelectorAll<HTMLButtonElement>(".events button");
    deleteButtons?.[1]?.click();
    await vi.waitFor(() => expect(deepText(panel)).not.toContain("Rasen"));
    expect(ask.mock.calls[0]?.[1]).toContain("ganzen Lauf der Zone");
  });

  it("explains when nothing was watered yet", async () => {
    const backend = fakeBackend({ plants: [makePlant({ id: "R" })] });
    const store = new GardenStore(() => backend.hass);
    await store.refresh();
    const panel = document.createElement("pg-water-panel") as PgWaterPanel;
    panel.hass = backend.hass;
    panel.store = store;
    panel.plantId = "R";
    document.body.append(panel);
    await panel.updateComplete;
    expect(deepText(panel)).toContain("Noch keine Bewässerung erfasst.");
  });

  it("links a soil moisture sensor, shows its reading and takes the scale", async () => {
    const balance = {
      depletion: 39,
      taw: 78,
      raw: 39,
      soil: "loam",
      root_depth_m: 0.6,
      sheltered: false,
      needs_water: false,
      frost: null,
      days: [],
    };
    const backend = fakeBackend({
      plants: [makePlant({ id: "R", name: "Rose" })],
      states: {
        "sensor.beet_feuchte": {
          entity_id: "sensor.beet_feuchte",
          state: "30",
          attributes: { friendly_name: "Beet Feuchte", unit_of_measurement: "%" },
        },
      },
      water: {
        configured: true,
        updated: null,
        sources: [],
        weather: [],
        plants: { R: balance },
        zones: {},
      },
    });
    const store = new GardenStore(() => backend.hass);
    await store.refresh();
    const panel = document.createElement("pg-water-panel") as PgWaterPanel;
    panel.hass = backend.hass;
    panel.store = store;
    panel.plantId = "R";
    document.body.append(panel);
    await panel.updateComplete;
    expect(deepText(panel)).toContain("Bodenfeuchtesensor verknüpfen");

    // pick the sensor
    deepGet(panel, "pg-entity-picker").dispatchEvent(
      new CustomEvent("entity-picked", { detail: { entityId: "sensor.beet_feuchte" } }),
    );
    await vi.waitFor(() =>
      expect(backend.callWS).toHaveBeenCalledWith({
        type: "plant_garden/plants/update",
        plant_id: "R",
        moisture_entity_id: "sensor.beet_feuchte",
      }),
    );
    // the backend measured: 30 % between 40 (learned) and 20
    backend.water = {
      ...backend.water,
      plants: {
        R: {
          ...balance,
          model_depletion: 77.5,
          moisture: { status: "ok", value: 30, wet: 40, dry: 20, learned: true },
        },
      },
    };
    await store.refresh();
    await vi.waitFor(() => expect(deepText(panel)).toContain("Beet Feuchte"));
    const text = deepText(panel);
    expect(text).toContain("30 %");
    expect(text).toContain("gemessen · berechnet wären 78 mm verbraucht");
    expect(text).toContain("nass 40 %");
    expect(text).toContain("trocken 20 %");
    expect(text).toContain("gelernt");

    // set the dry reading by hand
    const numbers = deepGet<PgNumberDialog>(panel, "pg-number-dialog");
    const ask = vi.spyOn(numbers, "ask").mockResolvedValue(15);
    panel.shadowRoot?.querySelectorAll<HTMLButtonElement>(".scale .chip")[1]?.click();
    await vi.waitFor(() =>
      expect(backend.callWS).toHaveBeenCalledWith({
        type: "plant_garden/plants/update",
        plant_id: "R",
        moisture_dry: 15,
      }),
    );
    expect(ask.mock.calls[0]?.[3]).toBe(20);

    // unlink clears the scale too
    deepGet<HTMLButtonElement>(panel, ".scale .icon-button").click();
    await vi.waitFor(() =>
      expect(backend.callWS).toHaveBeenCalledWith({
        type: "plant_garden/plants/update",
        plant_id: "R",
        moisture_entity_id: null,
        moisture_wet: null,
        moisture_dry: null,
      }),
    );
  });
});
