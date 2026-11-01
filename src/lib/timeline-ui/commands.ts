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
  // Which new clip is the copy of which, so a duplicated group can be a group of its own.
  const copyOf = new Map<string, string>();
  const duplicated = ids.reduce((current, id) => {
    const known = new Set(current.clips.map((clip) => clip.id));
    const next = duplicateClip(current, id, newId);
    const made = next.clips.find((clip) => !known.has(clip.id));
    if (made) copyOf.set(id, made.id);
    return next;
  }, project);

  const groupOfCopy = new Map<string, string>();
  const groupIds = new Map<string, string>();
  for (const [originalId, copyId] of copyOf) {
    const group = project.clips.find((clip) => clip.id === originalId)?.groupId;
    if (!group) continue;
    if (!groupIds.has(group)) groupIds.set(group, newId());
    groupOfCopy.set(copyId, groupIds.get(group)!);
  }
  if (groupOfCopy.size === 0) return duplicated;
  return {
    ...duplicated,
    clips: duplicated.clips.map((clip) => (groupOfCopy.has(clip.id) ? { ...clip, groupId: groupOfCopy.get(clip.id)! } : clip)),
  };
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
