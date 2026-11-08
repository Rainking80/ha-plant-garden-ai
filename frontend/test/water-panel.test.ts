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
});
