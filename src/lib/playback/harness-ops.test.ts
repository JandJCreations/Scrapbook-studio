import { describe, expect, it } from "vitest";

import {
  addMediaToProject,
  HARNESS_FRAME,
  IMAGE_CLIP_SECONDS,
  type MediaItem,
} from "@/lib/playback/harness-ops";
import { emptyTimeline } from "@/lib/sync/timeline-document";
import { seqIds } from "@/lib/timeline/test-utils";

const video = (mediaId: string, overrides: Partial<MediaItem> = {}): MediaItem => ({
  mediaId,
  name: mediaId,
  kind: "video",
  duration: 6,
  width: 640,
  height: 360,
  ...overrides,
});

const base = () => emptyTimeline("h", seqIds("t")); // video t-1, audio t-2

describe("addMediaToProject", () => {
  it("appends videos to the main track one after another", () => {
    let project = addMediaToProject(base(), video("a"), { newId: seqIds("c") });
    project = addMediaToProject(project, video("b"), { newId: seqIds("d") });

    expect(project.clips.map((c) => [c.mediaId, c.trackId, c.start])).toEqual([
      ["a", "t-1", 0],
      ["b", "t-1", 6],
    ]);
    expect(project.clips[0]).toMatchObject({ kind: "video", sourceIn: 0, sourceOut: 6, sourceDuration: 6 });
  });

  it("makes a still image five seconds long with no source length", () => {
    const project = addMediaToProject(base(), video("pic", { kind: "image", duration: 0 }), {
      newId: seqIds("c"),
    });
    expect(project.clips[0]).toMatchObject({
      kind: "image",
      sourceIn: 0,
      sourceOut: IMAGE_CLIP_SECONDS,
      sourceDuration: null,
    });
  });

  it("puts audio on the audio track at the requested time", () => {
    const project = addMediaToProject(base(), video("song", { kind: "audio", duration: 30 }), {
      at: 2,
      newId: seqIds("c"),
    });
    expect(project.clips[0]).toMatchObject({ kind: "audio", trackId: "t-2", start: 2, sourceOut: 30 });
  });

  it("starts audio at 0 by default", () => {
    const project = addMediaToProject(base(), video("song", { kind: "audio" }), { newId: seqIds("c") });
    expect(project.clips[0].start).toBe(0);
  });

  it("creates a missing track", () => {
    const empty = { id: "h", tracks: [], clips: [] };
    const project = addMediaToProject(empty, video("a"), { newId: seqIds("n") });
    expect(project.tracks.map((t) => t.type)).toEqual(["video"]);
    expect(project.clips).toHaveLength(1);
    expect(project.clips[0].trackId).toBe(project.tracks[0].id);
  });

  it("fits the picture inside the frame, centred", () => {
    const wide = addMediaToProject(base(), video("w"), { newId: seqIds("c") });
    expect(wide.clips[0].transform).toMatchObject({ x: 0, y: 0, width: 1280, height: 720 });

    const square = addMediaToProject(base(), video("s", { width: 1000, height: 1000 }), {
      newId: seqIds("c"),
    });
    expect(square.clips[0].transform).toMatchObject({ x: 280, y: 0, width: 720, height: 720 });
  });

  it("uses the whole frame when the natural size is unknown", () => {
    const project = addMediaToProject(base(), video("u", { width: 0, height: 0 }), {
      newId: seqIds("c"),
    });
    expect(project.clips[0].transform).toMatchObject({
      x: 0,
      y: 0,
      width: HARNESS_FRAME.width,
      height: HARNESS_FRAME.height,
    });
  });
});
