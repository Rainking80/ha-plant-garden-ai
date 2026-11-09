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
  flow_l_h_m: null,
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
    (b) =>
      b.getAttribute("title") === label ||
      b.getAttribute("aria-label") === label ||
      b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`no button ${label}`);
  button.click();
  await view.updateComplete;
}

/** A pointer event on the plan (or on an element in it) at screen coordinates. */
async function pointer(
  view: PgGardenView,
  type: string,
  x: number,
  y: number,
  target: Element = deepGet<SVGSVGElement>(canvasOf(view), "svg"),
): Promise<void> {
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      bubbles: true,
      composed: true,
    }),
  );
  await view.updateComplete;
  await canvasOf(view).updateComplete;
}

/** Drag a handle of the selected shape to a screen position. */
async function dragHandle(view: PgGardenView, handle: string, to: [number, number]) {
  const element = deepGet<SVGGElement>(canvasOf(view), `[data-handle="${handle}"]`);
  // where the handle is: its translate(x y) in plan metres, 20 px per metre around (400, 300)
  const [, x = "0", y = "0"] =
    /translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(element.getAttribute("transform") ?? "") ?? [];
  const sx = 400 + Number(x) * 20;
  const sy = 300 + Number(y) * 20;
  await pointer(view, "pointerdown", sx, sy, element);
  await pointer(view, "pointermove", (sx + to[0]) / 2, (sy + to[1]) / 2);
  await pointer(view, "pointermove", to[0], to[1]);
  await pointer(view, "pointerup", to[0], to[1]);
}

