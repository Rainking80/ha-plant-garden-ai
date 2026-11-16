// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PgConfirmDialog } from "../src/components/confirm-dialog";
import { GardenStore } from "../src/state/garden-store";
import "../src/views/dream-view";
import type { PgDreamView } from "../src/views/dream-view";
import { parseRoute } from "../src/panel";
import { deepGet, deepQuery, deepText, fakeBackend, makeDream, type FakeBackend } from "./fixtures";

vi.mock("../src/util/image", () => ({
  prepareImage: async (file: File) => ({
    blob: file,
    filename: file.name,
    takenAt: null,
    gps: null,
  }),
}));

const IMAGE = {
  available: true,
  provider: "OpenAI",
  model: "gpt-image-2",
  cost: 0.068,
  currency: "EUR",
  cost_known: true,
};

const calls = (backend: FakeBackend, type: string) =>
  backend.callWS.mock.calls
    .map(([msg]) => msg as Record<string, unknown> & { type: string })
    .filter((msg) => msg.type === type);

async function mount(backend: FakeBackend): Promise<PgDreamView> {
  const store = new GardenStore(() => backend.hass);
  await store.refresh();
  const view = document.createElement("pg-dream-view") as PgDreamView;
  view.hass = backend.hass;
  view.store = store;
  document.body.append(view);
  await vi.waitFor(() => expect(deepText(view)).toContain("Traumgarten"));
  return view;
}

const click = (view: PgDreamView, selector: string) =>
  deepGet<HTMLButtonElement>(view, selector).click();

afterEach(() => {
  document.body.innerHTML = "";
});

