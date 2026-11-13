import { describe, expect, it } from "vitest";

import {
  collectSnapTargets,
  snapClipStart,
  snapThresholdSeconds,
  snapTime,
} from "@/lib/timeline/snap";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";

describe("snapThresholdSeconds", () => {
  it("converts a pixel threshold using the zoom level", () => {
    expect(snapThresholdSeconds(8, 40)).toBeCloseTo(0.2, 9);
    expect(snapThresholdSeconds(8, 200)).toBeCloseTo(0.04, 9);
  });
});

describe("collectSnapTargets", () => {
  const project = makeProject(makeStandardTracks(), [
    makeClip({ id: "a", start: 2, sourceOut: 3 }),
    makeClip({ id: "b", trackId: "t2", start: 10, sourceOut: 4 }),
  ]);

  it("includes 0, the playhead and every clip edge", () => {
    expect(collectSnapTargets(project, [], 7).sort((x, y) => x - y)).toEqual([0, 2, 5, 7, 10, 14]);
  });

  it("excludes the edges of clips being moved", () => {
    expect(collectSnapTargets(project, ["a"], 7).sort((x, y) => x - y)).toEqual([0, 7, 10, 14]);
  });
});

describe("snapTime", () => {
  it("snaps to the nearest target within the threshold", () => {
    expect(snapTime(4.9, [0, 5, 5.05], 0.2)).toEqual({ time: 5, snappedTo: 5 });
  });

  it("does not snap outside the threshold", () => {
    expect(snapTime(4, [5], 0.2)).toEqual({ time: 4, snappedTo: null });
  });
});

describe("snapClipStart", () => {
  it("snaps the clip's start edge to a target", () => {
    expect(snapClipStart(4.9, 3, [5], 0.2)).toEqual({ start: 5, snappedTo: 5 });
  });

  it("snaps the clip's end edge to a target and adjusts the start", () => {
    // start 4.9 + duration 3 -> end 7.9; target 8 pulls the end to 8, so start = 5
    expect(snapClipStart(4.9, 3, [8], 0.2)).toEqual({ start: 5, snappedTo: 8 });
  });

  it("prefers the closest edge when both could snap", () => {
    const result = snapClipStart(4.95, 3, [5, 8.1], 0.2);
    expect(result.snappedTo).toBe(5);
    expect(result.start).toBe(5);
  });

  it("returns the original start when nothing is in range", () => {
    expect(snapClipStart(4, 3, [20], 0.2)).toEqual({ start: 4, snappedTo: null });
  });
});
