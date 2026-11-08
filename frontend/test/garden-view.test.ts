// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Shape } from "../src/api/types";
import type { PgGardenCanvas } from "../src/components/garden-canvas";
import { GardenStore } from "../src/state/garden-store";
import "../src/views/garden-view";
import type { PgGardenView } from "../src/views/garden-view";
import { deepGet, deepQuery, deepText, fakeBackend, makePlant, type FakeBackend } from "./fixtures";

const BED: Shape = {
  id: "01JSHAPE0000000000000000AA",
  kind: "bed",
  geometry: { type: "rect", cx: 5, cy: 0, w: 4, h: 2, rotation: 0 },
  label: "Beet Süd",
  plant_id: null,
  soil_type: null,
  locked: false,
  z: -2,
};

async function mount(backend: FakeBackend): Promise<{ view: PgGardenView; store: GardenStore }> {
  const store = new GardenStore(() => backend.hass);
  await store.refresh();
  const view = document.createElement("pg-garden-view") as PgGardenView;
  view.hass = backend.hass;
  view.store = store;
  document.body.append(view);
  await view.updateComplete;
  const canvas = canvasOf(view);
  await canvas.updateComplete;
  return { view, store };
}

const canvasOf = (view: PgGardenView) => deepGet<PgGardenCanvas>(view, "pg-garden-canvas");

function pointer(type: string, target: Element, x: number, y: number, pointerType = "mouse") {
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType,
      button: 0,
      bubbles: true,
      composed: true,
    }),
  );
}

const calls = (backend: FakeBackend, type: string) =>
  backend.callWS.mock.calls
    .map(([msg]) => msg as Record<string, unknown> & { type: string })
    .filter((msg) => msg.type === type);

/** Click a button by title or text, once it is enabled (e.g. undo after a save). */
async function clickButton(view: PgGardenView, label: string): Promise<void> {
  const find = () =>
    [...(view.shadowRoot?.querySelectorAll("button") ?? [])].find(
      (b) => b.getAttribute("title") === label || b.textContent?.trim() === label,
    );
  await vi.waitFor(() => {
    const button = find();
    if (!button) throw new Error(`no button ${label}`);
    expect(button.disabled).toBe(false);
  });
  find()?.click();
  await view.updateComplete;
}

