import { describe, expect, it } from "vitest";

import { countSlots, exportableProject, exportFrameTimes, stillTime } from "@/lib/export/export-plan";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";

describe("exportFrameTimes", () => {
  it("lists one time per frame, starting at 0", () => {
    expect(exportFrameTimes(1, 4)).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it("rounds the frame count and never gives fewer than one frame", () => {
    expect(exportFrameTimes(2.02, 30)).toHaveLength(61);
    expect(exportFrameTimes(0, 30)).toEqual([0]);
    expect(exportFrameTimes(-3, 30)).toEqual([0]);
  });

  it("keeps every time inside the project", () => {
    const times = exportFrameTimes(5, 30);
    expect(times[times.length - 1]).toBeLessThan(5);
  });
});

describe("exportableProject and countSlots", () => {
  const project = makeProject(makeStandardTracks(), [
    makeClip({ id: "a", trackId: "t1" }),
    makeClip({ id: "slot", trackId: "t2", kind: "image", sourceDuration: null, isPlaceholder: true }),
    makeClip({ id: "slot2", trackId: "t2", kind: "image", sourceDuration: null, isPlaceholder: true }),
  ]);

  it("counts the empty slots", () => {
    expect(countSlots(project)).toBe(2);
  });

  it("leaves empty slots out, and nothing else", () => {
    expect(exportableProject(project).clips.map((c) => c.id)).toEqual(["a"]);
    expect(exportableProject(project).tracks).toBe(project.tracks);
  });

  it("returns the same project when there are no slots", () => {
    const plain = makeProject(makeStandardTracks(), [makeClip({ id: "a", trackId: "t1" })]);
    expect(exportableProject(plain)).toBe(plain);
  });
});

describe("stillTime", () => {
  it("is the playhead, kept inside the project so something is on screen", () => {
    expect(stillTime(3, 10)).toBe(3);
    expect(stillTime(-1, 10)).toBe(0);
    expect(stillTime(10, 10)).toBeLessThan(10);
    expect(stillTime(99, 10)).toBeLessThan(10);
    expect(stillTime(5, 0)).toBe(0);
  });
});
