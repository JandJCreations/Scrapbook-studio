import { describe, expect, it } from "vitest";

import {
  addAsOverlay,
  addAudioClip,
  addPlaceholder,
  addSticker,
  addText,
  addToSequence,
  OVERLAY_SCALE,
  patchAudio,
  patchFades,
  patchPhotoAdjustments,
  patchTextAdjustments,
  patchVideoAdjustments,
  resetTextAdjustments,
  fillPlaceholder,
  setClipOpacity,
  setClipTransforms,
  setCrop,
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
    expect(clip.adjustments.text).toMatchObject({ content: "Happy birthday", fontSize: 90, color: "#ffffff" });
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
      color: "#ffffff",
      curve: 0,
      fontSize: 76,
    });
    expect(reset.name).toBe("Keep me");
  });
});

describe("patchPhotoAdjustments", () => {
  const withPhoto = () =>
    addToSequence(base(), video("p", { kind: "image", duration: 0 }), frame, seqIds("c"));

  it("creates the default adjustments on first use and merges the patch", () => {
    const { project, clipId } = withPhoto();
    expect(findClip(project, clipId)?.adjustments.photo).toBeNull();
    const result = patchPhotoAdjustments(project, clipId, { brightness: 25 });
    expect(findClip(result, clipId)?.adjustments.photo).toMatchObject({
      brightness: 25,
      contrast: 0,
      borderColor: "#ffffff",
    });
  });

  it("returns the same project when nothing changes, for other kinds and for locked clips", () => {
    const { project, clipId } = withPhoto();
    expect(patchPhotoAdjustments(project, clipId, { brightness: 0 })).toBe(project);
    expect(patchPhotoAdjustments(project, "missing", { brightness: 5 })).toBe(project);
    const clip = addToSequence(base(), video("v"), frame, seqIds("d"));
    expect(patchPhotoAdjustments(clip.project, clip.clipId, { brightness: 5 })).toBe(clip.project);
    const locked = { ...project, clips: project.clips.map((c) => ({ ...c, locked: true })) };
    expect(patchPhotoAdjustments(locked, clipId, { brightness: 5 })).toBe(locked);
  });
});

describe("patchVideoAdjustments", () => {
  it("creates defaults sized to the source on first use", () => {
    const { project, clipId } = addToSequence(base(), video("v", { duration: 8 }), frame, seqIds("c"));
    const result = patchVideoAdjustments(project, clipId, { saturation: -30 });
    expect(findClip(result, clipId)?.adjustments.video).toMatchObject({
      saturation: -30,
      duration: 8,
      brightness: 0,
    });
  });

  it("ignores pictures and unchanged values", () => {
    const photo = addToSequence(base(), video("p", { kind: "image", duration: 0 }), frame, seqIds("c"));
    expect(patchVideoAdjustments(photo.project, photo.clipId, { blur: 2 })).toBe(photo.project);
    const vid = addToSequence(base(), video("v"), frame, seqIds("d"));
    expect(patchVideoAdjustments(vid.project, vid.clipId, { blur: 0 })).toBe(vid.project);
  });
});

describe("setClipOpacity", () => {
  it("sets and clamps the clip opacity", () => {
    const { project, clipId } = addToSequence(base(), video("v"), frame, seqIds("c"));
    expect(findClip(setClipOpacity(project, clipId, 0.4), clipId)?.transform.opacity).toBe(0.4);
    expect(findClip(setClipOpacity(project, clipId, 3), clipId)?.transform.opacity).toBe(1);
    expect(findClip(setClipOpacity(project, clipId, -1), clipId)?.transform.opacity).toBe(0);
    expect(setClipOpacity(project, clipId, 1)).toBe(project);
  });
});

describe("patchAudio", () => {
  it("changes volume, mute and fades on sound-carrying clips", () => {
    const { project, clipId } = addAudioClip(
      base(),
      video("m", { kind: "audio", duration: 30 }),
      frame,
      0,
      seqIds("c"),
    );
    const result = patchAudio(project, clipId, { volume: 40, muted: true, fadeIn: 2, fadeOut: 3 });
    expect(findClip(result, clipId)).toMatchObject({ volume: 40, muted: true, fadeIn: 2, fadeOut: 3 });
  });

  it("clamps fades to the clip length", () => {
    const { project, clipId } = addAudioClip(
      base(),
      video("m", { kind: "audio", duration: 4 }),
      frame,
      0,
      seqIds("c"),
    );
    expect(findClip(patchAudio(project, clipId, { fadeIn: 99 }), clipId)?.fadeIn).toBe(4);
  });

  it("leaves pictures and text alone", () => {
    const { project, clipId } = addToSequence(
      base(),
      video("p", { kind: "image", duration: 0 }),
      frame,
      seqIds("c"),
    );
    expect(patchAudio(project, clipId, { volume: 10 })).toBe(project);
  });
});