/** The input of a settings field by its label. */
function fieldInput(view: PgGardenView, label: string): HTMLInputElement {
  const input = [
    ...(view.shadowRoot?.querySelectorAll<HTMLInputElement>(".props input") ?? []),
  ].find(
    (element) => element.closest("label")?.querySelector("span")?.textContent?.trim() === label,
  );
  if (!input) throw new Error(`no field ${label}`);
  return input;
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

  it("has its own button for drawing a zone, which shows the zone layer", async () => {
    localStorage.setItem("plant-garden.zones.v1", "false"); // zones hidden before
    const backend = fakeBackend({ plants: [ROSE] });
    const view = await mount(backend);
    await clickButton(view, "Bearbeiten");
    await clickButton(view, "Bewässerungsfläche");
    expect(deepText(view)).toContain(
      "Ziehe ein Rechteck über die Fläche, die ein Ventil bewässert",
    );
    const kinds = deepGet<HTMLSelectElement>(view, ".toolbar select");
    expect(kinds.querySelector("option[selected]")?.getAttribute("value")).toBe("zone");
    expect(localStorage.getItem("plant-garden.zones.v1")).toBe("true");
    const svg = deepGet<SVGSVGElement>(canvasOf(view), "svg");
    for (const [type, x, y] of [
      ["pointerdown", 380, 280],
      ["pointermove", 440, 340],
      ["pointerup", 440, 340],
    ] as const) {
      svg.dispatchEvent(
        new PointerEvent(type, {
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: "mouse",
          button: 0,
          bubbles: true,
          composed: true,
        }),
      );
    }
    await vi.waitFor(() => expect(savedShapes(backend)).toHaveLength(1));
    expect(savedShapes(backend)[0]).toMatchObject({ kind: "zone", plant_id: null });
    await canvasOf(view).updateComplete;
    expect(deepQuery(canvasOf(view), ".zones .zone")).not.toBeNull();
    // the zone settings open right away, to link the valve
    await view.updateComplete;
    expect(deepText(view)).toContain("Auswählen …");
  });

  it("places a sprinkler with a tap and changes its angle and reach with the handles", async () => {
    const backend = fakeBackend({ plants: [ROSE] });
    const view = await mount(backend);
    await clickButton(view, "Bearbeiten");
    await clickButton(view, "Rasensprenger (mit Winkel)");
    expect(deepText(view)).toContain("Tippe, wo der Rasensprenger steht");
    // the view shows 40 m on 800 px around (0, 0): 20 px per metre, (0, 0) at (400, 300)
    await pointer(view, "pointerdown", 400, 300);
    await pointer(view, "pointerup", 400, 300);
    await vi.waitFor(() => expect(savedShapes(backend)).toHaveLength(1));
    const created = savedShapes(backend)[0] as Shape;
    expect(created.kind).toBe("zone");
    expect(created.geometry).toEqual({
      type: "sector",
      cx: 0,
      cy: 0,
      r: 4,
      start: 337.5,
      sweep: 45, // pointing north
    });
    expect(created.irrigation?.emitter).toBe("rotor");
    await view.updateComplete;
    await canvasOf(view).updateComplete;
    expect(deepQuery(canvasOf(view), ".zones .zone .head")).not.toBeNull();
    expect(deepText(view)).toContain("Ziehe die beiden Punkte an den Enden des Bogens");

    // the end of the arc to the east: 112.5° wide
    await dragHandle(view, "arc:end", [480, 300]);
    await vi.waitFor(() => expect(savedShapes(backend)).toHaveLength(2));
    expect(savedShapes(backend)[1]?.geometry).toMatchObject({ start: 337.5, sweep: 112.5 });

    // the middle of the arc: 6 m to the south, same angle
    await dragHandle(view, "reach", [400, 420]);
    await vi.waitFor(() => expect(savedShapes(backend)).toHaveLength(3));
    expect(savedShapes(backend)[2]?.geometry).toMatchObject({
      r: 6,
      start: 123.75,
      sweep: 112.5,
    });

    // or as numbers: a narrower arc around the same direction
    const sweep = fieldInput(view, "Winkel (°)");
    sweep.value = "90";
    sweep.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(savedShapes(backend)).toHaveLength(4));
    expect(savedShapes(backend)[3]?.geometry).toMatchObject({ start: 135, sweep: 90 });
  });

  it("places a circular sprinkler that only has a reach", async () => {
    const backend = fakeBackend({ plants: [ROSE] });
    const view = await mount(backend);
    await clickButton(view, "Bearbeiten");
    await clickButton(view, "Kreisregner");
    await pointer(view, "pointerdown", 400, 300);
    await pointer(view, "pointermove", 460, 300);
    await pointer(view, "pointerup", 460, 300);
    await vi.waitFor(() => expect(savedShapes(backend)).toHaveLength(1));
    expect(savedShapes(backend)[0]?.geometry).toMatchObject({ type: "sector", r: 3, sweep: 360 });
    await view.updateComplete;
    await canvasOf(view).updateComplete;
    expect(deepQuery(canvasOf(view), '[data-handle="arc:start"]')).toBeNull();
    expect(deepQuery(canvasOf(view), '[data-handle="reach"]')).not.toBeNull();
    expect(deepText(view)).not.toContain("Richtung");
  });

  it("lays a drip line point by point and takes its flow per metre", async () => {
    const backend = fakeBackend({ plants: [ROSE] });
    const view = await mount(backend);
    await clickButton(view, "Bearbeiten");
    await clickButton(view, "Tropfschlauch");
    for (const [x, y] of [
      [400, 300],
      [460, 300],
      [460, 360],
      [460, 360], // the last point again ends the hose
    ] as const) {
      await pointer(view, "pointerdown", x, y);
      await pointer(view, "pointerup", x, y);
    }
    await vi.waitFor(() => expect(savedShapes(backend)).toHaveLength(1));
    const created = savedShapes(backend)[0] as Shape;
    expect(created.geometry).toEqual({
      type: "line",
      points: [
        [0, 0],
        [3, 0],
        [3, 3],
      ],
      width: 0.4,
    });
    expect(created.irrigation?.emitter).toBe("drip_line");
    await view.updateComplete;
    await canvasOf(view).updateComplete;
    expect(deepQuery(canvasOf(view), ".zones .zone .pipe")).not.toBeNull();
    expect(deepText(view)).toContain("Länge 6 m");
    // the double click that ended the hose does not remove the point now under it
    deepGet(canvasOf(view), '[data-handle="vertex:2"]').dispatchEvent(
      new MouseEvent("dblclick", { clientX: 460, clientY: 360, bubbles: true, composed: true }),
    );
    await view.updateComplete;
    expect(savedShapes(backend)).toHaveLength(1);

    const flow = fieldInput(view, "L/h je Meter");
    flow.value = "5";
    flow.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(savedShapes(backend)).toHaveLength(2));
    expect(savedShapes(backend)[1]?.irrigation?.flow_l_h_m).toBe(5);
    await view.updateComplete;
    expect(deepText(view)).toContain("12,5 mm/h über die Zone."); // 5 L/h per m over 0.4 m

    // the last point moves
    await dragHandle(view, "vertex:2", [520, 360]);
    await vi.waitFor(() => expect(savedShapes(backend)).toHaveLength(3));
    expect(savedShapes(backend)[2]?.geometry).toMatchObject({
      points: [
        [0, 0],
        [3, 0],
        [6, 3],
      ],
    });
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
