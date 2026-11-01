import { describe, expect, it } from "vitest";

import {
  addAsOverlay,
  addAudioClip,
  addText,
  addToSequence,
  OVERLAY_SCALE,
  patchTextAdjustments,
  resetTextAdjustments,
  setClipTransforms,
  STILL_SECONDS,
  TEXT_SECONDS,
  type EditorMedia,
} from "@/lib/editor/ops";
import { emptyTimeline } from "@/lib/sync/timeline-document";
import { clipEnd } from "@/lib/timeline/clip-math";
import { findClip } from "@/lib/timeline/lookup";
import { seqIds } from "@/lib/timeline/test-utils";

const frame = { width: 1920, height: 1080 };
const video = (mediaId: string, overrides: Partial<EditorMedia> = {}): EditorMedia => ({
  mediaId,
  name: mediaId,
  kind: "video",
  duration: 6,
  width: 1920,
  height: 1080,
  ...overrides,
});
const base = () => emptyTimeline("p", seqIds("t")); // video t-1, audio t-2

describe("addToSequence", () => {
  it("appends to the end of the main track, one after another", () => {
    const a = addToSequence(base(), video("a"), frame, seqIds("c"));
    const b = addToSequence(a.project, video("b"), frame, seqIds("d"));
    expect(b.project.clips.map((c) => [c.mediaId, c.trackId, c.start])).toEqual([
      ["a", "t-1", 0],
      ["b", "t-1", 6],
    ]);
    expect(b.clipId).toBe(findClip(b.project, b.clipId)?.id);
  });

  it("is not pushed later by longer music on another track", () => {
    const withMusic = addAudioClip(
      base(),
      video("m", { kind: "audio", duration: 60 }),
      frame,
      0,
      seqIds("m"),
    );
    const result = addToSequence(withMusic.project, video("a"), frame, seqIds("c"));
    expect(findClip(result.project, result.clipId)?.start).toBe(0);
  });

  it("fits a picture inside the frame, centred", () => {
    const square = addToSequence(
      base(),
      video("s", { width: 1000, height: 1000 }),
      frame,
      seqIds("c"),
    );
    expect(findClip(square.project, square.clipId)?.transform).toMatchObject({
      x: 420,
      y: 0,
      width: 1080,
      height: 1080,
    });
  });

  it("makes a still image five seconds long with no source length", () => {
    const result = addToSequence(
      base(),
      video("p", { kind: "image", duration: 0 }),
      frame,
      seqIds("c"),
    );
    expect(findClip(result.project, result.clipId)).toMatchObject({
      kind: "image",
      sourceDuration: null,
      sourceIn: 0,
      sourceOut: STILL_SECONDS,
    });
  });

  it("creates the main track when there is none", () => {
    const empty = { id: "p", tracks: [], clips: [] };
    const result = addToSequence(empty, video("a"), frame, seqIds("n"));
    expect(result.project.tracks.map((t) => t.type)).toEqual(["video"]);
  });

  it("sends an audio item to the audio track instead", () => {
    const result = addToSequence(
      base(),
      video("m", { kind: "audio", duration: 30 }),
      frame,
      seqIds("c"),
    );
    expect(findClip(result.project, result.clipId)).toMatchObject({
      kind: "audio",
      trackId: "t-2",
      start: 0,
    });
  });
});

