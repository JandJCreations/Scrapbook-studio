import { upsertKeyframe } from "@/lib/editor/keyframes";
import { setClipTransforms } from "@/lib/editor/ops";
import { createId, type IdFn } from "@/lib/timeline/ids";
import type { ClipTransform, TimelineProject } from "@/types/timeline";

/**
 * Applies what a stage gesture changed. A plain clip takes the new transform. An
 * animated clip takes position, rotation and opacity as a keyframe at `time` (the
 * timeline time of the gesture); its size has no keyframes and changes for the
 * whole clip. Locked and unknown clips are left alone.
 */
export function applyStagePatches(
  project: TimelineProject,
  patches: Record<string, Partial<ClipTransform>>,
  time: number,
  newId: IdFn = createId,
): TimelineProject {
  let result = project;
  for (const [clipId, patch] of Object.entries(patches)) {
    const clip = result.clips.find((c) => c.id === clipId);
    if (!clip) continue;
    if (clip.keyframes.length === 0) {
      result = setClipTransforms(result, { [clipId]: patch });
      continue;
    }
    const { x, y, rotation, opacity, width, height } = patch;
    const animated = { x, y, rotation, opacity };
    const values = Object.fromEntries(Object.entries(animated).filter(([, v]) => v !== undefined));
    if (Object.keys(values).length > 0) {
      result = upsertKeyframe(result, clipId, time - clip.start, values, newId);
    }
    const size: Partial<ClipTransform> = {};
    if (width !== undefined) size.width = width;
    if (height !== undefined) size.height = height;
    if (Object.keys(size).length > 0) result = setClipTransforms(result, { [clipId]: size });
  }
  return result;
}