describe("setCrop", () => {
  const natural = { width: 400, height: 300 };
  const photo = () =>
    addToSequence(
      base(),
      video("p", { kind: "image", duration: 0, width: 400, height: 300 }),
      { width: 400, height: 300 },
      seqIds("c"),
    );

  it("stores the crop and reshapes the box to it, keeping its width and centre", () => {
    const { project, clipId } = photo();
    const before = findClip(project, clipId)!.transform; // 400 x 300 at 0,0
    const result = setCrop(project, clipId, { x: 50, y: 0, width: 300, height: 300 }, natural);
    const clip = findClip(result, clipId)!;
    expect(clip.adjustments.photo?.crop).toEqual({ x: 50, y: 0, width: 300, height: 300 });
    expect(clip.transform.width).toBe(before.width);
    expect(clip.transform.height).toBe(400);
    expect(clip.transform.y).toBe(before.y + (before.height - 400) / 2);
  });

  it("clearing the crop restores the pictures own shape", () => {
    const { project, clipId } = photo();
    const cropped = setCrop(project, clipId, { x: 0, y: 0, width: 400, height: 100 }, natural);
    const cleared = findClip(setCrop(cropped, clipId, null, natural), clipId)!;
    expect(cleared.adjustments.photo?.crop).toBeNull();
    expect(cleared.transform).toMatchObject({ width: 400, height: 300, y: 0 });
  });

  it("crops videos through their video adjustments", () => {
    const added = addToSequence(
      base(),
      video("v", { width: 400, height: 300 }),
      { width: 400, height: 300 },
      seqIds("c"),
    );
    const result = setCrop(added.project, added.clipId, { x: 0, y: 0, width: 200, height: 300 }, natural);
    const clip = findClip(result, added.clipId)!;
    expect(clip.adjustments.video?.crop).toEqual({ x: 0, y: 0, width: 200, height: 300 });
    expect(clip.transform.height).toBe(600);
  });

  it("returns the same project for no change, other kinds, locked clips and unusable sizes", () => {
    const { project, clipId } = photo();
    expect(setCrop(project, clipId, null, natural)).toBe(project);
    expect(setCrop(project, clipId, { x: 0, y: 0, width: 0, height: 10 }, natural)).toBe(project);
    const text = addText(base(), { width: 400, height: 300 }, 0, seqIds("n"));
    expect(setCrop(text.project, text.clipId, { x: 0, y: 0, width: 10, height: 10 }, natural)).toBe(
      text.project,
    );
    const locked = { ...project, clips: project.clips.map((c) => ({ ...c, locked: true })) };
    expect(setCrop(locked, clipId, { x: 0, y: 0, width: 10, height: 10 }, natural)).toBe(locked);
  });
});

describe("addSticker", () => {
  const art = { mediaId: "asset:stickers/Star", name: "Star", width: 160, height: 160 };

  it("puts the sticker on its own new top overlay track at the playhead for five seconds", () => {
    const first = addSticker(base(), art, frame, 1, seqIds("n"));
    const second = addSticker(first.project, art, frame, 3, seqIds("m"));
    const clip = findClip(second.project, second.clipId)!;
    expect(clip).toMatchObject({
      kind: "sticker",
      mediaId: "asset:stickers/Star",
      name: "Star",
      sourceDuration: null,
      start: 3,
    });
    expect(clipEnd(clip)).toBe(8);
    const order = (trackId: string) => second.project.tracks.find((t) => t.id === trackId)!.order;
    expect(order(clip.trackId)).toBeLessThan(order(findClip(second.project, first.clipId)!.trackId));
    expect(second.project.tracks.find((t) => t.id === clip.trackId)?.type).toBe("overlay");
  });

  it("fits inside 30% of the frame, keeping its shape, centred", () => {
    const wide = addSticker(base(), { ...art, width: 400, height: 100 }, frame, 0, seqIds("n"));
    const t = findClip(wide.project, wide.clipId)!.transform;
    expect(t.width).toBeCloseTo(1920 * 0.3, 6);
    expect(t.height).toBeCloseTo((1920 * 0.3) / 4, 6);
    expect(t.x).toBeCloseTo((1920 - t.width) / 2, 6);
    expect(t.y).toBeCloseTo((1080 - t.height) / 2, 6);
  });

  it("never starts before zero", () => {
    const result = addSticker(base(), art, frame, -4, seqIds("n"));
    expect(findClip(result.project, result.clipId)?.start).toBe(0);
  });
});

