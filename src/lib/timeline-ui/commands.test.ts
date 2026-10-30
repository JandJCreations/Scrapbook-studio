import { describe, expect, it } from "vitest";

import { deleteSelected, duplicateSelected, splitAtPlayhead } from "@/lib/timeline-ui/commands";
import { clipEnd } from "@/lib/timeline/clip-math";
import { findClip } from "@/lib/timeline/lookup";
import { makeClip, makeProject, makeStandardTracks, seqIds } from "@/lib/timeline/test-utils";

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

describe("splitAtPlayhead", () => {
  const project = makeProject(makeStandardTracks(), [video("a", 0, 4), overlay("o", 1, 4)]);

  it("splits only the selected clips when there is a selection", () => {
    const result = splitAtPlayhead(project, ["a"], 2, seqIds("n"));
    expect(result.clips).toHaveLength(3);
    expect(clipEnd(findClip(result, "a")!)).toBe(2);
    expect(findClip(result, "o")).toBe(findClip(project, "o"));
  });

  it("splits every clip under the playhead when nothing is selected", () => {
    const result = splitAtPlayhead(project, [], 2, seqIds("n"));
    expect(result.clips).toHaveLength(4);
  });

  it("returns the same project when the playhead is not inside any target", () => {
    expect(splitAtPlayhead(project, [], 10, seqIds("n"))).toBe(project);
    expect(splitAtPlayhead(project, ["a"], 4, seqIds("n"))).toBe(project);
    expect(splitAtPlayhead(project, ["a"], 0.05, seqIds("n"))).toBe(project);
  });

  it("leaves locked clips alone", () => {
    const locked = makeProject(makeStandardTracks(), [overlay("o", 1, 4, { locked: true })]);
    expect(splitAtPlayhead(locked, ["o"], 2, seqIds("n"))).toBe(locked);
  });
});

describe("duplicateSelected", () => {
  it("copies every selected clip to sit after its original", () => {
    const project = makeProject(makeStandardTracks(), [video("a", 0, 4), overlay("o", 1, 2)]);
    const result = duplicateSelected(project, ["a", "o"], seqIds("d"));
    expect(result.clips).toHaveLength(4);
    const copyOfOverlay = result.clips.find((c) => c.trackId === "t2" && c.id !== "o")!;
    expect(copyOfOverlay.start).toBe(3);
  });

  it("does nothing for an empty selection", () => {
    const project = makeProject(makeStandardTracks(), [video("a", 0, 4)]);
    expect(duplicateSelected(project, [], seqIds("d"))).toBe(project);
  });
});

describe("deleteSelected", () => {
  const project = makeProject(makeStandardTracks(), [
    overlay("o1", 0, 2),
    overlay("o2", 2, 2),
    video("a", 0, 4),
    video("b", 4, 4),
  ]);

  it("removes a track that the delete leaves empty, but not the main track", () => {
    const result = deleteSelected(project, ["o1", "o2"], false);
    expect(result.tracks.some((t) => t.id === "t2")).toBe(false);
    expect(result.tracks.some((t) => t.id === "t1")).toBe(true);
  });

  it("does not prune when nothing was deleted", () => {
    const tidy = makeProject(makeStandardTracks(), [video("a", 0, 4)]);
    expect(deleteSelected(tidy, [], false)).toBe(tidy);
    expect(deleteSelected(tidy, ["missing"], false)).toBe(tidy);
  });

  it("leaves a gap on a free track and closes it on the main track", () => {
    const result = deleteSelected(project, ["o1", "a"], false);
    expect(findClip(result, "o2")?.start).toBe(2);
    expect(findClip(result, "b")?.start).toBe(0);
  });

  it("ripple-deleting also shifts later clips on a free track", () => {
    const result = deleteSelected(project, ["o1"], true);
    expect(findClip(result, "o2")?.start).toBe(0);
  });

  it("returns the same project when nothing is selected", () => {
    expect(deleteSelected(project, [], false)).toBe(project);
  });
});
