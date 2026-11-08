// @vitest-environment happy-dom
import { render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/components/assistant-panel";
import type { PgAssistantPanel } from "../src/components/assistant-panel";
import type { PgConfirmDialog } from "../src/components/confirm-dialog";
import type { PgGardenCanvas } from "../src/components/garden-canvas";
import "../src/components/problems-panel";
import type { PgProblemsPanel } from "../src/components/problems-panel";
import "../src/components/task-list";
import { taskGroup, type PgTaskList } from "../src/components/task-list";
import "../src/main";
import { GardenStore } from "../src/state/garden-store";
import { renderMarkdown } from "../src/util/markdown";
import type { PgGardenView } from "../src/views/garden-view";
import {
  deepGet,
  deepQuery,
  deepText,
  fakeBackend,
  makePhoto,
  makePlant,
  makeTask,
  type FakeBackend,
} from "./fixtures";

const AI = { status: { available: true, identify: "Claude", plantnet: false, currency: "EUR" } };
const ROSE = makePlant({ id: "R", name: "Rose", position: { x: 0, y: 0 }, crown_diameter_m: 1 });

function markdown(text: string): HTMLElement {
  const host = document.createElement("div");
  render(renderMarkdown(text), host);
  return host;
}

async function storeFor(backend: FakeBackend): Promise<GardenStore> {
  const store = new GardenStore(() => backend.hass);
  await store.refresh();
  return store;
}

async function mount<T extends HTMLElement & { hass: unknown; store: unknown }>(
  tag: string,
  backend: FakeBackend,
  props: Record<string, unknown> = {},
): Promise<T> {
  const element = document.createElement(tag) as T;
  element.hass = backend.hass;
  element.store = await storeFor(backend);
  Object.assign(element, props);
  document.body.append(element);
  return element;
}

const today = () => new Date().toISOString().slice(0, 10);
const shift = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute("open");
};

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("markdown of AI answers", () => {
  it("renders the supported subset as elements", () => {
    const host = markdown(
      "# Pflege\n\nGieß **morgens** und *nicht* zu viel.\nZweite Zeile mit `code`.\n\n- eins\n- zwei\n\n1. a\n2. b\n\n[Quelle](https://example.org/x)",
    );
    expect(host.querySelector("h4")?.textContent).toBe("Pflege");
    expect(host.querySelector("strong")?.textContent).toBe("morgens");
    expect(host.querySelector("em")?.textContent).toBe("nicht");
    expect(host.querySelector("code")?.textContent).toBe("code");
    expect(host.querySelectorAll("p br")).toHaveLength(1);
    expect([...host.querySelectorAll("ul li")].map((li) => li.textContent)).toEqual([
      "eins",
      "zwei",
    ]);
    expect(host.querySelectorAll("ol li")).toHaveLength(2);
    const link = host.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.org/x");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("never turns text into markup or unsafe links", () => {
    const host = markdown('<img src=x onerror="alert(1)"> [klick](javascript:alert(1))');
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("a")).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(host.textContent).toContain("klick");
  });
});

describe("tasks", () => {
  it("groups tasks by due date", () => {
    expect(taskGroup(makeTask({ due: shift(-1) }), today())).toBe("overdue");
    expect(taskGroup(makeTask({ due: today() }), today())).toBe("today");
    expect(taskGroup(makeTask({ due: shift(3) }), today())).toBe("week");
    expect(taskGroup(makeTask({ due: shift(30) }), today())).toBe("later");
    expect(taskGroup(makeTask(), today())).toBe("undated");
    expect(taskGroup(makeTask({ status: "done" }), today())).toBe("done");
  });

  it("ticks off, adds and deletes tasks", async () => {
    const backend = fakeBackend({
      plants: [ROSE],
      care: {
        tasks: [
          makeTask({
            id: "A",
            title: "Gießen",
            plant_id: "R",
            due: shift(-2),
            repeat: { every: 3, unit: "days" },
          }),
          makeTask({ id: "B", title: "Kompost umsetzen", due: shift(10), source: "ai" }),
        ],
      },
    });
    const list = await mount<PgTaskList>("pg-task-list", backend);
    await vi.waitFor(() => expect(deepText(list)).toContain("Kompost umsetzen"));
    const text = deepText(list);
    expect(text).toContain("Überfällig");
    expect(text).toContain("Später");
    expect(text).toContain("alle 3 Tage");
    expect(text).toContain("KI-Vorschlag");
    expect(deepGet<HTMLAnchorElement>(list, "li a").textContent).toBe("Rose");

    deepGet<HTMLButtonElement>(list, "li .check").click();
    await vi.waitFor(() => expect(deepText(list)).toContain("Erledigt"));
    expect(backend.callWS).toHaveBeenCalledWith({
      type: "plant_garden/tasks/complete",
      task_id: "A",
    });

    // add a seasonal task for the whole garden
    deepGet<HTMLButtonElement>(list, ".block-header button").click();
    await list.updateComplete;
    const form = deepGet<HTMLFormElement>(list, "dialog form");
    (form.elements.namedItem("title") as HTMLInputElement).value = "Rasen düngen";
    (form.elements.namedItem("kind") as HTMLSelectElement).value = "fertilize";
    (form.elements.namedItem("every") as HTMLInputElement).value = "4";
    (form.elements.namedItem("unit") as HTMLSelectElement).value = "weeks";
    for (const box of form.querySelectorAll<HTMLInputElement>('input[name="months"]')) {
      box.checked = ["4", "5"].includes(box.value);
    }
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(deepText(list)).toContain("Rasen düngen"));
    expect(backend.callWS).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "plant_garden/tasks/create",
        kind: "fertilize",
        title: "Rasen düngen",
        repeat: { every: 4, unit: "weeks" },
        months: [4, 5],
        plant_id: null,
        due: null,
      }),
    );

    const confirm = deepGet<PgConfirmDialog>(list, "pg-confirm-dialog");
    vi.spyOn(confirm, "ask").mockResolvedValue(true);
    const kompost = [...(list.shadowRoot?.querySelectorAll("li") ?? [])].find((li) =>
      li.textContent?.includes("Kompost"),
    );
    kompost?.querySelectorAll<HTMLButtonElement>(".icon-button.small")[1]?.click();
    await vi.waitFor(() => expect(deepText(list)).not.toContain("Kompost umsetzen"));
  });
});

