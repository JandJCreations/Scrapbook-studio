import { clipDuration, clipEnd, MIN_CLIP_DURATION } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { findClip, isClipLocked } from "@/lib/timeline/lookup";
import { packMagneticTracks } from "@/lib/timeline/pack";
import type { Clip, TimelineProject } from "@/types/timeline";

/**
 * Splits a clip at timeline time `at`. The left half keeps the original id and
 * fade-in; the right half gets `newId()` and the fade-out. Returns the same
 * project when nothing can be split (unknown or locked clip, or either half
 * would be shorter than MIN_CLIP_DURATION).
 */
export function splitClip(
  project: TimelineProject,
  clipId: string,
  at: number,
  newId: IdFn = createId,
): TimelineProject {
  const clip = findClip(project, clipId);
  if (!clip || isClipLocked(project, clip)) return project;

  const offset = at - clip.start;
  if (offset < MIN_CLIP_DURATION || clipDuration(clip) - offset < MIN_CLIP_DURATION) {
    return project;
  }

  const sourceOffset = offset * clip.speed;
  // A reversed clip plays its source from sourceOut down to sourceIn, so the
  // earlier (left) half owns the later part of the source range.
  const left: Clip = {
    ...clip,
    fadeOut: 0,
    keyframes: clip.keyframes.filter((k) => k.time < offset),
    ...(clip.reversed
      ? { sourceIn: clip.sourceOut - sourceOffset }
      : { sourceOut: clip.sourceIn + sourceOffset }),
  };
  const right: Clip = {
    ...clip,
    id: newId(),
    // Start exactly where the left half ends: `at` can differ from
    // clipEnd(left) by a float ulp, which would leave a sliver at the cut.
    start: clipEnd(left),
    fadeIn: 0,
    keyframes: clip.keyframes
      .filter((k) => k.time >= offset)
      .map((k) => ({ ...k, time: k.time - offset })),
    ...(clip.reversed
      ? { sourceOut: clip.sourceOut - sourceOffset }
      : { sourceIn: clip.sourceIn + sourceOffset }),
  };

  const clips = [...project.clips];
  clips.splice(clips.indexOf(clip), 1, left, right);
  // Re-pack magnetic tracks so following clips stay exactly contiguous.
  return packMagneticTracks({ ...project, clips });
}
