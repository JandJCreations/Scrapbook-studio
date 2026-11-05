import { describe, expect, it } from "vitest";

import { setAllMotion, setMotion } from "@/lib/timeline/motion";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import type { Clip } from "@/types/timeline";

const photo = (id: string, start: number, extra: Partial<Clip> = {}) =>
  makeClip({ id, trackId: "t1", kind: "image", sourceDuration: null, start, sourceIn: 0, sourceOut: 4, ...extra });
const video = (id: string, start: number) => makeClip({ id, trackId: "t1", kind: "video", start, sourceOut: 4, sourceDuration: 50 });

describe("setMotion", () => {
  const project = () => makeProject(makeStandardTracks(), [photo("a", 0), video("v", 4)]);

  it("sets and clears the motion of a photo", () => {
    const set = setMotion(project(), "a", "zoom-in");
    expect(set.clips[0].motion).toBe("zoom-in");
    expect(setMotion(set, "a", null).clips[0].motion ?? null).toBeNull();
  });

  it("does nothing for a video, an unknown clip, a locked photo or no change", () => {
    const p = project();
    expect(setMotion(p, "v", "zoom-in")).toBe(p);
    expect(setMotion(p, "nope", "zoom-in")).toBe(p);
    expect(setMotion(p, "a", null)).toBe(p);
    const locked = makeProject(makeStandardTracks(), [photo("a", 0, { locked: true })]);
    expect(setMotion(locked, "a", "pan-left")).toBe(locked);
    const same = setMotion(p, "a", "pan-left");
    expect(setMotion(same, "a", "pan-left")).toBe(same);
  });
});

describe("setAllMotion", () => {
  it("gives every photo the motion, leaving videos and locked photos alone", () => {
    const p = makeProject(makeStandardTracks(), [photo("a", 0), video("v", 4), photo("b", 8), photo("c", 12, { locked: true })]);
    const result = setAllMotion(p, "zoom-out");
    expect(result.clips.map((c) => c.motion ?? null)).toEqual(["zoom-out", null, "zoom-out", null]);
  });

  it("takes it away from all with null, and returns the same project when nothing changes", () => {
    const p = makeProject(makeStandardTracks(), [photo("a", 0, { motion: "pan-left" }), photo("b", 4)]);
    expect(setAllMotion(p, null).clips.every((c) => (c.motion ?? null) === null)).toBe(true);
    const once = setAllMotion(p, "zoom-in");
    expect(setAllMotion(once, "zoom-in")).toBe(once);
  });
});
