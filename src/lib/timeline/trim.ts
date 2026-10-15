import {
  clamp,
  clipDuration,
  clipEnd,
  EPS,
  MIN_CLIP_DURATION,
} from "@/lib/timeline/clip-math";
import { findClip, findTrack, isClipLocked } from "@/lib/timeline/lookup";
import { isMagnetic, packMagneticTracks } from "@/lib/timeline/pack";
import type { Clip, TimelineProject } from "@/types/timeline";

export type TrimEdge = "start" | "end";

/**
 * Moves one edge of a clip to timeline time `to`, clamped to the source file
 * and to MIN_CLIP_DURATION. On a magnetic track the clip keeps its `start`
 * when its start edge moves, and packing closes the resulting gap.
 */
export function trimClip(
  project: TimelineProject,
  clipId: string,
  edge: TrimEdge,
  to: number,
): TimelineProject {
  const clip = findClip(project, clipId);
  if (!clip || isClipLocked(project, clip)) return project;
  const track = findTrack(project, clip.trackId);
  if (!track) return project;

  const duration = clipDuration(clip);
  const end = clipEnd(clip);

  // Dragging the end of a forward clip, or the start of a reversed clip,
  // moves sourceOut; the other two combinations move sourceIn.
  const movesSourceOut = (edge === "end") !== clip.reversed;
  const sourceAvailable = movesSourceOut
    ? (clip.sourceDuration ?? Infinity) - clip.sourceIn
    : clip.sourceOut;
  let maxDuration = sourceAvailable / clip.speed;
  // On a free track the start edge cannot move before timeline time 0. A
  // magnetic clip keeps its start (packing places it), so no such cap applies.
  if (edge === "start" && !isMagnetic(track)) maxDuration = Math.min(maxDuration, end);

  const requested = edge === "end" ? to - clip.start : end - to;
  const newDuration = clamp(requested, MIN_CLIP_DURATION, maxDuration);
  if (Math.abs(newDuration - duration) < EPS) return project;

  const span = newDuration * clip.speed;
  // (available / speed) * speed does not always round-trip, so clamp the moved
  // bound back into the source file instead of trusting the arithmetic.
  const updated: Clip = {
    ...clip,
    ...(movesSourceOut
      ? { sourceOut: Math.min(clip.sourceIn + span, clip.sourceDuration ?? Infinity) }
      : { sourceIn: Math.max(clip.sourceOut - span, 0) }),
  };

  if (edge === "start") {
    if (!isMagnetic(track)) updated.start = end - newDuration;
    // Keyframe times are relative to the clip start; removing `headTrim`
    // seconds from the front shifts every keyframe earlier by that amount.
    const headTrim = duration - newDuration;
    updated.keyframes = clip.keyframes.map((k) => ({ ...k, time: k.time - headTrim }));
  }

  return packMagneticTracks({
    ...project,
    clips: project.clips.map((c) => (c.id === clipId ? updated : c)),
  });
}
