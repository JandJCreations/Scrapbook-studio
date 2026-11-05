import { describe, expect, it } from "vitest";

import {
  clipsInRect,
  computeMove,
  computeTrim,
  dropTargetAt,
  type DropTarget,
} from "@/lib/timeline-ui/drag";
import { trackLayout } from "@/lib/timeline-ui/layout";
import { clipDuration, clipEnd } from "@/lib/timeline/clip-math";
import { findClip } from "@/lib/timeline/lookup";
import { makeClip, makeProject, makeStandardTracks, seqIds } from "@/lib/timeline/test-utils";

// t2 overlay (row y 0-52), t1 video (54-142), t3 audio (144-200).
const overlay = (id: string, start: number, length: number, extra = {}) =>
  makeClip({
    id,
    trackId: "t2",
    kind: "image",
    sourceDuration: null,
    start,
    sourceIn: 0,
    sourceOut: length,
    ...extra,
  });
const video = (id: string, start: number, length: number) =>
  makeClip({ id, trackId: "t1", start, sourceIn: 0, sourceOut: length, sourceDuration: 100 });

const onTrack = (trackId: string): DropTarget => ({ kind: "track", trackId });
const base = { playhead: 0, pps: 60, newTrackId: seqIds("n") };

describe("dropTargetAt", () => {
  const layout = trackLayout(makeProject(makeStandardTracks(), []));

  it("finds the row under the pointer, with the gap below belonging to the row above", () => {
    expect(dropTargetAt(layout, 10)).toEqual(onTrack("t2"));
    expect(dropTargetAt(layout, 53)).toEqual(onTrack("t2"));
    expect(dropTargetAt(layout, 70)).toEqual(onTrack("t1"));
    expect(dropTargetAt(layout, 170)).toEqual(onTrack("t3"));
  });

  it("means a new track above the first row or below the last", () => {
    expect(dropTargetAt(layout, -5)).toEqual({ kind: "new-track" });
    expect(dropTargetAt(layout, 200)).toEqual({ kind: "new-track" });
    expect(dropTargetAt(layout, 400)).toEqual({ kind: "new-track" });
  });

  it("means a new track when there are no rows", () => {
    expect(dropTargetAt(trackLayout(makeProject([], [])), 10)).toEqual({ kind: "new-track" });
  });
});

describe("computeMove on a free track", () => {
  it("places the clip by the pointer minus where it was grabbed", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2)]);
    const result = computeMove(project, {
      ...base,
      clipId: "o",
      pointerTime: 3.5,
      grabOffset: 0.5,
      target: onTrack("t2"),
    });
    expect(findClip(result.project, "o")?.start).toBe(3);
    expect(result.guide).toBeNull();
  });

  it("snaps the start edge to the playhead within 8 px", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2)]);
    const result = computeMove(project, {
      ...base,
      playhead: 5,
      clipId: "o",
      pointerTime: 5.55,
      grabOffset: 0.5,
      target: onTrack("t2"),
    });
    expect(findClip(result.project, "o")?.start).toBe(5);
    expect(result.guide).toEqual({ kind: "snap", time: 5 });
  });

  it("snaps the end edge to another clip's start", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2), overlay("x", 10, 1)]);
    const result = computeMove(project, {
      ...base,
      clipId: "o",
      pointerTime: 8.45,
      grabOffset: 0.5,
      target: onTrack("t2"),
    });
    expect(findClip(result.project, "o")?.start).toBe(8);
    expect(result.guide).toEqual({ kind: "snap", time: 10 });
  });

  it("never goes before time 0", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2)]);
    const result = computeMove(project, {
      ...base,
      clipId: "o",
      pointerTime: 0.2,
      grabOffset: 0.5,
      target: onTrack("t2"),
    });
    expect(findClip(result.project, "o")?.start).toBe(0);
  });
});

describe("computeMove on the main track", () => {
  it("reorders and reports where the clip lands", () => {
    const project = makeProject(makeStandardTracks(), [video("a", 0, 4), video("b", 4, 4)]);
    const result = computeMove(project, {
      ...base,
      clipId: "b",
      pointerTime: 0.5,
      grabOffset: 2,
      target: onTrack("t1"),
    });
    expect(findClip(result.project, "b")?.start).toBe(0);
    expect(findClip(result.project, "a")?.start).toBe(4);
    expect(result.guide).toEqual({ kind: "insert", time: 0 });
  });

  it("does not snap on the magnetic track", () => {
    const project = makeProject(makeStandardTracks(), [video("a", 0, 4), video("b", 4, 4)]);
    const result = computeMove(project, {
      ...base,
      playhead: 4.05,
      clipId: "a",
      pointerTime: 4.1,
      grabOffset: 0,
      target: onTrack("t1"),
    });
    expect(result.guide?.kind).toBe("insert");
  });
});