describe("addAsOverlay", () => {
  it("puts the picture on its own new overlay track on top, at the playhead", () => {
    const first = addAsOverlay(base(), video("a"), frame, 2, seqIds("n"));
    const second = addAsOverlay(first.project, video("b"), frame, 3, seqIds("m"));

    const types = [...second.project.tracks].sort((x, y) => x.order - y.order).map((t) => t.type);
    expect(types).toEqual(["overlay", "overlay", "video", "audio"]);

    const bClip = findClip(second.project, second.clipId)!;
    const aClip = findClip(second.project, first.clipId)!;
    const order = (trackId: string) => second.project.tracks.find((t) => t.id === trackId)!.order;
    expect(order(bClip.trackId)).toBeLessThan(order(aClip.trackId)); // the newest is on top
    expect(bClip.start).toBe(3);
    expect(aClip.start).toBe(2);
  });

  it("fits at 40% of the frame and centres it", () => {
    const result = addAsOverlay(base(), video("a"), frame, 0, seqIds("n"));
    const clip = findClip(result.project, result.clipId)!;
    expect(clip.transform.width).toBeCloseTo(1920 * OVERLAY_SCALE, 6);
    expect(clip.transform.height).toBeCloseTo(1080 * OVERLAY_SCALE, 6);
    expect(clip.transform.x).toBeCloseTo((1920 - clip.transform.width) / 2, 6);
    expect(clip.transform.y).toBeCloseTo((1080 - clip.transform.height) / 2, 6);
  });

  it("never starts before time 0 and keeps a video's length", () => {
    const result = addAsOverlay(base(), video("a", { duration: 4 }), frame, -3, seqIds("n"));
    const clip = findClip(result.project, result.clipId)!;
    expect(clip.start).toBe(0);
    expect(clipEnd(clip)).toBe(4);
  });

  it("sends an audio item to the audio track", () => {
    const result = addAsOverlay(base(), video("m", { kind: "audio" }), frame, 5, seqIds("n"));
    expect(findClip(result.project, result.clipId)).toMatchObject({ kind: "audio", start: 5 });
    expect(result.project.tracks.filter((t) => t.type === "overlay")).toHaveLength(0);
  });
});

describe("addAudioClip", () => {
  it("places music on the audio track at the requested time", () => {
    const result = addAudioClip(
      base(),
      video("m", { kind: "audio", duration: 30 }),
      frame,
      2,
      seqIds("c"),
    );
    expect(findClip(result.project, result.clipId)).toMatchObject({
      kind: "audio",
      trackId: "t-2",
      start: 2,
      sourceOut: 30,
      sourceDuration: 30,
    });
  });

  it("creates an audio track when there is none", () => {
    const noAudio = { id: "p", tracks: base().tracks.filter((t) => t.type === "video"), clips: [] };
    const result = addAudioClip(noAudio, video("m", { kind: "audio" }), frame, 0, seqIds("n"));
    expect(result.project.tracks.map((t) => t.type).sort()).toEqual(["audio", "video"]);
  });
});

describe("setClipTransforms", () => {
  it("applies each patch to its own clip", () => {
    const a = addToSequence(base(), video("a"), frame, seqIds("c"));
    const b = addAsOverlay(a.project, video("b"), frame, 0, seqIds("n"));
    const result = setClipTransforms(b.project, {
      [a.clipId]: { x: 10 },
      [b.clipId]: { rotation: 45, width: 300 },
    });
    expect(findClip(result, a.clipId)?.transform.x).toBe(10);
    expect(findClip(result, b.clipId)?.transform).toMatchObject({ rotation: 45, width: 300 });
  });

  it("skips unknown clips and returns the same project when nothing changes", () => {
    const a = addToSequence(base(), video("a"), frame, seqIds("c"));
    const same = setClipTransforms(a.project, { missing: { x: 1 } });
    expect(same).toBe(a.project);
    const unchanged = setClipTransforms(a.project, {
      [a.clipId]: { x: findClip(a.project, a.clipId)!.transform.x },
    });
    expect(unchanged).toBe(a.project);
  });

  it("ignores a locked clip", () => {
    const a = addToSequence(base(), video("a"), frame, seqIds("c"));
    const locked = {
      ...a.project,
      clips: a.project.clips.map((c) => ({ ...c, locked: true })),
    };
    expect(setClipTransforms(locked, { [a.clipId]: { x: 99 } })).toBe(locked);
  });
});

