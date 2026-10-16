import { describe, expect, it } from "vitest";

import { isContinuation, planWanted } from "@/lib/engine/wanted";
import { splitClip } from "@/lib/timeline/split";
import {
  makeClip,
  makeProject,
  makeStandardTracks,
  makeTrack,
  seqIds,
} from "@/lib/timeline/test-utils";
import type { Clip } from "@/types/timeline";

const clip = (id: string, overrides: Partial<Clip> = {}) =>
  makeClip({ id, mediaId: "m", sourceDuration: 100, ...overrides });

describe("planWanted: active clips", () => {
  it("wants nothing for an empty project", () => {
    expect(planWanted(makeProject(makeStandardTracks(), []), 1, true)).toEqual([]);
  });

  it("wants a playing video clip at its source position, rate and gain", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("c1", { start: 2, sourceIn: 1, sourceOut: 7, speed: 2 }),
    ]);
    expect(planWanted(project, 3, true)).toEqual([
      {
        clipId: "c1",
        mediaId: "m",
        kind: "video",
        active: true,
        targetTime: 3,
        playbackRate: 2,
        reversed: false,
        shouldPlay: true,
        gain: 1,
      },
    ]);
  });

  it("does not ask a paused clip to play", () => {
    const project = makeProject(makeStandardTracks(), [clip("c1")]);
    const [wanted] = planWanted(project, 3, false);
    expect(wanted.shouldPlay).toBe(false);
    expect(wanted.active).toBe(true);
    expect(wanted.targetTime).toBe(3);
  });

  it("makes a reversed clip silent and non-playing, targeting the reversed position", () => {
    const project = makeProject(makeStandardTracks(), [clip("c1", { reversed: true })]);
    const [wanted] = planWanted(project, 4, true);
    expect(wanted).toMatchObject({ targetTime: 6, reversed: true, shouldPlay: false, gain: 0 });
  });

  it("includes an audio clip with its volume as gain", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("s", { kind: "audio", trackId: "t3", mediaId: "snd", volume: 50 }),
    ]);
    const [wanted] = planWanted(project, 5, true);
    expect(wanted).toMatchObject({ kind: "audio", mediaId: "snd", gain: 0.5 });
  });

  it("ignores image, text and sticker clips", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("i", { kind: "image", trackId: "t2", sourceDuration: null }),
      clip("t", { kind: "text", trackId: "t2", sourceDuration: null }),
      clip("k", { kind: "sticker", trackId: "t2", sourceDuration: null }),
    ]);
    expect(planWanted(project, 1, true)).toEqual([]);
  });

  it("still wants a hidden video that is audible, but not a hidden muted one", () => {
    const hidden = [makeTrack({ id: "t1", type: "video", hidden: true })];
    expect(planWanted(makeProject(hidden, [clip("v")]), 1, true)).toHaveLength(1);
    expect(planWanted(makeProject(hidden, [clip("v", { muted: true })]), 1, true)).toEqual([]);
  });

  it("does not want a muted audio clip", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("s", { kind: "audio", trackId: "t3", muted: true }),
    ]);
    expect(planWanted(project, 1, true)).toEqual([]);
  });

  it("gives a visible but muted video a zero gain", () => {
    const project = makeProject(makeStandardTracks(), [clip("v", { muted: true })]);
    expect(planWanted(project, 1, true)[0]).toMatchObject({ active: true, gain: 0 });
  });
});

describe("planWanted: preloading", () => {
  // Main track: a [0,4] of file m1, then b [4,10] of file m2.
  const project = () =>
    makeProject(makeStandardTracks(), [
      clip("a", { mediaId: "m1", start: 0, sourceIn: 0, sourceOut: 4 }),
      clip("b", { mediaId: "m2", start: 4, sourceIn: 0, sourceOut: 6 }),
    ]);

  it("prepares a clip starting within the lookahead, positioned at its start", () => {
    const wanted = planWanted(project(), 3.5, true);
    expect(wanted.map((w) => [w.clipId, w.active])).toEqual([
      ["a", true],
      ["b", false],
    ]);
    expect(wanted[1]).toEqual({
      clipId: "b",
      mediaId: "m2",
      kind: "video",
      active: false,
      targetTime: 0,
      playbackRate: 1,
      reversed: false,
      shouldPlay: false,
      gain: 0,
    });
  });

  it("does not prepare clips beyond the lookahead", () => {
    expect(planWanted(project(), 2, true).map((w) => w.clipId)).toEqual(["a"]);
  });

  it("does not prepare anything while paused", () => {
    expect(planWanted(project(), 3.5, false).map((w) => w.clipId)).toEqual(["a"]);
  });

  it("positions a reversed upcoming clip at the end of its source range", () => {
    const reversed = makeProject(makeStandardTracks(), [
      clip("a", { mediaId: "m1", start: 0, sourceIn: 0, sourceOut: 4 }),
      clip("b", { mediaId: "m2", start: 4, sourceIn: 0, sourceOut: 6, reversed: true }),
    ]);
    expect(planWanted(reversed, 3.5, true)[1].targetTime).toBe(6);
  });

  it("does not prepare an upcoming clip that no one can hear or see", () => {
    const hidden = makeProject(
      [makeTrack({ id: "t1", type: "video", hidden: true })],
      [
        clip("a", { mediaId: "m1", start: 0, sourceIn: 0, sourceOut: 4 }),
        clip("b", { mediaId: "m2", start: 4, sourceIn: 0, sourceOut: 6, muted: true }),
      ],
    );
    expect(planWanted(hidden, 3.5, true).map((w) => w.clipId)).toEqual(["a"]);
  });
});