describe("problems", () => {
  it("reports, diagnoses and logs a problem", async () => {
    const photos = [makePhoto("P1", "2026-06-02T08:00:00Z", { plant_id: "R" })];
    const backend = fakeBackend({ plants: [ROSE], ai: AI });
    const panel = await mount<PgProblemsPanel>("pg-problems-panel", backend, {
      plantId: "R",
      photos,
    });
    await vi.waitFor(() => expect(deepText(panel)).toContain("Keine Probleme"));

    deepGet<HTMLButtonElement>(panel, ".block-header button").click();
    await panel.updateComplete;
    const form = deepGet<HTMLFormElement>(panel, "dialog.report form");
    (form.elements.namedItem("title") as HTMLInputElement).value = "Gelbe Blätter";
    (form.elements.namedItem("note") as HTMLTextAreaElement).value = "seit Montag";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(deepText(panel)).toContain("Gelbe Blätter"));
    expect(backend.callWS).toHaveBeenCalledWith({
      type: "plant_garden/problems/create",
      plant_id: "R",
      title: "Gelbe Blätter",
      note: "seit Montag",
      photo_ids: ["P1"],
    });
    expect(deepText(panel)).toContain("seit Montag");

    const diagnose = [
      ...(panel.shadowRoot?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ].find((b) => b.textContent?.includes("Mit KI diagnostizieren"));
    diagnose?.click();
    await vi.waitFor(() => expect(deepText(panel)).toContain("Wahrscheinlich Trockenstress."));
    const text = deepText(panel);
    expect(text).toContain("Wasser Trockenheit");
    expect(text).toContain("Heute Morgens gießen");
    expect(text).toContain("Nicht in der Mittagssonne");
    expect(text).toContain("Wie oft wird gegossen?");

    const log = deepGet<HTMLFormElement>(panel, "form.add-log");
    (log.elements.namedItem("text") as HTMLInputElement).value = "Gegossen";
    log.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(deepText(panel)).toContain("Maßnahme: Gegossen"));

    const status = deepGet<HTMLSelectElement>(panel, ".problem header select");
    status.value = "resolved";
    status.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(deepText(panel)).toContain("Gelöste Probleme (1)"));
  });
});

