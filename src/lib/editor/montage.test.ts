import { describe, expect, it } from "vitest";

import { buildMontage, MONTAGE_PHOTO_SECONDS, MONTAGE_TITLE_SECONDS } from "@/lib/editor/montage";
import type { EditorMedia } from "@/lib/editor/ops";
import { emptyTimeline } from "@/lib/sync/timeline-document";
import { clipEnd, videoEnd } from "@/lib/timeline/clip-math";
import { findClip } from "@/lib/timeline/lookup";
import { seqIds } from "@/lib/timeline/test-utils";

const frame = { width: 1920, height: 1080 };
const media = (mediaId: string, kind: EditorMedia["kind"], duration = 6): EditorMedia => ({
  mediaId,
  name: mediaId,
  kind,
  duration,
  width: 1920,
  height: 1080,
});
const song = media("music:confetti", "audio", 60);

describe("buildMontage", () => {
  const { project, clipIds } = buildMontage(
    emptyTimeline("p", seqIds("t")),
    [media("p1", "image"), media("v1", "video", 4), media("p2", "image"), media("p3", "image")],
    frame,
    { title: "Our weekend", music: song },
    seqIds("c"),
  );
  const clips = clipIds.map((id) => findClip(project, id)!);

  it("puts the pictures on the strip in order, photos at an even length", () => {
    expect(clips.map((c) => c.mediaId)).toEqual(["p1", "v1", "p2", "p3"]);
    expect(clips[0].start).toBe(0);
    for (const clip of clips.filter((c) => c.kind === "image")) {
      expect(clipEnd(clip) - clip.start).toBeCloseTo(MONTAGE_PHOTO_SECONDS);
    }
    expect(videoEnd(project)).toBeCloseTo(3 * MONTAGE_PHOTO_SECONDS + 4);
  });

  it("moves each photo a different way and gives every cut a transition", () => {
    const motions = clips.filter((c) => c.kind === "image").map((c) => c.motion);
    expect(new Set(motions).size).toBe(motions.length);
    expect(clips[0].transition ?? null).toBeNull();
    expect(clips.slice(1).every((c) => c.transition)).toBe(true);
  });

  it("opens with a title and puts the song underneath, cut to the video and faded", () => {
    const title = project.clips.find((c) => c.kind === "text")!;
    expect(title.adjustments.text?.content).toBe("Our weekend");
    expect(title.start).toBe(0);
    expect(clipEnd(title)).toBeCloseTo(MONTAGE_TITLE_SECONDS);

    const music = project.clips.find((c) => c.kind === "audio")!;
    expect(music.start).toBe(0);
    expect(clipEnd(music)).toBeCloseTo(videoEnd(project));
    expect(music.fadeIn).toBeGreaterThan(0);
    expect(music.fadeOut).toBeGreaterThan(0);
  });

  it("goes after what is already there, without a title or song when none is given", () => {
    const first = buildMontage(emptyTimeline("p", seqIds("t")), [media("a", "video", 5)], frame, { title: "", music: null }, seqIds("x"));
    const second = buildMontage(first.project, [media("b", "image")], frame, { title: "", music: null }, seqIds("y"));
    const b = findClip(second.project, second.clipIds[0])!;
    expect(b.start).toBeCloseTo(5);
    expect(b.transition).toBeTruthy();
    expect(second.project.clips.some((c) => c.kind === "text" || c.kind === "audio")).toBe(false);
  });
});
