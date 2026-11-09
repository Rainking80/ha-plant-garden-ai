// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/components/knowledge-panel";
import type { PgConfirmDialog } from "../src/components/confirm-dialog";
import type { PgKnowledgePanel } from "../src/components/knowledge-panel";
import { monthNames } from "../src/components/knowledge-panel";
import { GardenStore } from "../src/state/garden-store";
import "../src/views/assistant-view";
import type { PgAssistantView } from "../src/views/assistant-view";
import {
  deepGet,
  deepQuery,
  deepText,
  fakeBackend,
  fakeResearch,
  makeKnowledge,
  makePlant,
  type FakeBackend,
} from "./fixtures";

const ROSE = makePlant({ id: "R", name: "Rose" });
const LAVENDER = makePlant({ id: "L", name: "Lavendel" });

async function storeFor(backend: FakeBackend): Promise<GardenStore> {
  const store = new GardenStore(() => backend.hass);
  await store.refresh();
  return store;
}

async function panelFor(backend: FakeBackend, plantId: string): Promise<PgKnowledgePanel> {
  const panel = document.createElement("pg-knowledge-panel") as PgKnowledgePanel;
  panel.hass = backend.hass;
  panel.store = await storeFor(backend);
  panel.plantId = plantId;
  document.body.append(panel);
  await panel.updateComplete;
  return panel;
}

const calls = (backend: FakeBackend) =>
  backend.callWS.mock.calls.map(([msg]) => (msg as { type: string }).type);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("plant knowledge on the plant page", () => {
  it("shows what the assistant found, with its sources, and can delete it", async () => {
    const backend = fakeBackend({
      plants: [ROSE],
      research: fakeResearch({ plants: { R: makeKnowledge() } }),
    });
    const panel = await panelFor(backend, "R");
    const text = deepText(panel);
    expect(text).toContain("Robuster Strauch mit Duft.");
    expect(text).toContain("Stacheln");
    expect(text).toContain("Gießen");
    expect(text).toContain("Schnitt");
    expect(text).toContain(`${monthNames("de")[2]}, ${monthNames("de")[6]}`);
    expect(text).toContain("Rückschnitt");
    expect(text).toContain("Aus einer Websuche");
    expect(text).toContain("0,08");
    // pruning comes as a list (rendered safely, without HTML)
    expect(panel.shadowRoot?.querySelectorAll(".topic li")).toHaveLength(2);
    const link = deepGet<HTMLAnchorElement>(panel, ".sources a");
    expect(link.getAttribute("href")).toBe("https://garten.example/rose");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");

    // deleting asks first, then the plant is queued for research again
    const dialog = deepGet<PgConfirmDialog>(panel, "pg-confirm-dialog");
    dialog.ask = vi.fn(async () => true);
    deepGet<HTMLButtonElement>(panel, ".header button").click();
    await vi.waitFor(() => expect(calls(backend)).toContain("plant_garden/research/delete"));
    expect(dialog.ask).toHaveBeenCalledWith(
      "Wissen löschen?",
      expect.stringContaining("Rose"),
      "Löschen",
    );
  });

  it("researches a plant without knowledge on request", async () => {
    const backend = fakeBackend({
      plants: [ROSE],
      research: fakeResearch({
        queue: ["R"],
        failed: { R: { at: "2026-11-08T10:00:00+00:00", error: "web search disabled" } },
      }),
    });
    const panel = await panelFor(backend, "R");
    const text = deepText(panel);
    expect(text).toContain("Noch kein Wissen gesammelt.");
    expect(text).toContain("Selbstständiges Recherchieren ist aus.");
    expect(text).toContain("web search disabled");
    expect(text).toMatch(/Etwa 0,12 (€|EUR) pro Pflanze./);
    deepGet<HTMLButtonElement>(panel, ".actions button").click();
    await vi.waitFor(() => expect(deepText(panel)).toContain("Robuster Strauch mit Duft."));
    expect(backend.callWS).toHaveBeenCalledWith({
      type: "plant_garden/research/run",
      plant_id: "R",
    });
  });

  it("asks for an AI provider first", async () => {
    const backend = fakeBackend({
      plants: [ROSE],
      research: fakeResearch({ available: false, queue: ["R"] }),
    });
    const panel = await panelFor(backend, "R");
    expect(deepText(panel)).toContain("Richte einen KI-Anbieter ein");
    expect(deepQuery(panel, ".actions button")).toBeNull();
  });
});

describe("plant knowledge in the assistant", () => {
  async function mount(backend: FakeBackend): Promise<PgAssistantView> {
    const view = document.createElement("pg-assistant-view") as PgAssistantView;
    view.hass = backend.hass;
    view.store = await storeFor(backend);
    view.prefix = "/plant-garden";
    document.body.append(view);
    await view.updateComplete;
    return view;
  }

  it("lists the knowledge, the queue and sets how often to research", async () => {
    const backend = fakeBackend({
      plants: [ROSE, LAVENDER],
      research: fakeResearch({
        schedule: "off",
        queue: ["L"],
        plants: { R: makeKnowledge() },
      }),
    });
    const view = await mount(backend);
    const text = deepText(view);
    expect(text).toContain("Pflanzenwissen");
    expect(text).toContain("1 von 2 Pflanzen haben Wissen");
    expect(text).toContain("Gesammeltes Wissen (1)");
    expect(text).toContain("Noch ohne Wissen (1)");
    expect(text).toContain("Deine KI sucht selbst im Web.");

    const select = deepGet<HTMLSelectElement>(view, "pg-research-schedule select");
    expect(select.disabled).toBe(false);
    select.value = "daily";
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(backend.callWS).toHaveBeenCalledWith({
        type: "plant_garden/research/schedule",
        schedule: "daily",
      }),
    );

    // research the next plant by hand
    const button = [...(view.shadowRoot?.querySelectorAll(".queue button") ?? [])][0];
    (button as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(backend.callWS).toHaveBeenCalledWith({
        type: "plant_garden/research/run",
        plant_id: "L",
      }),
    );
  });

  it("lets only administrators change the schedule", async () => {
    const backend = fakeBackend({
      plants: [ROSE],
      isAdmin: false,
      research: fakeResearch({ queue: ["R"] }),
    });
    const view = await mount(backend);
    expect(deepGet<HTMLSelectElement>(view, "pg-research-schedule select").disabled).toBe(true);
    expect(deepText(view)).toContain("Nur Administratoren ändern die Häufigkeit.");
  });
});
