import { describe, expect, it } from "vitest";

import { deleteClips, rippleDeleteClips } from "@/lib/timeline/delete";
import {
  getClip,
  makeClip,
  makeProject,
  makeStandardTracks,
  makeTrack,
} from "@/lib/timeline/test-utils";

const mainProject = () =>
  makeProject(makeStandardTracks(), [
    makeClip({ id: "a", start: 0, sourceOut: 4 }),
    makeClip({ id: "b", start: 4, sourceOut: 3 }),
    makeClip({ id: "c", start: 7, sourceOut: 2 }),
  ]);

const overlayProject = () =>
  makeProject(makeStandardTracks(), [
    makeClip({ id: "x", trackId: "t2", kind: "image", start: 0, sourceOut: 2, sourceDuration: null }),
    makeClip({ id: "y", trackId: "t2", kind: "image", start: 3, sourceOut: 2, sourceDuration: null }),
    makeClip({ id: "z", trackId: "t2", kind: "image", start: 6, sourceOut: 2, sourceDuration: null }),
  ]);

describe("deleteClips", () => {
  it("closes the gap on the main track", () => {
    const result = deleteClips(mainProject(), ["b"]);
    expect(result.clips.map((c) => c.id)).toEqual(["a", "c"]);
    expect(getClip(result, "c").start).toBe(4);
  });

  it("leaves a gap on an overlay track", () => {
    const result = deleteClips(overlayProject(), ["x"]);
    expect(getClip(result, "y").start).toBe(3);
  });

  it("deletes several clips at once", () => {
    const result = deleteClips(mainProject(), ["a", "c"]);
    expect(result.clips.map((c) => [c.id, c.start])).toEqual([["b", 0]]);
  });

  it("skips locked clips but deletes the rest", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceOut: 4, locked: true }),
      makeClip({ id: "b", start: 4, sourceOut: 3 }),
    ]);
    expect(deleteClips(project, ["a", "b"]).clips.map((c) => c.id)).toEqual(["a"]);
  });

  it("returns the same project when nothing is removable", () => {
    const project = mainProject();
    expect(deleteClips(project, ["nope"])).toBe(project);
    expect(deleteClips(project, [])).toBe(project);
    const lockedTrack = makeProject([makeTrack({ id: "t1", locked: true })], [
      makeClip({ id: "a" }),
    ]);
    expect(deleteClips(lockedTrack, ["a"])).toBe(lockedTrack);
  });
});

describe("rippleDeleteClips", () => {
  it("shifts later clips left on an overlay track", () => {
    const result = rippleDeleteClips(overlayProject(), ["x"]);
    expect(getClip(result, "y").start).toBe(1);
    expect(getClip(result, "z").start).toBe(4);
  });

  it("shifts by the combined duration of several removed clips", () => {
    const result = rippleDeleteClips(overlayProject(), ["x", "y"]);
    expect(getClip(result, "z").start).toBe(2);
  });

  it("matches a plain delete on the main track", () => {
    expect(rippleDeleteClips(mainProject(), ["b"])).toEqual(deleteClips(mainProject(), ["b"]));
  });

  it("does not shift a clip that overlaps the removed clip", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "x", trackId: "t2", kind: "image", start: 0, sourceOut: 4, sourceDuration: null }),
      makeClip({ id: "y", trackId: "t2", kind: "image", start: 2, sourceOut: 4, sourceDuration: null }),
      makeClip({ id: "z", trackId: "t2", kind: "image", start: 4, sourceOut: 2, sourceDuration: null }),
    ]);
    const result = rippleDeleteClips(project, ["x"]);
    expect(getClip(result, "y").start).toBe(2);
    expect(getClip(result, "z").start).toBe(0);
  });

  it("does not shift locked clips", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "x", trackId: "t2", kind: "image", start: 0, sourceOut: 2, sourceDuration: null }),
      makeClip({ id: "y", trackId: "t2", kind: "image", start: 3, sourceOut: 2, sourceDuration: null, locked: true }),
    ]);
    expect(getClip(rippleDeleteClips(project, ["x"]), "y").start).toBe(3);
  });

  it("returns the same project when nothing is removable", () => {
    const project = overlayProject();
    expect(rippleDeleteClips(project, ["nope"])).toBe(project);
  });
});
