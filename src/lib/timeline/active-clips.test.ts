import { describe, expect, it } from "vitest";

import { activeClipsAt, clipGainAt } from "@/lib/timeline/active-clips";
import { clipsOnTrack } from "@/lib/timeline/lookup";
import { packMagneticTracks } from "@/lib/timeline/pack";
import {
  makeClip,
  makeProject,
  makeStandardTracks,
  makeTrack,
} from "@/lib/timeline/test-utils";

const ids = (project: ReturnType<typeof makeProject>, t: number) =>
  activeClipsAt(project, t).map((a) => a.clip.id);

describe("activeClipsAt: which clips play", () => {
  const project = makeProject(makeStandardTracks(), [
    makeClip({ id: "a", start: 0, sourceOut: 4 }),
    makeClip({ id: "b", start: 4, sourceOut: 3 }),
  ]);

  it("returns nothing before the first clip and after the last", () => {
    expect(ids(project, -1)).toEqual([]);
    expect(ids(project, 7)).toEqual([]);
    expect(ids(project, 99)).toEqual([]);
  });

  it("treats a clip as [start, end): the next clip owns the exact cut time", () => {
    expect(ids(project, 0)).toEqual(["a"]);
    expect(ids(project, 3.999)).toEqual(["a"]);
    expect(ids(project, 4)).toEqual(["b"]);
    expect(ids(project, 6.999)).toEqual(["b"]);
  });

  it("ignores clips whose track does not exist", () => {
    const orphan = makeProject(makeStandardTracks(), [makeClip({ id: "x", trackId: "gone" })]);
    expect(ids(orphan, 1)).toEqual([]);
  });

  it("returns every overlapping clip on a free track", () => {
    const overlap = makeProject(makeStandardTracks(), [
      makeClip({ id: "o1", trackId: "t2", kind: "image", sourceDuration: null, start: 0, sourceOut: 6 }),
      makeClip({ id: "o2", trackId: "t2", kind: "image", sourceDuration: null, start: 2, sourceOut: 6 }),
    ]);
    expect(ids(overlap, 3).sort()).toEqual(["o1", "o2"]);
  });

  it("has exactly one active clip at every cut of a packed track with fractional durations", () => {
    const packed = packMagneticTracks(
      makeProject(makeStandardTracks(), [
        makeClip({ id: "a", start: 0, sourceIn: 0, sourceOut: 0.1 }),
        makeClip({ id: "b", start: 9, sourceIn: 0, sourceOut: 0.2 }),
        makeClip({ id: "c", start: 9, sourceIn: 0, sourceOut: 0.3 }),
        makeClip({ id: "d", start: 9, sourceIn: 0, sourceOut: 0.7 }),
      ]),
    );
    for (const clip of clipsOnTrack(packed, "t1")) {
      expect(ids(packed, clip.start)).toEqual([clip.id]);
    }
  });
});

describe("activeClipsAt: source position", () => {
  it("offsets from sourceIn", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 10, sourceIn: 2, sourceOut: 12 }),
    ]);
    const [active] = activeClipsAt(project, 13);
    expect(active.localTime).toBe(3);
    expect(active.sourceTime).toBe(5);
  });

  it("scales by speed", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceIn: 0, sourceOut: 10, speed: 2 }),
    ]);
    expect(activeClipsAt(project, 3)[0].sourceTime).toBe(6);
  });

  it("counts backward for reversed clips", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceIn: 0, sourceOut: 10, reversed: true }),
    ]);
    expect(activeClipsAt(project, 0)[0].sourceTime).toBe(10);
    expect(activeClipsAt(project, 4)[0].sourceTime).toBe(6);
  });
});

describe("activeClipsAt: paint order", () => {
  it("lists bottom tracks first so the top overlay is painted last", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "over", trackId: "t2", kind: "image", sourceDuration: null }),
      makeClip({ id: "main", trackId: "t1" }),
      makeClip({ id: "sound", trackId: "t3", kind: "audio" }),
    ]);
    expect(ids(project, 1)).toEqual(["sound", "main", "over"]);
  });
});

describe("activeClipsAt: visible and audible", () => {
  it("marks clips on hidden tracks as not visible but still returns them", () => {
    const project = makeProject(
      [makeTrack({ id: "t1", hidden: true })],
      [makeClip({ id: "a" })],
    );
    expect(activeClipsAt(project, 1)[0]).toMatchObject({ visible: false, audible: true });
  });

  it("silences muted clips and muted tracks", () => {
    const mutedClip = makeProject(makeStandardTracks(), [makeClip({ id: "a", muted: true })]);
    expect(activeClipsAt(mutedClip, 1)[0].audible).toBe(false);
    const mutedTrack = makeProject([makeTrack({ id: "t1", muted: true })], [makeClip({ id: "a" })]);
    expect(activeClipsAt(mutedTrack, 1)[0].audible).toBe(false);
  });

  it("silences non-soloed tracks when any track is soloed", () => {
    const tracks = [
      makeTrack({ id: "t1", type: "video", order: 0 }),
      makeTrack({ id: "t3", type: "audio", order: 1, solo: true }),
    ];
    const project = makeProject(tracks, [
      makeClip({ id: "v", trackId: "t1" }),
      makeClip({ id: "s", trackId: "t3", kind: "audio" }),
    ]);
    const byId = Object.fromEntries(activeClipsAt(project, 1).map((a) => [a.clip.id, a.audible]));
    expect(byId).toEqual({ v: false, s: true });
  });

  it("never marks images, text or stickers audible", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "i", trackId: "t2", kind: "image", sourceDuration: null }),
    ]);
    expect(activeClipsAt(project, 1)[0].audible).toBe(false);
  });
});

describe("clipGainAt", () => {
  const clip = (overrides = {}) => makeClip({ start: 0, sourceIn: 0, sourceOut: 10, ...overrides });

  it("is the volume as a fraction", () => {
    expect(clipGainAt(clip({ volume: 50 }), 5)).toBe(0.5);
    expect(clipGainAt(clip({ volume: 0 }), 5)).toBe(0);
  });

  it("ramps up over the fade-in", () => {
    const c = clip({ fadeIn: 2 });
    expect(clipGainAt(c, 0)).toBe(0);
    expect(clipGainAt(c, 1)).toBe(0.5);
    expect(clipGainAt(c, 2)).toBe(1);
  });

  it("ramps down over the fade-out", () => {
    const c = clip({ fadeOut: 2 });
    expect(clipGainAt(c, 8)).toBe(1);
    expect(clipGainAt(c, 9)).toBe(0.5);
    expect(clipGainAt(c, 10)).toBe(0);
  });

  it("multiplies overlapping fades", () => {
    expect(clipGainAt(clip({ fadeIn: 10, fadeOut: 10 }), 5)).toBe(0.25);
  });

  it("never goes negative", () => {
    expect(clipGainAt(clip({ fadeIn: 2 }), -1)).toBe(0);
    expect(clipGainAt(clip({ fadeOut: 2 }), 11)).toBe(0);
  });
});