describe("fillPlaceholder", () => {
  const slot = (rotation = 0) =>
    addPlaceholder(base(), "Photo 1", { x: 100, y: 50, width: 400, height: 300, rotation }, 0, seqIds("n"));

  it("puts a picture into the slot, fitted inside its box and centred", () => {
    const { project, clipId } = slot();
    const filled = fillPlaceholder(project, clipId, video("pic", { kind: "image", duration: 0, width: 200, height: 200 }));
    const clip = findClip(filled, clipId)!;
    expect(clip).toMatchObject({ kind: "image", mediaId: "pic", isPlaceholder: false, sourceDuration: null, sourceOut: STILL_SECONDS });
    expect(clip.transform).toMatchObject({ x: 150, y: 50, width: 300, height: 300 });
    expect(clip.trackId).toBe(findClip(project, clipId)!.trackId);
  });

  it("turns the slot into a video clip as long as the video", () => {
    const { project, clipId } = slot();
    const filled = fillPlaceholder(project, clipId, video("vid", { duration: 8, width: 800, height: 450 }));
    const clip = findClip(filled, clipId)!;
    // The slot lasts 5 s, so the video starts out that long; trimming can stretch it to its full 8 s.
    expect(clip).toMatchObject({ kind: "video", mediaId: "vid", sourceDuration: 8, sourceOut: 5, isPlaceholder: false });
    expect(clipEnd(clip)).toBe(5);
    expect(clip.transform.width).toBeCloseTo(400, 6);
    expect(clip.transform.height).toBeCloseTo(225, 6);
  });

  it("never runs longer than the slot: a short video keeps its length, a long one is cut to the slot", () => {
    const { project, clipId } = slot();
    const short = findClip(fillPlaceholder(project, clipId, video("a", { duration: 3 })), clipId)!;
    expect(clipEnd(short)).toBe(3);
    const long = findClip(fillPlaceholder(project, clipId, video("b", { duration: 30 })), clipId)!;
    expect(clipEnd(long)).toBe(5);
    expect(long.sourceDuration).toBe(30);
  });

  it("gives a picture only as long as a shortened slot", () => {
    const { project, clipId } = slot();
    const shortened = {
      ...project,
      clips: project.clips.map((c) => (c.id === clipId ? { ...c, sourceOut: 2 } : c)),
    };
    const filled = findClip(
      fillPlaceholder(shortened, clipId, video("pic", { kind: "image", duration: 0, width: 10, height: 10 })),
      clipId,
    )!;
    expect(clipEnd(filled)).toBe(2);
  });

  it("centres along the slot's own tilt", () => {
    const { project, clipId } = slot(90);
    const filled = fillPlaceholder(project, clipId, video("pic", { kind: "image", duration: 0, width: 200, height: 200 }));
    const t = findClip(filled, clipId)!.transform;
    // A 90 degree turn about the top-left: the box's own x axis points down the stage.
    expect(t.rotation).toBe(90);
    // The 300 x 300 picture sits 50 along the box's own x axis, which now points down the stage.
    expect(t.x).toBeCloseTo(100, 6);
    expect(t.y).toBeCloseTo(100, 6);
  });

  it("leaves everything else alone", () => {
    const { project, clipId } = slot();
    const media = video("pic", { kind: "image", duration: 0, width: 10, height: 10 });
    expect(fillPlaceholder(project, "missing", media)).toBe(project);
    expect(fillPlaceholder(project, clipId, video("m", { kind: "audio" }))).toBe(project);
    const plain = addToSequence(base(), video("v"), frame, seqIds("c"));
    expect(fillPlaceholder(plain.project, plain.clipId, media)).toBe(plain.project);
    const locked = { ...project, clips: project.clips.map((c) => ({ ...c, locked: true })) };
    expect(fillPlaceholder(locked, clipId, media)).toBe(locked);
  });
});

describe("patchFades", () => {
  it("sets the fades of any visible clip, kept inside the clip's length", () => {
    const { project, clipId } = addText(base(), frame, 0, seqIds("n")); // 5 s
    const result = findClip(patchFades(project, clipId, { fadeIn: 1, fadeOut: 99 }), clipId)!;
    expect(result.fadeIn).toBe(1);
    expect(result.fadeOut).toBe(5);
    const sticker = addSticker(base(), { mediaId: "asset:x/y", name: "S", width: 10, height: 10 }, frame, 0, seqIds("m"));
    expect(findClip(patchFades(sticker.project, sticker.clipId, { fadeOut: 2 }), sticker.clipId)?.fadeOut).toBe(2);
  });

  it("leaves unknown, locked and unchanged clips alone", () => {
    const { project, clipId } = addText(base(), frame, 0, seqIds("n"));
    expect(patchFades(project, "missing", { fadeIn: 1 })).toBe(project);
    expect(patchFades(project, clipId, {})).toBe(project);
    const locked = { ...project, clips: project.clips.map((c) => ({ ...c, locked: true })) };
    expect(patchFades(locked, clipId, { fadeIn: 1 })).toBe(locked);
  });
});
