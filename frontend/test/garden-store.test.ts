import { afterEach, describe, expect, it, vi } from "vitest";

import { GardenStore, STALE_AFTER_MS } from "../src/state/garden-store";
import { fakeBackend, makePlant } from "./fixtures";

afterEach(() => {
  vi.useRealTimers();
});

describe("GardenStore", () => {
  it("subscribes, loads and reloads after backend changes", async () => {
    vi.useFakeTimers();
    const backend = fakeBackend({ plants: [makePlant()] });
    const store = new GardenStore(() => backend.hass);
    const changes = vi.fn();
    const plantChanges = vi.fn();
    store.addEventListener("change", changes);
    store.addEventListener("plant-changed", plantChanges);

    await store.connect();
    expect(store.loaded).toBe(true);
    expect(store.plants).toHaveLength(1);
    expect(changes).toHaveBeenCalledTimes(1);

    backend.plants = [makePlant(), makePlant({ id: "B", name: "Rose" })];
    backend.emit({ kind: "plant", plant_id: "B" });
    backend.emit({ kind: "plant", plant_id: "B" }); // debounced into one reload
    expect(plantChanges).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(store.plants.map((p) => p.name)).toEqual(["Hortensie", "Rose"]);
    expect(store.getPlant("B")?.name).toBe("Rose");
    const listCalls = backend.callWS.mock.calls.filter(
      ([msg]) => (msg as { type: string }).type === "plant_garden/plants/list",
    );
    expect(listCalls).toHaveLength(2);

    await store.disconnect();
    backend.emit({ kind: "plant", plant_id: "B" });
    expect(plantChanges).toHaveBeenCalledTimes(2);
  });

  it("shares concurrent refreshes and tracks staleness", async () => {
    const backend = fakeBackend();
    const store = new GardenStore(() => backend.hass);
    expect(store.stale).toBe(true);
    await Promise.all([store.refresh(), store.refresh()]);
    // one refresh = plants + layout
    expect(backend.callWS.mock.calls.map(([msg]) => (msg as { type: string }).type)).toEqual([
      "plant_garden/plants/list",
      "plant_garden/layout/get",
    ]);
    expect(store.layout?.origin).toEqual({ latitude: 52.4, longitude: 13.06 });
    expect(store.stale).toBe(false);
    store.lastRefresh = Date.now() - STALE_AFTER_MS - 1;
    expect(store.stale).toBe(true);
  });

  it("applies optimistic edits and reloads on layout events", async () => {
    vi.useFakeTimers();
    const backend = fakeBackend({ plants: [makePlant({ id: "A" })] });
    const store = new GardenStore(() => backend.hass);
    await store.connect();
    const changes = vi.fn();
    store.addEventListener("change", changes);

    store.patchPlant("A", { position: { x: 1, y: 2 } });
    expect(store.getPlant("A")?.position).toEqual({ x: 1, y: 2 });
    store.putShape({
      id: "S",
      kind: "bed",
      geometry: { type: "circle", cx: 0, cy: 0, r: 1 },
      label: null,
      plant_id: null,
      soil_type: null,
      locked: false,
      z: 0,
    });
    expect(store.getShape("S")).toBeDefined();
    store.removeShape("S");
    expect(store.getShape("S")).toBeUndefined();
    expect(changes).toHaveBeenCalledTimes(3);

    backend.emit({ kind: "layout", shape_id: "S" });
    await vi.advanceTimersByTimeAsync(500);
    expect(changes).toHaveBeenCalledTimes(4);
  });

  it("reports errors", async () => {
    const backend = fakeBackend();
    backend.callWS.mockRejectedValueOnce({ code: "not_loaded", message: "not set up" });
    const store = new GardenStore(() => backend.hass);
    await store.connect();
    expect(store.loaded).toBe(false);
    expect(store.error).toBe("not set up");
    await store.refresh();
    expect(store.loaded).toBe(true);
    expect(store.error).toBeUndefined();
  });
});
