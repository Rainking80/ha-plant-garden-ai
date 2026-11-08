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
    expect(backend.callWS).toHaveBeenCalledTimes(1);
    expect(store.stale).toBe(false);
    store.lastRefresh = Date.now() - STALE_AFTER_MS - 1;
    expect(store.stale).toBe(true);
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
