import { describe, expect, it } from "vitest";

import type { Measurement, Photo, Plant } from "../src/api/types";
import { createLocalize } from "../src/i18n";
import { buildChart, niceStep, pathOf, PADDING } from "../src/util/chart";
import { formatAge, formatLength, monthKey, parseLocalDate, todayIso } from "../src/util/format";
import { scaledSize } from "../src/util/image";
import { tagLabel, toggleTag } from "../src/util/tags";
import { canPickSeveralFiles } from "../src/util/upload";
import { groupByMonth } from "../src/views/plant-detail";
import { matchesQuery } from "../src/views/plants-view";
import { makePhoto, makePlant } from "./fixtures";

const de = createLocalize("de");
const en = createLocalize("en");

describe("format", () => {
  it("parses ISO dates as local dates", () => {
    const date = parseLocalDate("2026-06-01");
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 5, 1]);
  });

  it("formats today in the local time zone", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("formats ages", () => {
    expect(formatAge(null, de)).toBe("");
    expect(formatAge(0, de)).toBe("unter einem Monat");
    expect(formatAge(1, de)).toBe("1 Monat");
    expect(formatAge(12, de)).toBe("1 Jahr");
    expect(formatAge(38, de)).toBe("3 Jahre, 2 Monate");
    expect(formatAge(25, en)).toBe("2 years, 1 month");
  });

  it("formats lengths in cm and m", () => {
    expect(formatLength(null, "de")).toBe("");
    expect(formatLength(42.5, "de")).toBe("42,5 cm");
    expect(formatLength(150, "en")).toBe("1.5 m");
  });

  it("groups by local month", () => {
    expect(monthKey(new Date(2026, 5, 30, 23).toISOString())).toBe("2026-06");
  });
});

describe("image", () => {
  it("keeps small images and shrinks the long edge to the limit", () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(scaledSize(4000, 3000)).toEqual({ width: 2560, height: 1920 });
    expect(scaledSize(3000, 4000)).toEqual({ width: 1920, height: 2560 });
  });

  it("picks one photo at a time in the Android app before 2026.11.1", () => {
    const chrome =
      "Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro Fold) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
    const app = (version: string) =>
      `${chrome} Home Assistant/${version} (Android 16; Pixel 10 Pro Fold)`;
    expect(canPickSeveralFiles(chrome)).toBe(true);
    expect(canPickSeveralFiles(app("2026.10.1-full"))).toBe(false);
    expect(canPickSeveralFiles(app("2025.12.3-minimal"))).toBe(false);
    expect(canPickSeveralFiles(app("2026.11.0-full"))).toBe(false);
    expect(canPickSeveralFiles(app("2026.11.1-full"))).toBe(true);
    expect(canPickSeveralFiles(app("2026.12.1-full"))).toBe(true);
    expect(canPickSeveralFiles(app("2027.1.0"))).toBe(true);
    // the iOS app picks several files fine
    expect(
      canPickSeveralFiles(
        "Mozilla/5.0 (iPhone) Home Assistant/2026.10 (io.robbie.HomeAssistant; build:1; iOS 26.0)",
      ),
    ).toBe(true);
    expect(canPickSeveralFiles("")).toBe(true);
  });
});

describe("tags", () => {
  it("translates preset tags and keeps custom ones", () => {
    expect(tagLabel("problem", de)).toBe("Problem");
    expect(tagLabel("flowering", de)).toBe("Blüte");
    expect(tagLabel("Rosenbeet", de)).toBe("Rosenbeet");
  });

  it("toggles", () => {
    expect(toggleTag(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleTag(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("chart", () => {
  it("picks round tick steps", () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(37)).toBe(10);
    expect(niceStep(80)).toBe(20);
    expect(niceStep(150)).toBe(50);
    expect(niceStep(1200)).toBe(500);
  });

  const m = (id: string, date: string, height: number | null, width: number | null) =>
    ({ id, measured_on: date, height_cm: height, width_cm: width }) as Measurement;

  it("maps measurements to coordinates", () => {
    const model = buildChart(
      [m("b", "2026-07-01", 80, null), m("a", "2026-05-01", 40, 30)],
      400,
      200,
    );
    expect(model.height.map((p) => p.value)).toEqual([40, 80]);
    expect(model.width.map((p) => p.value)).toEqual([30]);
    expect(model.height[0]?.x).toBe(PADDING.left);
    expect(model.height[1]?.x).toBe(400 - PADDING.right);
    expect(model.ticks.at(-1)?.value).toBe(80);
    expect(model.height[1]?.y).toBe(PADDING.top);
    expect(model.first).toBe("2026-05-01");
    expect(model.last).toBe("2026-07-01");
    expect(pathOf(model.height)).toMatch(/^M48\.0,\d+\.\d L384\.0,12\.0$/);
  });

  it("centres a single measurement", () => {
    const model = buildChart([m("a", "2026-05-01", 40, null)], 400, 200);
    expect(model.height[0]?.x).toBe(PADDING.left + (400 - PADDING.left - PADDING.right) / 2);
    expect(model.last).toBeNull();
  });
});

describe("views", () => {
  it("searches name, botanical name, variety and tags", () => {
    const plant: Plant = makePlant({
      name: "Hortensie",
      scientific_name: "Hydrangea macrophylla",
      variety: "Endless Summer",
      tags: ["Beet Süd"],
    });
    expect(matchesQuery(plant, "")).toBe(true);
    expect(matchesQuery(plant, "hydrangea")).toBe(true);
    expect(matchesQuery(plant, "SUMMER")).toBe(true);
    expect(matchesQuery(plant, "süd")).toBe(true);
    expect(matchesQuery(plant, "rose")).toBe(false);
  });

  it("groups photos by month, keeping the order", () => {
    const photos: Photo[] = [
      makePhoto("c", new Date(2026, 6, 2).toISOString()),
      makePhoto("b", new Date(2026, 5, 20).toISOString()),
      makePhoto("a", new Date(2026, 5, 1).toISOString()),
    ];
    expect(groupByMonth(photos).map((g) => [g.key, g.photos.map((p) => p.id)])).toEqual([
      ["2026-07", ["c"]],
      ["2026-06", ["b", "a"]],
    ]);
  });
});
