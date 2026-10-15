import { describe, expect, it } from "vitest";

import { duplicateClip, setSpeed, updateClip } from "@/lib/timeline/clip-edits";
import { clipDuration } from "@/lib/timeline/clip-math";
import {
  getClip,
  makeClip,
  makeProject,
  makeStandardTracks,
  makeTrack,
  seqIds,
} from "@/lib/timeline/test-utils";

const mainProject = () =>
  makeProject(makeStandardTracks(), [
    makeClip({ id: "A", start: 0, sourceOut: 4 }),
    makeClip({ id: "B", start: 4, sourceOut: 6 }),
    makeClip({ id: "C", start: 10, sourceOut: 2 }),
  ]);

describe("duplicateClip", () => {
  it("places the copy right after the original on a free track", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "x", trackId: "t2", kind: "image", sourceDuration: null, start: 2, sourceOut: 3 }),
    ]);
    const result = duplicateClip(project, "x", seqIds());
    expect(getClip(result, "id-1")).toMatchObject({ trackId: "t2", start: 5, name: "clip" });
  });

  it("inserts directly after the original on the main track and ripples", () => {
    const result = duplicateClip(mainProject(), "B", seqIds());
    expect(getClip(result, "B").start).toBe(4);
    expect(getClip(result, "id-1").start).toBe(10);
    expect(getClip(result, "C").start).toBe(16);
  });

  it("drops the copy's group membership", () => {
    const project = makeProject(makeStandardTracks(), [makeClip({ id: "A", groupId: "g1" })]);
    expect(getClip(duplicateClip(project, "A", seqIds()), "id-1").groupId).toBeNull();
  });

  it("returns the same project for locked or unknown clips", () => {
    const locked = makeProject(makeStandardTracks(), [makeClip({ id: "A", locked: true })]);
    expect(duplicateClip(locked, "A", seqIds())).toBe(locked);
    const project = mainProject();
    expect(duplicateClip(project, "nope", seqIds())).toBe(project);
  });
});

describe("setSpeed", () => {
  it("halves the duration at double speed and ripples the main track", () => {
    const result = setSpeed(mainProject(), "A", 2);
    expect(clipDuration(getClip(result, "A"))).toBe(2);
    expect(getClip(result, "B").start).toBe(2);
  });

  it("leaves later clips on free tracks where they are", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "x", trackId: "t2", start: 0, sourceOut: 4 }),
      makeClip({ id: "y", trackId: "t2", start: 6, sourceOut: 4 }),
    ]);
    expect(getClip(setSpeed(project, "x", 2), "y").start).toBe(6);
  });

  it("clamps to the speed range", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "A", sourceOut: 100, sourceDuration: 100 }),
    ]);
    expect(getClip(setSpeed(project, "A", 50), "A").speed).toBe(8);
    expect(getClip(setSpeed(project, "A", 0.01), "A").speed).toBe(0.1);
  });

  it("never lets the clip drop below the minimum duration", () => {
    const project = makeProject(makeStandardTracks(), [makeClip({ id: "A", sourceOut: 0.5 })]);
    const result = getClip(setSpeed(project, "A", 20), "A");
    expect(result.speed).toBe(5);
    expect(clipDuration(result)).toBeCloseTo(0.1, 9);
  });

  it("clamps fades to the new duration", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "A", sourceOut: 10, fadeIn: 4, fadeOut: 4 }),
    ]);
    expect(getClip(setSpeed(project, "A", 4), "A")).toMatchObject({ fadeIn: 2.5, fadeOut: 2.5 });
  });

  it("returns the same project for an unchanged speed, locked or unknown clip", () => {
    const project = mainProject();
    expect(setSpeed(project, "A", 1)).toBe(project);
    expect(setSpeed(project, "nope", 2)).toBe(project);
    const locked = makeProject(makeStandardTracks(), [makeClip({ id: "A", locked: true })]);
    expect(setSpeed(locked, "A", 2)).toBe(locked);
  });
});

describe("updateClip", () => {
  const project = makeProject(makeStandardTracks(), [makeClip({ id: "A", sourceOut: 10 })]);

  it("applies a patch", () => {
    const result = updateClip(project, "A", { volume: 40, muted: true, name: "Intro" });
    expect(getClip(result, "A")).toMatchObject({ volume: 40, muted: true, name: "Intro" });
  });

  it("clamps fades to [0, duration]", () => {
    expect(getClip(updateClip(project, "A", { fadeIn: 50 }), "A").fadeIn).toBe(10);
    expect(getClip(updateClip(project, "A", { fadeOut: -3 }), "A").fadeOut).toBe(0);
  });

  it("blocks edits on a locked clip but allows unlocking it", () => {
    const locked = makeProject(makeStandardTracks(), [makeClip({ id: "A", locked: true })]);
    expect(updateClip(locked, "A", { volume: 10 })).toBe(locked);
    expect(updateClip(locked, "A", { volume: 10, locked: false })).toBe(locked);
    expect(getClip(updateClip(locked, "A", { locked: false }), "A").locked).toBe(false);
  });

  it("blocks edits on a locked track", () => {
    const lockedTrack = makeProject([makeTrack({ id: "t1", locked: true })], [makeClip({ id: "A" })]);
    expect(updateClip(lockedTrack, "A", { volume: 10 })).toBe(lockedTrack);
  });

  it("returns the same project for an unknown clip", () => {
    expect(updateClip(project, "nope", { volume: 1 })).toBe(project);
  });
});
