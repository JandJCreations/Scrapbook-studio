import { clipDuration, clipEnd, EPS } from "@/lib/timeline/clip-math";
import { isClipLocked } from "@/lib/timeline/lookup";
import { packMagneticTracks } from "@/lib/timeline/pack";
import type { Clip, TimelineProject } from "@/types/timeline";

function removableClips(project: TimelineProject, clipIds: string[]): Clip[] {
  const ids = new Set(clipIds);
  return project.clips.filter((clip) => ids.has(clip.id) && !isClipLocked(project, clip));
}

/** Removes unlocked clips. Magnetic tracks close the gap; other tracks keep it. */
export function deleteClips(project: TimelineProject, clipIds: string[]): TimelineProject {
  const removed = removableClips(project, clipIds);
  if (removed.length === 0) return project;
  const removedIds = new Set(removed.map((clip) => clip.id));
  return packMagneticTracks({
    ...project,
    clips: project.clips.filter((clip) => !removedIds.has(clip.id)),
  });
}

/**
 * Like deleteClips, but clips on non-magnetic tracks that start at or after a
 * removed clip's end shift left by its duration. Overlapping and locked clips
 * stay put.
 */
export function rippleDeleteClips(project: TimelineProject, clipIds: string[]): TimelineProject {
  const removed = removableClips(project, clipIds);
  if (removed.length === 0) return project;
  const removedIds = new Set(removed.map((clip) => clip.id));

  const clips = project.clips
    .filter((clip) => !removedIds.has(clip.id))
    .map((clip) => {
      if (clip.locked) return clip;
      const shift = removed
        .filter((r) => r.trackId === clip.trackId && clip.start >= clipEnd(r) - EPS)
        .reduce((sum, r) => sum + clipDuration(r), 0);
      return shift > 0 ? { ...clip, start: Math.max(0, clip.start - shift) } : clip;
    });

  return packMagneticTracks({ ...project, clips });
}
