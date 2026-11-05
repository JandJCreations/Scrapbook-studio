import type { FrameSize } from "@/lib/sync/timeline-document";
import { updateClip } from "@/lib/timeline/clip-edits";
import { clipEnd } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { clipDuration } from "@/lib/timeline/clip-math";
import { insertClip } from "@/lib/timeline/place";
import { addTrack } from "@/lib/timeline/tracks";
import type { Clip, TimelineProject } from "@/types/timeline";
import { DEFAULT_TEXT_ADJUSTMENTS, type TextAdjustments } from "@/types/text-adjustments";
import type { AddResult } from "@/lib/editor/ops";

export const TEXT_SECONDS = 3;
const TEXT_NAME_LENGTH = 24;
const BOX_WIDTH_SCALE = 0.8;
const EDGE_MARGIN_SCALE = 0.07;

export type TextPosition = "top" | "middle" | "bottom";

export interface TextStyle {
  id: string;
  label: string;
  /** The look: font, size (as a fraction of the frame's height), colours and effects. */
  adjustments: Partial<TextAdjustments> & { fontSizeScale: number };
  position: TextPosition;
}

const WHITE = "#ffffff";
const shadow = { enabled: true, color: "#000000", blur: 10, offsetX: 0, offsetY: 4, opacity: 60 };

/** The looks to pick from, each with the place it usually goes. */
export const TEXT_STYLES: TextStyle[] = [
  { id: "title", label: "Title", position: "middle", adjustments: { fontFamily: "Poppins", fontWeight: 700, fontSizeScale: 0.1, color: WHITE, shadow } },
  { id: "subtitle", label: "Subtitle", position: "bottom", adjustments: { fontFamily: "Inter", fontWeight: 600, fontSizeScale: 0.055, color: WHITE, shadow } },
  {
    id: "caption",
    label: "Caption",
    position: "bottom",
    adjustments: { fontFamily: "Inter", fontWeight: 700, fontSizeScale: 0.05, color: WHITE, stroke: { enabled: true, color: "#000000", width: 3 } },
  },
  { id: "bold", label: "Bold", position: "middle", adjustments: { fontFamily: "Anton", fontWeight: 400, fontSizeScale: 0.13, color: WHITE, letterSpacing: 2, shadow } },
  { id: "elegant", label: "Elegant", position: "middle", adjustments: { fontFamily: "Playfair Display", fontWeight: 700, fontSizeScale: 0.09, color: "#fdf4e3", shadow } },
  { id: "handwritten", label: "Handwritten", position: "bottom", adjustments: { fontFamily: "Caveat", fontWeight: 700, fontSizeScale: 0.1, color: "#fff7b0", shadow } },
  {
    id: "neon",
    label: "Neon",
    position: "middle",
    adjustments: { fontFamily: "Bebas Neue", fontWeight: 400, fontSizeScale: 0.12, color: "#e0fbff", glow: { enabled: true, color: "#22d3ee", blur: 24, opacity: 90 } },
  },
  { id: "retro", label: "Retro", position: "top", adjustments: { fontFamily: "Permanent Marker", fontWeight: 400, fontSizeScale: 0.09, color: "#fde047", shadow } },
];

const textName = (content: string) => {
  const trimmed = content.trim();
  return trimmed === "" ? "Text" : trimmed.slice(0, TEXT_NAME_LENGTH);
};

/** The full text settings for a style at a frame size. */
function textFor(frame: FrameSize, content: string, style: TextStyle | undefined): TextAdjustments {
  const { fontSizeScale, ...look } = style?.adjustments ?? { fontSizeScale: 0.07 };
  return {
    ...DEFAULT_TEXT_ADJUSTMENTS,
    color: WHITE,
    ...look,
    content,
    fontSize: Math.round(frame.height * fontSizeScale),
  };
}

function boxFor(frame: FrameSize, text: TextAdjustments, position: TextPosition) {
  const width = frame.width * BOX_WIDTH_SCALE;
  const height = Math.round(text.fontSize * text.lineHeight * 2);
  const margin = frame.height * EDGE_MARGIN_SCALE;
  const y = position === "top" ? margin : position === "bottom" ? frame.height - margin - height : (frame.height - height) / 2;
  return { x: (frame.width - width) / 2, y, width, height };
}

