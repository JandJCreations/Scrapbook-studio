import { describe, expect, it } from "vitest";

import {
  canHostClip,
  clipsOnTrack,
  findClip,
  findTrack,
  isClipLocked,
} from "@/lib/timeline/lookup";
import { makeClip, makeProject, makeStandardTracks, makeTrack } from "@/lib/timeline/test-utils";

describe("findClip / findTrack", () => {
  const project = makeProject(makeStandardTracks(), [makeClip({ id: "a" })]);

  it("finds by id", () => {
    expect(findClip(project, "a")?.id).toBe("a");
    expect(findTrack(project, "t2")?.type).toBe("overlay");
  });

  it("returns undefined for unknown ids", () => {
    expect(findClip(project, "nope")).toBeUndefined();
    expect(findTrack(project, "nope")).toBeUndefined();
  });
});

describe("isClipLocked", () => {
  it("is true when the clip is locked", () => {
    const clip = makeClip({ locked: true });
    expect(isClipLocked(makeProject(makeStandardTracks(), [clip]), clip)).toBe(true);
  });

  it("is true when the clip's track is locked", () => {
    const clip = makeClip({ trackId: "t1" });
    const tracks = [makeTrack({ id: "t1", locked: true })];
    expect(isClipLocked(makeProject(tracks, [clip]), clip)).toBe(true);
  });

  it("is false otherwise", () => {
    const clip = makeClip();
    expect(isClipLocked(makeProject(makeStandardTracks(), [clip]), clip)).toBe(false);
  });
});

describe("canHostClip", () => {
  const video = makeTrack({ type: "video" });
  const overlay = makeTrack({ type: "overlay" });
  const audio = makeTrack({ type: "audio" });

  it("puts audio clips only on audio tracks", () => {
    const clip = makeClip({ kind: "audio" });
    expect(canHostClip(audio, clip)).toBe(true);
    expect(canHostClip(video, clip)).toBe(false);
    expect(canHostClip(overlay, clip)).toBe(false);
  });

  it.each(["video", "image", "text", "sticker"] as const)(
    "keeps %s clips off audio tracks",
    (kind) => {
      const clip = makeClip({ kind });
      expect(canHostClip(video, clip)).toBe(true);
      expect(canHostClip(overlay, clip)).toBe(true);
      expect(canHostClip(audio, clip)).toBe(false);
    },
  );
});

describe("clipsOnTrack", () => {
  it("returns only that track's clips, sorted by start, without mutating the project", () => {
    const clips = [
      makeClip({ id: "late", trackId: "t2", start: 9 }),
      makeClip({ id: "other", trackId: "t1", start: 0 }),
      makeClip({ id: "early", trackId: "t2", start: 1 }),
    ];
    const project = makeProject(makeStandardTracks(), clips);
    expect(clipsOnTrack(project, "t2").map((c) => c.id)).toEqual(["early", "late"]);
    expect(project.clips.map((c) => c.id)).toEqual(["late", "other", "early"]);
  });
});
