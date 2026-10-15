import { clipDuration } from "@/lib/timeline/clip-math";
import {
  canHostClip,
  clipsOnTrack,
  findClip,
  findTrack,
  isClipLocked,
} from "@/lib/timeline/lookup";
import {
  isMagnetic,
  packClips,
  packMagneticTracks,
  replaceTrackClips,
} from "@/lib/timeline/pack";
import type { Clip, TimelineProject } from "@/types/timeline";

/**
 * Puts `clip` (which must not already be in the project) on its track. Free
 * tracks take it at `start`. Magnetic tracks insert it before the first clip
 * whose midpoint is later than the new clip's midpoint, then pack.
 */
export function placeClip(project: TimelineProject, clip: Clip): TimelineProject {
  const track = findTrack(project, clip.trackId);
  if (!track) return project;

  const placed = { ...clip, start: Math.max(0, clip.start) };
  if (!isMagnetic(track)) return { ...project, clips: [...project.clips, placed] };

  const others = clipsOnTrack(project, track.id);
  const midpoint = placed.start + clipDuration(placed) / 2;
  const index = others.filter((o) => o.start + clipDuration(o) / 2 < midpoint).length;
  const ordered = [...others.slice(0, index), placed, ...others.slice(index)];
  return replaceTrackClips(project, track.id, packClips(ordered));
}

/**
 * Moves a clip to `to.start`, optionally onto another track. On a magnetic
 * target track this reorders the clips. Returns the same project when the
 * clip or target track is missing or locked, or the track cannot host the clip.
 */
export function moveClip(
  project: TimelineProject,
  clipId: string,
  to: { start: number; trackId?: string },
): TimelineProject {
  const clip = findClip(project, clipId);
  if (!clip || isClipLocked(project, clip)) return project;

  const target = findTrack(project, to.trackId ?? clip.trackId);
  if (!target || target.locked || !canHostClip(target, clip)) return project;

  const without = { ...project, clips: project.clips.filter((c) => c.id !== clipId) };
  return packMagneticTracks(placeClip(without, { ...clip, trackId: target.id, start: to.start }));
}

/** Adds a new clip. Same rejection rules as moveClip, plus duplicate ids. */
export function insertClip(project: TimelineProject, clip: Clip): TimelineProject {
  if (findClip(project, clip.id)) return project;
  const track = findTrack(project, clip.trackId);
  if (!track || track.locked || !canHostClip(track, clip)) return project;
  return packMagneticTracks(placeClip(project, clip));
}
