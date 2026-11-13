import type { CanvasObject } from "@/types/canvas";

/** Shortest a story clip can be trimmed to, in seconds. */
export const MIN_STORY_CLIP_SECONDS = 0.5;
/** How long a photo stays on screen when it's added to the story. */
export const DEFAULT_STORY_PHOTO_SECONDS = 4;

export function isStoryClip(object: CanvasObject): boolean {
  return Boolean(object.extras?.inStory);
}

export function storyClips(objects: CanvasObject[]): CanvasObject[] {
  return objects.filter(isStoryClip).sort(byStoryPosition);
}

function byStoryPosition(a: CanvasObject, b: CanvasObject) {
  // Midpoints, not start times: while a clip is being dragged its start time
  // is wherever the pointer put it, and comparing centres makes it swap with
  // a neighbour once it's dragged past that neighbour's middle — the natural
  // feel for reordering.
  const am = (a.startTime + a.endTime) / 2;
  const bm = (b.startTime + b.endTime) / 2;
  return am - bm;
}

/** When the story finishes (0 if there are no story clips). */
export function storyEnd(objects: CanvasObject[]): number {
  return objects.reduce(
    (max, o) => (isStoryClip(o) ? Math.max(max, o.endTime) : max),
    0,
  );
}

/**
 * Lays the story clips end to end starting at 0, in their current order,
 * keeping each clip's length. This is what makes the story "magnetic":
 * deleting, trimming, splitting or dragging a clip closes or opens the gap
 * automatically. Returns the same array when nothing needed to move, so
 * callers can cheaply tell whether anything changed.
 */
export function normalizeStory(objects: CanvasObject[]): CanvasObject[] {
  const story = storyClips(objects);
  if (story.length === 0) return objects;

  const placed = new Map<string, { startTime: number; endTime: number }>();
  let cursor = 0;
  for (const clip of story) {
    // A story video lasts exactly as long as its trimmed footage at its
    // speed, so trimming or speeding it up in the video panel ripples too.
    const videoLength = videoPlayLength(clip);
    const length = Math.max(
      MIN_STORY_CLIP_SECONDS,
      videoLength && videoLength > 0 ? videoLength : clip.endTime - clip.startTime,
    );
    placed.set(clip.id, { startTime: cursor, endTime: cursor + length });
    cursor += length;
  }

  let changed = false;
  const next = objects.map((o) => {
    const p = placed.get(o.id);
    if (!p) return o;
    if (
      Math.abs(p.startTime - o.startTime) < 1e-6 &&
      Math.abs(p.endTime - o.endTime) < 1e-6
    ) {
      return o;
    }
    changed = true;
    return { ...o, ...p };
  });
  return changed ? next : objects;
}

/** How long a video plays for on the timeline with its current trim and speed. */
export function videoPlayLength(object: CanvasObject): number | null {
  const v = object.videoAdjustments;
  if (!v) return null;
  return Math.max(0, v.trimEnd - v.trimStart) / (v.playbackRate || 1);
}

/** Fit a `natural` size inside `frame` without cropping, centred. */
export function fitInsideFrame(
  natural: { width: number; height: number },
  frame: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  if (natural.width <= 0 || natural.height <= 0) {
    return { x: 0, y: 0, width: frame.width, height: frame.height };
  }
  const scale = Math.min(frame.width / natural.width, frame.height / natural.height);
  const width = Math.round(natural.width * scale);
  const height = Math.round(natural.height * scale);
  return {
    x: Math.round((frame.width - width) / 2),
    y: Math.round((frame.height - height) / 2),
    width,
    height,
  };
}
