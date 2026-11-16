// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/components/camera-crop";
import type { PgCameraCrop } from "../src/components/camera-crop";
import { deepGet, deepText, fakeBackend, makePlant, type FakeBackend } from "./fixtures";

const calls = (backend: FakeBackend, type: string) =>
  backend.callWS.mock.calls
    .map(([msg]) => msg as Record<string, unknown> & { type: string })
    .filter((msg) => msg.type === type);

async function mount(backend: FakeBackend): Promise<PgCameraCrop> {
  const dialog = document.createElement("pg-camera-crop") as PgCameraCrop;
  dialog.hass = backend.hass;
  document.body.append(dialog);
  dialog.open("R");
  await vi.waitFor(() => deepGet(dialog, ".stage"));
  // the stage measures 400 x 225 px on screen
  deepGet<HTMLElement>(dialog, ".stage").getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 225, right: 400, bottom: 225 }) as DOMRect;
  return dialog;
}

function pointer(type: string, target: Element, x: number, y: number): void {
  target.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, bubbles: true }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("pg-camera-crop", () => {
  it("shows the camera picture and saves the frame the user drags", async () => {
    const backend = fakeBackend({
      plants: [makePlant({ id: "R", name: "Rose", camera_entity_id: "camera.beet" })],
    });
    const dialog = await mount(backend);
    expect(deepText(dialog)).toContain("Zieh den Rahmen um die Pflanze");
    expect(deepGet<HTMLImageElement>(dialog, ".stage img").getAttribute("src")).toBe(
      "data:image/jpeg;base64,AAAA",
    );
    // it starts with the whole picture: nothing to reset yet
    expect(deepGet<HTMLButtonElement>(dialog, "button.whole").disabled).toBe(true);
    const saved = vi.fn();
    dialog.addEventListener("frame-saved", saved);

    // drag the top-left corner to the middle: the lower right quarter stays
    const stage = deepGet<HTMLElement>(dialog, ".stage");
    pointer("pointerdown", deepGet(dialog, ".handle.nw"), 0, 0);
    pointer("pointermove", stage, 200, 112.5);
    pointer("pointerup", stage, 200, 112.5);
    await dialog.updateComplete;
    const box = deepGet<HTMLElement>(dialog, ".box");
    expect(box.style.left).toBe("50.000%");
    expect(box.style.top).toBe("50.000%");

    deepGet<HTMLButtonElement>(dialog, "button.apply").click();
    await vi.waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(calls(backend, "plant_garden/camera/crop")[0]).toMatchObject({
      plant_id: "R",
      crop: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    });
  });

  it("opens with the frame set before and can go back to the whole picture", async () => {
    const backend = fakeBackend({
      plants: [
        makePlant({
          id: "R",
          camera_entity_id: "camera.beet",
          camera_crop: { x: 0.25, y: 0.1, w: 0.5, h: 0.6 },
        }),
      ],
    });
    const dialog = await mount(backend);
    const box = deepGet<HTMLElement>(dialog, ".box");
    expect(box.style.left).toBe("25.000%");
    expect(box.style.height).toBe("60.000%");

    // arrow keys move the frame
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await dialog.updateComplete;
    expect(box.style.left).toBe("27.000%");

    deepGet<HTMLButtonElement>(dialog, "button.whole").click();
    await dialog.updateComplete;
    deepGet<HTMLButtonElement>(dialog, "button.apply").click();
    await vi.waitFor(() => expect(calls(backend, "plant_garden/camera/crop")).toHaveLength(1));
    // the whole picture is stored as "no frame"
    expect(calls(backend, "plant_garden/camera/crop")[0]?.crop).toBeNull();
  });

  it("says when the camera delivers no picture", async () => {
    const backend = fakeBackend({ plants: [makePlant({ id: "R" })] });
    backend.callWS.mockRejectedValueOnce({ code: "invalid_format", message: "Kamera offline" });
    const dialog = document.createElement("pg-camera-crop") as PgCameraCrop;
    dialog.hass = backend.hass;
    document.body.append(dialog);
    dialog.open("R");
    await vi.waitFor(() => expect(deepText(dialog)).toContain("Kamera offline"));
    expect(deepGet<HTMLButtonElement>(dialog, "button.apply").disabled).toBe(true);
  });
});
