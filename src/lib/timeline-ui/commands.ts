import { duplicateClip } from "@/lib/timeline/clip-edits";
import { clipEnd } from "@/lib/timeline/clip-math";
import { deleteClips, rippleDeleteClips } from "@/lib/timeline/delete";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { splitClip } from "@/lib/timeline/split";
import { pruneEmptyTracks } from "@/lib/timeline/tracks";
import type { TimelineProject } from "@/types/timeline";

/**
 * Splits the selected clips at `time`, or, with no selection, every clip the
 * playhead is inside. Returns the same project when nothing could be split.
 */
export function splitAtPlayhead(
  project: TimelineProject,
  selectedIds: string[],
  time: number,
  newId: IdFn = createId,
): TimelineProject {
  const targets =
    selectedIds.length > 0
      ? selectedIds
      : project.clips
          .filter((clip) => clip.start < time && time < clipEnd(clip))
          .map((clip) => clip.id);
  return targets.reduce((current, id) => splitClip(current, id, time, newId), project);
}

export function duplicateSelected(
  project: TimelineProject,
  ids: string[],
  newId: IdFn = createId,
): TimelineProject {
  return ids.reduce((current, id) => duplicateClip(current, id, newId), project);
}

export function deleteSelected(
  project: TimelineProject,
  ids: string[],
  ripple: boolean,
): TimelineProject {
  const next = ripple ? rippleDeleteClips(project, ids) : deleteClips(project, ids);
  // Only tidy up after a delete that really removed something.
  return next === project ? project : pruneEmptyTracks(next);
}
