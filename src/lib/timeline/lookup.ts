import type { Clip, TimelineProject, Track } from "@/types/timeline";

export function findClip(project: TimelineProject, id: string): Clip | undefined {
  return project.clips.find((clip) => clip.id === id);
}

export function findTrack(project: TimelineProject, id: string): Track | undefined {
  return project.tracks.find((track) => track.id === id);
}

export function isClipLocked(project: TimelineProject, clip: Clip): boolean {
  return clip.locked || (findTrack(project, clip.trackId)?.locked ?? false);
}

/** Audio clips live only on audio tracks; every other kind lives only on non-audio tracks. */
export function canHostClip(track: Track, clip: Clip): boolean {
  return clip.kind === "audio" ? track.type === "audio" : track.type !== "audio";
}

export function clipsOnTrack(project: TimelineProject, trackId: string): Clip[] {
  return project.clips
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => a.start - b.start);
}
