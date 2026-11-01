import { computeSnap, type Box, type GuideLine } from "@/lib/canvas/alignment";
import { buildScene } from "@/lib/playback/scene";
import { isClipLocked } from "@/lib/timeline/lookup";
import type { TimelineProject } from "@/types/timeline";

export const MIN_BOX_SIZE = 8;
/** How close, in screen pixels, a dragged box must be to snap. */
export const SNAP_PX = 6;

export interface StageBox {
  clipId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
  /** Has keyframes: selectable, but dragging waits for the keyframes slice. */
  animated: boolean;
  /** A text clip: double-clicking it edits the words in place. */
  isText: boolean;
}

/** The boxes on the stage at `time`, bottom first, exactly as the painter draws them. */
export function stageBoxes(project: TimelineProject, time: number): StageBox[] {
  const clips = new Map(project.clips.map((clip) => [clip.id, clip]));
  const boxes: StageBox[] = [];
  for (const item of buildScene(project, time, () => undefined)) {
    const clip = clips.get(item.clipId);
    if (!clip) continue;
    boxes.push({
      clipId: clip.id,
      x: item.draw.x,
      y: item.draw.y,
      width: item.draw.width,
      height: item.draw.height,
      rotation: item.draw.rotation,
      locked: isClipLocked(project, clip),
      animated: clip.keyframes.length > 0,
      isText: clip.kind === "text",
    });
  }
  return boxes;
}

/** A transformed node's position, rotation and real size (its scale folded back into width and height). */
export function nodeToTransform(node: {
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}): { x: number; y: number; width: number; height: number; rotation: number } {
  return {
    x: node.x,
    y: node.y,
    width: Math.max(MIN_BOX_SIZE, node.width * Math.abs(node.scaleX)),
    height: Math.max(MIN_BOX_SIZE, node.height * Math.abs(node.scaleY)),
    rotation: node.rotation,
  };
}

/** Snaps a dragged box to the frame and to the other boxes; `scale` is the stage zoom. */
export function snapMove(
  moving: { id: string; x: number; y: number; width: number; height: number },
  boxes: StageBox[],
  frame: { width: number; height: number },
  scale: number,
  excludeIds: string[] = [],
): { x: number; y: number; guides: GuideLine[] } {
  const skip = new Set([moving.id, ...excludeIds]);
  const others: Box[] = boxes
    .filter((box) => !skip.has(box.clipId))
    .map((box) => ({ id: box.clipId, x: box.x, y: box.y, width: box.width, height: box.height }));
  others.push({ id: "__frame__", x: 0, y: 0, width: frame.width, height: frame.height });
  return computeSnap(moving, others, SNAP_PX / scale);
}
