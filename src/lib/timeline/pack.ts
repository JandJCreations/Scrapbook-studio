import { clipDuration } from "@/lib/timeline/clip-math";
import { clipsOnTrack } from "@/lib/timeline/lookup";
import type { Clip, TimelineProject, Track } from "@/types/timeline";

/** Video tracks are magnetic: their clips always sit end to end from time 0. */
export function isMagnetic(track: Track): boolean {
  return track.type === "video";
}

/**
 * Assigns sequential starts beginning at 0, in the given order. The start is
 * set to the exact running sum, so `clipEnd(prev) === next.start` with no
 * floating-point sliver between clips.
 */
export function packClips(ordered: Clip[]): Clip[] {
  let cursor = 0;
  return ordered.map((clip) => {
    const packed = clip.start === cursor ? clip : { ...clip, start: cursor };
    cursor += clipDuration(clip);
    return packed;
  });
}

export function replaceTrackClips(
  project: TimelineProject,
  trackId: string,
  clips: Clip[],
): TimelineProject {
  return {
    ...project,
    clips: [...project.clips.filter((clip) => clip.trackId !== trackId), ...clips],
  };
}

/** Re-packs every magnetic track by current start order. */
export function packMagneticTracks(project: TimelineProject): TimelineProject {
  const magnetic = project.tracks.filter(isMagnetic);
  if (magnetic.length === 0) return project;

  const packedById = new Map<string, Clip>();
  for (const track of magnetic) {
    for (const clip of packClips(clipsOnTrack(project, track.id))) {
      packedById.set(clip.id, clip);
    }
  }
  return { ...project, clips: project.clips.map((clip) => packedById.get(clip.id) ?? clip) };
}
