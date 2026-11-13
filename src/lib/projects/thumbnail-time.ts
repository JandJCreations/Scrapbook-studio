import type { TimelineProject } from "@/types/timeline";

/** The first moment of the project where something can be seen, for its thumbnail; null if nothing ever shows. */
export function thumbnailTime(project: TimelineProject): number | null {
  const visibleTracks = new Set(project.tracks.filter((t) => !t.hidden).map((t) => t.id));
  const starts = project.clips
    .filter((c) => c.kind !== "audio" && !c.isPlaceholder && visibleTracks.has(c.trackId))
    .map((c) => c.start);
  return starts.length === 0 ? null : Math.min(...starts);
}
