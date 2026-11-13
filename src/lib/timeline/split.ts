import { clipDuration, clipEnd, MIN_CLIP_DURATION } from "@/lib/timeline/clip-math";
import { clipBaseState } from "@/lib/playback/draw-state";
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
  const rightId = newId();
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
    id: rightId,
    // The cut inside a clip is always a plain cut; the transition into the clip stays with the left half.
    transition: null,
    // A slow zoom or pan belongs to the half it started in; the other half stays still instead of jumping back.
    motion: null,
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

  // An animated clip keeps moving through the cut: each half starts or ends
  // where the motion was, instead of falling back to the clip's static position.
  const cut = clipBaseState(clip, offset);
  const joined = (half: Clip, time: number): Clip => {
    if (clip.keyframes.length === 0) return half;
    const shown = clipBaseState(half, time);
    const same =
      shown.x === cut.x &&
      shown.y === cut.y &&
      shown.rotation === cut.rotation &&
      shown.opacity === cut.opacity;
    if (same) return half;
    const keyframes = [...half.keyframes, { id: newId(), time, ...cut }].sort((a, b) => a.time - b.time);
    return { ...half, keyframes };
  };
  const leftJoined = joined(left, offset);
  const rightJoined = joined(right, 0);

  const clips = [...project.clips];
  clips.splice(clips.indexOf(clip), 1, leftJoined, rightJoined);
  // Re-pack magnetic tracks so following clips stay exactly contiguous.
  return packMagneticTracks({ ...project, clips });
}