describe("computeMove into empty space", () => {
  it("creates an overlay track for a picture clip", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2)]);
    const result = computeMove(project, {
      ...base,
      newTrackId: seqIds("n"),
      clipId: "o",
      pointerTime: 2,
      grabOffset: 0,
      target: { kind: "new-track" },
    });
    expect(result.project.tracks).toHaveLength(4);
    const clip = findClip(result.project, "o")!;
    const track = result.project.tracks.find((t) => t.id === clip.trackId)!;
    expect(track.type).toBe("overlay");
    expect(track.id).toBe("n-1");
    expect(clip.start).toBe(2);
  });

  it("creates an audio track for an audio clip", () => {
    const sound = makeClip({ id: "s", trackId: "t3", kind: "audio", start: 0, sourceOut: 3 });
    const project = makeProject(makeStandardTracks(), [sound]);
    const result = computeMove(project, {
      ...base,
      newTrackId: seqIds("n"),
      clipId: "s",
      pointerTime: 1,
      grabOffset: 0,
      target: { kind: "new-track" },
    });
    const clip = findClip(result.project, "s")!;
    expect(result.project.tracks.find((t) => t.id === clip.trackId)?.type).toBe("audio");
    expect(result.project.tracks).toHaveLength(4);
  });

  it("treats a track id that does not exist yet as a new track (the preview track)", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2)]);
    const result = computeMove(project, {
      ...base,
      newTrackId: seqIds("n"),
      clipId: "o",
      pointerTime: 2,
      grabOffset: 0,
      target: onTrack("ghost"),
    });
    expect(result.project.tracks).toHaveLength(4);
  });
});

describe("computeMove rejections", () => {
  it("returns the original project when the track cannot host the clip", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2)]);
    const result = computeMove(project, {
      ...base,
      clipId: "o",
      pointerTime: 2,
      grabOffset: 0,
      target: onTrack("t3"),
    });
    expect(result.project).toBe(project);
    expect(result.guide).toBeNull();
  });

  it("returns the original project for a locked or missing clip", () => {
    const locked = makeProject(makeStandardTracks(), [overlay("o", 1, 2, { locked: true })]);
    const input = { ...base, pointerTime: 3, grabOffset: 0, target: onTrack("t2") };
    expect(computeMove(locked, { ...input, clipId: "o" }).project).toBe(locked);
    expect(computeMove(locked, { ...input, clipId: "nope" }).project).toBe(locked);
  });

  it("never returns a project with an empty extra track when a move into a new track is rejected", () => {
    const locked = makeProject(makeStandardTracks(), [overlay("o", 1, 2, { locked: true })]);
    const result = computeMove(locked, {
      ...base,
      clipId: "o",
      pointerTime: 3,
      grabOffset: 0,
      target: { kind: "new-track" },
    });
    expect(result.project).toBe(locked);
  });
});

describe("computeTrim", () => {
  it("snaps the dragged edge to the playhead", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 5)]);
    const result = computeTrim(project, {
      ...base,
      playhead: 3,
      clipId: "o",
      edge: "end",
      pointerTime: 2.95,
    });
    expect(clipEnd(findClip(result.project, "o")!)).toBeCloseTo(3, 9);
    expect(result.guide).toEqual({ kind: "snap", time: 3 });
  });

  it("moves the start edge and keeps the end where it was", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2)]);
    const result = computeTrim(project, {
      ...base,
      clipId: "o",
      edge: "start",
      pointerTime: 1.5,
    });
    const clip = findClip(result.project, "o")!;
    expect(clip.start).toBeCloseTo(1.5, 9);
    expect(clipEnd(clip)).toBeCloseTo(3, 9);
    expect(clipDuration(clip)).toBeCloseTo(1.5, 9);
  });

  it("returns the original project for a locked or missing clip", () => {
    const locked = makeProject(makeStandardTracks(), [overlay("o", 1, 2, { locked: true })]);
    const input = { ...base, edge: "end" as const, pointerTime: 2 };
    expect(computeTrim(locked, { ...input, clipId: "o" }).project).toBe(locked);
    expect(computeTrim(locked, { ...input, clipId: "nope" }).project).toBe(locked);
  });
});

describe("clipsInRect", () => {
  const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2), video("a", 0, 4)]);
  const layout = trackLayout(project);
  // At 60 px/s: overlay chip x 60-180, y 2-42; video chip x 0-240, y 48-108.

  it("selects the clips the rectangle overlaps", () => {
    expect(clipsInRect(project, layout, 60, { left: 0, top: 0, right: 100, bottom: 40 })).toEqual(["o"]);
    expect(
      clipsInRect(project, layout, 60, { left: 0, top: 0, right: 300, bottom: 200 }).sort(),
    ).toEqual(["a", "o"]);
  });

  it("selects nothing in empty space", () => {
    expect(clipsInRect(project, layout, 60, { left: 400, top: 0, right: 500, bottom: 200 })).toEqual([]);
  });

  it("does not count rectangles that only touch an edge", () => {
    expect(clipsInRect(project, layout, 60, { left: 0, top: 0, right: 60, bottom: 40 })).toEqual([]);
    expect(clipsInRect(project, layout, 60, { left: 0, top: 0, right: 61, bottom: 40 })).toEqual(["o"]);
  });
});
