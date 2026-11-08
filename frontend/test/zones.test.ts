// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Irrigation, Shape } from "../src/api/types";
import type { PgGardenCanvas } from "../src/components/garden-canvas";
import type { PgEntityPicker } from "../src/components/entity-picker";
import { GardenStore } from "../src/state/garden-store";
import "../src/views/garden-view";
import type { PgGardenView } from "../src/views/garden-view";
import { deepGet, deepQuery, deepText, fakeBackend, makePlant, type FakeBackend } from "./fixtures";

const SETTINGS: Irrigation = {
  entity_id: "switch.regner",
  timer_entity_id: "timer.regner",
  meter_entity_id: null,
  emitter: "rotor",
  rate_mm_h: 10,
  flow_l_min: null,
  drip_l_h: null,
  efficiency: null,
  include: [],
  exclude: [],
};

const ZONE: Shape = {
  id: "01JZONE00000000000000000AA",
  kind: "zone",
  geometry: { type: "rect", cx: 0, cy: 0, w: 4, h: 4, rotation: 0 },
  label: "Rasen",
  plant_id: null,
  soil_type: null,
  locked: false,
  z: 7,
  irrigation: SETTINGS,
};

const ROSE = makePlant({ id: "R", name: "Rose", position: { x: 0, y: 0 }, crown_diameter_m: 1 });
const FAR = makePlant({ id: "F", name: "Feige", position: { x: 9, y: 9 }, crown_diameter_m: 1 });

async function mount(backend: FakeBackend): Promise<PgGardenView> {
  const store = new GardenStore(() => backend.hass);
  await store.refresh();
  const view = document.createElement("pg-garden-view") as PgGardenView;
  view.hass = backend.hass;
  view.store = store;
  document.body.append(view);
  await view.updateComplete;
  await canvasOf(view).updateComplete;
  return view;
}

const canvasOf = (view: PgGardenView) => deepGet<PgGardenCanvas>(view, "pg-garden-canvas");

async function select(view: PgGardenView, id: string): Promise<void> {
  canvasOf(view).dispatchEvent(
    new CustomEvent("select", { detail: { selection: { type: "shape", id } } }),
  );
  await view.updateComplete;
  await canvasOf(view).updateComplete;
}

async function clickButton(view: PgGardenView, label: string): Promise<void> {
  const button = [...(view.shadowRoot?.querySelectorAll("button") ?? [])].find(
    (b) => b.getAttribute("title") === label || b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`no button ${label}`);
  button.click();
  await view.updateComplete;
}

const savedShapes = (backend: FakeBackend) =>
  backend.callWS.mock.calls
    .map(([msg]) => msg as { type: string; shape?: Shape })
    .filter((msg) => msg.type === "plant_garden/layout/shapes/save")
    .map((msg) => msg.shape as Shape);

beforeEach(() => {
  localStorage.setItem("plant-garden.viewport.v1", JSON.stringify({ cx: 0, cy: 0, width: 40 }));
});

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.useRealTimers();
});

