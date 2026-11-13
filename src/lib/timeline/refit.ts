import { fitContain } from "@/lib/playback/scene";
import type { FrameSize } from "@/lib/sync/timeline-document";
import type { Clip, ClipTransform, TimelineProject } from "@/types/timeline";

type Box = Pick<ClipTransform, "x" | "y" | "width" | "height">;

const near = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;

function fitCover(width: number, height: number, frame: FrameSize): Box {
  const scale = Math.max(frame.width / width, frame.height / height);
  const w = width * scale;
  const h = height * scale;
  return { x: (frame.width - w) / 2, y: (frame.height - h) / 2, width: w, height: h };
}

/** Where a picture goes in the new frame: fitted stays fitted, filling stays filling, anything else keeps its place and size relative to the frame. */
function pictureBox(t: Box, from: FrameSize, to: FrameSize): Box {
  if (t.width <= 0 || t.height <= 0) return t;
  if (near(t, fitContain(t.width, t.height, from.width, from.height))) {
    return fitContain(t.width, t.height, to.width, to.height);
  }
  if (near(t, fitCover(t.width, t.height, from))) return fitCover(t.width, t.height, to);
  const scale = Math.min(to.width / from.width, to.height / from.height);
  const width = t.width * scale;
  const height = t.height * scale;
  const cx = ((t.x + t.width / 2) / from.width) * to.width;
  const cy = ((t.y + t.height / 2) / from.height) * to.height;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/** Text keeps its place relative to the frame, its box spans the same share of the width, and its size follows the frame's area. */
function refitText(clip: Clip, from: FrameSize, to: FrameSize): Clip {
  const text = clip.adjustments.text;
  const t = clip.transform;
  if (!text) return clip;
  const fontSize = Math.max(8, Math.round(text.fontSize * Math.sqrt((to.width * to.height) / (from.width * from.height))));
  const width = (t.width / from.width) * to.width;
  const height = Math.round(t.height * (fontSize / text.fontSize));
  const cx = ((t.x + t.width / 2) / from.width) * to.width;
  const cy = ((t.y + t.height / 2) / from.height) * to.height;
  const box = { x: cx - width / 2, y: Math.min(Math.max(0, cy - height / 2), Math.max(0, to.height - height)), width, height };
  return {
    ...clip,
    transform: { ...t, ...box },
    keyframes: moveKeyframes(clip, t, { ...box, width: t.width, height: t.height }),
    adjustments: { ...clip.adjustments, text: { ...text, fontSize } },
  };
}

/** Keyframe positions move with the clip, keeping their offset in proportion to its size. */
function moveKeyframes(clip: Clip, before: Box, after: Box) {
  if (clip.keyframes.length === 0) return clip.keyframes;
  const sx = before.width > 0 ? after.width / before.width : 1;
  const sy = before.height > 0 ? after.height / before.height : 1;
  return clip.keyframes.map((k) => ({ ...k, x: after.x + (k.x - before.x) * sx, y: after.y + (k.y - before.y) * sy }));
}

/**
 * Moves every picture and text into a new frame shape, so switching between
 * landscape, portrait and square keeps the video looking the same.
 */
export function refitToFrame(project: TimelineProject, from: FrameSize, to: FrameSize): TimelineProject {
  if (from.width === to.width && from.height === to.height) return project;
  if (from.width <= 0 || from.height <= 0) return project;
  let changed = false;
  const clips = project.clips.map((clip) => {
    if (clip.kind === "audio") return clip;
    changed = true;
    if (clip.kind === "text") return refitText(clip, from, to);
    const box = pictureBox(clip.transform, from, to);
    return { ...clip, transform: { ...clip.transform, ...box }, keyframes: moveKeyframes(clip, clip.transform, box) };
  });
  return changed ? { ...project, clips } : project;
}
