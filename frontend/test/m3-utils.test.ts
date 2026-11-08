import { describe, expect, it } from "vitest";

import type { HassEntity } from "home-assistant-js-websocket";

import { rankEntities } from "../src/components/entity-picker";
import { guessCategory } from "../src/components/todo-import";
import { createLocalize } from "../src/i18n";
import { sparklinePath } from "../src/util/chart";
import { markerIcon, markerValue } from "../src/util/markers";
import { suggestedPosition } from "../src/util/upload";
import {
  WMS_PRESETS,
  geoToPlan,
  getMapRequest,
  planToMercator,
  presetFor,
  resolveWms,
  toMercator,
} from "../src/util/wms";
import { calibrateBackground } from "../src/views/garden-view";
import { mdiRobotMower, mdiWaterPercent, mdiGauge } from "@mdi/js";

const POTSDAM = { latitude: 52.4, longitude: 13.06 };
const de = createLocalize("de");

const entity = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) =>
  ({
    entity_id,
    state,
    attributes,
    last_changed: "",
    last_updated: "",
    context: {},
  }) as unknown as HassEntity;

describe("WMS presets", () => {
  it("have unique keys and https urls", () => {
    expect(new Set(WMS_PRESETS.map((p) => p.key)).size).toBe(WMS_PRESETS.length);
    expect(WMS_PRESETS.every((p) => p.url.startsWith("https://"))).toBe(true);
  });

  it("suggests the service of the state the garden is in", () => {
    expect(presetFor(POTSDAM)?.key).toBe("bb");
    expect(presetFor({ latitude: 48.137, longitude: 11.575 })?.key).toBe("by");
    // Bremen lies inside Lower Saxony's box too; the smaller area wins
    expect(presetFor({ latitude: 53.08, longitude: 8.81 })?.key).toBe("hb");
    expect(presetFor({ latitude: 48.85, longitude: 2.35 })).toBeUndefined(); // Paris
    expect(presetFor(null)).toBeUndefined();
  });

  it("resolves presets and own services", () => {
    expect(resolveWms({ type: "wms", preset: "ni", opacity: 1 }, 2026)).toEqual({
      url: "https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms",
      layers: "ni_dop20",
      attribution: "© LGLN (2026), CC BY 4.0",
    });
    expect(
      resolveWms({
        type: "wms",
        url: "https://x/wms",
        layers: "a,b",
        attribution: "© X",
        opacity: 1,
      }),
    ).toEqual({ url: "https://x/wms", layers: "a,b", attribution: "© X" });
    expect(resolveWms({ type: "wms", url: "https://x/wms", opacity: 1 })).toBeNull();
  });
});

describe("coordinates", () => {
  it("maps the origin to 0,0 and back", () => {
    expect(geoToPlan(POTSDAM, 52.4, 13.06)).toEqual({ x: 0, y: -0 });
    const m = planToMercator(POTSDAM, { x: 0, y: 0 });
    const o = toMercator(52.4, 13.06);
    expect(m.mx).toBeCloseTo(o.mx);
    expect(m.my).toBeCloseTo(o.my);
  });

  it("measures real metres around the origin", () => {
    // 0.001° latitude is about 111 m; north is negative y
    const north = geoToPlan(POTSDAM, 52.401, 13.06);
    expect(north.x).toBeCloseTo(0);
    expect(north.y).toBeCloseTo(-111.3, 0);
    // 0.001° longitude at 52.4° N is about 67.9 m
    const east = geoToPlan(POTSDAM, 52.4, 13.061);
    expect(east.x).toBeCloseTo(67.9, 0);
  });

  it("builds GetMap requests in EPSG:3857 with the right aspect ratio", () => {
    const request = getMapRequest(
      { url: "https://wms.example/service", layers: "dop" },
      POTSDAM,
      { minX: -20, minY: -10, maxX: 20, maxY: 10 },
      1200,
    );
    // 40 m wide: at most 0.1 m per pixel -> 400 px, height 200 px
    expect([request.widthPx, request.heightPx]).toEqual([400, 200]);
    const params = new URL(request.href).searchParams;
    expect(params.get("CRS")).toBe("EPSG:3857");
    expect(params.get("LAYERS")).toBe("dop");
    const [minx, miny, maxx, maxy] = (params.get("BBOX") ?? "").split(",").map(Number);
    expect(minx).toBeLessThan(maxx ?? 0);
    expect(miny).toBeLessThan(maxy ?? 0);
    // Web Mercator stretches by 1/cos(lat): 40 m on the ground ≈ 65.6 Mercator metres here
    expect((maxx ?? 0) - (minx ?? 0)).toBeCloseTo(40 / Math.cos((52.4 * Math.PI) / 180), 1);

    const capped = getMapRequest(
      { url: "https://wms.example/service?map=x", layers: "dop" },
      POTSDAM,
      { minX: 0, minY: 0, maxX: 2000, maxY: 4000 },
      5000,
    );
    expect(capped.heightPx).toBe(2048);
    expect(capped.widthPx).toBe(1024);
    expect(capped.href).toContain("service?map=x&SERVICE=WMS");
  });

  it("suggests positions only near home", () => {
    expect(suggestedPosition({ latitude: 52.4001, longitude: 13.0601 }, POTSDAM)).toEqual({
      x: 6.8,
      y: -11.1,
    });
    expect(suggestedPosition({ latitude: 48.1, longitude: 11.5 }, POTSDAM)).toBeNull();
    expect(suggestedPosition(null, POTSDAM)).toBeNull();
    expect(suggestedPosition({ latitude: 52.4, longitude: 13.06 }, null)).toBeNull();
  });
});

