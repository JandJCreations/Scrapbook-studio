import { isClipLocked } from "@/lib/timeline/lookup";
import type { ClipMotion, TimelineProject } from "@/types/timeline";

export const MOTIONS: Array<{ motion: ClipMotion; label: string }> = [
  { motion: "zoom-in", label: "Zoom in" },
  { motion: "zoom-out", label: "Zoom out" },
  { motion: "pan-left", label: "Pan left" },
  { motion: "pan-right", label: "Pan right" },
];

/** Gives a photo a slow zoom or pan (or with null, none). Videos and locked clips are left alone; the same project comes back when nothing changes. */
export function setMotion(project: TimelineProject, clipId: string, motion: ClipMotion | null): TimelineProject {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip || clip.kind !== "image" || isClipLocked(project, clip)) return project;
  if ((clip.motion ?? null) === motion) return project;
  return { ...project, clips: project.clips.map((c) => (c.id === clipId ? { ...c, motion } : c)) };
}

/** The same motion for every photo. */
export function setAllMotion(project: TimelineProject, motion: ClipMotion | null): TimelineProject {
  let result = project;
  for (const clip of project.clips) result = setMotion(result, clip.id, motion);
  return result;
}
