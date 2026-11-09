// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlantBalance, Shape, WaterSummary, WeatherDay } from "../src/api/types";
import type { PgGardenCanvas } from "../src/components/garden-canvas";
import "../src/components/water-panel";
import type { PgWaterPanel } from "../src/components/water-panel";
import { parseRoute } from "../src/panel";
import { GardenStore } from "../src/state/garden-store";
import "../src/views/garden-view";
import type { PgGardenView } from "../src/views/garden-view";
import "../src/views/water-view";
import type { PgWaterView } from "../src/views/water-view";
import {
  cloudLayout,
  deficitColor,
  deficitFraction,
  nextWatering,
  wateringDays,
  weatherChart,
} from "../src/util/water";
import { deepGet, deepQuery, deepText, fakeBackend, makePlant, type FakeBackend } from "./fixtures";

const day = (iso: string, rain: number, et0: number, forecast = false): WeatherDay => ({
  day: iso,
  t_min: 9,
  t_max: 22,
  precip_mm: rain,
  et0_mm: et0,
  rain_probability: null,
  forecast,
  et0_method: forecast ? null : "open_meteo",
  source: "open_meteo",
});

const balance = (depletion: number, extra: Partial<PlantBalance> = {}): PlantBalance => ({
  depletion,
  taw: 78,
  raw: 39,
  soil: "loam",
  root_depth_m: 0.6,
  sheltered: false,
  needs_water: depletion > 39,
  frost: null,
  days: [],
  ...extra,
});

const ZONE: Shape = {
  id: "Z",
  kind: "zone",
  geometry: { type: "rect", cx: 0, cy: 0, w: 4, h: 4, rotation: 0 },
  label: "Beet",
  plant_id: null,
  soil_type: null,
  locked: false,
  z: 7,
  irrigation: {
    entity_id: null,
    timer_entity_id: null,
    meter_entity_id: null,
    emitter: "rotor",
    rate_mm_h: 15,
    flow_l_min: null,
    drip_l_h: null,
    flow_l_h_m: null,
    efficiency: null,
    include: [],
    exclude: [],
  },
};

const WATER: WaterSummary = {
  configured: true,
  updated: new Date().toISOString(),
  sources: [
    { source: "open_meteo", title: "Open-Meteo", ok: true, error: null, days: 34 },
    { source: "bright_sky", title: "Bright Sky (DWD)", ok: false, error: "HTTP 503", days: 0 },
  ],
  weather: [day("2026-07-08", 0, 4.5), day("2026-07-09", 12, 3.1), day("2026-07-10", 3, 4, true)],
  plants: {
    R: balance(60, { frost: 2 }),
    L: balance(10),
  },
  zones: {
    Z: { recommended: true, minutes: 42, reason: "dry" },
  },
};

const PLANTS = [
  makePlant({ id: "R", name: "Rose", position: { x: 0, y: 0 }, crown_diameter_m: 1 }),
  makePlant({ id: "L", name: "Lavendel", position: { x: 9, y: 9 }, crown_diameter_m: 1 }),
];

async function storeFor(backend: FakeBackend): Promise<GardenStore> {
  const store = new GardenStore(() => backend.hass);
  await store.refresh();
  return store;
}

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("water helpers", () => {
  it("colours the deficit from green over yellow to red", () => {
    expect(deficitFraction({ depletion: 39, taw: 78 })).toBe(0.5);
    expect(deficitFraction({ depletion: 99, taw: 78 })).toBe(1);
    expect(deficitFraction({ depletion: 5, taw: 0 })).toBe(0);
    expect(deficitColor({ depletion: 0, taw: 78, raw: 39 })).toBe("hsl(130 70% 45%)");
    expect(deficitColor({ depletion: 39, taw: 78, raw: 39 })).toBe("hsl(50 70% 45%)");
    expect(deficitColor({ depletion: 78, taw: 78, raw: 39 })).toBe("hsl(0 70% 45%)");
    expect(deficitColor({ depletion: 1, taw: 0, raw: 0 })).toBe("hsl(130 70% 45%)");
  });

  it("draws rain bars and an ET₀ line on one scale", () => {
    const chart = weatherChart(WATER.weather, 300, 100);
    expect(chart.top).toBe(12);
    expect(chart.rain.map((bar) => Math.round(bar.h))).toEqual([0, 100, 25]);
    expect(chart.et0.startsWith("M50,62.5")).toBe(true);
    expect(chart.forecastX).toBe(200);
    expect(weatherChart([], 300, 100)).toMatchObject({
      rain: [],
      et0: "",
      forecastX: null,
      top: 5,
    });
  });

  it("routes /water to the water view", () => {
    expect(parseRoute("/water")).toEqual({ name: "water" });
  });
});

