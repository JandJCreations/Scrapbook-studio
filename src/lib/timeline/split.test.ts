import { describe, expect, it } from "vitest";

import { activeClipsAt } from "@/lib/timeline/active-clips";
import { clipEnd } from "@/lib/timeline/clip-math";
import { clipsOnTrack } from "@/lib/timeline/lookup";
import { packMagneticTracks } from "@/lib/timeline/pack";
import { splitClip } from "@/lib/timeline/split";
import {
  getClip,
  makeClip,
  makeProject,
  makeStandardTracks,
  makeTrack,
  seqIds,
} from "@/lib/timeline/test-utils";
import type { Keyframe } from "@/types/keyframe";

const kf = (time: number): Keyframe => ({
  id: `k${time}`,
  time,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 1,
});

describe("splitClip", () => {
  it("splits a clip at the playhead into two contiguous clips", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceIn: 0, sourceOut: 10 }),
    ]);
    const result = splitClip(project, "a", 4, seqIds());
    expect(getClip(result, "a")).toMatchObject({ start: 0, sourceIn: 0, sourceOut: 4 });
    expect(getClip(result, "id-1")).toMatchObject({
      start: 4,
      sourceIn: 4,
      sourceOut: 10,
      trackId: "t1",
    });
  });

  it("accounts for speed when computing the source cut point", () => {
    const project = makeProject(makeStandardTracks(), [
      // On a free (overlay) track: a main-track clip must start at 0.
      makeClip({ id: "a", trackId: "t2", start: 5, sourceIn: 0, sourceOut: 10, speed: 2 }),
    ]);
    const result = splitClip(project, "a", 7, seqIds());
    expect(getClip(result, "a")).toMatchObject({ start: 5, sourceIn: 0, sourceOut: 4 });
    expect(getClip(result, "id-1")).toMatchObject({ start: 7, sourceIn: 4, sourceOut: 10 });
  });

  it("splits a reversed clip so the earlier half plays the later source", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceIn: 0, sourceOut: 10, reversed: true }),
    ]);
    const result = splitClip(project, "a", 4, seqIds());
    expect(getClip(result, "a")).toMatchObject({ sourceIn: 6, sourceOut: 10 });
    expect(getClip(result, "id-1")).toMatchObject({ start: 4, sourceIn: 0, sourceOut: 6 });
  });

  it("keeps fade-in on the left half and fade-out on the right half", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", fadeIn: 1, fadeOut: 2 }),
    ]);
    const result = splitClip(project, "a", 5, seqIds());
    expect(getClip(result, "a")).toMatchObject({ fadeIn: 1, fadeOut: 0 });
    expect(getClip(result, "id-1")).toMatchObject({ fadeIn: 0, fadeOut: 2 });
  });

  it("partitions keyframes and rebases the right half to its own start", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", keyframes: [kf(1), kf(4), kf(6)] }),
    ]);
    const result = splitClip(project, "a", 4, seqIds());
    expect(getClip(result, "a").keyframes.map((k) => k.time)).toEqual([1]);
    expect(getClip(result, "id-1").keyframes.map((k) => k.time)).toEqual([0, 2]);
  });

  describe("an animated clip", () => {
    const at = (id: string, time: number, x: number) => ({ id, time, x, y: 0, rotation: 0, opacity: 1 });
    const animated = (keyframes: ReturnType<typeof at>[]) =>
      makeProject(makeStandardTracks(), [
        makeClip({
          id: "a",
          keyframes,
          transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
        }),
      ]);

    it("keeps moving through the cut: a half with no keyframes of its own starts where the motion is", () => {
      // x runs 100 at 2 s to 500 at 4 s; the cut at 1 s is before both keyframes.
      const result = splitClip(animated([at("k1", 2, 100), at("k2", 4, 500)]), "a", 1, seqIds());
      const left = getClip(result, "a");
      expect(left.keyframes.map((k) => [k.time, k.x])).toEqual([[1, 100]]);
      const right = getClip(result, "id-1");
      expect(right.keyframes.map((k) => [k.time, k.x])).toEqual([[1, 100], [3, 500]]);
    });

    it("ends the left half and starts the right half at the interpolated position", () => {
      const result = splitClip(animated([at("k1", 0, 0), at("k2", 4, 400)]), "a", 2, seqIds());
      expect(getClip(result, "a").keyframes.map((k) => [k.time, k.x])).toEqual([[0, 0], [2, 200]]);
      expect(getClip(result, "id-1").keyframes.map((k) => [k.time, k.x])).toEqual([[0, 200], [2, 400]]);
    });

    it("adds nothing when each half already shows the right motion", () => {
      const result = splitClip(animated([at("k1", 0, 50), at("k2", 9, 50)]), "a", 4, seqIds());
      expect(getClip(result, "a").keyframes).toHaveLength(1);
      expect(getClip(result, "id-1").keyframes).toHaveLength(1);
    });

    it("leaves a plain clip without keyframes", () => {
      const project = makeProject(makeStandardTracks(), [makeClip({ id: "a" })]);
      const result = splitClip(project, "a", 4, seqIds());
      expect(getClip(result, "a").keyframes).toEqual([]);
      expect(getClip(result, "id-1").keyframes).toEqual([]);
    });
  });

  it("inserts the new clip right after the original in the clip list", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceOut: 10 }),
      makeClip({ id: "b", start: 10, sourceOut: 5 }),
    ]);
    const result = splitClip(project, "a", 4, seqIds());
    expect(result.clips.map((c) => c.id)).toEqual(["a", "id-1", "b"]);
  });

  it("keeps the main track contiguous so following clips do not move", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceOut: 10 }),
      makeClip({ id: "b", start: 10, sourceOut: 5 }),
    ]);
    const result = splitClip(project, "a", 4, seqIds());
    expect(clipEnd(getClip(result, "a"))).toBe(getClip(result, "id-1").start);
    expect(clipEnd(getClip(result, "id-1"))).toBe(getClip(result, "b").start);
  });

  it.each([false, true])(
    "leaves exactly one active main-track clip at every cut with fractional times (reversed=%s)",
    (reversed) => {
      const packed = packMagneticTracks(
        makeProject(makeStandardTracks(), [
          makeClip({ id: "a", start: 0, sourceIn: 0.1, sourceOut: 3.1, reversed }),
          makeClip({ id: "b", start: 3, sourceIn: 0, sourceOut: 2 }),
        ]),
      );
      const result = splitClip(packed, "a", 0.3, seqIds());
      const main = clipsOnTrack(result, "t1");
      expect(main).toHaveLength(3);
      for (const clip of main) {
        expect(activeClipsAt(result, clip.start).map((a) => a.clip.id)).toEqual([clip.id]);
      }
      expect(clipEnd(getClip(result, "a"))).toBe(getClip(result, "id-1").start);
      expect(clipEnd(getClip(result, "id-1"))).toBe(getClip(result, "b").start);
    },
  );

  it("allows a split exactly the minimum duration from the start edge", () => {
    const project = makeProject(makeStandardTracks(), [makeClip({ id: "a" })]);
    const result = splitClip(project, "a", 0.1, seqIds());
    expect(result.clips).toHaveLength(2);
  });

  it("allows a split well inside the clip near the end edge", () => {
    const project = makeProject(makeStandardTracks(), [makeClip({ id: "a" })]);
    expect(splitClip(project, "a", 9.8, seqIds()).clips).toHaveLength(2);
  });

  describe("no-ops", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceOut: 10 }),
    ]);

    it.each([[0], [0.05], [9.95], [10], [-3], [99]])(
      "returns the same project when splitting at %s",
      (at) => {
        expect(splitClip(project, "a", at, seqIds())).toBe(project);
      },
    );

    it("returns the same project for an unknown clip", () => {
      expect(splitClip(project, "nope", 5, seqIds())).toBe(project);
    });

    it("returns the same project for a locked clip", () => {
      const locked = makeProject(makeStandardTracks(), [makeClip({ id: "a", locked: true })]);
      expect(splitClip(locked, "a", 5, seqIds())).toBe(locked);
    });

    it("returns the same project for a clip on a locked track", () => {
      const lockedTrack = makeProject([makeTrack({ id: "t1", locked: true })], [
        makeClip({ id: "a" }),
      ]);
      expect(splitClip(lockedTrack, "a", 5, seqIds())).toBe(lockedTrack);
    });
  });
});

describe("splitClip and transitions", () => {
  it("keeps the transition into the left half, and gives the right half a plain cut", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceOut: 4 }),
      makeClip({ id: "b", start: 4, sourceOut: 8, transition: { type: "fade", duration: 1 } }),
    ]);
    const result = splitClip(project, "b", 8, seqIds("n"));
    expect(result.clips.find((c) => c.id === "b")?.transition).toEqual({ type: "fade", duration: 1 });
    const right = result.clips.find((c) => c.id !== "a" && c.id !== "b")!;
    expect(right.transition ?? null).toBeNull();
  });
});
