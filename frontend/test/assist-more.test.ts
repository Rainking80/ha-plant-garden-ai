// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/components/knowledge-panel";
import "../src/components/photo-compare";
import "../src/components/task-list";
import "../src/components/weather-alerts";
import type { Photo } from "../src/api/types";
import { GardenStore } from "../src/state/garden-store";
import { hedgeCutRestricted } from "../src/util/rules";
import {
  deepGet,
  deepQuery,
  deepText,
  fakeBackend,
  fakeResearch,
  makeComparison,
  makeKnowledge,
  makePlant,
  makeTask,
  type FakeBackend,
} from "./fixtures";

const HEDGE = makePlant({ id: "H", name: "Hainbuche", category: "hedge" });
const ROSE = makePlant({ id: "R", name: "Rose", category: "shrub" });

async function mount<T extends HTMLElement>(
  tag: string,
  backend: FakeBackend,
  props: Record<string, unknown> = {},
): Promise<T> {
  const store = new GardenStore(() => backend.hass);
  await store.refresh();
  const element = document.createElement(tag) as T & { hass: unknown; store: unknown };
  element.hass = backend.hass;
  element.store = store;
  Object.assign(element, props);
  document.body.append(element);
  await (element as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return element;
}

const photo = (id: string, taken: string): Photo => ({
  id,
  plant_id: "R",
  taken_at: taken,
  uploaded_at: taken,
  width: 800,
  height: 600,
  size_bytes: 1000,
  tags: [],
  note: "",
  edit: null,
  urls: {
    thumb: `/thumb/${id}`,
    medium: `/medium/${id}`,
    original: `/original/${id}`,
    source: `/source/${id}`,
  },
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("hedge cutting season (Germany)", () => {
  const prune = (due: string) => makeTask({ kind: "prune", status: "open", due, plant_id: "H" });

  it("applies to hedges from March to September in Germany only", () => {
    expect(hedgeCutRestricted(prune("2026-05-10"), HEDGE, [], "DE")).toBe(true);
    expect(hedgeCutRestricted(prune("2026-10-01"), HEDGE, [], "DE")).toBe(false);
    expect(hedgeCutRestricted(prune("2026-03-01"), HEDGE, [], "DE")).toBe(true);
    expect(hedgeCutRestricted(prune("2026-05-10"), HEDGE, [], "AT")).toBe(false);
    expect(hedgeCutRestricted(prune("2026-05-10"), ROSE, [], "DE")).toBe(false);
    // a plant drawn as a hedge counts as one
    expect(
      hedgeCutRestricted(prune("2026-05-10"), ROSE, [{ kind: "hedge", plant_id: "R" }], "DE"),
    ).toBe(true);
    // without a due date: today decides
    const undated = makeTask({ kind: "prune", status: "open", due: null, plant_id: "H" });
    expect(hedgeCutRestricted(undated, HEDGE, [], "DE", "2026-12-01")).toBe(false);
    expect(hedgeCutRestricted({ ...prune("2026-05-10"), kind: "water" }, HEDGE, [], "DE")).toBe(
      false,
    );
  });

  it("shows the rule on a hedge pruning task", async () => {
    const backend = fakeBackend({
      plants: [HEDGE, ROSE],
      care: {
        tasks: [
          makeTask({
            id: "T1",
            kind: "prune",
            title: "Hecke schneiden",
            plant_id: "H",
            due: "2026-06-15",
          }),
          makeTask({
            id: "T2",
            kind: "prune",
            title: "Rose schneiden",
            plant_id: "R",
            due: "2026-06-15",
          }),
        ],
      },
    });
    const list = await mount("pg-task-list", backend);
    await vi.waitFor(() => expect(deepText(list)).toContain("Hecke schneiden"));
    const notes = [...(list.shadowRoot?.querySelectorAll(".legal") ?? [])];
    expect(notes).toHaveLength(1);
    expect(deepText(notes[0] as Element)).toContain("§ 39 BNatSchG");
  });
});

describe("weather warnings", () => {
  it("lists each warning with what to do and the plants at risk", async () => {
    const backend = fakeBackend({
      plants: [ROSE, HEDGE],
      water: {
        configured: true,
        updated: null,
        sources: [],
        weather: [],
        alerts: [
          { key: "frost-2026-11-10", kind: "frost", day: "2026-11-10", value: -4, plants: ["R"] },
          { key: "slugs-2026-11-11", kind: "slugs", day: "2026-11-11", value: null, plants: [] },
        ],
      },
    });
    const alerts = await mount("pg-weather-alerts", backend);
    const text = deepText(alerts);
    expect(text).toContain("Frost bis -4 °C ab Di 10.11.");
    expect(text).toContain("Kübel ins Haus");
    expect(text).toContain("Schneckenwetter bis Mi 11.11.");
    expect(deepGet<HTMLAnchorElement>(alerts, ".plants a").textContent).toBe("Rose");
  });

  it("shows nothing without warnings", async () => {
    const alerts = await mount("pg-weather-alerts", fakeBackend({ plants: [ROSE] }));
    expect(deepQuery(alerts, "section")).toBeNull();
  });
});

describe("care calendar to tasks", () => {
  it("takes one job or all of them over as yearly tasks", async () => {
    const knowledge = makeKnowledge({
      calendar: [
        { months: [3], task: "Rückschnitt", kind: "prune" },
        { months: [6, 7], task: "Ernten", kind: "harvest" },
        { months: [4], task: "Düngen", kind: "fertilize", task_id: "T-old" },
      ],
    });
    const backend = fakeBackend({
      plants: [ROSE],
      research: fakeResearch({ plants: { R: knowledge } }),
    });
    const panel = await mount("pg-knowledge-panel", backend, { plantId: "R" });
    expect(deepText(panel)).toContain("Aufgabe angelegt"); // the fertiliser job
    const take = () =>
      [...(panel.shadowRoot?.querySelectorAll(".calendar button") ?? [])] as HTMLButtonElement[];
    expect(take()).toHaveLength(2);
    take()[0]?.click();
    await vi.waitFor(() =>
      expect(backend.callWS).toHaveBeenCalledWith({
        type: "plant_garden/research/calendar_task",
        plant_id: "R",
        index: 0,
      }),
    );
    await vi.waitFor(() => expect(take()).toHaveLength(1));
    // one left: no "all" button any more
    expect(deepQuery(panel, ".actions button")).toBeNull();
  });
});

describe("photo comparison", () => {
  const photos = [photo("PH2", "2026-07-01T10:00:00Z"), photo("PH1", "2026-05-01T10:00:00Z")];

  it("shows growth, changes, concerns and the problem it opened", async () => {
    const backend = fakeBackend({ plants: [ROSE], comparison: makeComparison() });
    const panel = await mount("pg-photo-compare", backend, { plantId: "R", photos });
    await vi.waitFor(() => expect(deepText(panel)).toContain("gewachsen"));
    const text = deepText(panel);
    expect(text).toContain("Deutlich gewachsen, aber neue Flecken.");
    expect(text).toContain("Flecken wie Sternrußtau");
    expect(text).toContain("beobachten");
    expect(text).toContain("Problem „Braune Flecken“ angelegt");
    expect(
      [...(panel.shadowRoot?.querySelectorAll("img") ?? [])].map((img) => img.getAttribute("src")),
    ).toEqual(["/thumb/PH1", "/thumb/PH2"]);
    // the newest photo was compared already
    expect(deepQuery(panel, ".header button")).toBeNull();
  });

  it("compares the newest photo on request", async () => {
    const backend = fakeBackend({ plants: [ROSE] });
    const panel = await mount("pg-photo-compare", backend, { plantId: "R", photos });
    await vi.waitFor(() => expect(deepText(panel)).toContain("Die KI vergleicht das neueste Foto"));
    deepGet<HTMLButtonElement>(panel, ".header button").click();
    await vi.waitFor(() => expect(deepText(panel)).toContain("gewachsen"));
    expect(backend.callWS).toHaveBeenCalledWith({
      type: "plant_garden/assistant/compare",
      photo_id: "PH2",
    });
  });

  it("needs two photos", async () => {
    const backend = fakeBackend({ plants: [ROSE] });
    const panel = await mount("pg-photo-compare", backend, {
      plantId: "R",
      photos: photos.slice(0, 1),
    });
    await vi.waitFor(() => expect(deepText(panel)).toContain("Mit zwei Fotos"));
    expect(deepQuery(panel, ".header button")).toBeNull();
  });
});
