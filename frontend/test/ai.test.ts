// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UsageRow } from "../src/api/types";
import "../src/components/ai-panel";
import type { PgAIPanel } from "../src/components/ai-panel";
import { GardenStore } from "../src/state/garden-store";
import "../src/views/tech-view";
import { costBars, previewExport, toCsv, type PgTechView } from "../src/views/tech-view";
import {
  deepGet,
  deepText,
  fakeBackend,
  makeIdentification,
  makePhoto,
  makePlant,
  makeTotals,
  type FakeBackend,
} from "./fixtures";

const PLANT = makePlant({ id: "H", name: "Hortensie" });

function row(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    id: "R1",
    ts: "2026-06-02T10:00:00+00:00",
    feature: "identify",
    provider: "S1",
    provider_title: "Claude",
    model: "claude-opus-5-5",
    plant_id: "H",
    status: "ok",
    error: null,
    input: 1200,
    cached_input: 0,
    cache_write: 0,
    output: 300,
    reasoning: 0,
    images: 2,
    cost: 0.0108,
    cost_source: "computed",
    latency_ms: 4200,
    prompt: null,
    response: null,
    ...overrides,
  };
}

async function mountPanel(backend: FakeBackend, photos = [makePhoto("P1", "2026-06-01")]) {
  const store = new GardenStore(() => backend.hass);
  await store.refresh();
  const panel = document.createElement("pg-ai-panel") as PgAIPanel;
  panel.hass = backend.hass;
  panel.store = store;
  panel.plantId = "H";
  panel.photos = photos;
  document.body.append(panel);
  await panel.updateComplete;
  return panel;
}

async function mountTech(backend: FakeBackend) {
  const store = new GardenStore(() => backend.hass);
  await store.refresh();
  const view = document.createElement("pg-tech-view") as PgTechView;
  view.hass = backend.hass;
  view.store = store;
  document.body.append(view);
  await vi.waitFor(() => expect(deepText(view)).toContain("Preise"));
  return view;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("pg-ai-panel", () => {
  it("points to the settings while no provider is set up", async () => {
    const panel = await mountPanel(fakeBackend({ plants: [PLANT] }));
    await vi.waitFor(() => expect(deepText(panel)).toContain("Einstellungen öffnen"));
    expect(panel.shadowRoot?.querySelector("dialog")).toBeNull();
    expect(deepGet<HTMLAnchorElement>(panel, "a.button").getAttribute("href")).toBe(
      "/config/integrations/integration/plant_garden",
    );
  });

  it("shows the result and takes over single suggestions", async () => {
    const backend = fakeBackend({
      plants: [PLANT],
      ai: {
        status: { available: true, identify: "Claude", plantnet: false, currency: "EUR" },
        identifications: { H: makeIdentification() },
      },
    });
    const panel = await mountPanel(backend);
    await vi.waitFor(() => expect(deepText(panel)).toContain("Hydrangea macrophylla"));
    const text = deepText(panel);
    expect(text).toContain("Bauernhortensie");
    expect(text).toContain("Ohne Pl@ntNet");
    expect(text).toContain("Welche Farbe haben die Blüten?");
    // the user's own value stays; the AI opinion is only shown
    expect(text).toContain("KI sieht das anders – du hast Gering eingetragen");

    deepGet<HTMLButtonElement>(panel, "li.new button[title='Übernehmen']").click();
    await vi.waitFor(() => expect(deepText(panel)).toContain("übernommen"));
    expect(backend.callWS).toHaveBeenCalledWith({
      type: "plant_garden/ai/decide",
      plant_id: "H",
      key: "scientific_name",
      accept: true,
    });
  });

  it("identifies from the chosen photos with a cost estimate", async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    const backend = fakeBackend({
      plants: [PLANT],
      ai: { status: { available: true, identify: "Claude", plantnet: true, currency: "EUR" } },
    });
    const panel = await mountPanel(backend, [
      makePhoto("P2", "2026-06-02"),
      makePhoto("P1", "2026-06-01"),
    ]);
    await vi.waitFor(() => expect(deepText(panel)).toContain("Bestimmen"));
    deepGet<HTMLButtonElement>(panel, ".block-header button").click();
    await vi.waitFor(() => expect(deepText(panel)).toContain("etwa 0,012 EUR"));

    // add the second photo, mark it as a flower
    const thumbs = panel.shadowRoot?.querySelectorAll<HTMLButtonElement>(".thumb");
    thumbs?.[1]?.click();
    await panel.updateComplete;
    const selects = panel.shadowRoot?.querySelectorAll<HTMLSelectElement>(".photo select");
    expect(selects).toHaveLength(2);
    const second = selects?.[1] as HTMLSelectElement;
    second.value = "flower";
    second.dispatchEvent(new Event("change"));
    await panel.updateComplete;

    deepGet<HTMLButtonElement>(panel, ".dialog-actions .button:not(.text)").click();
    await vi.waitFor(() => expect(deepText(panel)).toContain("Hydrangea macrophylla"));
    expect(backend.callWS).toHaveBeenCalledWith({
      type: "plant_garden/ai/identify",
      plant_id: "H",
      photos: [
        { photo_id: "P2", organ: "auto" },
        { photo_id: "P1", organ: "flower" },
      ],
    });
  });

  it("cannot identify without a photo", async () => {
    const panel = await mountPanel(
      fakeBackend({
        plants: [PLANT],
        ai: { status: { available: true, identify: "Claude", plantnet: false, currency: "EUR" } },
      }),
      [],
    );
    await vi.waitFor(() => expect(deepText(panel)).toContain("Füge zuerst ein Foto hinzu."));
    expect(deepGet<HTMLButtonElement>(panel, ".block-header button").disabled).toBe(true);
  });
});

