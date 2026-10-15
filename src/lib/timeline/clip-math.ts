import type { Clip, TimelineProject } from "@/types/timeline";

/** Tolerance for comparing timeline seconds. */
export const EPS = 1e-6;
/** No clip may be shorter than this, in timeline seconds. */
export const MIN_CLIP_DURATION = 0.1;
export const MIN_SPEED = 0.1;
export const MAX_SPEED = 8;

/** Limits `value` to [min, max]; if the range is inverted, `min` wins. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clipDuration(clip: Clip): number {
  return (clip.sourceOut - clip.sourceIn) / clip.speed;
}

export function clipEnd(clip: Clip): number {
  return clip.start + clipDuration(clip);
}

export function projectDuration(project: TimelineProject): number {
  return project.clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0);
}
