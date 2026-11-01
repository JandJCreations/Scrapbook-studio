import { setClipOpacity } from "@/lib/editor/ops";
import { clipBaseState } from "@/lib/playback/draw-state";
import { updateClip } from "@/lib/timeline/clip-edits";
import { clipDuration } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import type { Keyframe } from "@/types/keyframe";
import type { TimelineProject } from "@/types/timeline";

/** A keyframe this close to the requested time is updated instead of a second one being added. */
export const KEYFRAME_MERGE_SECONDS = 0.04;

type KeyframeValues = Partial<Pick<Keyframe, "x" | "y" | "rotation" | "opacity">>;

const byTime = (a: Keyframe, b: Keyframe) => a.time - b.time;

/**
 * Sets some of a clip's animated values at `localTime` (seconds from the clip's
 * start, kept inside the clip). A new keyframe starts from how the clip looks at
 * that moment, so adding one never makes it jump. A keyframe within
 * KEYFRAME_MERGE_SECONDS is updated instead.
 */
export function upsertKeyframe(
  project: TimelineProject,
  clipId: string,
  localTime: number,
  values: KeyframeValues,
  newId: IdFn = createId,
): TimelineProject {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip) return project;
  const time = Math.min(Math.max(localTime, 0), clipDuration(clip));

  const existing = clip.keyframes.find((k) => Math.abs(k.time - time) <= KEYFRAME_MERGE_SECONDS);
  const keyframes = existing
    ? clip.keyframes.map((k) => (k === existing ? { ...k, ...values } : k))
    : [...clip.keyframes, { id: newId(), time, ...clipBaseState(clip, time), ...values }];

  return updateClip(project, clipId, { keyframes: [...keyframes].sort(byTime) });
}

/** Deletes a keyframe. Deleting the last one leaves the clip still, as that keyframe had it. */
export function removeKeyframe(
  project: TimelineProject,
  clipId: string,
  keyframeId: string,
): TimelineProject {
  const clip = project.clips.find((c) => c.id === clipId);
  const removed = clip?.keyframes.find((k) => k.id === keyframeId);
  if (!clip || !removed) return project;
  const keyframes = clip.keyframes.filter((k) => k.id !== keyframeId);
  if (keyframes.length > 0) return updateClip(project, clipId, { keyframes });
  return updateClip(project, clipId, {
    keyframes,
    transform: {
      ...clip.transform,
      x: removed.x,
      y: removed.y,
      rotation: removed.rotation,
      opacity: removed.opacity,
    },
  });
}

/** Removes all keyframes, freezing the clip as it looks at `localTime`. */
export function clearKeyframes(
  project: TimelineProject,
  clipId: string,
  localTime: number,
): TimelineProject {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip || clip.keyframes.length === 0) return project;
  const now = clipBaseState(clip, localTime);
  return updateClip(project, clipId, { keyframes: [], transform: { ...clip.transform, ...now } });
}

/** Sets opacity: a keyframe at `localTime` for an animated clip, the clip's own opacity otherwise. */
export function setOpacityAt(
  project: TimelineProject,
  clipId: string,
  localTime: number,
  opacity: number,
  newId: IdFn = createId,
): TimelineProject {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip) return project;
  const clamped = Math.min(1, Math.max(0, opacity));
  return clip.keyframes.length > 0
    ? upsertKeyframe(project, clipId, localTime, { opacity: clamped }, newId)
    : setClipOpacity(project, clipId, clamped);
}