describe("tech helpers", () => {
  it("quotes CSV cells that need it", () => {
    const csv = toCsv([row({ error: 'bad "json", line 1' })]);
    const [header, line] = csv.split("\n");
    expect(header?.startsWith("ts,feature,provider_title,model")).toBe(true);
    expect(line).toContain('"bad ""json"", line 1"');
    expect(line).toContain(",0.0108,computed,4200");
  });

  it("stacks the cost of each day by model", () => {
    const chart = costBars(
      [
        { day: "2026-06-02", model: "a", cost: 1, requests: 1 },
        { day: "2026-06-01", model: "a", cost: 0.5, requests: 1 },
        { day: "2026-06-02", model: "b", cost: 1, requests: 2 },
        { day: "2026-06-01", model: "b", cost: null, requests: 1 },
      ],
      100,
      50,
    );
    expect(chart.days).toEqual(["2026-06-01", "2026-06-02"]);
    expect(chart.models).toEqual(["a", "b"]);
    const second = chart.bars.filter((bar) => bar.day === "2026-06-02");
    expect(second.map((bar) => bar.h)).toEqual([25, 25]);
    expect(second[1]?.y).toBe(0);
    expect(chart.bars.find((bar) => bar.day === "2026-06-01")?.h).toBe(12.5);
  });
});

describe("pg-tech-view", () => {
  it("shows costs, the request log, providers and system data", async () => {
    const backend = fakeBackend({
      plants: [PLANT],
      ai: {
        summary: {
          currency: "EUR",
          rate: 0.5,
          budget: 5,
          budget_stop: true,
          today: makeTotals({ requests: 1, input: 1200, output: 300, images: 2, cost: 0.02 }),
          month: makeTotals({ requests: 4, errors: 1, cost: 2, latency_ms: 8000 }),
          total: makeTotals({ requests: 9, cost: 3, unknown_cost: 2 }),
          by: {
            provider: [{ ...makeTotals({ requests: 4, cost: 2 }), key: "Claude" }],
            model: [],
            feature: [{ ...makeTotals({ requests: 4, cost: 2 }), key: "identify" }],
            plant_id: [{ ...makeTotals({ requests: 4, cost: 2 }), key: "H" }],
          },
          daily: [{ day: "2026-06-02", model: "claude-opus-5-5", cost: 2, requests: 4 }],
          providers: [],
        },
        rows: [row(), row({ id: "R2", status: "error", error: "timeout", cost: null })],
        tech: {
          version: "0.1.0",
          storage: { photos: 2_000_000, backgrounds: 0, database: 4096 },
          entities: 12,
          plants: 1,
          weather: {
            updated: null,
            sources: [{ title: "Open-Meteo", ok: true, error: null, days: 21 }],
            last_error: null,
          },
          providers: [
            {
              id: "S1",
              title: "Claude",
              kind: "anthropic",
              model: "claude-opus-5-5",
              base_url: null,
              key: "sk-…abcd",
              status: null,
            },
          ],
        },
      },
    });
    const view = await mountTech(backend);
    const text = deepText(view);
    expect(text).toContain("1,00 EUR"); // month: 2 USD × 0.5
    expect(text).toContain("0,010 EUR"); // today
    expect(text).toContain("Budget: 1,00 EUR von 5,00 EUR");
    expect(text).toContain("KI stoppt beim Erreichen");
    expect(text).toContain("25 % Fehler · ⌀ 2 s");
    expect(text).toContain("2 ohne bekannten Preis");
    expect(text).toContain("Hortensie"); // plant breakdown by name
    expect(text).toContain("Bestimmen"); // feature name
    expect(text).toContain("timeout");
    expect(text).toContain("sk-…abcd");
    expect(text).toContain("Open-Meteo: 21");
    expect(view.shadowRoot?.querySelectorAll(".chart rect")).toHaveLength(1);
    expect(view.shadowRoot?.querySelectorAll(".log tr.failed")).toHaveLength(1);

    // filter the log by status
    const status = view.shadowRoot?.querySelectorAll<HTMLSelectElement>(".filters select")[1];
    if (!status) throw new Error("no status filter");
    status.value = "error";
    status.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(view.shadowRoot?.querySelectorAll(".log tbody tr")).toHaveLength(1),
    );
    expect(backend.callWS).toHaveBeenCalledWith(
      expect.objectContaining({ type: "plant_garden/ai/usage/log", status: "error" }),
    );

    // test the connection
    deepGet<HTMLButtonElement>(view, ".providers button").click();
    await vi.waitFor(() => expect(deepText(view)).toContain("verbunden"));
  });

  it("saves and resets an own price", async () => {
    const backend = fakeBackend();
    const view = await mountTech(backend);
    view.shadowRoot?.querySelector("details")?.setAttribute("open", "");
    const input = deepGet<HTMLInputElement>(view, ".prices input[data-key='output']");
    expect(input.value).toBe("20");
    input.value = "18,5";
    deepGet<HTMLButtonElement>(view, ".row-actions button").click();
    await vi.waitFor(() => expect(deepText(view)).toContain("eigener Preis"));
    expect(backend.callWS).toHaveBeenCalledWith({
      type: "plant_garden/ai/pricing/set",
      kind: "anthropic",
      model: "claude-opus-5-5",
      prices: { input: 4, output: 18.5 },
    });

    const buttons = view.shadowRoot?.querySelectorAll<HTMLButtonElement>(".row-actions button");
    buttons?.[1]?.click();
    await vi.waitFor(() => expect(deepText(view)).not.toContain("eigener Preis"));
  });
});

