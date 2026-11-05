import { describe, expect, it } from "vitest";

import type { DrawState } from "@/lib/playback/draw-state";
import { MOTION_ZOOM, motionDraw } from "@/lib/playback/motion-draw";

const base: DrawState = { x: 100, y: 50, width: 800, height: 600, rotation: 0, opacity: 1 };
const centre = (d: DrawState) => ({ x: d.x + d.width / 2, y: d.y + d.height / 2 });

describe("motionDraw", () => {
  it("zoom-in grows the picture about its centre, from its normal size to a little bigger", () => {
    const start = motionDraw("zoom-in", 0, base);
    const end = motionDraw("zoom-in", 1, base);
    expect(start).toEqual(base);
    expect(end.width).toBeCloseTo(800 * MOTION_ZOOM);
    expect(end.height).toBeCloseTo(600 * MOTION_ZOOM);
    expect(centre(end).x).toBeCloseTo(centre(base).x);
    expect(centre(end).y).toBeCloseTo(centre(base).y);
  });

  it("zoom-out is the other way round", () => {
    expect(motionDraw("zoom-out", 0, base).width).toBeCloseTo(800 * MOTION_ZOOM);
    expect(motionDraw("zoom-out", 1, base).width).toBeCloseTo(800);
  });

  it("pans sideways while zoomed in a little, so the edges never show", () => {
    const left0 = motionDraw("pan-left", 0, base);
    const left1 = motionDraw("pan-left", 1, base);
    expect(left0.width).toBeCloseTo(800 * MOTION_ZOOM);
    expect(centre(left1).x).toBeLessThan(centre(left0).x);
    // The picture still covers the whole of its original box at both ends.
    for (const d of [left0, left1]) {
      expect(d.x).toBeLessThanOrEqual(base.x + 1e-9);
      expect(d.x + d.width).toBeGreaterThanOrEqual(base.x + base.width - 1e-9);
    }
    const right0 = motionDraw("pan-right", 0, base);
    const right1 = motionDraw("pan-right", 1, base);
    expect(centre(right1).x).toBeGreaterThan(centre(right0).x);
  });

  it("holds at the ends for progress outside 0 to 1, and changes nothing but size and position", () => {
    expect(motionDraw("zoom-in", -3, base)).toEqual(base);
    expect(motionDraw("zoom-in", 9, base).width).toBeCloseTo(800 * MOTION_ZOOM);
    const moved = motionDraw("zoom-in", 0.5, { ...base, rotation: 12, opacity: 0.4 });
    expect(moved.rotation).toBe(12);
    expect(moved.opacity).toBe(0.4);
  });
});
