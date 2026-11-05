import { describe, expect, it } from "vitest";

import {
  addCaptionFor,
  addText,
  applyTextStyle,
  patchTextAdjustments,
  setTextPosition,
  TEXT_SECONDS,
  TEXT_STYLES,
} from "@/lib/editor/text-ops";
import { emptyTimeline } from "@/lib/sync/timeline-document";
import { clipEnd } from "@/lib/timeline/clip-math";
import { findClip } from "@/lib/timeline/lookup";
import { makeClip, makeProject, makeStandardTracks, seqIds } from "@/lib/timeline/test-utils";

const frame = { width: 1920, height: 1080 };
const titleStyle = TEXT_STYLES.find((s) => s.id === "title")!;
const captionStyle = TEXT_STYLES.find((s) => s.id === "caption")!;

describe("addText", () => {
  it("adds a selected-looking text clip at the playhead on an overlay track, with the style's look", () => {
    const { project, clipId } = addText(emptyTimeline("p"), frame, 2, { style: titleStyle }, seqIds("n"));
    const clip = findClip(project, clipId)!;
    expect(clip.kind).toBe("text");
    expect(clip.start).toBe(2);
    expect(clipEnd(clip)).toBe(2 + TEXT_SECONDS);
    expect(project.tracks.find((t) => t.id === clip.trackId)?.type).toBe("overlay");
    expect(clip.adjustments.text).toMatchObject({ fontFamily: titleStyle.adjustments.fontFamily, content: "Your text" });
    expect(clip.adjustments.text!.fontSize).toBeGreaterThan(30);
  });

  it("uses the content it is given, and names the clip after it", () => {
    const { project, clipId } = addText(emptyTimeline("p"), frame, 0, { content: "Summer 2026" }, seqIds("n"));
    expect(findClip(project, clipId)?.adjustments.text?.content).toBe("Summer 2026");
    expect(findClip(project, clipId)?.name).toBe("Summer 2026");
  });

  it("reuses the overlay track when the text does not overlap, and starts a new one when it does", () => {
    const ids = seqIds("n");
    const first = addText(emptyTimeline("p"), frame, 0, {}, ids);
    const apart = addText(first.project, frame, TEXT_SECONDS + 1, {}, ids);
    expect(apart.project.tracks.filter((t) => t.type === "overlay")).toHaveLength(1);
    const overlapping = addText(apart.project, frame, 1, {}, ids);
    expect(overlapping.project.tracks.filter((t) => t.type === "overlay")).toHaveLength(2);
  });

  it("can span a given stretch of the timeline, for a caption", () => {
    const { project, clipId } = addText(emptyTimeline("p"), frame, 0, { style: captionStyle, span: { start: 4, duration: 6.5 } }, seqIds("n"));
    const clip = findClip(project, clipId)!;
    expect(clip.start).toBe(4);
    expect(clipEnd(clip)).toBeCloseTo(10.5);
  });
});

describe("text positions", () => {
  it("puts the box near the top, the middle or the bottom of the frame", () => {
    const added = addText(emptyTimeline("p"), frame, 0, { style: titleStyle }, seqIds("n"));
    const at = (position: "top" | "middle" | "bottom") =>
      findClip(setTextPosition(added.project, added.clipId, position, frame), added.clipId)!.transform;
    const top = at("top");
    const middle = at("middle");
    const bottom = at("bottom");
    expect(top.y).toBeLessThan(middle.y);
    expect(middle.y).toBeLessThan(bottom.y);
    expect(middle.y + middle.height / 2).toBeCloseTo(frame.height / 2);
    expect(bottom.y + bottom.height).toBeLessThan(frame.height);
    expect(top.y).toBeGreaterThan(0);
  });

  it("does nothing for a clip that is not text, or when it is already there", () => {
    const p = makeProject(makeStandardTracks(), [makeClip({ id: "a" })]);
    expect(setTextPosition(p, "a", "top", frame)).toBe(p);
    const added = addText(emptyTimeline("p"), frame, 0, { style: titleStyle }, seqIds("n"));
    const once = setTextPosition(added.project, added.clipId, "top", frame);
    expect(setTextPosition(once, added.clipId, "top", frame)).toBe(once);
  });
});

describe("patchTextAdjustments", () => {
  it("changes the words and the look, renaming the clip, and returns the same project when nothing changes", () => {
    const { project, clipId } = addText(emptyTimeline("p"), frame, 0, {}, seqIds("n"));
    const changed = patchTextAdjustments(project, clipId, { content: "Hello", color: "#ff0000" });
    expect(findClip(changed, clipId)?.adjustments.text).toMatchObject({ content: "Hello", color: "#ff0000" });
    expect(findClip(changed, clipId)?.name).toBe("Hello");
    expect(patchTextAdjustments(changed, clipId, { content: "Hello" })).toBe(changed);
  });

  it("ignores clips that are not text and locked text", () => {
    const p = makeProject(makeStandardTracks(), [makeClip({ id: "a" })]);
    expect(patchTextAdjustments(p, "a", { content: "x" })).toBe(p);
    const { project, clipId } = addText(emptyTimeline("p"), frame, 0, {}, seqIds("n"));
    const locked = { ...project, clips: project.clips.map((c) => ({ ...c, locked: true })) };
    expect(patchTextAdjustments(locked, clipId, { content: "x" })).toBe(locked);
  });
});