describe("moving a garden", () => {
  const EXPORT = {
    format: "plant_garden.garden",
    version: 1,
    exported_at: "2026-11-09T10:00:00+00:00",
    garden: { name: "Schrebergarten" },
    layout: {
      origin: { latitude: 48.13743, longitude: 11.57549 },
      shapes: [{ kind: "bed" }, { kind: "hedge" }, { kind: "zone" }],
    },
    plants: [{}, {}, {}],
    tasks: [{}],
  };

  it("previews an export file and refuses other files", () => {
    const preview = previewExport(new Blob(["{}"]), EXPORT);
    expect(preview).toMatchObject({
      name: "Schrebergarten",
      plants: 3,
      areas: 2,
      zones: 1,
      tasks: 1,
    });
    expect(() => previewExport(new Blob(), { format: "other" })).toThrow();
    expect(() => previewExport(new Blob(), { ...EXPORT, layout: {} })).toThrow();
  });

  it("exports and imports through the tech page", async () => {
    const backend = fakeBackend();
    const fetch = backend.hass.fetchWithAuth as ReturnType<typeof vi.fn>;
    fetch.mockImplementation(async (url: string) =>
      url.endsWith("/export")
        ? new Response(JSON.stringify(EXPORT), { status: 200 })
        : new Response(
            JSON.stringify({
              garden: "Schrebergarten",
              plants: 3,
              areas: 2,
              zones: 1,
              markers: 0,
              measurements: 0,
              tasks: 1,
              background: null,
            }),
            { status: 200 },
          ),
    ); // fmt: skip
    const created = vi.fn(() => "blob:x");
    URL.createObjectURL = created;
    URL.revokeObjectURL = vi.fn();
    const view = await mountTech(backend);
    expect(deepText(view)).toContain("Garten übertragen");

    const button = (label: string) =>
      [...(view.shadowRoot?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((b) =>
        b.textContent?.includes(label),
      );
    button("Als JSON exportieren")?.click();
    await vi.waitFor(() => expect(created).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith("/api/plant_garden/export");

    view._preview = previewExport(new Blob([JSON.stringify(EXPORT)]), EXPORT);
    await view.updateComplete;
    const text = deepText(view);
    expect(text).toContain("3 Pflanzen, 2 Flächen, 1 Bewässerungszonen, 1 offene Aufgaben");
    expect(text).toContain("Standort 48,1374, 11,5755");
    button("Importieren")?.click();
    await vi.waitFor(() => expect(deepText(view)).toContain("Importiert: 3 Pflanzen"));
    const [url, init] = fetch.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe("/api/plant_garden/import");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("does not import into a garden that has plants, and shows backend errors", async () => {
    const backend = fakeBackend({ plants: [makePlant()] });
    const fetch = backend.hass.fetchWithAuth as ReturnType<typeof vi.fn>;
    fetch.mockResolvedValue(
      new Response(JSON.stringify({ message: "Administrators only" }), { status: 403 }),
    );
    const view = await mountTech(backend);
    view._preview = previewExport(new Blob(["{}"]), EXPORT);
    await view.updateComplete;
    expect(deepText(view)).toContain("Importieren geht nur in einen leeren Garten");
    const importButton = [
      ...(view.shadowRoot?.querySelectorAll<HTMLButtonElement>(".preview button") ?? []),
    ].at(-1);
    expect(importButton?.disabled).toBe(true);
    [...(view.shadowRoot?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
      .find((b) => b.textContent?.includes("Als JSON exportieren"))
      ?.click();
    await vi.waitFor(() => expect(deepText(view)).toContain("Administrators only"));
  });
});