describe("irrigation zones on the plan", () => {
  it("draws zones in their own layer, animated while the valve is open", async () => {
    const states = {
      "switch.regner": { entity_id: "switch.regner", state: "on", attributes: {} },
      "timer.regner": {
        entity_id: "timer.regner",
        state: "active",
        attributes: { finishes_at: new Date(Date.now() + 12 * 60000 - 1000).toISOString() },
      },
    };
    const backend = fakeBackend({ shapes: [ZONE], plants: [ROSE, FAR], states });
    const view = await mount(backend);
    const zone = deepGet<SVGGElement>(canvasOf(view), ".zones .zone");
    expect(zone.classList.contains("running")).toBe(true);
    expect(deepQuery(canvasOf(view), ".shapes .zone")).toBeNull();
    expect(zone.textContent).toContain("Rasen · noch 12 min");

    // the layer can be hidden (remembered per device)
    await clickButton(view, "Bewässerungszonen anzeigen");
    expect(deepQuery(canvasOf(view), ".zones .zone")).toBeNull();
    expect(localStorage.getItem("plant-garden.zones.v1")).toBe("false");
  });

  it("shows run time, water and the reached plants in view mode", async () => {
    const backend = fakeBackend({
      shapes: [ZONE],
      plants: [ROSE, FAR],
      states: { "switch.regner": { entity_id: "switch.regner", state: "off", attributes: {} } },
      irrigation: {
        plants: {
          R: {
            today_l: 2.9,
            today_mm: 3.75,
            total_l: 12,
            last_watering: new Date().toISOString(),
            days: [],
          },
        },
        zones: {
          [ZONE.id]: {
            runtime_today_s: 1800,
            liters_today: 80,
            last_run: new Date().toISOString(),
            running_since: null,
          },
        },
      },
    });
    const view = await mount(backend);
    await select(view, ZONE.id);
    const card = deepText(deepGet(view, ".zone-card"));
    expect(card).toContain("Heute 30 min · 80 L");
    expect(card).toContain("Versenkregner · 10 mm/h");
    expect(card).toContain("Bewässert Rose");
    expect(card).not.toContain("Feige");
    // the reached plant gets a water ring
    expect(deepGet(canvasOf(view), '[data-plant-id="R"]').classList.contains("covered")).toBe(true);
    expect(deepGet(canvasOf(view), '[data-plant-id="F"]').classList.contains("covered")).toBe(
      false,
    );

    // the plant card tells when it was watered
    canvasOf(view).dispatchEvent(
      new CustomEvent("select", { detail: { selection: { type: "plant", id: "R" } } }),
    );
    await view.updateComplete;
    expect(deepText(deepGet(view, ".water-facts"))).toContain("heute 2,9 L");
  });

  it("creates zones and edits their settings", async () => {
    const backend = fakeBackend({ plants: [ROSE, FAR] });
    const view = await mount(backend);
    await clickButton(view, "Bearbeiten");
    await clickButton(view, "Rechteck");
    const kind = deepGet<HTMLSelectElement>(view, ".toolbar select");
    kind.value = "zone";
    kind.dispatchEvent(new Event("change"));
    canvasOf(view).dispatchEvent(
      new CustomEvent("create-shape", { detail: { geometry: ZONE.geometry } }),
    );
    await vi.waitFor(() => expect(savedShapes(backend)).toHaveLength(1));
    const created = savedShapes(backend)[0] as Shape;
    expect(created.kind).toBe("zone");
    expect(created.irrigation?.emitter).toBe("spray");
    await view.updateComplete;
    expect(deepText(view)).toContain("Erreicht 1 Pflanzen");

    // rate and emitter
    const inputs = [...(view.shadowRoot?.querySelectorAll<HTMLInputElement>(".props input") ?? [])];
    const rate = inputs.find((input) => input.closest("label")?.textContent?.includes("mm/h"));
    if (!rate) throw new Error("no rate field");
    rate.value = "12,5";
    rate.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(savedShapes(backend)).toHaveLength(2));
    expect(savedShapes(backend)[1]?.irrigation?.rate_mm_h).toBe(12.5);
    await view.updateComplete;
    expect(deepText(view)).toContain("12,5 mm/h über die Zone.");

    // link the valve with the picker (only valves, switches … are offered)
    await clickButton(view, "Auswählen …");
    const picker = deepGet<PgEntityPicker>(view, "pg-entity-picker.zone-picker");
    expect(picker.domains).toEqual(["valve", "switch", "input_boolean", "binary_sensor"]);
    picker.dispatchEvent(
      new CustomEvent("entity-picked", { detail: { entityId: "valve.garten" } }),
    );
    await vi.waitFor(() => expect(savedShapes(backend)).toHaveLength(3));
    expect(savedShapes(backend)[2]?.irrigation?.entity_id).toBe("valve.garten");

    // exclude the reached plant, add the far one by hand
    await view.updateComplete;
    const roseBox = [
      ...(view.shadowRoot?.querySelectorAll<HTMLInputElement>(".zone-plants input") ?? []),
    ][0];
    if (!roseBox) throw new Error("no plant checkbox");
    roseBox.checked = false;
    roseBox.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(savedShapes(backend)).toHaveLength(4));
    expect(savedShapes(backend)[3]?.irrigation?.exclude).toEqual(["R"]);
    await view.updateComplete;
    const add = deepGet<HTMLSelectElement>(view, "select.add-plant");
    add.value = "F";
    add.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(savedShapes(backend)).toHaveLength(5));
    expect(savedShapes(backend)[4]?.irrigation?.include).toEqual(["F"]);

    // turning the zone into a bed drops the irrigation settings
    await view.updateComplete;
    const kindSelect = [
      ...(view.shadowRoot?.querySelectorAll<HTMLSelectElement>(".props select") ?? []),
    ][0];
    if (!kindSelect) throw new Error("no kind select");
    kindSelect.value = "bed";
    kindSelect.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(savedShapes(backend)).toHaveLength(6));
    expect(savedShapes(backend)[5]?.irrigation).toBeNull();
  });
});
