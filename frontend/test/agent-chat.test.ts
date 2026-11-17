// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentMessage } from "../src/api/types";
import "../src/components/agent-chat";
import type { PgAgentChat } from "../src/components/agent-chat";
import { parseRoute } from "../src/panel";
import { GardenStore } from "../src/state/garden-store";
import { deepGet, deepQuery, deepText, fakeBackend, type FakeBackend } from "./fixtures";

const ANSWER: AgentMessage = {
  id: "A1",
  role: "assistant",
  text: "Heute ist **nichts** fällig.\n\n- Rose gießen\n- Hecke prüfen",
  created: "2026-07-01T10:00:00Z",
  actions: [
    { id: "ACT1", kind: "create_plant", label: "Lavendel", undone: false },
    { id: "ACT2", kind: "create_task", label: "Lavendel schneiden", undone: false },
  ],
  steps: ["garden_overview", "create_plant"],
  sources: [{ url: "https://example.org/laus", title: "Blattläuse" }],
  model: "claude-opus-5-5",
  cost: 0.012,
};

const calls = (backend: FakeBackend, type: string) =>
  backend.callWS.mock.calls
    .map(([msg]) => msg as Record<string, unknown> & { type: string })
    .filter((msg) => msg.type === type);

const asked = (backend: FakeBackend) =>
  (backend.hass.connection.subscribeMessage as ReturnType<typeof vi.fn>).mock.calls
    .map(([, msg]) => msg as Record<string, unknown> & { type: string })
    .filter((msg) => msg.type === "plant_garden/agent/ask");

async function mount(backend: FakeBackend, open = true): Promise<PgAgentChat> {
  const store = new GardenStore(() => backend.hass);
  await store.refresh();
  const chat = document.createElement("pg-agent-chat") as PgAgentChat;
  chat.hass = backend.hass;
  chat.store = store;
  chat.view = "Pflanzen";
  document.body.append(chat);
  await chat.updateComplete;
  if (open) {
    deepGet<HTMLButtonElement>(chat, "button.opener").click();
    await vi.waitFor(() => deepGet(chat, ".drawer textarea"));
  }
  return chat;
}

