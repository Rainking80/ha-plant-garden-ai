// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/components/garden-walk";
import { placeholderName, type PgGardenWalk } from "../src/components/garden-walk";
import { deepGet, deepText, fakeBackend, makePhoto, type FakeBackend } from "./fixtures";

// the photo of the first plant carries a GPS position 10 m east of the garden's origin
const prepared = vi.hoisted(() => ({
  gps: null as { latitude: number; longitude: number } | null,
}));
vi.mock("../src/util/image", () => ({
  prepareImage: async (file: File) => ({
    blob: file,
    filename: file.name,
    takenAt: "2026-07-01T10:00:00Z",
    gps: prepared.gps,
  }),
}));

const calls = (backend: FakeBackend, type: string) =>
  backend.callWS.mock.calls
    .map(([msg]) => msg as Record<string, unknown> & { type: string })
    .filter((msg) => msg.type === type);

async function mount(backend: FakeBackend): Promise<PgGardenWalk> {
  (backend.hass.fetchWithAuth as ReturnType<typeof vi.fn>).mockImplementation(
    async () =>
      new Response(JSON.stringify(makePhoto("PH1", "2026-07-01T10:00:00Z")), { status: 200 }),
  );
  const walk = document.createElement("pg-garden-walk") as PgGardenWalk;
  walk.hass = backend.hass;
  walk.origin = backend.origin;
  walk.existingNames = ["Neue Pflanze 1", "Rose"];
  document.body.append(walk);
  walk.open();
  await walk.updateComplete;
  return walk;
}

function pick(walk: PgGardenWalk, ...names: string[]): void {
  const input = walk.shadowRoot?.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
  if (!input) throw new Error("no file input");
  Object.defineProperty(input, "files", {
    configurable: true,
    value: names.map((name) => new File(["x"], name, { type: "image/jpeg" })),
  });
  input.dispatchEvent(new Event("change"));
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  prepared.gps = null;
});

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("placeholderName", () => {
  it("takes the next free number", () => {
    expect(placeholderName("Neue Pflanze", [])).toBe("Neue Pflanze 1");
    expect(placeholderName("Neue Pflanze", ["Neue Pflanze 1", "Neue Pflanze 3"])).toBe(
      "Neue Pflanze 2",
    );
    expect(placeholderName("Neue Pflanze", ["Neue Pflanze 1"], 1)).toBe("Neue Pflanze 3");
  });
});

describe("pg-garden-walk", () => {
  it("turns photos into plants, placed by the photo's GPS, without AI", async () => {
    const backend = fakeBackend();
    const walk = await mount(backend);
    await vi.waitFor(() => expect(deepText(walk)).toContain("Ohne KI-Anbieter"));
    expect(walk.shadowRoot?.querySelector('input[type="checkbox"]')).toBeNull();

    // about 10 m east of the garden (52.4 N, 13.06 E)
    prepared.gps = { latitude: 52.4, longitude: 13.060147 };
    pick(walk, "a.jpg", "b.jpg");
    await vi.waitFor(() => expect(deepText(walk)).toContain("2 Pflanzen angelegt"));
    await vi.waitFor(() => expect(deepText(walk)).toContain("Fertig"));
    const created = calls(backend, "plant_garden/plants/create");
    // names that are free: "Neue Pflanze 1" exists already
    expect(created.map((msg) => msg.name)).toEqual(["Neue Pflanze 2", "Neue Pflanze 3"]);
    const position = created[0]?.position as { x: number; y: number };
    expect(position.x).toBeCloseTo(10, 0);
    expect(position.y).toBeCloseTo(0, 0);
    expect(backend.hass.fetchWithAuth).toHaveBeenCalledTimes(2);
    expect(calls(backend, "plant_garden/ai/identify")).toHaveLength(0);
    expect(deepText(walk)).toContain("auf dem Plan");

    const finished = vi.fn();
    walk.addEventListener("walk-finished", finished);
    deepGet<HTMLButtonElement>(walk, ".dialog-actions button").click();
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it("identifies and names the plants when the user switches the AI on", async () => {
    const backend = fakeBackend({
      ai: { status: { available: true, identify: "Claude", plantnet: false, currency: "EUR" } },
    });
    const walk = await mount(backend);
    const check = await vi.waitFor(() => deepGet<HTMLInputElement>(walk, 'input[type="checkbox"]'));
    await vi.waitFor(() => expect(deepText(walk)).toContain("etwa 0,012 EUR pro Foto"));
    // off until the user asks for it; remembered afterwards
    expect(check.checked).toBe(false);
    check.checked = true;
    check.dispatchEvent(new Event("change"));
    expect(localStorage.getItem("plant-garden.walk-identify.v1")).toBe("true");

    pick(walk, "a.jpg");
    await vi.waitFor(() => expect(deepText(walk)).toContain("Bauernhortensie"));
    expect(calls(backend, "plant_garden/ai/identify")[0]).toMatchObject({
      photos: [{ photo_id: "PH1", organ: "auto" }],
      adopt: true,
    });
    const text = deepText(walk);
    expect(text).toContain("Hydrangea macrophylla");
    expect(text).toContain("noch nicht auf dem Plan");
  });

  it("keeps a plant whose identification failed and reports a failed upload", async () => {
    const backend = fakeBackend({
      ai: { status: { available: true, identify: "Claude", plantnet: false, currency: "EUR" } },
    });
    localStorage.setItem("plant-garden.walk-identify.v1", "true");
    const walk = await mount(backend);
    await vi.waitFor(() =>
      expect(deepGet<HTMLInputElement>(walk, 'input[type="checkbox"]').checked).toBe(true),
    );
    const original = backend.callWS.getMockImplementation() as (msg: unknown) => Promise<unknown>;
    backend.callWS.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === "plant_garden/ai/identify") {
        throw { code: "budget_exceeded", message: "Das Budget ist aufgebraucht" };
      }
      return original(msg);
    });
    pick(walk, "a.jpg");
    await vi.waitFor(() => expect(deepText(walk)).toContain("Das Budget ist aufgebraucht"));
    expect(deepText(walk)).toContain("1 Pflanze angelegt");

    (backend.hass.fetchWithAuth as ReturnType<typeof vi.fn>).mockImplementation(
      async () => new Response(JSON.stringify({ message: "kaputt" }), { status: 400 }),
    );
    pick(walk, "b.jpg");
    await vi.waitFor(() =>
      expect(walk.shadowRoot?.querySelectorAll(".items .error-text").length).toBe(2),
    );
  });
});
