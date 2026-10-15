import { createId, type IdFn } from "@/lib/timeline/ids";
import type { TimelineProject, Track, TrackType } from "@/types/timeline";

/**
 * Adds a track and renumbers `order` top to bottom. Overlays stack on top,
 * video goes just below the overlays, audio goes at the bottom.
 */
export function addTrack(
  project: TimelineProject,
  type: TrackType,
  newId: IdFn = createId,
): TimelineProject {
  const track: Track = {
    id: newId(),
    type,
    order: 0,
    muted: false,
    locked: false,
    hidden: false,
    solo: false,
  };

  const sorted = [...project.tracks].sort((a, b) => a.order - b.order);
  const index =
    type === "overlay"
      ? 0
      : type === "video"
        ? sorted.filter((t) => t.type === "overlay").length
        : sorted.length;
  sorted.splice(index, 0, track);

  return {
    ...project,
    tracks: sorted.map((t, i) => (t.order === i ? t : { ...t, order: i })),
  };
}

export type TrackPatch = Partial<Pick<Track, "muted" | "locked" | "hidden" | "solo">>;

/** Always allowed, so a locked track can be unlocked. */
export function updateTrack(
  project: TimelineProject,
  trackId: string,
  patch: TrackPatch,
): TimelineProject {
  if (!project.tracks.some((t) => t.id === trackId)) return project;
  return {
    ...project,
    tracks: project.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
  };
}