beforeEach(() => {
  // a known viewport: 40 m wide on the 800 px fallback size -> 0.05 m per px,
  // plan (0, 0) at screen (400, 300)
  localStorage.setItem("plant-garden.viewport.v1", JSON.stringify({ cx: 0, cy: 0, width: 40 }));
  localStorage.setItem("plant-garden.snap.v1", JSON.stringify(0.25));
});

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("pg-garden-view", () => {
  it("draws shapes and placed plants only", async () => {
    const backend = fakeBackend({
      plants: [
        makePlant({ id: "A", name: "Rose", position: { x: 0, y: 0 } }),
        makePlant({ id: "B", name: "Minze" }),
      ],
      shapes: [BED],
    });
    const { view } = await mount(backend);
    const canvas = canvasOf(view);
    expect(canvas.shadowRoot?.querySelectorAll("[data-plant-id]")).toHaveLength(1);
    expect(canvas.shadowRoot?.querySelector("[data-shape-id] text")?.textContent).toBe("Beet Süd");
    expect(canvas.viewport).toEqual({ cx: 0, cy: 0, width: 40 });
  });

  it("shows the tray in edit mode and places a plant by tapping", async () => {
    const backend = fakeBackend({ plants: [makePlant({ id: "B", name: "Minze" })] });
    const { view, store } = await mount(backend);
    expect(deepQuery(view, ".tray")).toBeNull();

    await clickButton(view, "Bearbeiten");
    expect(deepText(view)).toContain("Noch nicht im Plan");

    const item = deepGet<HTMLElement>(view, ".tray-item");
    pointer("pointerdown", item, 10, 10);
    pointer("pointerup", window as unknown as Element, 10, 10);
    await view.updateComplete;
    expect(deepText(view)).toContain("Tippe auf den Standort von Minze");

    const svg = deepGet<SVGSVGElement>(canvasOf(view), "svg");
    pointer("pointerdown", svg, 460, 320);
    pointer("pointerup", svg, 460, 320);
    await vi.waitFor(() => expect(calls(backend, "plant_garden/plants/move")).toHaveLength(1));
    // (460, 320) is 3 m east and 1 m south of the centre
    expect(calls(backend, "plant_garden/plants/move")[0]?.moves).toEqual([
      { plant_id: "B", position: { x: 3, y: 1 } },
    ]);
    expect(store.getPlant("B")?.position).toEqual({ x: 3, y: 1 });

    // undo takes it off the plan again
    await clickButton(view, "Rückgängig");
    await vi.waitFor(() => expect(store.getPlant("B")?.position).toBeNull());
    expect(calls(backend, "plant_garden/plants/move")[1]?.moves).toEqual([
      { plant_id: "B", position: null },
    ]);
  });

  it("moves plants only in edit mode, snapped to the grid", async () => {
    const backend = fakeBackend({ plants: [makePlant({ id: "A", position: { x: 0, y: 0 } })] });
    const { view, store } = await mount(backend);
    const canvas = canvasOf(view);
    const plant = () => deepGet<SVGElement>(canvas, '[data-plant-id="A"] .crown');

    // view mode: dragging pans, the plant stays
    pointer("pointerdown", plant(), 400, 300);
    pointer("pointermove", plant(), 440, 300);
    pointer("pointerup", plant(), 440, 300);
    expect(calls(backend, "plant_garden/plants/move")).toHaveLength(0);
    expect(canvas.viewport.cx).toBeCloseTo(-2);

    // edit mode: the same gesture moves the plant (now at screen x = 440)
    canvas.viewport = { cx: 0, cy: 0, width: 40 };
    await clickButton(view, "Bearbeiten");
    pointer("pointerdown", plant(), 400, 300);
    pointer("pointermove", plant(), 431, 300);
    pointer("pointerup", plant(), 431, 300);
    await vi.waitFor(() => expect(store.getPlant("A")?.position).toEqual({ x: 1.5, y: 0 }));
  });

  it("creates, changes and deletes shapes with undo", async () => {
    const backend = fakeBackend({ shapes: [BED] });
    const { view, store } = await mount(backend);
    const canvas = canvasOf(view);
    await clickButton(view, "Bearbeiten");

    canvas.dispatchEvent(
      new CustomEvent("create-shape", {
        detail: { geometry: { type: "circle", cx: 1, cy: 1, r: 2 } },
      }),
    );
    await vi.waitFor(() => expect(store.layout?.shapes).toHaveLength(2));
    const created = calls(backend, "plant_garden/layout/shapes/save")[0]?.shape as Shape;
    expect(created.kind).toBe("bed");
    expect(created.id).toMatch(/^[0-9A-Z]{26}$/);

    canvas.dispatchEvent(
      new CustomEvent("change-shape", {
        detail: {
          shapeId: BED.id,
          from: BED.geometry,
          to: { ...BED.geometry, cx: 7 },
        },
      }),
    );
    await vi.waitFor(() => expect(store.getShape(BED.id)?.geometry).toMatchObject({ cx: 7 }));
    await clickButton(view, "Rückgängig");
    await vi.waitFor(() => expect(store.getShape(BED.id)?.geometry).toMatchObject({ cx: 5 }));

    canvas.dispatchEvent(
      new CustomEvent("select", { detail: { selection: { type: "shape", id: BED.id } } }),
    );
    await view.updateComplete;
    expect(deepText(view)).toContain("Fläche löschen");
    await clickButton(view, "Fläche löschen");
    await vi.waitFor(() => expect(store.getShape(BED.id)).toBeUndefined());
    expect(calls(backend, "plant_garden/layout/shapes/delete")).toHaveLength(1);
    await clickButton(view, "Rückgängig");
    await vi.waitFor(() => expect(store.getShape(BED.id)).toBeDefined());
  });

  it("draws a rectangle by dragging with the rectangle tool", async () => {
    const backend = fakeBackend();
    const { view, store } = await mount(backend);
    await clickButton(view, "Bearbeiten");
    await clickButton(view, "Rechteck");
    const svg = deepGet<SVGSVGElement>(canvasOf(view), "svg");
    pointer("pointerdown", svg, 400, 300);
    pointer("pointermove", svg, 480, 340);
    pointer("pointerup", svg, 480, 340);
    await vi.waitFor(() => expect(store.layout?.shapes).toHaveLength(1));
    expect(store.layout?.shapes[0]?.geometry).toEqual({
      type: "rect",
      cx: 2,
      cy: 1,
      w: 4,
      h: 2,
      rotation: 0,
    });
  });

  it("shows an info card with details for a tapped plant", async () => {
    const backend = fakeBackend({
      plants: [makePlant({ id: "A", name: "Rose", age_months_now: 14, position: { x: 0, y: 0 } })],
    });
    const { view } = await mount(backend);
    const plant = deepGet<SVGElement>(canvasOf(view), '[data-plant-id="A"] .crown');
    pointer("pointerdown", plant, 400, 300, "touch");
    pointer("pointerup", plant, 400, 300, "touch");
    await vi.waitFor(() => expect(deepQuery(view, ".info.pinned")).not.toBeNull());
    expect(deepText(view)).toContain("1 Jahr, 2 Monate");
    expect(deepText(view)).toContain("Details");
  });

  it("reports save errors and rolls back", async () => {
    const backend = fakeBackend({ plants: [makePlant({ id: "A", position: { x: 0, y: 0 } })] });
    const { view, store } = await mount(backend);
    backend.callWS.mockRejectedValueOnce({ code: "unknown_error", message: "offline" });
    canvasOf(view).dispatchEvent(
      new CustomEvent("move-plant", {
        detail: { plantId: "A", from: { x: 0, y: 0 }, to: { x: 5, y: 5 } },
      }),
    );
    await vi.waitFor(() => expect(deepText(view)).toContain("Speichern fehlgeschlagen: offline"));
    expect(store.getPlant("A")?.position).toEqual({ x: 0, y: 0 });
  });
});
