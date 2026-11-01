import { describe, expect, it } from "vitest";

import {
  clearKeyframes,
  KEYFRAME_MERGE_SECONDS,
  removeKeyframe,
  setOpacityAt,
  upsertKeyframe,
} from "@/lib/editor/keyframes";
import { findClip } from "@/lib/timeline/lookup";
import { makeClip, makeProject, makeStandardTracks, seqIds } from "@/lib/timeline/test-utils";

const transform = { x: 10, y: 20, width: 100, height: 50, rotation: 0, opacity: 1 };
const project = () =>
  makeProject(makeStandardTracks(), [
    makeClip({ id: "c", trackId: "t2", kind: "image", sourceDuration: null, start: 5, sourceOut: 8, transform }),
  ]);
const clipOf = (p: ReturnType<typeof project>) => findClip(p, "c")!;
const kf = (id: string, time: number, x: number, y = 20, rotation = 0, opacity = 1) => ({
  id,
  time,
  x,
  y,
  rotation,
  opacity,
});

describe("upsertKeyframe", () => {
  it("starts from the clip's own look, so adding the first keyframe changes nothing on screen", () => {
    const result = upsertKeyframe(project(), "c", 2, { x: 100 }, seqIds("k"));
    expect(clipOf(result).keyframes).toEqual([kf("k-1", 2, 100, 20, 0, 1)]);
  });

  it("starts a new keyframe from the animated state at that time", () => {
    const base = {
      ...project(),
      clips: [{ ...clipOf(project()), keyframes: [kf("a", 0, 0), kf("b", 4, 400)] }],
    };
    const result = upsertKeyframe(base, "c", 2, { y: 50 }, seqIds("k"));
    const middle = clipOf(result).keyframes.find((k) => k.id === "k-1")!;
    expect(middle).toMatchObject({ time: 2, x: 200, y: 50 });
    expect(clipOf(result).keyframes.map((k) => k.time)).toEqual([0, 2, 4]);
  });

  it("updates a keyframe that is within a hair of the playhead instead of adding one", () => {
    const first = upsertKeyframe(project(), "c", 2, { x: 100 }, seqIds("k"));
    const again = upsertKeyframe(first, "c", 2 + KEYFRAME_MERGE_SECONDS / 2, { x: 150, rotation: 30 }, seqIds("m"));
    expect(clipOf(again).keyframes).toHaveLength(1);
    expect(clipOf(again).keyframes[0]).toMatchObject({ id: "k-1", time: 2, x: 150, rotation: 30 });
  });

  it("keeps the keyframes sorted and inside the clip", () => {
    let p = upsertKeyframe(project(), "c", 6, { x: 1 }, seqIds("a"));
    p = upsertKeyframe(p, "c", -3, { x: 2 }, seqIds("b"));
    p = upsertKeyframe(p, "c", 99, { x: 3 }, seqIds("c"));
    expect(clipOf(p).keyframes.map((k) => k.time)).toEqual([0, 6, 8]);
  });

  it("does nothing for a missing or locked clip", () => {
    const p = project();
    expect(upsertKeyframe(p, "nope", 1, { x: 1 })).toBe(p);
    const locked = { ...p, clips: p.clips.map((c) => ({ ...c, locked: true })) };
    expect(upsertKeyframe(locked, "c", 1, { x: 1 })).toBe(locked);
  });
});

describe("removeKeyframe", () => {
  it("removes one keyframe and leaves the rest", () => {
    const base = { ...project(), clips: [{ ...clipOf(project()), keyframes: [kf("a", 0, 0), kf("b", 4, 400)] }] };
    expect(clipOf(removeKeyframe(base, "c", "a")).keyframes.map((k) => k.id)).toEqual(["b"]);
  });

  it("makes the clip static at the last keyframe's values when the last one goes", () => {
    const base = { ...project(), clips: [{ ...clipOf(project()), keyframes: [kf("a", 0, 77, 88, 15, 0.5)] }] };
    const result = clipOf(removeKeyframe(base, "c", "a"));
    expect(result.keyframes).toEqual([]);
    expect(result.transform).toMatchObject({ x: 77, y: 88, rotation: 15, opacity: 0.5, width: 100, height: 50 });
  });

  it("ignores an unknown keyframe", () => {
    const p = project();
    expect(removeKeyframe(p, "c", "zzz")).toBe(p);
  });
});

describe("clearKeyframes", () => {
  it("freezes the clip as it looks at the given time", () => {
    const base = {
      ...project(),
      clips: [{ ...clipOf(project()), keyframes: [kf("a", 0, 0), kf("b", 4, 400)] }],
    };
    const result = clipOf(clearKeyframes(base, "c", 1));
    expect(result.keyframes).toEqual([]);
    expect(result.transform.x).toBe(100);
  });
});

describe("setOpacityAt", () => {
  it("sets the clip opacity when it is not animated", () => {
    expect(clipOf(setOpacityAt(project(), "c", 3, 0.4)).transform.opacity).toBe(0.4);
  });

  it("writes a keyframe when it is animated, leaving the static opacity alone", () => {
    const base = { ...project(), clips: [{ ...clipOf(project()), keyframes: [kf("a", 0, 0)] }] };
    const result = clipOf(setOpacityAt(base, "c", 3, 0.2, seqIds("k")));
    expect(result.keyframes.find((k) => k.time === 3)?.opacity).toBe(0.2);
    expect(result.transform.opacity).toBe(1);
  });
});