describe("pg-water-view", () => {
  it("asks for a weather source first", async () => {
    const view = document.createElement("pg-water-view") as PgWaterView;
    const backend = fakeBackend();
    view.hass = backend.hass;
    view.store = await storeFor(backend);
    document.body.append(view);
    await view.updateComplete;
    expect(deepText(view)).toContain("Wetterquelle hinzufügen");
    expect(deepGet<HTMLAnchorElement>(view, "a.button").getAttribute("href")).toBe(
      "/config/integrations/integration/plant_garden",
    );
  });

  it("shows weather, soil water, advice and sources", async () => {
    const backend = fakeBackend({ plants: PLANTS, shapes: [ZONE], water: WATER });
    const view = document.createElement("pg-water-view") as PgWaterView;
    view.hass = backend.hass;
    view.store = await storeFor(backend);
    document.body.append(view);
    await view.updateComplete;
    const text = deepText(view);
    expect(text).toContain("Heute 12 mm Regen, 3,1 mm Verdunstung · morgen 3 mm Regen");
    expect(view.shadowRoot?.querySelectorAll(".chart .rain")).toHaveLength(3);
    // thirstiest first, with badges
    const names = [...(view.shadowRoot?.querySelectorAll(".plants a") ?? [])].map((a) =>
      a.textContent?.trim(),
    );
    expect(names).toEqual(["Rose", "Lavendel"]);
    expect(deepText(deepGet(view, ".plants li"))).toContain("60 / 78 mm Gießbedarf");
    expect(deepQuery(view, ".badge.frost")).not.toBeNull();
    expect(text).toContain("Beet sollte etwa 42 min laufen");
    expect(text).toContain("Open-Meteo 34 Tage");
    expect(text).toContain("Bright Sky (DWD) HTTP 503");

    // refresh fetches and takes over the new summary
    backend.water = { ...WATER, sources: [WATER.sources[0] as WaterSummary["sources"][0]] };
    deepGet<HTMLButtonElement>(view, ".sources button").click();
    await vi.waitFor(() => expect(deepText(view)).not.toContain("HTTP 503"));
    expect(backend.callWS).toHaveBeenCalledWith({ type: "plant_garden/water/refresh" });
  });

  it("marks the days with weekday and date and clouds the plants to water", async () => {
    // today is Tuesday 2026-07-14; two weeks back and nine days ahead are cut to 7 + 1 + 7
    const weather = [
      ...Array.from({ length: 14 }, (_, i) =>
        day(`2026-07-${String(i + 1).padStart(2, "0")}`, 0, 4),
      ),
      ...Array.from({ length: 9 }, (_, i) => day(`2026-07-${String(i + 15)}`, 2, 4, true)),
    ];
    const outlook = (watered: string[]) =>
      ["2026-07-14", "2026-07-15", "2026-07-16"].map((d) => ({
        day: d,
        depletion: 40,
        water: watered.includes(d),
      }));
    const water: WaterSummary = {
      ...WATER,
      weather,
      plants: {
        // the rose needs water, but rain is coming; it is due the day after tomorrow
        R: balance(45, { outlook: outlook(["2026-07-16"]) }),
        L: balance(20, { outlook: outlook(["2026-07-16"]) }),
        X: balance(50, { outlook: outlook(["2026-07-14"]) }),
      },
    };
    const plants = [...PLANTS, makePlant({ id: "X", name: "Phlox" })];
    const backend = fakeBackend({ plants, water });
    const view = document.createElement("pg-water-view") as PgWaterView;
    view.hass = backend.hass;
    view.store = await storeFor(backend);
    document.body.append(view);
    await view.updateComplete;

    const ticks = [...(view.shadowRoot?.querySelectorAll(".axis .tick") ?? [])];
    expect(ticks).toHaveLength(15);
    expect(deepText(ticks[0] as Element).trim()).toBe("Di 07.07.");
    expect(deepGet(view, ".axis .tick.today").textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Di 14.07.",
    );
    expect(view.shadowRoot?.querySelectorAll(".chart .rain")).toHaveLength(15);

    // one cloud for today (Phlox), one with two plants the day after tomorrow
    const clouds = [...(view.shadowRoot?.querySelectorAll(".cloud[role=group]") ?? [])];
    expect(clouds.map((cloud) => cloud.getAttribute("aria-label"))).toEqual([
      "Di 14.07.: Phlox gießen",
      "Do 16.07.: Lavendel, Rose gießen",
    ]);
    expect(clouds[1]?.querySelectorAll("a")).toHaveLength(2);

    // the list tells when: today, rain expected, or the next day
    const rows = Object.fromEntries(
      [...(view.shadowRoot?.querySelectorAll(".plants li") ?? [])].map((li) => [
        li.querySelector("a")?.textContent?.trim(),
        deepText(li.querySelector(".badges") as Element).trim(),
      ]),
    );
    expect(rows).toEqual({
      Phlox: "Gießbedarf",
      Rose: "Regen erwartet",
      Lavendel: "gießen Do 16.07.",
    });
  });

  it("reports a failing refresh", async () => {
    const backend = fakeBackend({ water: { ...WATER, weather: [] } });
    const view = document.createElement("pg-water-view") as PgWaterView;
    view.hass = backend.hass;
    view.store = await storeFor(backend);
    document.body.append(view);
    await view.updateComplete;
    expect(deepText(view)).toContain("Noch keine Wetterdaten.");
    backend.callWS.mockRejectedValueOnce({ code: "x", message: "kaputt" });
    deepGet<HTMLButtonElement>(view, ".sources button").click();
    await vi.waitFor(() => expect(deepText(view)).toContain("kaputt"));
  });
});