/** An overlay track with no clip in [start, end), or a new one. */
function overlayTrackFor(project: TimelineProject, start: number, end: number, newId: IdFn) {
  for (const track of project.tracks) {
    if (track.type !== "overlay" || track.locked) continue;
    const busy = project.clips.some((c) => c.trackId === track.id && c.start < end && clipEnd(c) > start);
    if (!busy) return { project, trackId: track.id };
  }
  const next = addTrack(project, "overlay", newId);
  const created = next.tracks.find((track) => !project.tracks.some((old) => old.id === track.id));
  if (!created) throw new Error("addTrack did not add a track");
  return { project: next, trackId: created.id };
}

interface AddTextOptions {
  content?: string;
  style?: TextStyle;
  /** A stretch of the timeline to cover, instead of starting at the playhead for a few seconds. */
  span?: { start: number; duration: number };
}

/** Adds text at `at` (or over `span`), on an overlay track, in a style, in the place that style usually goes. */
export function addText(
  project: TimelineProject,
  frame: FrameSize,
  at: number,
  options: AddTextOptions = {},
  newId: IdFn = createId,
): AddResult {
  const start = Math.max(0, options.span?.start ?? at);
  const duration = options.span?.duration ?? TEXT_SECONDS;
  const text = textFor(frame, options.content ?? "Your text", options.style);
  const { project: withTrack, trackId } = overlayTrackFor(project, start, start + duration, newId);
  const box = boxFor(frame, text, options.style?.position ?? "middle");
  const clip: Clip = {
    id: newId(),
    trackId,
    kind: "text",
    name: textName(text.content),
    mediaId: "",
    sourceDuration: null,
    start,
    sourceIn: 0,
    sourceOut: duration,
    speed: 1,
    reversed: false,
    loop: false,
    volume: 100,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transform: { ...box, rotation: 0, opacity: 1 },
    adjustments: { photo: null, video: null, text },
    keyframes: [],
    groupId: null,
    locked: false,
    isPlaceholder: false,
  };
  return { project: insertClip(withTrack, clip), clipId: clip.id };
}

/** Changes the words or the look of a text clip; the same project comes back when nothing changes. */
export function patchTextAdjustments(
  project: TimelineProject,
  clipId: string,
  patch: Partial<TextAdjustments>,
): TimelineProject {
  const clip = project.clips.find((c) => c.id === clipId);
  const current = clip?.adjustments.text;
  if (!clip || clip.kind !== "text" || !current) return project;
  const next: TextAdjustments = { ...current, ...patch };
  if (JSON.stringify(next) === JSON.stringify(current)) return project;
  return updateClip(project, clipId, { name: textName(next.content), adjustments: { ...clip.adjustments, text: next } });
}

/** Moves a text clip's box to the top, middle or bottom of the frame. */
export function setTextPosition(project: TimelineProject, clipId: string, position: TextPosition, frame: FrameSize): TimelineProject {
  const clip = project.clips.find((c) => c.id === clipId);
  const text = clip?.adjustments.text;
  if (!clip || clip.kind !== "text" || !text) return project;
  const box = boxFor(frame, text, position);
  const t = clip.transform;
  if (t.x === box.x && t.y === box.y && t.width === box.width && t.height === box.height) return project;
  return updateClip(project, clipId, { transform: { ...t, ...box } });
}

/** Gives text a style's look and place, keeping its words. */
export function applyTextStyle(project: TimelineProject, clipId: string, style: TextStyle, frame: FrameSize): TimelineProject {
  const clip = project.clips.find((c) => c.id === clipId);
  const text = clip?.adjustments.text;
  if (!clip || clip.kind !== "text" || !text) return project;
  const styled = textFor(frame, text.content, style);
  return setTextPosition(patchTextAdjustments(project, clipId, styled), clipId, style.position, frame);
}

/** A caption at the bottom that lasts exactly as long as a photo or video; null for anything else. */
export function addCaptionFor(
  project: TimelineProject,
  clipId: string,
  frame: FrameSize,
  newId: IdFn = createId,
): AddResult | null {
  const target = project.clips.find((c) => c.id === clipId);
  if (!target || (target.kind !== "image" && target.kind !== "video")) return null;
  const style = TEXT_STYLES.find((s) => s.id === "caption");
  return addText(project, frame, target.start, { content: "Caption", style, span: { start: target.start, duration: clipDuration(target) } }, newId);
}
