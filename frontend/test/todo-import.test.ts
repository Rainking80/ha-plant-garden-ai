// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/components/todo-import";
import type { PgTodoImport } from "../src/components/todo-import";
import { deepGet, deepText, fakeBackend } from "./fixtures";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("pg-todo-import", () => {
  it("imports the list entries as plants, skipping existing ones", async () => {
    const backend = fakeBackend({
      states: {
        "todo.einkauf": { entity_id: "todo.einkauf", state: "0", attributes: {} },
        "todo.pflanzen": {
          entity_id: "todo.pflanzen",
          state: "3",
          attributes: { friendly_name: "Pflanzen" },
        },
      },
      todo: {
        "todo.pflanzen": [
          { uid: "1", summary: "Rasen", status: "needs_action" },
          { uid: "2", summary: "Bonsai", status: "completed" },
          { uid: "3", summary: "Hortensie", status: "needs_action" },
        ],
      },
    });
    const dialog = document.createElement("pg-todo-import") as PgTodoImport;
    dialog.hass = backend.hass;
    dialog.existingNames = ["hortensie"];
    document.body.append(dialog);
    await dialog.updateComplete;
    const imported = vi.fn();
    dialog.addEventListener("imported", imported);

    dialog.open();
    // the list that looks like a plant list is preselected
    await vi.waitFor(() => expect(deepText(dialog)).toContain("Bonsai"));
    expect(deepText(dialog)).toContain("gibt es schon");

    const action = [...(dialog.shadowRoot?.querySelectorAll("button") ?? [])].find((b) =>
      b.textContent?.includes("importieren"),
    );
    expect(action?.textContent?.trim()).toBe("2 importieren");
    action?.click();
    await vi.waitFor(() => expect(imported).toHaveBeenCalled());

    const created = backend.callWS.mock.calls
      .map(([msg]) => msg as Record<string, unknown>)
      .filter((msg) => msg.type === "plant_garden/plants/create");
    expect(created.map(({ type: _t, ...fields }) => fields)).toEqual([
      { name: "Rasen", category: "lawn", location_type: "lawn" },
      { name: "Bonsai", category: "potted", location_type: "pot" },
    ]);
    expect(imported.mock.calls[0]?.[0].detail).toEqual({ count: 2 });
    expect(deepGet(dialog, "dialog")).toBeDefined();
  });
});
