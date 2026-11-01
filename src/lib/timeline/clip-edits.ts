import {
  clamp,
  clipDuration,
  clipEnd,
  MAX_SPEED,
  MIN_CLIP_DURATION,
  MIN_SPEED,
} from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { clipsOnTrack, findClip, findTrack, isClipLocked } from "@/lib/timeline/lookup";
import {
  isMagnetic,
  packClips,
  packMagneticTracks,
  replaceTrackClips,
} from "@/lib/timeline/pack";
import type { Clip, TimelineProject } from "@/types/timeline";

function replaceClip(project: TimelineProject, updated: Clip): TimelineProject {
  return {
    ...project,
    clips: project.clips.map((clip) => (clip.id === updated.id ? updated : clip)),
  };
}

/** Copies a clip to sit immediately after the original. */
export function duplicateClip(
  project: TimelineProject,
  clipId: string,
  newId: IdFn = createId,
): TimelineProject {
  const clip = findClip(project, clipId);
  if (!clip || isClipLocked(project, clip)) return project;
  const track = findTrack(project, clip.trackId);
  if (!track) return project;

  const copy: Clip = { ...clip, id: newId(), start: clipEnd(clip), groupId: null };
  if (!isMagnetic(track)) return { ...project, clips: [...project.clips, copy] };

  const ordered = clipsOnTrack(project, track.id);
  ordered.splice(ordered.findIndex((c) => c.id === clipId) + 1, 0, copy);
  return replaceTrackClips(project, track.id, packClips(ordered));
}

/** Changes playback speed, keeping the trimmed source range. */
export function setSpeed(project: TimelineProject, clipId: string, speed: number): TimelineProject {
  const clip = findClip(project, clipId);
  if (!clip || isClipLocked(project, clip)) return project;

  const maxForMinDuration = (clip.sourceOut - clip.sourceIn) / MIN_CLIP_DURATION;
  const next = clamp(speed, MIN_SPEED, Math.min(MAX_SPEED, maxForMinDuration));
  if (next === clip.speed) return project;

  const resized: Clip = { ...clip, speed: next };
  const duration = clipDuration(resized);
  // Keyframes are seconds from the clip's start, and the picture they animate
  // now takes a different time: keep each one on the same moment of it.
  const stretch = clip.speed / next;
  resized.keyframes = clip.keyframes.map((k) => ({ ...k, time: Math.min(k.time * stretch, duration) }));
  resized.fadeIn = Math.min(resized.fadeIn, duration);
  resized.fadeOut = Math.min(resized.fadeOut, duration);
  return packMagneticTracks(replaceClip(project, resized));
}

export type ClipPatch = Partial<
  Pick<
    Clip,
    | "name"
    | "volume"
    | "muted"
    | "fadeIn"
    | "fadeOut"
    | "transform"
    | "adjustments"
    | "keyframes"
    | "locked"
    | "reversed"
    | "loop"
    | "groupId"
    | "isPlaceholder"
  >
>;

/**
 * Applies non-timing property changes. When the clip or its track is locked,
 * only a patch that contains nothing but `locked` is accepted.
 */
export function updateClip(
  project: TimelineProject,
  clipId: string,
  patch: ClipPatch,
): TimelineProject {
  const clip = findClip(project, clipId);
  if (!clip) return project;

  const onlyLocked = Object.keys(patch).every((key) => key === "locked");
  if (isClipLocked(project, clip) && !onlyLocked) return project;

  const duration = clipDuration(clip);
  const updated: Clip = { ...clip, ...patch };
  if (patch.fadeIn !== undefined) updated.fadeIn = clamp(patch.fadeIn, 0, duration);
  if (patch.fadeOut !== undefined) updated.fadeOut = clamp(patch.fadeOut, 0, duration);

  const keys = Object.keys(patch) as (keyof ClipPatch)[];
  const changed = keys.some((key) => !Object.is(updated[key], clip[key]));
  return changed ? replaceClip(project, updated) : project;
}
