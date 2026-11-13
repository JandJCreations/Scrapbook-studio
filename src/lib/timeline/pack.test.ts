import { describe, expect, it } from "vitest";

import { clipEnd } from "@/lib/timeline/clip-math";
import { clipsOnTrack } from "@/lib/timeline/lookup";
import {
  isMagnetic,
  packClips,
  packMagneticTracks,
  replaceTrackClips,
} from "@/lib/timeline/pack";
import { getClip, makeClip, makeProject, makeStandardTracks, makeTrack } from "@/lib/timeline/test-utils";

describe("isMagnetic", () => {
  it("is true only for video tracks", () => {
    expect(isMagnetic(makeTrack({ type: "video" }))).toBe(true);
    expect(isMagnetic(makeTrack({ type: "overlay" }))).toBe(false);
    expect(isMagnetic(makeTrack({ type: "audio" }))).toBe(false);
  });
});

describe("packClips", () => {
  it("assigns sequential starts from 0 in the given order", () => {
    const packed = packClips([
      makeClip({ id: "a", start: 5, sourceOut: 4 }),
      makeClip({ id: "b", start: 1, sourceOut: 3 }),
    ]);
    expect(packed.map((c) => [c.id, c.start])).toEqual([
      ["a", 0],
      ["b", 4],
    ]);
  });

  it("returns the same object when the start is already exact", () => {
    const a = makeClip({ id: "a", start: 0, sourceOut: 4 });
    const b = makeClip({ id: "b", start: 4, sourceOut: 3 });
    const packed = packClips([a, b]);
    expect(packed[0]).toBe(a);
    expect(packed[1]).toBe(b);
  });
});

describe("replaceTrackClips", () => {
  it("swaps one track's clips and leaves the rest", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "keep", trackId: "t2" }),
      makeClip({ id: "old", trackId: "t1" }),
    ]);
    const result = replaceTrackClips(project, "t1", [makeClip({ id: "new", trackId: "t1" })]);
    expect(result.clips.map((c) => c.id).sort()).toEqual(["keep", "new"]);
  });
});

describe("packMagneticTracks", () => {
  it("closes gaps on the main track", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceOut: 4 }),
      makeClip({ id: "b", start: 6, sourceOut: 3 }),
      makeClip({ id: "c", start: 20, sourceOut: 2 }),
    ]);
    const result = packMagneticTracks(project);
    expect(getClip(result, "a").start).toBe(0);
    expect(getClip(result, "b").start).toBe(4);
    expect(getClip(result, "c").start).toBe(7);
  });

  it("resolves overlaps by pushing later clips right", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceOut: 4 }),
      makeClip({ id: "b", start: 2, sourceOut: 3 }),
    ]);
    expect(getClip(packMagneticTracks(project), "b").start).toBe(4);
  });

  it("orders by start, not by array position", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "b", start: 5, sourceOut: 3 }),
      makeClip({ id: "a", start: 0, sourceOut: 4 }),
    ]);
    const result = packMagneticTracks(project);
    expect(getClip(result, "a").start).toBe(0);
    expect(getClip(result, "b").start).toBe(4);
  });

  it("leaves overlay and audio tracks alone", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "o", trackId: "t2", kind: "image", start: 9, sourceOut: 2 }),
      makeClip({ id: "s", trackId: "t3", kind: "audio", start: 7, sourceOut: 2 }),
    ]);
    const result = packMagneticTracks(project);
    expect(getClip(result, "o").start).toBe(9);
    expect(getClip(result, "s").start).toBe(7);
  });

  it("keeps clips exactly contiguous with fractional durations", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceIn: 0, sourceOut: 0.1 }),
      makeClip({ id: "b", start: 9, sourceIn: 0, sourceOut: 0.2 }),
      makeClip({ id: "c", start: 9, sourceIn: 0, sourceOut: 0.3 }),
    ]);
    const ordered = clipsOnTrack(packMagneticTracks(project), "t1");
    expect(clipEnd(ordered[0])).toBe(ordered[1].start);
    expect(clipEnd(ordered[1])).toBe(ordered[2].start);
  });
});
