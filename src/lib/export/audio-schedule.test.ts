import { describe, expect, it } from "vitest";

import { applyGainPoints, scheduleMixItem } from "@/lib/export/audio-schedule";
import type { MixdownItem } from "@/lib/engine/mixdown";

const item = (overrides: Partial<MixdownItem> = {}): MixdownItem => ({
  clipId: "c",
  mediaId: "m",
  startAt: 4,
  sourceIn: 2,
  sourceOut: 8,
  playbackRate: 1,
  reversed: false,
  gainPoints: [],
  ...overrides,
});

describe("scheduleMixItem", () => {
  it("plays the trimmed span from the clip's start", () => {
    expect(scheduleMixItem(item())).toEqual({ when: 4, offset: 2, duration: 6, rate: 1, reversed: false });
  });

  it("measures the span in the file's own seconds whatever the speed", () => {
    const s = scheduleMixItem(item({ playbackRate: 2 }));
    expect(s).toMatchObject({ duration: 6, rate: 2 });
  });

  it("carries reversed through", () => {
    expect(scheduleMixItem(item({ reversed: true })).reversed).toBe(true);
  });

  it("never starts before time zero", () => {
    expect(scheduleMixItem(item({ startAt: -1 })).when).toBe(0);
  });
});

describe("applyGainPoints", () => {
  function fakeParam() {
    const calls: Array<[string, number, number]> = [];
    return {
      calls,
      param: {
        setValueAtTime: (v: number, t: number) => void calls.push(["set", v, t]),
        linearRampToValueAtTime: (v: number, t: number) => void calls.push(["ramp", v, t]),
      },
    };
  }

  it("sets the first point and ramps linearly to each later one", () => {
    const { calls, param } = fakeParam();
    applyGainPoints(param, [
      { time: 4, value: 0 },
      { time: 5, value: 1 },
      { time: 9, value: 1 },
      { time: 10, value: 0 },
    ]);
    expect(calls).toEqual([
      ["set", 0, 4],
      ["ramp", 1, 5],
      ["ramp", 1, 9],
      ["ramp", 0, 10],
    ]);
  });

  it("does nothing for no points", () => {
    const { calls, param } = fakeParam();
    applyGainPoints(param, []);
    expect(calls).toEqual([]);
  });
});