async function type(chat: PgAgentChat, text: string): Promise<void> {
  const input = deepGet<HTMLTextAreaElement>(chat, "textarea");
  input.value = text;
  input.dispatchEvent(new Event("input"));
  await chat.updateComplete;
}

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("pg-agent-chat", () => {
  it("replaces the assistant tab", () => {
    // the old address shows the plan now
    expect(parseRoute("/assistant")).toEqual({ name: "plan", focusPlantId: null });
  });

  it("is a button that opens the chat on a click, not before", async () => {
    const backend = fakeBackend();
    const chat = await mount(backend, false);
    const opener = deepGet<HTMLButtonElement>(chat, "button.opener");
    expect(opener.title).toBe("Garten-Assistent");
    expect(deepQuery(chat, ".drawer")).toBeNull();
    expect(calls(backend, "plant_garden/agent/state")).toHaveLength(0);

    opener.click();
    await vi.waitFor(() => expect(deepText(chat)).toContain("Was ist heute zu tun?"));
    expect(opener.getAttribute("aria-expanded")).toBe("true");
    expect(deepText(chat)).toContain("suche im Web");

    // larger and smaller, remembered on this device
    const size = deepGet<HTMLButtonElement>(chat, "button.size");
    expect(deepGet(chat, ".drawer").classList.contains("wide")).toBe(false);
    size.click();
    await chat.updateComplete;
    expect(deepGet(chat, ".drawer").classList.contains("wide")).toBe(true);
    expect(localStorage.getItem("plant-garden.agent-wide.v1")).toBe("true");

    deepGet<HTMLButtonElement>(chat, "button.close").click();
    await chat.updateComplete;
    expect(deepQuery(chat, ".drawer")).toBeNull();
  });

  it("asks, shows the answer with what was done, and undoes an action", async () => {
    const backend = fakeBackend();
    backend.agentReply = {
      steps: ANSWER.steps ?? [],
      actions: ANSWER.actions ?? [],
      message: ANSWER,
    };
    const chat = await mount(backend);
    chat.plantId = "R1";
    const refresh = vi.spyOn(chat.store as GardenStore, "refresh");

    // a suggested question is one click
    const chip = [...(chat.shadowRoot?.querySelectorAll<HTMLButtonElement>(".chip") ?? [])][0];
    chip?.click();
    await vi.waitFor(() => expect(deepText(chat)).toContain("Rose gießen"));
    expect(asked(backend)[0]).toMatchObject({
      text: "Was ist heute zu tun?",
      view: "Pflanzen",
      plant_id: "R1",
    });
    // the answer is rendered as text with a list, not as raw markdown
    expect(deepQuery(chat, ".assistant .text strong")?.textContent).toBe("nichts");
    expect(chat.shadowRoot?.querySelectorAll(".assistant .text li")).toHaveLength(2);
    const text = deepText(chat);
    expect(text).toContain("Pflanze angelegt: Lavendel");
    expect(text).toContain("Aufgabe angelegt: Lavendel schneiden");
    expect(text).toContain("Blattläuse");
    expect(text).toContain("0,012 EUR");
    expect(deepGet<HTMLAnchorElement>(chat, ".sources a").rel).toBe("noopener noreferrer");
    // the garden changed: the lists are loaded again
    expect(refresh).toHaveBeenCalled();

    deepGet<HTMLButtonElement>(chat, "button.undo").click();
    await vi.waitFor(() => expect(deepText(chat)).toContain("rückgängig gemacht"));
    expect(calls(backend, "plant_garden/agent/undo")[0]).toMatchObject({ action_id: "ACT1" });
    expect(chat.shadowRoot?.querySelectorAll("button.undo")).toHaveLength(1);
  });

  it("sends with Enter, keeps the conversation and clears it", async () => {
    const backend = fakeBackend();
    backend.agentReply = {
      steps: [],
      actions: [],
      message: { ...ANSWER, actions: [], text: "Gern." },
    };
    const chat = await mount(backend);
    await type(chat, "Danke dir");
    const input = deepGet<HTMLTextAreaElement>(chat, "textarea");
    // Shift+Enter is a new line, Enter sends
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }));
    expect(asked(backend)).toHaveLength(0);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await vi.waitFor(() => expect(deepText(chat)).toContain("Gern."));
    expect(asked(backend)[0]?.text).toBe("Danke dir");
    expect(chat.shadowRoot?.querySelectorAll(".message.user")).toHaveLength(1);
    expect(input.value).toBe("");

    deepGet<HTMLButtonElement>(chat, "button.clear").click();
    await vi.waitFor(() => expect(chat.shadowRoot?.querySelectorAll(".message")).toHaveLength(0));
    expect(calls(backend, "plant_garden/agent/clear")).toHaveLength(1);
  });

  it("keeps the question when the answer fails", async () => {
    const backend = fakeBackend(); // no reply prepared: the backend answers with an error
    const chat = await mount(backend);
    await type(chat, "Was ist zu tun?");
    deepGet<HTMLFormElement>(chat, "form.ask").requestSubmit();
    await vi.waitFor(() => expect(deepText(chat)).toContain("No AI provider that can use tools"));
    expect(deepGet<HTMLTextAreaElement>(chat, "textarea").value).toBe("Was ist zu tun?");
    expect(chat.shadowRoot?.querySelectorAll(".message")).toHaveLength(0);
  });

  it("says which providers work when none is set up", async () => {
    const backend = fakeBackend({ agent: { available: false, provider: null, web: false } });
    const chat = document.createElement("pg-agent-chat") as PgAgentChat;
    chat.hass = backend.hass;
    document.body.append(chat);
    await chat.updateComplete;
    deepGet<HTMLButtonElement>(chat, "button.opener").click();
    await vi.waitFor(() => expect(deepText(chat)).toContain("fehlt ein passender KI-Anbieter"));
    expect(deepQuery(chat, "textarea")).toBeNull();
  });
});
