// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/components/photo-crop";
import "../src/components/photo-viewer";
import type { PgPhotoCrop } from "../src/components/photo-crop";
import type { PgPhotoViewer } from "../src/components/photo-viewer";
import {
  clampBox,
  dragBox,
  fitRatio,
  FULL,
  isFull,
  MIN_CROP,
  plantness,
  ratioFor,
  suggestCrop,
  turnBox,
  type CropBox,
  type Pixels,
} from "../src/util/crop";
import { deepGet, deepQuery, deepText, fakeBackend, makePhoto } from "./fixtures";

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("missing");
  return value;
}

const close = (box: CropBox, expected: CropBox) => {
  for (const key of ["x", "y", "w", "h"] as const) expect(box[key]).toBeCloseTo(expected[key], 6);
};

/** An image of one colour with a rectangle of another. */
function picture(
  width: number,
  height: number,
  background: [number, number, number],
  rect?: { x0: number; y0: number; x1: number; y1: number; color: [number, number, number] },
): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = rect && x >= rect.x0 && x < rect.x1 && y >= rect.y0 && y < rect.y1;
      const [r, g, b] = inside ? rect.color : background;
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

describe("crop geometry", () => {
  it("keeps boxes inside the image and not too small", () => {
    close(clampBox({ x: 0.8, y: -0.1, w: 0.5, h: 0.01 }), { x: 0.5, y: 0, w: 0.5, h: MIN_CROP });
    expect(isFull(FULL)).toBe(true);
    expect(isFull({ x: 0, y: 0, w: 0.99, h: 1 })).toBe(false);
  });

  it("follows the photo when it is turned", () => {
    const box = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    close(turnBox(box), { x: 0.4, y: 0.1, w: 0.4, h: 0.3 });
    close(turnBox(turnBox(turnBox(turnBox(box)))), box);
  });

  it("fits a square into the box", () => {
    // a square on a 4:3 photo is 3/4 as wide as high in fractions
    const ratio = ratioFor(1, 800, 600);
    expect(ratio).toBeCloseTo(0.75);
    close(fitRatio(FULL, ratio), { x: 0.125, y: 0, w: 0.75, h: 1 });
  });

  it("moves, and drags edges and corners within the image", () => {
    const box = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    close(dragBox(box, "move", 0.5, -0.5), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
    close(dragBox(box, "se", 0.1, 0.9), { x: 0.2, y: 0.2, w: 0.6, h: 0.8 });
    // the west edge moves, the east one stays
    close(dragBox(box, "w", -0.5, 0), { x: 0, y: 0.2, w: 0.7, h: 0.5 });
    close(dragBox(box, "n", 0, 0.9), { x: 0.2, y: 0.7 - MIN_CROP, w: 0.5, h: MIN_CROP });
    // with a ratio the opposite corner stays and the ratio holds
    const square = dragBox(box, "nw", -0.1, -0.05, 1);
    close(square, { x: 0.1, y: 0.1, w: 0.6, h: 0.6 });
    const big = dragBox(box, "se", 1, 1, 0.75);
    expect(big.w / big.h).toBeCloseTo(0.75);
    expect(big.x + big.w).toBeLessThanOrEqual(1);
    expect(big.y + big.h).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("plant suggestion", () => {
  it("tells leaves and flowers from sky, soil and walls", () => {
    expect(plantness(60, 140, 50)).toBeGreaterThan(0); // leaf
    expect(plantness(210, 30, 60)).toBeGreaterThan(0); // red rose
    expect(plantness(120, 170, 230)).toBe(0); // sky
    expect(plantness(120, 85, 55)).toBe(0); // soil
    expect(plantness(160, 160, 160)).toBe(0); // wall
  });

  it("frames a plant on a plain background", () => {
    const leaves = picture(100, 80, [150, 140, 130], {
      x0: 30,
      y0: 20,
      x1: 60,
      y1: 60,
      color: [50, 150, 40],
    });
    const box = must(suggestCrop(leaves));
    expect(box.x).toBeGreaterThan(0.2);
    expect(box.x).toBeLessThan(0.3);
    expect(box.x + box.w).toBeGreaterThan(0.6);
    expect(box.x + box.w).toBeLessThan(0.7);
    expect(box.y).toBeGreaterThan(0.15);
    expect(box.y).toBeLessThan(0.25);
    expect(box.y + box.h).toBeGreaterThan(0.74);
    expect(box.y + box.h).toBeLessThan(0.85);
  });

  it("suggests nothing without a plant and nearly everything for a hedge", () => {
    expect(suggestCrop(picture(60, 40, [150, 140, 130]))).toBeNull();
    const hedge = must(suggestCrop(picture(60, 40, [50, 150, 40])));
    expect(hedge.w).toBeGreaterThan(0.85);
    expect(hedge.h).toBeGreaterThan(0.85);
  });
});

describe("crop dialog", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  async function mount() {
    const backend = fakeBackend();
    const crop = document.createElement("pg-photo-crop") as PgPhotoCrop;
    crop.hass = backend.hass;
    document.body.append(crop);
    await crop.updateComplete;
    return { backend, crop };
  }

  const sent = (backend: ReturnType<typeof fakeBackend>) =>
    vi.mocked(backend.callWS).mock.calls.map(([msg]) => msg as Record<string, unknown>);

  it("goes through new photos and saves a dragged frame", async () => {
    const { backend, crop } = await mount();
    const changed = vi.fn();
    crop.addEventListener("photos-changed", changed);
    const done = crop.edit([
      makePhoto("P1", "2026-07-01T10:00:00Z"),
      makePhoto("P2", "2026-07-01T10:00:00Z"),
    ]);
    await crop.updateComplete;
    expect(deepText(crop)).toContain("Foto 1 von 2");
    expect(deepGet<HTMLImageElement>(crop, ".stage img").getAttribute("src")).toContain("/source");

    // skip the first, drag the corner of the second
    deepGet<HTMLButtonElement>(crop, ".dialog-actions .text").click();
    await crop.updateComplete;
    expect(deepText(crop)).toContain("Foto 2 von 2");
    const stage = deepGet<HTMLElement>(crop, ".stage");
    // the photo's size on screen (happy-dom does no layout)
    const width = 400;
    const height = 300;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, width, height));
    const pointer = (type: string, x: number, y: number) =>
      new PointerEvent(type, {
        pointerId: 1,
        clientX: x,
        clientY: y,
        bubbles: true,
        composed: true,
      });
    deepGet<HTMLElement>(crop, ".handle.se").dispatchEvent(pointer("pointerdown", 500, 400));
    stage.dispatchEvent(pointer("pointermove", 500 - width * 0.2, 400 - height * 0.25));
    stage.dispatchEvent(pointer("pointerup", 0, 0));
    deepGet<HTMLButtonElement>(crop, ".apply").click();
    await done;

    const [edit] = sent(backend).filter((msg) => msg.type === "plant_garden/photos/edit");
    expect(edit?.photo_id).toBe("P2");
    expect(edit?.rotate).toBe(0);
    const box = edit?.crop as CropBox;
    close(box, { x: 0, y: 0, w: 0.8, h: 0.75 });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(deepQuery(crop, ".stage")).toBeNull();
  });

  it("turns a photo, keeps a square and goes back to the upload", async () => {
    const { backend, crop } = await mount();
    let done = crop.edit([makePhoto("P1", "2026-07-01T10:00:00Z")]);
    await crop.updateComplete;
    const button = (label: string) =>
      must(
        [...(crop.shadowRoot?.querySelectorAll("button") ?? [])].find((b) =>
          b.textContent?.includes(label),
        ),
      );
    button("Drehen").click();
    button("Quadrat").click();
    await crop.updateComplete;
    // a square only has corners
    expect(crop.shadowRoot?.querySelectorAll(".handle")).toHaveLength(4);
    button("Übernehmen").click();
    await done;
    let [edit] = sent(backend).filter((msg) => msg.type === "plant_garden/photos/edit");
    expect(edit?.rotate).toBe(90);
    // turned, the 800 x 600 photo is 600 x 800: the square is the full width
    close(edit?.crop as CropBox, { x: 0, y: 0.125, w: 1, h: 0.75 });

    // an edited photo can go back to how it was uploaded
    vi.mocked(backend.callWS).mockClear();
    done = crop.edit([
      makePhoto("P1", "2026-07-01T10:00:00Z", {
        edit: { x: 0.1, y: 0.1, w: 0.5, h: 0.5, rotate: 90 },
      }),
    ]);
    await crop.updateComplete;
    // the upload's size comes with the image; happy-dom does not load it
    deepGet<HTMLImageElement>(crop, ".stage img").dispatchEvent(new Event("load"));
    await crop.updateComplete;
    button("Wie hochgeladen").click();
    button("Übernehmen").click();
    await done;
    [edit] = sent(backend).filter((msg) => msg.type === "plant_garden/photos/edit");
    expect(edit).toMatchObject({ photo_id: "P1", crop: null, rotate: 0 });
  });

  it("is opened from the photo viewer", async () => {
    const backend = fakeBackend();
    const viewer = document.createElement("pg-photo-viewer") as PgPhotoViewer;
    viewer.hass = backend.hass;
    viewer.photos = [makePhoto("P1", "2026-07-01T10:00:00Z")];
    viewer.plantId = "A";
    document.body.append(viewer);
    viewer.open(0);
    await viewer.updateComplete;
    const asked = vi.fn();
    viewer.addEventListener("crop-photo", asked);
    must(
      [...(viewer.shadowRoot?.querySelectorAll("button") ?? [])].find((b) =>
        b.textContent?.includes("Zuschneiden"),
      ),
    ).click();
    expect((asked.mock.calls[0]?.[0] as CustomEvent).detail.id).toBe("P1");
    // "Open original" shows the upload, not the crop
    expect(deepGet<HTMLAnchorElement>(viewer, "a.button").getAttribute("href")).toContain(
      "/source",
    );
  });
});
