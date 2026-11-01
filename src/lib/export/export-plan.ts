import type { TimelineProject } from "@/types/timeline";

/** The time of every frame of an export, from 0, one per 1/fps seconds, always at least one. */
export function exportFrameTimes(durationSeconds: number, fps: number): number[] {
  const total = Math.max(1, Math.round(Math.max(0, durationSeconds) * fps));
  return Array.from({ length: total }, (_, i) => i / fps);
}

/** How many empty "tap to add" slots the project still has. */
export function countSlots(project: TimelineProject): number {
  return project.clips.filter((clip) => clip.isPlaceholder).length;
}

/** The project as it is exported: empty slots are stand-ins, not content, so they are left out. */
export function exportableProject(project: TimelineProject): TimelineProject {
  if (countSlots(project) === 0) return project;
  return { ...project, clips: project.clips.filter((clip) => !clip.isPlaceholder) };
}

const JUST_BEFORE_END = 0.001;

/** The moment a still picture is taken: the playhead, kept inside the project so something is on screen. */
export function stillTime(playhead: number, projectDuration: number): number {
  if (projectDuration <= 0) return 0;
  return Math.min(Math.max(0, playhead), projectDuration - JUST_BEFORE_END);
}
