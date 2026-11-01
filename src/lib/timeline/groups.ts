import { isClipLocked } from "@/lib/timeline/lookup";
import type { TimelineProject } from "@/types/timeline";

/**
 * Puts two or more clips in one group, merging any groups they were already in.
 * Locked clips cannot be grouped; with fewer than two usable clips nothing changes.
 */
export function groupClips(project: TimelineProject, ids: string[], newId: () => string): TimelineProject {
  const wanted = new Set(ids);
  const usable = project.clips.filter((clip) => wanted.has(clip.id) && !isClipLocked(project, clip));
  if (usable.length < 2) return project;
  const merged = new Set(usable.map((clip) => clip.id));
  const oldGroups = new Set(usable.map((clip) => clip.groupId).filter((g): g is string => g !== null));
  const groupId = newId();
  return {
    ...project,
    clips: project.clips.map((clip) =>
      merged.has(clip.id) || (clip.groupId !== null && oldGroups.has(clip.groupId)) ? { ...clip, groupId } : clip,
    ),
  };
}

/** Takes the chosen clips out of their groups. */
export function ungroupClips(project: TimelineProject, ids: string[]): TimelineProject {
  const wanted = new Set(ids);
  if (!project.clips.some((clip) => wanted.has(clip.id) && clip.groupId !== null)) return project;
  return {
    ...project,
    clips: project.clips.map((clip) => (wanted.has(clip.id) && clip.groupId !== null ? { ...clip, groupId: null } : clip)),
  };
}

/** The selection without the whole group of a clip that was just toggled off, so one member cannot be left out. */
export function dropGroupOf(project: TimelineProject, ids: string[], removedId: string): string[] {
  const group = project.clips.find((clip) => clip.id === removedId)?.groupId;
  if (!group) return ids;
  const members = new Set(project.clips.filter((clip) => clip.groupId === group).map((clip) => clip.id));
  return ids.filter((id) => !members.has(id));
}

/** The ids, plus every other member of any group they touch (given ids keep their order). */
export function expandToGroups(project: TimelineProject, ids: string[]): string[] {
  const have = new Set(ids);
  const groups = new Set<string>();
  for (const clip of project.clips) if (have.has(clip.id) && clip.groupId !== null) groups.add(clip.groupId);
  if (groups.size === 0) return ids;
  const extra = project.clips
    .filter((clip) => clip.groupId !== null && groups.has(clip.groupId) && !have.has(clip.id))
    .map((clip) => clip.id);
  return extra.length === 0 ? ids : [...ids, ...extra];
}
