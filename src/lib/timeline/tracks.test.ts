import { describe, expect, it } from "vitest";

import { addTrack, moveTrack, pruneEmptyTracks, updateTrack } from "@/lib/timeline/tracks";
import { makeClip, makeProject, makeStandardTracks, makeTrack, seqIds } from "@/lib/timeline/test-utils";

const ids = (project: ReturnType<typeof makeProject>) =>
  [...project.tracks].sort((a, b) => a.order - b.order).map((t) => t.id);

describe("addTrack", () => {
  it("puts a new overlay track on top", () => {
    const result = addTrack(makeProject(makeStandardTracks(), []), "overlay", seqIds());
    expect(ids(result)).toEqual(["id-1", "t2", "t1", "t3"]);
  });

  it("puts a new audio track at the bottom", () => {
    const result = addTrack(makeProject(makeStandardTracks(), []), "audio", seqIds());
    expect(ids(result)).toEqual(["t2", "t1", "t3", "id-1"]);
  });

  it("puts a new video track just below the overlays", () => {
    const result = addTrack(makeProject(makeStandardTracks(), []), "video", seqIds());
    expect(ids(result)).toEqual(["t2", "id-1", "t1", "t3"]);
  });

  it("renumbers order to 0..n-1 and keeps existing flags", () => {
    const tracks = makeStandardTracks().map((t) => (t.id === "t3" ? { ...t, muted: true } : t));
    const result = addTrack(makeProject(tracks, []), "overlay", seqIds());
    expect(result.tracks.map((t) => t.order).sort()).toEqual([0, 1, 2, 3]);
    expect(result.tracks.find((t) => t.id === "t3")?.muted).toBe(true);
  });

  it("creates a track with default flags", () => {
    const result = addTrack(makeProject([], []), "video", seqIds());
    expect(result.tracks).toEqual([
      { id: "id-1", type: "video", order: 0, muted: false, locked: false, hidden: false, solo: false },
    ]);
  });
});

describe("updateTrack", () => {
  const project = makeProject(makeStandardTracks(), []);

  it("applies a patch to one track", () => {
    const result = updateTrack(project, "t2", { muted: true, solo: true });
    expect(result.tracks.find((t) => t.id === "t2")).toMatchObject({ muted: true, solo: true });
    expect(result.tracks.find((t) => t.id === "t1")?.muted).toBe(false);
  });

  it("lets a locked track be unlocked", () => {
    const locked = updateTrack(project, "t1", { locked: true });
    expect(updateTrack(locked, "t1", { locked: false }).tracks.find((t) => t.id === "t1")?.locked).toBe(false);
  });

  it("returns the same project for an unknown track", () => {
    expect(updateTrack(project, "nope", { muted: true })).toBe(project);
  });
});

describe("pruneEmptyTracks", () => {
  it("removes empty overlay and audio tracks and renumbers the rest", () => {
    const project = makeProject(makeStandardTracks(), [makeClip({ id: "a", trackId: "t1" })]);
    const pruned = pruneEmptyTracks(project);
    expect(pruned.tracks.map((t) => [t.id, t.order])).toEqual([["t1", 0]]);
  });

  it("keeps the main video track even when it is empty", () => {
    const project = makeProject(makeStandardTracks(), []);
    expect(pruneEmptyTracks(project).tracks.map((t) => t.id)).toEqual(["t1"]);
  });

  it("keeps tracks that hold clips, in their existing order", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", trackId: "t1" }),
      makeClip({ id: "o", trackId: "t2", kind: "image", sourceDuration: null }),
    ]);
    expect(pruneEmptyTracks(project).tracks.map((t) => [t.id, t.order])).toEqual([
      ["t2", 0],
      ["t1", 1],
    ]);
  });

  it("returns the same project when nothing is empty", () => {
    const project = makeProject([makeStandardTracks()[1]], [makeClip({ id: "a", trackId: "t1" })]);
    expect(pruneEmptyTracks(project)).toBe(project);
  });
});

describe("moveTrack", () => {
  // o3 (0), o2 (1), o1 (2) overlays, then video v (3), audio a (4)
  const stacked = () =>
    makeProject(
      [
        makeTrack({ id: "o3", type: "overlay", order: 0 }),
        makeTrack({ id: "o2", type: "overlay", order: 1 }),
        makeTrack({ id: "o1", type: "overlay", order: 2 }),
        makeTrack({ id: "v", type: "video", order: 3 }),
        makeTrack({ id: "a", type: "audio", order: 4 }),
      ],
      [makeClip({ id: "c", trackId: "o2", kind: "image", sourceDuration: null })],
    );
  const order = (p: ReturnType<typeof stacked>) =>
    [...p.tracks].sort((x, y) => x.order - y.order).map((t) => t.id);

  it("moves an overlay up or down one place among the overlays", () => {
    expect(order(moveTrack(stacked(), "o2", "up"))).toEqual(["o2", "o3", "o1", "v", "a"]);
    expect(order(moveTrack(stacked(), "o2", "down"))).toEqual(["o3", "o1", "o2", "v", "a"]);
  });

  it("keeps the order numbers 0 to n-1 and leaves the clips alone", () => {
    const moved = moveTrack(stacked(), "o1", "up");
    expect(moved.tracks.map((t) => t.order).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(moved.clips.map((c) => [c.id, c.trackId])).toEqual([["c", "o2"]]);
  });

  it("stops at the top and bottom of the overlays", () => {
    const p = stacked();
    expect(moveTrack(p, "o3", "up")).toBe(p);
    expect(moveTrack(p, "o1", "down")).toBe(p); // the main video track stays below every overlay
  });

  it("only moves overlays, and ignores unknown tracks", () => {
    const p = stacked();
    expect(moveTrack(p, "v", "up")).toBe(p);
    expect(moveTrack(p, "a", "up")).toBe(p);
    expect(moveTrack(p, "nope", "up")).toBe(p);
  });
});