describe("planWanted: continuations share one element", () => {
  it("does not prepare the second half of a split", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 4 }),
      clip("b", { start: 4, sourceIn: 4, sourceOut: 10 }),
    ]);
    expect(planWanted(project, 3.5, true).map((w) => w.clipId)).toEqual(["a"]);
  });

  it("prepares a same-file clip that jumps elsewhere in the source", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 4 }),
      clip("b", { start: 4, sourceIn: 20, sourceOut: 26 }),
    ]);
    expect(planWanted(project, 3.5, true).map((w) => w.clipId)).toEqual(["a", "b"]);
  });

  it("prepares a same-file clip at a different speed", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 4 }),
      clip("b", { start: 4, sourceIn: 4, sourceOut: 10, speed: 2 }),
    ]);
    expect(planWanted(project, 3.5, true).map((w) => w.clipId)).toEqual(["a", "b"]);
  });

  it("needs one element for a chain of contiguous clips inside the window", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 2 }),
      clip("b", { start: 2, sourceIn: 2, sourceOut: 2.5 }),
      clip("c", { start: 2.5, sourceIn: 2.5, sourceOut: 3 }),
    ]);
    expect(planWanted(project, 1.8, true).map((w) => w.clipId)).toEqual(["a"]);
  });

  it("prepares a clip that continues a different file's chain", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 2 }),
      clip("b", { start: 2, sourceIn: 2, sourceOut: 2.5 }),
      clip("c", { mediaId: "other", start: 2.5, sourceIn: 2.5, sourceOut: 3 }),
    ]);
    expect(planWanted(project, 1.8, true).map((w) => w.clipId)).toEqual(["a", "c"]);
  });

  it("recognises the halves of real splits, with fractional times, as one chain", () => {
    const base = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0.1, sourceOut: 3.1 }),
    ]);
    let project = splitClip(base, "a", 0.3, seqIds("s"));
    project = splitClip(project, "s-1", 1.0, seqIds("t"));
    expect(project.clips).toHaveLength(3);
    expect(planWanted(project, 0.25, true).map((w) => w.clipId)).toEqual(["a"]);
  });
});

describe("isContinuation", () => {
  const a = clip("a", { start: 0, sourceIn: 0, sourceOut: 4 });

  it("is true when the next clip picks up at the same place in the same file", () => {
    expect(isContinuation(a, clip("b", { start: 4, sourceIn: 4, sourceOut: 8 }))).toBe(true);
  });

  it("is true for reversed clips that continue backwards", () => {
    const prev = clip("p", { start: 0, sourceIn: 6, sourceOut: 10, reversed: true });
    const next = clip("n", { start: 4, sourceIn: 0, sourceOut: 6, reversed: true });
    expect(isContinuation(prev, next)).toBe(true);
  });

  it("is false for a different file, a time gap, a source jump, or a different speed or direction", () => {
    expect(isContinuation(a, clip("b", { mediaId: "x", start: 4, sourceIn: 4, sourceOut: 8 }))).toBe(false);
    expect(isContinuation(a, clip("b", { start: 5, sourceIn: 4, sourceOut: 8 }))).toBe(false);
    expect(isContinuation(a, clip("b", { start: 4, sourceIn: 9, sourceOut: 12 }))).toBe(false);
    expect(isContinuation(a, clip("b", { start: 4, sourceIn: 4, sourceOut: 8, speed: 2 }))).toBe(false);
    expect(isContinuation(a, clip("b", { start: 4, sourceIn: 4, sourceOut: 8, reversed: true }))).toBe(false);
  });
});
