// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/main";
import { parseRoute, type PlantGardenPanel } from "../src/panel";
import type { PanelInfo, PlantGardenPanelConfig } from "../src/types/hass";
import {
  deepGet,
  deepQuery,
  deepText,
  fakeBackend,
  makePhoto,
  makePlant,
  type FakeBackend,
} from "./fixtures";

const PANEL: PanelInfo<PlantGardenPanelConfig> = {
  component_name: "custom",
  config: { entry_id: "e" },
  icon: "mdi:flower",
  title: "Schrebergarten",
  url_path: "plant-garden",
};

async function mount(backend: FakeBackend, path = "", narrow = false): Promise<PlantGardenPanel> {
  const el = document.createElement("plant-garden-panel") as PlantGardenPanel;
  el.hass = backend.hass;
  el.narrow = narrow;
  el.panel = PANEL;
  el.route = { prefix: "/plant-garden", path };
  document.body.append(el);
  await el.updateComplete;
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("parseRoute", () => {
  it("maps paths to views", () => {
    expect(parseRoute("")).toEqual({ name: "plan", focusPlantId: null });
    expect(parseRoute(undefined)).toEqual({ name: "plan", focusPlantId: null });
    expect(parseRoute("/plan/01JABC")).toEqual({ name: "plan", focusPlantId: "01JABC" });
    expect(parseRoute("/plants")).toEqual({ name: "plants" });
    expect(parseRoute("/plants/")).toEqual({ name: "plants" });
    expect(parseRoute("/plants/01JABC")).toEqual({ name: "plant", plantId: "01JABC" });
    expect(parseRoute("/plants/01JABC/")).toEqual({ name: "plant", plantId: "01JABC" });
    expect(parseRoute("/plants/../x")).toEqual({ name: "plan", focusPlantId: null });
    expect(parseRoute("/water")).toEqual({ name: "water" });
    expect(parseRoute("/tech/")).toEqual({ name: "tech" });
  });
});

describe("plant-garden-panel", () => {
  it("is registered as a custom element", () => {
    expect(customElements.get("plant-garden-panel")).toBeDefined();
  });

  it("opens with the garden plan and offers tabs", async () => {
    const el = await mount(fakeBackend());
    await vi.waitFor(() => expect(deepQuery(el, "pg-garden-canvas")).not.toBeNull());
    const tabs = [...(el.shadowRoot?.querySelectorAll(".tabs a") ?? [])];
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      "Gartenplan",
      "Pflanzen",
      "Aufgaben",
      "Assistent",
      "Wasser & Wetter",
      "Technik",
    ]);
    expect(tabs[0]?.getAttribute("aria-current")).toBe("page");
  });

  it("shows the tech page to admins only", async () => {
    const user = await mount(fakeBackend({ isAdmin: false }), "/tech");
    await vi.waitFor(() => expect(user.shadowRoot?.querySelectorAll(".tabs a")).toHaveLength(5));
    expect(deepQuery(user, "pg-tech-view")).toBeNull();
    document.body.innerHTML = "";

    const admin = await mount(fakeBackend(), "/tech");
    await vi.waitFor(() => expect(deepText(admin)).toContain("KI-Nutzung und System"));
    expect(deepText(admin)).toContain("Noch keine KI-Anfragen.");
    expect(deepText(admin)).toContain("0,00 EUR");
    expect(deepText(admin)).toContain("keine eingerichtet");
    expect(deepText(admin)).not.toContain("Aufteilung");
  });

  it("welcomes a new garden with an empty state", async () => {
    const el = await mount(fakeBackend(), "/plants");
    await vi.waitFor(() => expect(deepText(el)).toContain("Willkommen in Schrebergarten"));
    expect(deepText(el)).toContain("Pflanze hinzufügen");
  });

  it("lists plants, filters by search and follows the HA language", async () => {
    const backend = fakeBackend({
      language: "en",
      plants: [
        makePlant({ id: "A", name: "Hortensie", age_months_now: 26, photo_count: 3 }),
        makePlant({ id: "B", name: "Rose", status: "problem" }),
      ],
    });
    const el = await mount(backend, "/plants");
    await vi.waitFor(() => expect(deepText(el)).toContain("Rose"));
    expect(deepText(el)).toContain("2 years, 2 months");
    expect(deepText(el)).toContain("3 photos");

    const search = deepGet<HTMLInputElement>(el, "input[type=search]");
    search.value = "rose";
    search.dispatchEvent(new Event("input"));
    await vi.waitFor(() => expect(deepText(el)).not.toContain("Hortensie"));
  });

  it("updates the list when another client changes a plant", async () => {
    const backend = fakeBackend({ plants: [makePlant({ id: "A", name: "Hortensie" })] });
    const el = await mount(backend, "/plants");
    await vi.waitFor(() => expect(deepText(el)).toContain("Hortensie"));
    backend.plants = [...backend.plants, makePlant({ id: "B", name: "Lavendel" })];
    backend.emit({ kind: "plant", plant_id: "B" });
    await vi.waitFor(() => expect(deepText(el)).toContain("Lavendel"));
  });

  it("navigates to a plant when its card is clicked", async () => {
    const backend = fakeBackend({ plants: [makePlant({ id: "A1", name: "Hortensie" })] });
    const el = await mount(backend, "/plants");
    await vi.waitFor(() => expect(deepQuery(el, "a.card")).not.toBeNull());
    const changed = vi.fn();
    window.addEventListener("location-changed", changed);
    deepGet<HTMLAnchorElement>(el, "a.card").click();
    expect(window.location.pathname).toBe("/plant-garden/plants/A1");
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener("location-changed", changed);
  });

  it("shows the detail view with facts, growth and photos", async () => {
    const plant = makePlant({
      id: "A1",
      name: "Hortensie",
      scientific_name: "Hydrangea macrophylla",
      light: "partial_shade",
      age_months_now: 14,
      height_cm: 80,
      care_prune: "Nach der Blüte auslichten",
      photo_count: 2,
      cover: { id: "P2", urls: makePhoto("P2", "2026-07-01T10:00:00Z").urls },
      sources: {
        light: { source: "ai", confidence: 0.82, model: "x", updated_at: "2026-06-01T00:00:00Z" },
        care_prune: {
          source: "ai",
          confidence: 0.7,
          model: "x",
          updated_at: "2026-06-01T00:00:00Z",
        },
      },
    });
    const backend = fakeBackend({
      plants: [plant],
      details: {
        A1: {
          plant,
          photos: [
            makePhoto("P2", "2026-07-01T10:00:00Z", { tags: ["problem"] }),
            makePhoto("P1", "2026-06-01T10:00:00Z"),
          ],
          measurements: [
            {
              id: "M1",
              plant_id: "A1",
              measured_on: "2026-06-01",
              height_cm: 80,
              width_cm: 60,
              source: "user",
              confidence: null,
              photo_id: null,
              note: "",
            },
          ],
        },
      },
    });
    const el = await mount(backend, "/plants/A1");
    await vi.waitFor(() => expect(deepText(el)).toContain("Hydrangea macrophylla"));
    const text = deepText(el);
    expect(text).toContain("Halbschatten");
    expect(text).toContain("1 Jahr, 2 Monate");
    expect(text).toContain("80 cm");
    expect(text).toContain("Wachstum");
    expect(text).toContain("Pflege Schnitt Nach der Blüte auslichten");
    expect(text).toContain("Problem");
    expect(deepQuery(el, ".source-ai")?.getAttribute("title")).toBe("KI-Vorschlag (82 %)");
    // toolbar shows the plant name and a back button
    expect(el.shadowRoot?.querySelector("h1")?.textContent).toBe("Hortensie");
    expect(el.shadowRoot?.querySelector(".toolbar .icon-button")?.getAttribute("aria-label")).toBe(
      "Zurück",
    );
  });

  it("explains when a plant does not exist", async () => {
    const el = await mount(fakeBackend(), "/plants/GONE");
    await vi.waitFor(() => expect(deepText(el)).toContain("Diese Pflanze gibt es nicht mehr."));
  });

  it("shows an error with a working retry button", async () => {
    const backend = fakeBackend();
    backend.callWS.mockRejectedValueOnce({
      code: "not_loaded",
      message: "Plant Garden is not set up",
    });
    const el = await mount(backend, "/plants");
    await vi.waitFor(() => expect(deepText(el)).toContain("Plant Garden is not set up"));
    el.shadowRoot?.querySelector<HTMLButtonElement>(".state .button")?.click();
    await vi.waitFor(() => expect(deepText(el)).toContain("Willkommen in Schrebergarten"));
  });

  it("offers the sidebar toggle only in narrow mode on the list", async () => {
    const wide = await mount(fakeBackend());
    expect(wide.shadowRoot?.querySelector(".toolbar .icon-button")).toBeNull();

    const narrow = await mount(fakeBackend(), "", true);
    const toggled = vi.fn();
    document.body.addEventListener("hass-toggle-menu", toggled);
    narrow.shadowRoot?.querySelector<HTMLButtonElement>(".toolbar .icon-button")?.click();
    expect(toggled).toHaveBeenCalledTimes(1);
  });

  it("switches to the dark palette with the HA theme", async () => {
    const backend = fakeBackend();
    (backend.hass.themes as { darkMode: boolean }).darkMode = true;
    const el = await mount(backend);
    expect(el.hasAttribute("dark")).toBe(true);
  });
});
