import { describe, expect, it } from "vitest";

import { insertClip, moveClip } from "@/lib/timeline/place";
import {
  getClip,
  makeClip,
  makeProject,
  makeStandardTracks,
  makeTrack,
} from "@/lib/timeline/test-utils";

// Main track t1: A[0,4] B[4,10] C[10,12]. Overlay t2 and audio t3 are empty.
const mainProject = () =>
  makeProject(makeStandardTracks(), [
    makeClip({ id: "A", start: 0, sourceOut: 4 }),
    makeClip({ id: "B", start: 4, sourceOut: 6 }),
    makeClip({ id: "C", start: 10, sourceOut: 2 }),
  ]);

const still = (overrides = {}) =>
  makeClip({ kind: "image", sourceDuration: null, sourceIn: 0, sourceOut: 5, ...overrides });

describe("moveClip on free tracks", () => {
  const project = makeProject(makeStandardTracks(), [
    still({ id: "o", trackId: "t2", start: 2 }),
  ]);

  it("moves a clip to a new start", () => {
    expect(getClip(moveClip(project, "o", { start: 12 }), "o").start).toBe(12);
  });

  it("clamps a negative start to 0", () => {
    expect(getClip(moveClip(project, "o", { start: -4 }), "o").start).toBe(0);
  });

  it("allows overlapping another clip", () => {
    const two = makeProject(makeStandardTracks(), [
      still({ id: "o", trackId: "t2", start: 0 }),
      still({ id: "p", trackId: "t2", start: 20 }),
    ]);
    const result = moveClip(two, "p", { start: 1 });
    expect(getClip(result, "p").start).toBe(1);
    expect(getClip(result, "o").start).toBe(0);
  });
});

describe("moveClip on the main track (reorder)", () => {
  it("reorders by midpoint and re-packs", () => {
    const result = moveClip(mainProject(), "A", { start: 7 });
    expect(getClip(result, "B").start).toBe(0);
    expect(getClip(result, "A").start).toBe(6);
    expect(getClip(result, "C").start).toBe(10);
  });

  it("moves a clip to the end when dropped far right", () => {
    const result = moveClip(mainProject(), "A", { start: 100 });
    expect(getClip(result, "B").start).toBe(0);
    expect(getClip(result, "C").start).toBe(6);
    expect(getClip(result, "A").start).toBe(8);
  });

  it("moves a clip to the front when dropped at 0", () => {
    const result = moveClip(mainProject(), "C", { start: 0 });
    expect(getClip(result, "C").start).toBe(0);
    expect(getClip(result, "A").start).toBe(2);
    expect(getClip(result, "B").start).toBe(6);
  });

  it("inserts an overlay clip into the main track and ripples the rest", () => {
    const project = makeProject(makeStandardTracks(), [
      ...mainProject().clips,
      still({ id: "O", trackId: "t2", start: 3 }),
    ]);
    const result = moveClip(project, "O", { start: 1, trackId: "t1" });
    expect(getClip(result, "O").trackId).toBe("t1");
    expect(getClip(result, "A").start).toBe(0);
    expect(getClip(result, "O").start).toBe(4);
    expect(getClip(result, "B").start).toBe(9);
    expect(getClip(result, "C").start).toBe(15);
  });

  it("closes the gap when a main-track clip moves to an overlay track", () => {
    const result = moveClip(mainProject(), "B", { start: 20, trackId: "t2" });
    expect(getClip(result, "B")).toMatchObject({ trackId: "t2", start: 20 });
    expect(getClip(result, "C").start).toBe(4);
  });
});

describe("moveClip rejections", () => {
  it("rejects an audio clip on the video track", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "s", trackId: "t3", kind: "audio", start: 0, sourceOut: 3 }),
    ]);
    expect(moveClip(project, "s", { start: 0, trackId: "t1" })).toBe(project);
  });

  it("rejects a video clip on an audio track", () => {
    const project = mainProject();
    expect(moveClip(project, "A", { start: 0, trackId: "t3" })).toBe(project);
  });

  it("rejects a locked clip, a locked target track and unknown ids", () => {
    const lockedClip = makeProject(makeStandardTracks(), [
      still({ id: "o", trackId: "t2", locked: true }),
    ]);
    expect(moveClip(lockedClip, "o", { start: 3 })).toBe(lockedClip);

    const tracks = [
      ...makeStandardTracks().filter((t) => t.id !== "t2"),
      makeTrack({ id: "t2", type: "overlay", order: 0, locked: true }),
    ];
    const lockedTarget = makeProject(tracks, [still({ id: "o", trackId: "t1" })]);
    expect(moveClip(lockedTarget, "o", { start: 3, trackId: "t2" })).toBe(lockedTarget);

    const project = mainProject();
    expect(moveClip(project, "nope", { start: 1 })).toBe(project);
    expect(moveClip(project, "A", { start: 1, trackId: "nope" })).toBe(project);
  });
});

describe("insertClip", () => {
  it("adds a clip to an overlay track at its start", () => {
    const project = makeProject(makeStandardTracks(), []);
    const result = insertClip(project, still({ id: "n", trackId: "t2", start: 8 }));
    expect(getClip(result, "n").start).toBe(8);
  });

  it("inserts into the main track at the midpoint position and packs", () => {
    const result = insertClip(
      mainProject(),
      makeClip({ id: "D", start: 5, sourceIn: 0, sourceOut: 2 }),
    );
    expect(getClip(result, "A").start).toBe(0);
    expect(getClip(result, "D").start).toBe(4);
    expect(getClip(result, "B").start).toBe(6);
    expect(getClip(result, "C").start).toBe(12);
  });

  it("rejects duplicate ids, unknown tracks, incompatible tracks and locked tracks", () => {
    const project = mainProject();
    expect(insertClip(project, makeClip({ id: "A" }))).toBe(project);
    expect(insertClip(project, makeClip({ id: "n", trackId: "nope" }))).toBe(project);
    expect(insertClip(project, makeClip({ id: "n", trackId: "t1", kind: "audio" }))).toBe(project);

    const locked = makeProject([makeTrack({ id: "t1", locked: true })], []);
    expect(insertClip(locked, makeClip({ id: "n" }))).toBe(locked);
  });
});