describe("markers", () => {
  it("formats values", () => {
    expect(markerValue(entity("sensor.z", "73.456", { unit_of_measurement: "%" }), "de", de)).toBe(
      "73,5 %",
    );
    expect(markerValue(entity("switch.v", "on"), "de", de)).toBe("An");
    expect(markerValue(entity("lawn_mower.m", "mowing"), "de", de)).toBe("Mäht");
    expect(markerValue(entity("sensor.x", "unavailable"), "de", de)).toBe("–");
    expect(markerValue(undefined, "de", de)).toBe("–");
    expect(markerValue(entity("sensor.text", "Regen erwartet"), "de", de)).toBe("Regen erwartet");
  });

  it("picks icons by device class, domain and name", () => {
    expect(
      markerIcon("sensor.boden", entity("sensor.boden", "1", { device_class: "moisture" })),
    ).toBe(mdiWaterPercent);
    expect(markerIcon("lawn_mower.navimow", undefined)).toBe(mdiRobotMower);
    expect(markerIcon("sensor.something", undefined)).toBe(mdiGauge);
  });

  it("ranks garden-relevant entities first and filters", () => {
    const states = {
      "light.kueche": entity("light.kueche", "on", { friendly_name: "Küche" }),
      "sensor.zisterne": entity("sensor.zisterne", "70", { friendly_name: "Zisterne" }),
      "lawn_mower.navimow": entity("lawn_mower.navimow", "docked", { friendly_name: "Mäher" }),
    };
    expect(rankEntities(states, "").map((s) => s.entity_id)).toEqual([
      "sensor.zisterne",
      "lawn_mower.navimow",
      "light.kueche",
    ]);
    expect(rankEntities(states, "zist").map((s) => s.entity_id)).toEqual(["sensor.zisterne"]);
    expect(rankEntities(states, "", ["todo"])).toEqual([]);
  });
});

describe("import and calibration", () => {
  it("guesses categories from names", () => {
    expect(guessCategory("Rasen")).toBe("lawn");
    expect(guessCategory("Hecke")).toBe("hedge");
    expect(guessCategory("Bäume hinten")).toBe("tree");
    expect(guessCategory("Bonsai")).toBe("potted");
    expect(guessCategory("Beet")).toBe("other");
    expect(guessCategory("Tomaten")).toBe("vegetable");
  });

  it("scales an image background about the first calibration point", () => {
    const bg = {
      type: "image" as const,
      image_id: "X",
      width_px: 1000,
      height_px: 500,
      x: -10,
      y: -5,
      width_m: 20,
      rotation: 0,
      opacity: 0.8,
    };
    // two points 5 m apart on the plan are really 10 m apart
    const result = calibrateBackground(bg, { x: 0, y: 0 }, { x: 5, y: 0 }, 10);
    expect(result.width_m).toBe(40);
    expect([result.x, result.y]).toEqual([-20, -10]);
    expect(result.rotation).toBe(0);
  });

  it("draws sparklines", () => {
    expect(sparklinePath([], 100, 20)).toBe("");
    expect(
      sparklinePath(
        [
          [0, 1],
          [10, 1],
        ],
        100,
        20,
      ),
    ).toBe("M0.0,10.0 L100.0,10.0");
    expect(
      sparklinePath(
        [
          [0, 0],
          [10, 10],
        ],
        100,
        20,
      ),
    ).toBe("M0.0,18.0 L100.0,2.0");
  });
});
