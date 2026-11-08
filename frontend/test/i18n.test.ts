import { describe, expect, it } from "vitest";

import { createLocalize, dictionaryFor } from "../src/i18n";
import { de } from "../src/i18n/de";
import { en } from "../src/i18n/en";

describe("dictionaryFor", () => {
  it("matches the base language of regional codes", () => {
    expect(dictionaryFor("de")).toBe(de);
    expect(dictionaryFor("de-CH")).toBe(de);
    expect(dictionaryFor("DE")).toBe(de);
  });

  it("falls back to English", () => {
    expect(dictionaryFor("fr")).toBe(en);
    expect(dictionaryFor(undefined)).toBe(en);
    expect(dictionaryFor("")).toBe(en);
  });
});

describe("createLocalize", () => {
  it("fills placeholders", () => {
    const t = createLocalize("de");
    expect(t("plants.empty_title", { garden: "Schrebergarten" })).toBe(
      "Willkommen in Schrebergarten",
    );
    expect(t("detail.uploading", { current: 2, total: 5 })).toBe("Lade Foto 2 von 5 hoch …");
  });

  it("keeps unknown placeholders visible instead of dropping them", () => {
    const t = createLocalize("en");
    expect(t("plants.empty_title")).toBe("Welcome to {garden}");
    expect(t("plants.empty_title", { other: 1 })).toBe("Welcome to {garden}");
  });

  it("has the same keys in every language", () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it("uses the same placeholders in every language", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(de[key]), key).toEqual(placeholders(en[key]));
    }
  });
});
