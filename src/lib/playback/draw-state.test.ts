import { describe, expect, it } from "vitest";

import { clipDrawState } from "@/lib/playback/draw-state";
import { makeClip } from "@/lib/timeline/test-utils";
import type { Keyframe } from "@/types/keyframe";

const kf = (time: number, x: number, overrides: Partial<Keyframe> = {}): Keyframe => ({
  id: `k${time}-${x}`,
  time,
  x,
  y: 0,
  rotation: 0,
  opacity: 1,
  ...overrides,
});

const transform = { x: 10, y: 20, width: 300, height: 200, rotation: 15, opacity: 0.8 };

describe("clipDrawState: without keyframes", () => {
  it("uses the clip's transform", () => {
    const clip = makeClip({ transform });
    expect(clipDrawState(clip, 1)).toEqual(transform);
  });
});

describe("clipDrawState: keyframes", () => {
  const clip = (keyframes: Keyframe[]) => makeClip({ transform, keyframes });

  it("holds the first keyframe before it and the last after it", () => {
    const c = clip([kf(1, 0), kf(3, 100)]);
    expect(clipDrawState(c, 0).x).toBe(0);
    expect(clipDrawState(c, 1).x).toBe(0);
    expect(clipDrawState(c, 3).x).toBe(100);
    expect(clipDrawState(c, 5).x).toBe(100);
  });

  it("blends linearly between keyframes", () => {
    const c = clip([kf(1, 0), kf(3, 100)]);
    expect(clipDrawState(c, 2).x).toBe(50);
  });

  it("blends x, y, rotation and opacity together", () => {
    const c = clip([
      kf(1, 0, { y: 0, rotation: 0, opacity: 0 }),
      kf(3, 100, { y: 200, rotation: 90, opacity: 1 }),
    ]);
    expect(clipDrawState(c, 2)).toMatchObject({ x: 50, y: 100, rotation: 45, opacity: 0.5 });
  });

  it("keeps the transform's width and height", () => {
    const state = clipDrawState(clip([kf(1, 0), kf(3, 100)]), 2);
    expect(state.width).toBe(300);
    expect(state.height).toBe(200);
  });

  it("handles keyframes given out of order", () => {
    expect(clipDrawState(clip([kf(3, 100), kf(1, 0)]), 2).x).toBe(50);
  });

  it("applies a single keyframe at every time", () => {
    const c = clip([kf(2, 42)]);
    expect(clipDrawState(c, 0).x).toBe(42);
    expect(clipDrawState(c, 9).x).toBe(42);
  });

  it("never produces NaN when keyframes share a time", () => {
    const c = clip([kf(2, 0), kf(2, 100), kf(4, 200)]);
    for (const t of [0, 2, 3, 4, 6]) {
      const state = clipDrawState(c, t);
      for (const value of Object.values(state)) expect(Number.isFinite(value)).toBe(true);
    }
    expect(clipDrawState(c, 3).x).toBe(150);
  });
});

describe("clipDrawState: fades", () => {
  it("multiplies the fade ramp into opacity", () => {
    const c = makeClip({ transform, fadeIn: 2, sourceIn: 0, sourceOut: 10 });
    expect(clipDrawState(c, 0).opacity).toBe(0);
    expect(clipDrawState(c, 1).opacity).toBeCloseTo(0.4, 9);
    expect(clipDrawState(c, 2).opacity).toBeCloseTo(0.8, 9);
  });

  it("fades out toward the end of the clip", () => {
    const c = makeClip({ transform, fadeOut: 2, sourceIn: 0, sourceOut: 10 });
    expect(clipDrawState(c, 9).opacity).toBeCloseTo(0.4, 9);
  });

  it("multiplies fades into keyframed opacity too", () => {
    const c = makeClip({ transform, fadeIn: 2, keyframes: [kf(0, 0, { opacity: 0.5 })] });
    expect(clipDrawState(c, 1).opacity).toBeCloseTo(0.25, 9);
  });
});
