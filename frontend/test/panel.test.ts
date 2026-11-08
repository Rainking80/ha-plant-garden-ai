// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/main";
import type { GardenInfo } from "../src/api/client";
import type { PlantGardenPanel } from "../src/panel";
import type { HomeAssistant, PanelInfo, PlantGardenPanelConfig } from "../src/types/hass";

const INFO: GardenInfo = {
  entry_id: "abc",
  garden_name: "Schrebergarten",
  version: "0.1.0",
  is_admin: true,
};

const PANEL: PanelInfo<PlantGardenPanelConfig> = {
  component_name: "custom",
  config: { entry_id: "abc" },
  icon: "mdi:flower",
  title: "Schrebergarten",
  url_path: "plant-garden",
};

function fakeHass(callWS: HomeAssistant["callWS"], overrides: Partial<HomeAssistant> = {}) {
  return {
    callWS,
    language: "de",
    locale: { language: "de" },
    themes: { darkMode: false },
    states: {},
    ...overrides,
  } as unknown as HomeAssistant;
}

async function mount(hass: HomeAssistant, narrow = false): Promise<PlantGardenPanel> {
  const el = document.createElement("plant-garden-panel") as PlantGardenPanel;
  el.hass = hass;
  el.narrow = narrow;
  el.panel = PANEL;
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const text = (el: PlantGardenPanel) => el.shadowRoot?.textContent ?? "";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("plant-garden-panel", () => {
  it("is registered as a custom element", () => {
    expect(customElements.get("plant-garden-panel")).toBeDefined();
  });

  it("loads the garden info once and renders the welcome page", async () => {
    const callWS = vi.fn().mockResolvedValue(INFO);
    const hass = fakeHass(callWS);
    const el = await mount(hass);

    await vi.waitFor(() => expect(text(el)).toContain("Willkommen in Schrebergarten"));
    expect(text(el)).toContain("Version 0.1.0");
    expect(callWS).toHaveBeenCalledWith({ type: "plant_garden/info" });

    // HA hands over a new hass object on every state change: no refetch.
    el.hass = fakeHass(callWS);
    await el.updateComplete;
    expect(callWS).toHaveBeenCalledTimes(1);
  });

  it("follows the HA language", async () => {
    const el = await mount(
      fakeHass(vi.fn().mockResolvedValue(INFO), { language: "en", locale: { language: "en" } }),
    );
    await vi.waitFor(() => expect(text(el)).toContain("Welcome to Schrebergarten"));
  });

  it("shows an error with a working retry button", async () => {
    const callWS = vi
      .fn()
      .mockRejectedValueOnce({ code: "not_loaded", message: "Plant Garden is not set up" })
      .mockResolvedValueOnce(INFO);
    const el = await mount(fakeHass(callWS));

    await vi.waitFor(() => expect(text(el)).toContain("Plant Garden is not set up"));
    el.shadowRoot?.querySelector<HTMLButtonElement>(".state .button")?.click();
    await vi.waitFor(() => expect(text(el)).toContain("Willkommen in Schrebergarten"));
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it("offers the sidebar toggle only in narrow mode", async () => {
    const wide = await mount(fakeHass(vi.fn().mockResolvedValue(INFO)));
    expect(wide.shadowRoot?.querySelector(".icon-button")).toBeNull();

    const narrow = await mount(fakeHass(vi.fn().mockResolvedValue(INFO)), true);
    const toggled = vi.fn();
    document.body.addEventListener("hass-toggle-menu", toggled);
    narrow.shadowRoot?.querySelector<HTMLButtonElement>(".icon-button")?.click();
    expect(toggled).toHaveBeenCalledTimes(1);
  });

  it("switches to the dark palette with the HA theme", async () => {
    const el = await mount(
      fakeHass(vi.fn().mockResolvedValue(INFO), { themes: { darkMode: true } }),
    );
    expect(el.hasAttribute("dark")).toBe(true);
  });
});