describe("dream garden", () => {
  it("has its own tab", () => {
    expect(parseRoute("/dream")).toEqual({ name: "dream" });
  });

  it("uploads a photo and opens the new design", async () => {
    const backend = fakeBackend({ dreamImage: IMAGE });
    const design = makeDream();
    (backend.hass.fetchWithAuth as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      backend.dreams = [design];
      return new Response(JSON.stringify(design), { status: 200 });
    });
    const view = await mount(backend);
    expect(deepText(view)).toContain("ohne Metadaten und ohne Standort");

    const input = deepGet<HTMLInputElement>(view, 'input[type="file"]');
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["x"], "garten.jpg", { type: "image/jpeg" })],
    });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(deepText(view)).toContain("1 · Was die KI sieht"));
    expect(backend.hass.fetchWithAuth).toHaveBeenCalledWith(
      "/api/plant_garden/dreams",
      expect.objectContaining({ method: "POST" }),
    );
    // no AI call happened by itself
    expect(calls(backend, "plant_garden/dream/look")).toHaveLength(0);
  });

  it("goes from the AI's questions to a concept, a picture and planned plants", async () => {
    const backend = fakeBackend({ dreams: [makeDream()], dreamImage: IMAGE });
    const view = await mount(backend);
    click(view, ".tile");
    await view.updateComplete;

    // step 1: the AI describes and asks back
    click(view, "button.look");
    await vi.waitFor(() => expect(deepText(view)).toContain("Ich sehe einen Rasen"));
    expect(deepText(view)).toContain("Was soll sich ändern?");
    // keep the hedge, answer a question, choose a style
    const keep = [...(view.shadowRoot?.querySelectorAll<HTMLButtonElement>(".keep .chip") ?? [])];
    keep.find((chip) => chip.textContent?.trim() === "Hecke")?.click();
    const answers = [
      ...(view.shadowRoot?.querySelectorAll<HTMLButtonElement>(".question .chip") ?? []),
    ];
    answers.find((chip) => chip.textContent?.trim() === "wenig")?.click();
    const styles = [
      ...(view.shadowRoot?.querySelectorAll<HTMLButtonElement>(".styles .chip") ?? []),
    ];
    // the style the AI suggested is marked
    expect(styles.find((chip) => chip.classList.contains("suggested"))?.textContent?.trim()).toBe(
      "Bauerngarten",
    );
    styles.find((chip) => chip.textContent?.trim() === "Bauerngarten")?.click();
    const wish = deepGet<HTMLTextAreaElement>(view, "textarea");
    wish.value = "Mehr Blüten für Bienen";
    wish.dispatchEvent(new Event("input"));
    await view.updateComplete;

    // step 2: the concept
    click(view, "button.concept");
    await vi.waitFor(() => expect(deepText(view)).toContain("5 × Lavendel"));
    expect(calls(backend, "plant_garden/dream/concept")[0]).toMatchObject({
      wish: "Mehr Blüten für Bienen",
      style: "cottage",
      strength: "medium",
      keep: ["Hecke"],
      answers: [{ question: "Wie viel Pflege?", answer: "wenig" }],
    });
    const text = deepText(view);
    expect(text).toContain("Lavandula angustifolia");
    expect(text).toContain("Abstand 40 cm");
    expect(text).toContain("Für Katzen leicht giftig.");
    expect(text).toContain("Rasenkante abstechen");

    // step 3: the picture warns about its cost and asks first
    expect(text).toContain("Ein Bild kostet etwa 0,068 EUR.");
    expect(text).toContain("Anbieter: OpenAI, Modell gpt-image-2.");
    const confirm = deepGet<PgConfirmDialog>(view, "pg-confirm-dialog");
    const ask = vi.spyOn(confirm, "ask").mockResolvedValueOnce(false);
    click(view, "button.picture");
    await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    expect(ask.mock.calls[0]?.[1]).toContain("Ein Bild kostet etwa 0,068 EUR.");
    expect(ask.mock.calls[0]?.[1]).toContain("Jedes Bild wird einzeln berechnet");
    await view.updateComplete;
    // declined: nothing is created
    expect(calls(backend, "plant_garden/dream/picture")).toHaveLength(0);

    // leave the catmint out, then confirm
    view.shadowRoot
      ?.querySelectorAll<HTMLInputElement>('.plants input[type="checkbox"]')[1]
      ?.click();
    await view.updateComplete;
    ask.mockResolvedValue(true);
    click(view, "button.picture");
    await vi.waitFor(() => expect(deepQuery(view, ".compare .after")).not.toBeNull());
    expect(calls(backend, "plant_garden/dream/picture")[0]).toMatchObject({ plants: ["DP1"] });
    expect(deepText(view)).toContain("Eine Idee, kein Bauplan");
    expect(deepText(view)).toContain("dieses Bild: 0,061 EUR");

    // the slider reveals before and after
    const slider = deepGet<HTMLInputElement>(view, ".slider");
    slider.value = "80";
    slider.dispatchEvent(new Event("input"));
    await view.updateComplete;
    expect(deepGet<HTMLElement>(view, ".compare").style.getPropertyValue("--reveal")).toBe("80%");

    // refine the picture in words
    const instruction = deepGet<HTMLInputElement>(view, "input.instruction");
    instruction.value = "mehr Weiß";
    instruction.dispatchEvent(new Event("input"));
    await view.updateComplete;
    click(view, "button.refine");
    await vi.waitFor(() => expect(calls(backend, "plant_garden/dream/picture")).toHaveLength(2));
    expect(calls(backend, "plant_garden/dream/picture")[1]).toMatchObject({
      base: "PIC1",
      instruction: "mehr Weiß",
    });
    await vi.waitFor(() => expect(view.shadowRoot?.querySelectorAll(".thumb")).toHaveLength(2));

    // take the ticked plant over
    click(view, "button.plant");
    await vi.waitFor(() => expect(deepText(view)).toContain("eingeplant"));
    expect(calls(backend, "plant_garden/dream/plant")[0]).toMatchObject({ plants: ["DP1"] });
  });

  it("says when no provider can create pictures", async () => {
    const design = makeDream({
      concept: { summary: "Ein Beet.", changes: [], hardscape: [], plants: [] },
    });
    const backend = fakeBackend({
      dreams: [design],
      dreamImage: { ...IMAGE, available: false, provider: null, model: null, cost: null },
    });
    const view = await mount(backend);
    click(view, ".tile");
    await view.updateComplete;
    expect(deepText(view)).toContain("Kein KI-Anbieter für Bilder eingerichtet");
    expect(deepGet<HTMLButtonElement>(view, "button.picture").disabled).toBe(true);
  });

  it("warns when the price is only known afterwards and deletes a design", async () => {
    const backend = fakeBackend({
      dreams: [
        makeDream({ concept: { summary: "Ein Beet.", changes: [], hardscape: [], plants: [] } }),
      ],
      dreamImage: { ...IMAGE, provider: "OpenRouter", cost: null, cost_known: false },
    });
    const view = await mount(backend);
    click(view, ".tile");
    await view.updateComplete;
    expect(deepText(view)).toContain("ist vorab nicht bekannt - rechne mit mehreren Cent");

    const confirm = deepGet<PgConfirmDialog>(view, "pg-confirm-dialog");
    vi.spyOn(confirm, "ask").mockResolvedValue(true);
    click(view, ".bar .icon-button");
    await vi.waitFor(() => expect(calls(backend, "plant_garden/dream/delete")).toHaveLength(1));
    await vi.waitFor(() => expect(deepQuery(view, ".tile")).toBeNull());
  });
});