describe("applyTextStyle", () => {
  it("gives existing text a style's look and position but keeps its words", () => {
    const { project, clipId } = addText(emptyTimeline("p"), frame, 0, { content: "Keep me", style: titleStyle }, seqIds("n"));
    const styled = applyTextStyle(project, clipId, captionStyle, frame);
    const clip = findClip(styled, clipId)!;
    expect(clip.adjustments.text?.content).toBe("Keep me");
    expect(clip.adjustments.text?.fontFamily).toBe(captionStyle.adjustments.fontFamily);
    expect(clip.transform.y).toBeGreaterThan(frame.height / 2);
  });
});

describe("addCaptionFor", () => {
  it("adds a caption at the bottom that lasts exactly as long as the slide", () => {
    const slide = makeClip({ id: "s", trackId: "t1", kind: "image", sourceDuration: null, start: 5, sourceIn: 0, sourceOut: 4 });
    const base = makeProject(makeStandardTracks(), [slide]);
    const result = addCaptionFor(base, "s", frame, seqIds("n"));
    expect(result).not.toBeNull();
    const caption = findClip(result!.project, result!.clipId)!;
    expect(caption.kind).toBe("text");
    expect(caption.start).toBe(5);
    expect(clipEnd(caption)).toBeCloseTo(9);
    expect(caption.transform.y).toBeGreaterThan(frame.height / 2);
  });

  it("is not offered for a clip that is not a photo or video", () => {
    const base = makeProject(makeStandardTracks(), [makeClip({ id: "a", kind: "audio", trackId: "t3" })]);
    expect(addCaptionFor(base, "a", frame, seqIds("n"))).toBeNull();
    expect(addCaptionFor(base, "missing", frame, seqIds("n"))).toBeNull();
  });
});

describe("addText near or past the end of the video", () => {
  const withVideo = () =>
    makeProject(makeStandardTracks(), [makeClip({ id: "s", trackId: "t1", kind: "image", sourceDuration: null, start: 0, sourceIn: 0, sourceOut: 5 })]);
  const startAt = (at: number) => {
    const { project, clipId } = addText(withVideo(), frame, at, {}, seqIds("n"));
    return findClip(project, clipId)!;
  };

  it("keeps the text inside the video: it is pulled back so it ends with the last picture", () => {
    expect(startAt(5).start).toBeCloseTo(5 - TEXT_SECONDS); // the playhead is at the very end
    expect(startAt(4).start).toBeCloseTo(5 - TEXT_SECONDS); // only a second left
    expect(startAt(1).start).toBe(1); // plenty of room
    expect(clipEnd(startAt(99))).toBeCloseTo(5);
  });

  it("starts at 0 when the video is shorter than the text, and leaves captions (a given span) alone", () => {
    const short = makeProject(makeStandardTracks(), [makeClip({ id: "s", trackId: "t1", kind: "image", sourceDuration: null, start: 0, sourceIn: 0, sourceOut: 1 })]);
    const { project, clipId } = addText(short, frame, 1, {}, seqIds("n"));
    expect(findClip(project, clipId)!.start).toBe(0);
    const caption = addText(withVideo(), frame, 0, { span: { start: 4.5, duration: 2 } }, seqIds("n"));
    expect(findClip(caption.project, caption.clipId)!.start).toBe(4.5);
  });

  it("does not move text when there is no video yet", () => {
    const { project, clipId } = addText(emptyTimeline("p"), frame, 7, {}, seqIds("n"));
    expect(findClip(project, clipId)!.start).toBe(7);
  });
});

describe("addText and hidden tracks", () => {
  it("does not put text on an overlay track that is hidden, where it could not be seen", () => {
    const hidden = makeProject(
      [...makeStandardTracks(), { id: "h", type: "overlay", order: 9, muted: false, locked: false, hidden: true, solo: false }],
      [],
    );
    const { project, clipId } = addText(hidden, frame, 0, {}, seqIds("n"));
    expect(findClip(project, clipId)!.trackId).not.toBe("h");
  });
});

describe("captions and their slides", () => {
  it("stay where they are when the slide is deleted (they are not linked to it)", () => {
    const slides = makeProject(makeStandardTracks(), [
      makeClip({ id: "s1", trackId: "t1", kind: "image", sourceDuration: null, start: 0, sourceIn: 0, sourceOut: 4 }),
      makeClip({ id: "s2", trackId: "t1", kind: "image", sourceDuration: null, start: 4, sourceIn: 0, sourceOut: 4 }),
    ]);
    const withCaption = addCaptionFor(slides, "s2", frame, seqIds("n"))!;
    const captionStart = findClip(withCaption.project, withCaption.clipId)!.start;
    const after = withCaption.project.clips.filter((c) => c.id !== "s1");
    expect(captionStart).toBe(4);
    expect(after.find((c) => c.id === withCaption.clipId)!.start).toBe(4);
  });
});