describe("addText", () => {
  it("puts a five second text clip on its own new top overlay track at the playhead", () => {
    const first = addText(base(), frame, 2, seqIds("n"));
    const second = addText(first.project, frame, 4, seqIds("m"));
    const clip = findClip(second.project, second.clipId)!;
    expect(clip).toMatchObject({
      kind: "text",
      mediaId: "",
      sourceDuration: null,
      start: 4,
      name: "Your text",
    });
    expect(clipEnd(clip)).toBe(4 + TEXT_SECONDS);
    const order = (trackId: string) => second.project.tracks.find((t) => t.id === trackId)!.order;
    const older = findClip(second.project, first.clipId)!;
    expect(order(clip.trackId)).toBeLessThan(order(older.trackId));
    expect(second.project.tracks.find((t) => t.id === clip.trackId)?.type).toBe("overlay");
  });

  it("sizes the font and box from the frame and centres the box", () => {
    const result = addText(base(), frame, 0, seqIds("n"));
    const clip = findClip(result.project, result.clipId)!;
    expect(clip.adjustments.text?.fontSize).toBe(76);
    expect(clip.transform.width).toBeCloseTo(1920 * 0.6, 6);
    expect(clip.transform.x).toBeCloseTo((1920 - clip.transform.width) / 2, 6);
    expect(clip.transform.y).toBeCloseTo((1080 - clip.transform.height) / 2, 6);
    expect(clip.adjustments.text?.content).toBe("Your text");
  });

  it("never starts before zero", () => {
    const result = addText(base(), frame, -5, seqIds("n"));
    expect(findClip(result.project, result.clipId)?.start).toBe(0);
  });
});

describe("patchTextAdjustments", () => {
  const withText = () => addText(base(), frame, 0, seqIds("n"));

  it("merges the patch and keeps the clip name in step with the content", () => {
    const { project, clipId } = withText();
    const result = patchTextAdjustments(project, clipId, { content: "Happy birthday", fontSize: 90 });
    const clip = findClip(result, clipId)!;
    expect(clip.adjustments.text).toMatchObject({ content: "Happy birthday", fontSize: 90, color: "#1f2937" });
    expect(clip.name).toBe("Happy birthday");
  });

  it("shortens a long name and falls back to Text for empty content", () => {
    const { project, clipId } = withText();
    const long = patchTextAdjustments(project, clipId, { content: "a".repeat(40) });
    expect(findClip(long, clipId)?.name).toBe("a".repeat(24));
    const empty = patchTextAdjustments(project, clipId, { content: "   " });
    expect(findClip(empty, clipId)?.name).toBe("Text");
  });

  it("returns the same project for an unknown clip, a non-text clip, a locked clip or no change", () => {
    const { project, clipId } = withText();
    expect(patchTextAdjustments(project, "missing", { fontSize: 5 })).toBe(project);
    expect(patchTextAdjustments(project, clipId, {})).toBe(project);
    expect(patchTextAdjustments(project, clipId, { fontSize: 76 })).toBe(project);
    const media = addToSequence(base(), video("a"), frame, seqIds("c"));
    expect(patchTextAdjustments(media.project, media.clipId, { fontSize: 5 })).toBe(media.project);
    const locked = { ...project, clips: project.clips.map((c) => ({ ...c, locked: true })) };
    expect(patchTextAdjustments(locked, clipId, { fontSize: 5 })).toBe(locked);
  });
});

describe("resetTextAdjustments", () => {
  it("restores the default style but keeps the words", () => {
    const { project, clipId } = addText(base(), frame, 0, seqIds("n"));
    const changed = patchTextAdjustments(project, clipId, {
      content: "Keep me",
      color: "#ff0000",
      curve: 50,
      fontSize: 10,
    });
    const reset = findClip(resetTextAdjustments(changed, clipId, frame), clipId)!;
    expect(reset.adjustments.text).toMatchObject({
      content: "Keep me",
      color: "#1f2937",
      curve: 0,
      fontSize: 76,
    });
    expect(reset.name).toBe("Keep me");
  });
});
