import { describe, expect, it, vi } from "vitest";

import { History, type Command } from "../src/util/history";
import { ulid } from "../src/util/ulid";
import {
  DEFAULT_VIEWPORT,
  fitBounds,
  gridStep,
  isViewport,
  metresPerPixel,
  panBy,
  planToScreen,
  scaleBar,
  screenToPlan,
  zoomAt,
} from "../src/util/viewport";

const RECT = { left: 100, top: 50, width: 800, height: 400 };

describe("viewport", () => {
  const vp = { cx: 10, cy: 5, width: 40 };

  it("maps the screen centre to the viewport centre", () => {
    expect(screenToPlan(vp, RECT, 500, 250)).toEqual({ x: 10, y: 5 });
    expect(screenToPlan(vp, RECT, 100, 50)).toEqual({ x: -10, y: -5 });
    expect(metresPerPixel(vp, RECT)).toBe(0.05);
  });

  it("converts back and forth", () => {
    const p = { x: 3.7, y: -1.2 };
    const s = planToScreen(vp, RECT, p);
    const back = screenToPlan(vp, RECT, s.x, s.y);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it("zooms around the cursor", () => {
    const before = screenToPlan(vp, RECT, 200, 120);
    const zoomed = zoomAt(vp, RECT, 200, 120, 2);
    expect(zoomed.width).toBe(20);
    const after = screenToPlan(zoomed, RECT, 200, 120);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("limits zoom", () => {
    expect(zoomAt(vp, RECT, 500, 250, 1000).width).toBe(1);
    expect(zoomAt(vp, RECT, 500, 250, 0.00001).width).toBe(5000);
  });

  it("pans so that content follows the pointer", () => {
    expect(panBy(vp, RECT, 100, -20)).toEqual({ cx: 5, cy: 6, width: 40 });
  });

  it("fits bounds with a margin, respecting the aspect ratio", () => {
    const fitted = fitBounds({ minX: 0, minY: 0, maxX: 10, maxY: 20 }, RECT);
    expect(fitted.cx).toBe(5);
    expect(fitted.cy).toBe(10);
    // 20 m tall in a 2:1 screen needs 40 m width, plus margins
    expect(fitted.width).toBeCloseTo(40 * 1.24);
    expect(fitBounds(null, RECT)).toEqual(DEFAULT_VIEWPORT);
  });

  it("picks readable grid steps and scale bars", () => {
    expect(gridStep(0.01)).toBe(0.25); // 100 px per metre
    expect(gridStep(0.1)).toBe(2);
    expect(scaleBar(0.05)).toEqual({ metres: 5, px: 100 });
  });

  it("validates stored viewports", () => {
    expect(isViewport({ cx: 1, cy: 2, width: 30 })).toBe(true);
    expect(isViewport({ cx: 1, cy: 2, width: 0 })).toBe(false);
    expect(isViewport({ cx: "1", cy: 2, width: 30 })).toBe(false);
    expect(isViewport(null)).toBe(false);
  });
});

describe("History", () => {
  function counter() {
    let value = 0;
    const make = (step: number, fail = false): Command => ({
      label: `+${step}`,
      run: async () => {
        if (fail) throw new Error("nope");
        value += step;
      },
      undo: async () => {
        value -= step;
      },
    });
    return { make, get: () => value };
  }

  it("executes, undoes and redoes", async () => {
    const c = counter();
    const history = new History();
    const changes = vi.fn();
    history.addEventListener("change", changes);
    expect(history.canUndo).toBe(false);

    await history.execute(c.make(1));
    await history.execute(c.make(10));
    expect(c.get()).toBe(11);
    await history.undo();
    expect(c.get()).toBe(1);
    expect(history.canRedo).toBe(true);
    await history.redo();
    expect(c.get()).toBe(11);
    await history.undo();
    await history.execute(c.make(100)); // a new command drops the redo stack
    expect(history.canRedo).toBe(false);
    expect(c.get()).toBe(101);
    expect(changes).toHaveBeenCalled();
  });

  it("does not record failed commands", async () => {
    const c = counter();
    const history = new History();
    await history.execute(c.make(1));
    await expect(history.execute(c.make(5, true))).rejects.toThrow("nope");
    await history.undo();
    expect(c.get()).toBe(0);
    expect(history.canUndo).toBe(false);
  });

  it("keeps a limited number of steps", async () => {
    const c = counter();
    const history = new History(2);
    for (const step of [1, 2, 3]) await history.execute(c.make(step));
    await history.undo();
    await history.undo();
    await history.undo(); // nothing left
    expect(c.get()).toBe(1);
  });
});

describe("ulid", () => {
  it("creates 26 Crockford characters that sort by time", () => {
    const a = ulid(1_700_000_000_000);
    const b = ulid(1_700_000_000_001);
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a < b).toBe(true);
    expect(ulid()).not.toBe(ulid());
  });
});
