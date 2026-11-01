import { describe, expect, it } from "vitest";

import { applyStagePatches } from "@/lib/editor/stage-patches";
import { findClip } from "@/lib/timeline/lookup";
import { makeClip, makeProject, makeStandardTracks, seqIds } from "@/lib/timeline/test-utils";

const transform = { x: 10, y: 20, width: 100, height: 50, rotation: 0, opacity: 1 };
const still = (id: string, extra = {}) =>
  makeClip({ id, trackId: "t2", kind: "image", sourceDuration: null, start: 5, sourceOut: 8, transform, ...extra });
const kf = (id: string, time: number, x: number) => ({ id, time, x, y: 20, rotation: 0, opacity: 1 });

describe("applyStagePatches", () => {
  it("sets the transform of a plain clip", () => {
    const project = makeProject(makeStandardTracks(), [still("a")]);
    const result = applyStagePatches(project, { a: { x: 50, rotation: 30, width: 200 } }, 6, seqIds("k"));
    expect(findClip(result, "a")?.transform).toMatchObject({ x: 50, rotation: 30, width: 200 });
    expect(findClip(result, "a")?.keyframes).toEqual([]);
  });

  it("writes position and rotation of an animated clip as a keyframe at the playhead", () => {
    const project = makeProject(makeStandardTracks(), [still("a", { keyframes: [kf("k0", 0, 0)] })]);
    const result = applyStagePatches(project, { a: { x: 300, rotation: 45 } }, 7, seqIds("k"));
    const clip = findClip(result, "a")!;
    expect(clip.keyframes.map((k) => [k.time, k.x, k.rotation])).toEqual([
      [0, 0, 0],
      [2, 300, 45],
    ]);
    expect(clip.transform.x).toBe(10); // the static position is not touched
  });

  it("changes the size of an animated clip for the whole clip", () => {
    const project = makeProject(makeStandardTracks(), [still("a", { keyframes: [kf("k0", 0, 0)] })]);
    const result = applyStagePatches(project, { a: { width: 400, height: 300 } }, 6, seqIds("k"));
    expect(findClip(result, "a")?.transform).toMatchObject({ width: 400, height: 300 });
    expect(findClip(result, "a")?.keyframes).toHaveLength(1);
  });

  it("changes only the width when only the width is given", () => {
    const project = makeProject(makeStandardTracks(), [still("a", { keyframes: [kf("k0", 0, 0)] })]);
    const result = applyStagePatches(project, { a: { width: 400 } }, 6, seqIds("k"));
    expect(findClip(result, "a")?.transform).toMatchObject({ width: 400, height: 50 });
  });

  it("handles a plain and an animated clip moved together", () => {
    const project = makeProject(makeStandardTracks(), [
      still("a"),
      still("b", { keyframes: [kf("k0", 0, 0)] }),
    ]);
    const result = applyStagePatches(project, { a: { x: 1 }, b: { x: 2 } }, 6, seqIds("k"));
    expect(findClip(result, "a")?.transform.x).toBe(1);
    expect(findClip(result, "b")?.keyframes.find((k) => k.time === 1)?.x).toBe(2);
  });

  it("keeps repeated previews of one gesture to a single keyframe", () => {
    const project = makeProject(makeStandardTracks(), [still("a", { keyframes: [kf("k0", 0, 0)] })]);
    const once = applyStagePatches(project, { a: { x: 100 } }, 7, seqIds("k"));
    const twice = applyStagePatches(project, { a: { x: 120 } }, 7, seqIds("m"));
    expect(findClip(once, "a")?.keyframes).toHaveLength(2);
    expect(findClip(twice, "a")?.keyframes).toHaveLength(2);
  });

  it("ignores locked and unknown clips, returning the same project", () => {
    const project = makeProject(makeStandardTracks(), [still("a", { locked: true })]);
    expect(applyStagePatches(project, { a: { x: 5 }, nope: { x: 1 } }, 6)).toBe(project);
  });
});
