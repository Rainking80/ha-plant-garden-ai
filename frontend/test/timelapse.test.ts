// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/components/timelapse";
import { timelapseFrames, type PgTimelapse } from "../src/components/timelapse";
import { deepGet, deepText, fakeBackend, makePhoto } from "./fixtures";

const PHOTOS = [
  makePhoto("C3", "2026-07-03T12:00:00Z", { tags: ["camera"] }),
  makePhoto("U1", "2026-07-02T15:00:00Z"),
  makePhoto("C2", "2026-07-02T12:00:00Z", { tags: ["camera"] }),
  makePhoto("C1", "2026-07-01T12:00:00Z", { tags: ["camera"] }),
];

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("timelapseFrames", () => {
  it("plays oldest first, optionally camera pictures only", () => {
    expect(timelapseFrames(PHOTOS, false).map((p) => p.id)).toEqual(["C1", "C2", "U1", "C3"]);
    expect(timelapseFrames(PHOTOS, true).map((p) => p.id)).toEqual(["C1", "C2", "C3"]);
  });
});

describe("pg-timelapse", () => {
  it("plays the camera pictures, pauses at the end and can show all photos", async () => {
    vi.useFakeTimers();
    const lapse = document.createElement("pg-timelapse") as PgTimelapse;
    lapse.hass = fakeBackend().hass;
    document.body.append(lapse);
    lapse.open(PHOTOS);
    await lapse.updateComplete;
    await vi.advanceTimersByTimeAsync(0);
    await lapse.updateComplete;
    const image = () => deepGet<HTMLImageElement>(lapse, ".stage img");
    // camera pictures only, starting with the oldest
    expect(image().getAttribute("src")).toBe(makePhoto("C1", "x").urls.medium);
    expect(deepText(lapse)).toContain("Foto 1 von 3");
    expect(deepText(lapse)).toContain("Pause");

    // 5 pictures a second: after 400 ms the last one, then it stops
    await vi.advanceTimersByTimeAsync(400);
    await lapse.updateComplete;
    expect(deepText(lapse)).toContain("Foto 3 von 3");
    await vi.advanceTimersByTimeAsync(400);
    await lapse.updateComplete;
    expect(deepText(lapse)).toContain("Abspielen");
    expect(deepText(lapse)).toContain("Foto 3 von 3");

    // all photos
    const check = deepGet<HTMLInputElement>(lapse, 'input[type="checkbox"]');
    expect(check.checked).toBe(true);
    check.checked = false;
    check.dispatchEvent(new Event("change"));
    await lapse.updateComplete;
    expect(deepText(lapse)).toContain("Foto 1 von 4");

    // scrubbing
    const scrub = deepGet<HTMLInputElement>(lapse, ".scrub");
    scrub.value = "2";
    scrub.dispatchEvent(new Event("input"));
    await lapse.updateComplete;
    expect(image().getAttribute("src")).toBe(makePhoto("U1", "x").urls.medium);
  });
});
