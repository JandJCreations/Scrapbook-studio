import { describe, expect, it } from "vitest";

import type { DrawState } from "@/lib/playback/draw-state";
import { transitionDraw } from "@/lib/playback/transition-draw";

const base: DrawState = { x: 100, y: 50, width: 800, height: 600, rotation: 0, opacity: 0.8 };
const W = 1000;

describe("transitionDraw: fade", () => {
  it("fades the outgoing clip out over the incoming one, which stays as it is", () => {
    expect(transitionDraw("out", "fade", 0, base, W).opacity).toBeCloseTo(0.8);
    expect(transitionDraw("out", "fade", 0.25, base, W).opacity).toBeCloseTo(0.6);
    expect(transitionDraw("out", "fade", 1, base, W).opacity).toBeCloseTo(0);
    expect(transitionDraw("in", "fade", 0.4, base, W)).toEqual(base);
  });
});

describe("transitionDraw: dip to black", () => {
  it("fades the outgoing clip out in the first half and the incoming one in during the second", () => {
    expect(transitionDraw("out", "dip", 0.25, base, W).opacity).toBeCloseTo(0.4);
    expect(transitionDraw("out", "dip", 0.5, base, W).opacity).toBeCloseTo(0);
    expect(transitionDraw("out", "dip", 0.9, base, W).opacity).toBeCloseTo(0);
    expect(transitionDraw("in", "dip", 0.25, base, W).opacity).toBeCloseTo(0);
    expect(transitionDraw("in", "dip", 0.75, base, W).opacity).toBeCloseTo(0.4);
    expect(transitionDraw("in", "dip", 1, base, W).opacity).toBeCloseTo(0.8);
  });
});

describe("transitionDraw: slides", () => {
  it("slide-left pushes the outgoing clip off to the left while the incoming one enters from the right", () => {
    expect(transitionDraw("out", "slide-left", 0.5, base, W).x).toBe(100 - 500);
    expect(transitionDraw("in", "slide-left", 0.5, base, W).x).toBe(100 + 500);
    expect(transitionDraw("in", "slide-left", 1, base, W).x).toBe(100);
    expect(transitionDraw("in", "slide-left", 0, base, W).x).toBe(100 + W);
  });

  it("slide-right is the mirror image", () => {
    expect(transitionDraw("out", "slide-right", 0.5, base, W).x).toBe(100 + 500);
    expect(transitionDraw("in", "slide-right", 0.5, base, W).x).toBe(100 - 500);
  });

  it("changes nothing but the position", () => {
    const moved = transitionDraw("out", "slide-left", 0.3, base, W);
    expect({ ...moved, x: base.x }).toEqual(base);
  });
});

describe("transitionDraw: out of range progress", () => {
  it("is held at the ends", () => {
    expect(transitionDraw("out", "fade", -1, base, W).opacity).toBeCloseTo(0.8);
    expect(transitionDraw("out", "fade", 2, base, W).opacity).toBeCloseTo(0);
  });
});