describe("assistant", () => {
  it("points to the settings without an AI provider", async () => {
    const panel = await mount<PgAssistantPanel>("pg-assistant-panel", fakeBackend());
    await vi.waitFor(() => expect(deepText(panel)).toContain("Einstellungen öffnen"));
  });

  it("answers questions, takes tips over and streams the chat", async () => {
    const backend = fakeBackend({
      plants: [ROSE],
      ai: AI,
      care: {
        questions: [
          {
            id: "Q1",
            plant_id: "R",
            field: "soil_type",
            question: "Welcher Boden?",
            answer: null,
            status: "open",
            created_at: "2026-06-01T08:00:00Z",
            answered_at: null,
          },
        ],
      },
    });
    const panel = await mount<PgAssistantPanel>("pg-assistant-panel", backend, { plantId: null });
    await vi.waitFor(() => expect(deepText(panel)).toContain("Welcher Boden?"));
    expect(deepGet<HTMLAnchorElement>(panel, ".question a").textContent?.trim()).toBe("Rose");

    const question = deepGet<HTMLFormElement>(panel, "form.question");
    (question.elements.namedItem("answer") as HTMLInputElement).value = "Lehm";
    question.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(deepText(panel)).not.toContain("Welcher Boden?"));
    expect(backend.care.questions[0]?.answer).toBe("Lehm");

    deepGet<HTMLButtonElement>(panel, ".tips .block-header button").click();
    await vi.waitFor(() => expect(deepText(panel)).toContain("Aufgabe: Verblühtes schneiden"));
    expect(deepGet(panel, ".tips .markdown strong").textContent).toBe("verblühte");
    deepGet<HTMLButtonElement>(panel, ".proposal .button").click();
    await vi.waitFor(() => expect(deepText(panel)).toContain("als Aufgabe übernommen"));
    expect(backend.care.tasks.map((t) => [t.title, t.source])).toEqual([
      ["Verblühtes schneiden", "ai"],
    ]);

    const form = deepGet<HTMLFormElement>(panel, "form.ask");
    const field = form.querySelector("textarea") as HTMLTextAreaElement;
    field.value = "Wann gießen?";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(deepText(panel)).toContain("Gieß morgen früh."));
    expect(deepGet(panel, ".message.assistant strong").textContent).toBe("morgen");
    expect(deepText(panel)).toContain("Wann gießen?");
    expect(field.value).toBe("");

    backend.care.chatAnswer = "ERROR:Monatsbudget aufgebraucht";
    field.value = "Und düngen?";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(deepText(panel)).toContain("Monatsbudget aufgebraucht"));
    expect(field.value).toBe("Und düngen?"); // kept for another try
  });
});

describe("assistant on the plan and in the panel", () => {
  it("rings plants with pruning due, marks problems and lists them on the card", async () => {
    localStorage.setItem("plant-garden.viewport.v1", JSON.stringify({ cx: 0, cy: 0, width: 40 }));
    const backend = fakeBackend({
      plants: [ROSE],
      care: {
        tasks: [
          makeTask({ id: "A", kind: "prune", title: "Schneiden", plant_id: "R", due: shift(-1) }),
        ],
        problems: [
          {
            id: "P1",
            plant_id: "R",
            title: "Läuse",
            status: "treating",
            observed_on: "2026-06-01",
            created_at: "2026-06-01T08:00:00Z",
            resolved_at: null,
            photo_ids: [],
            diagnosis: null,
          },
        ],
      },
    });
    const view = await mount<PgGardenView>("pg-garden-view", backend);
    await view.updateComplete;
    const canvas = deepGet<PgGardenCanvas>(view, "pg-garden-canvas");
    await canvas.updateComplete;
    const rose = deepGet<SVGGElement>(canvas, '[data-plant-id="R"]');
    expect([...rose.classList]).toEqual(expect.arrayContaining(["prune", "has-problem"]));
    expect(rose.querySelector(".prune-ring")).not.toBeNull();
    expect(rose.querySelector(".problem-dot")).not.toBeNull();

    canvas.dispatchEvent(
      new CustomEvent("select", { detail: { selection: { type: "plant", id: "R" } } }),
    );
    await view.updateComplete;
    const card = deepText(deepGet(view, "article.info"));
    expect(card).toContain("Problem: In Behandlung");
    expect(card).toContain("1 offene Aufgaben · 1 überfällig · Schnitt fällig");

    // care events reload the summary
    await view.store.connect();
    backend.care.problems = [];
    backend.emit({ kind: "care", plant_id: "R" });
    await vi.waitFor(() =>
      expect(deepGet(canvas, '[data-plant-id="R"]').querySelector(".problem-dot")).toBeNull(),
    );
  });

  it("has tabs for tasks and the assistant", async () => {
    const backend = fakeBackend({
      plants: [ROSE],
      care: { tasks: [makeTask({ id: "A", title: "Gießen", due: shift(-3) })] },
    });
    const panel = document.createElement("plant-garden-panel") as HTMLElement & {
      hass: unknown;
      panel: unknown;
      route: unknown;
      narrow: boolean;
    };
    panel.hass = backend.hass;
    panel.narrow = false;
    panel.panel = { config: {}, url_path: "plant-garden", title: "Garten" };
    panel.route = { prefix: "/plant-garden", path: "/tasks" };
    document.body.append(panel);
    await vi.waitFor(() => expect(deepQuery(panel, "pg-tasks-view")).not.toBeNull());
    await vi.waitFor(() => expect(deepText(panel)).toContain("Keine offenen Probleme."));
    expect(deepGet(panel, ".tabs .badge").textContent).toBe("1");
    panel.route = { prefix: "/plant-garden", path: "/assistant" };
    await vi.waitFor(() => expect(deepQuery(panel, "pg-assistant-view")).not.toBeNull());
  });
});