describe("soil water on the plan and the plant page", () => {
  it("rings thirsty and frost-endangered plants and offers heatmaps", async () => {
    localStorage.setItem("plant-garden.viewport.v1", JSON.stringify({ cx: 0, cy: 0, width: 40 }));
    const backend = fakeBackend({ plants: PLANTS, shapes: [ZONE], water: WATER });
    const view = document.createElement("pg-garden-view") as PgGardenView;
    view.hass = backend.hass;
    view.store = await storeFor(backend);
    document.body.append(view);
    await view.updateComplete;
    const canvas = deepGet<PgGardenCanvas>(view, "pg-garden-canvas");
    await canvas.updateComplete;
    const rose = deepGet<SVGGElement>(canvas, '[data-plant-id="R"]');
    expect([...rose.classList]).toEqual(expect.arrayContaining(["thirsty", "frost"]));
    expect(rose.querySelector(".frost-ring")).not.toBeNull();
    expect(deepGet(canvas, '[data-plant-id="L"]').classList.contains("thirsty")).toBe(false);

    const select = deepGet<HTMLSelectElement>(view, ".layer-select select");
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual([
      "Plan",
      "Wasserdefizit",
      "Bewässerungsabdeckung",
    ]);
    select.value = "deficit";
    select.dispatchEvent(new Event("change"));
    await view.updateComplete;
    await canvas.updateComplete;
    expect(rose.querySelector(".deficit")?.getAttribute("style")).toContain("hsl(");
    expect(localStorage.getItem("plant-garden.layer.v1")).toBe('"deficit"');

    select.value = "coverage";
    select.dispatchEvent(new Event("change"));
    await view.updateComplete;
    await canvas.updateComplete;
    const zone = deepGet<SVGGElement>(canvas, ".zones .zone");
    expect(zone.querySelector(".coverage")?.getAttribute("style")).toContain("opacity: 0.35");
    expect(zone.textContent).toContain("15 mm/h");

    // the info cards tell the water state and the advice
    canvas.dispatchEvent(
      new CustomEvent("select", { detail: { selection: { type: "plant", id: "R" } } }),
    );
    await view.updateComplete;
    const card = deepText(deepGet(view, "article.info"));
    expect(card).toContain("Gießbedarf: 60 von 78 mm verbraucht");
    expect(card).toContain("Frost erwartet: bis 2 °C");
    canvas.dispatchEvent(
      new CustomEvent("select", { detail: { selection: { type: "shape", id: "Z" } } }),
    );
    await view.updateComplete;
    expect(deepText(deepGet(view, ".zone-card"))).toContain("sollte etwa 42 min laufen");
  });

  it("shows the soil water on the plant page", async () => {
    const backend = fakeBackend({ plants: PLANTS, water: WATER });
    const panel = document.createElement("pg-water-panel") as PgWaterPanel;
    panel.hass = backend.hass;
    panel.store = await storeFor(backend);
    panel.plantId = "R";
    document.body.append(panel);
    await panel.updateComplete;
    const text = deepText(panel);
    expect(text).toContain("Gießbedarf: 60 von 78 mm verbraucht");
    expect(text).toContain("Lehm, Wurzeln etwa 60 cm, Gießbedarf ab 39 mm");
    expect(text).toContain("Frost erwartet: bis 2 °C");
    expect(deepGet<HTMLElement>(panel, ".meter .used").getAttribute("style")).toContain(
      "width: 76.9",
    );
  });
});

describe("watering outlook", () => {
  it("collects the plants per day and finds each plant's next day", () => {
    const outlook = (due: string[]) =>
      ["2026-07-14", "2026-07-15"].map((d) => ({ day: d, depletion: 1, water: due.includes(d) }));
    const plants = {
      A: balance(10, { outlook: outlook(["2026-07-15"]) }),
      B: balance(50, { outlook: outlook(["2026-07-14", "2026-07-15"]) }),
      C: balance(10, { outlook: outlook([]) }),
      D: balance(10),
    };
    expect([...wateringDays(plants)]).toEqual([
      ["2026-07-15", ["A", "B"]],
      ["2026-07-14", ["B"]],
    ]);
    expect(nextWatering(plants.A)).toBe("2026-07-15");
    expect(nextWatering(plants.C)).toBeNull();
    expect(nextWatering(plants.D)).toBeNull();
  });

  it("packs a cloud of plants without overlaps", () => {
    expect(cloudLayout(1)).toEqual({ points: [{ x: 0, y: 0 }], radius: 1 });
    for (let count = 2; count <= 40; count++) {
      const { points, radius } = cloudLayout(count);
      for (const [i, a] of points.entries()) {
        expect(Math.hypot(a.x, a.y) + 1).toBeLessThanOrEqual(radius + 1e-9);
        for (const b of points.slice(i + 1)) {
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });
});
