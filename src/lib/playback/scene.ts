import { lookFor, type Look } from "@/lib/appearance/look";
import { clipDrawState, type DrawState } from "@/lib/playback/draw-state";
import type { PoolElement } from "@/lib/playback/media-pool";
import { activeClipsAt } from "@/lib/timeline/active-clips";
import type { Clip, TimelineProject } from "@/types/timeline";
import type { TextAdjustments } from "@/types/text-adjustments";

export type SceneContent =
  | { type: "video"; element: PoolElement }
  | { type: "image"; mediaId: string }
  | { type: "text"; adjustments: TextAdjustments }
  | { type: "placeholder"; label: string };

export interface SceneItem {
  clipId: string;
  draw: DrawState;
  /** Filters, flip, border and shadows for pictures and video; null when the clip has none. */
  look: Look | null;
  /** null = nothing to draw for this clip right now (e.g. its video element is not ready). */
  content: SceneContent | null;
}

function contentFor(
  clip: Clip,
  elementFor: (clipId: string) => PoolElement | undefined,
): SceneContent | null {
  switch (clip.kind) {
    case "video": {
      const element = elementFor(clip.id);
      return element ? { type: "video", element } : null;
    }
    case "image":
      return { type: "image", mediaId: clip.mediaId };
    case "text":
      return clip.adjustments.text
        ? { type: "text", adjustments: clip.adjustments.text }
        : { type: "placeholder", label: clip.name };
    case "sticker":
      return { type: "placeholder", label: clip.name };
    case "audio":
      return null;
  }
}

/**
 * What to draw at `time`: one item per active clip on a visible track, in
 * paint order (bottom first). Audio clips draw nothing and are left out. A
 * video clip never borrows another clip's element: without its own it is empty.
 */
export function buildScene(
  project: TimelineProject,
  time: number,
  elementFor: (clipId: string) => PoolElement | undefined,
): SceneItem[] {
  const items: SceneItem[] = [];
  for (const active of activeClipsAt(project, time)) {
    if (!active.visible || active.clip.kind === "audio") continue;
    items.push({
      clipId: active.clip.id,
      draw: clipDrawState(active.clip, active.localTime),
      look: lookFor(active.clip),
      content: contentFor(active.clip, elementFor),
    });
  }
  return items;
}

/** Uniform scale and offset that centre a frame inside a container. */
export function fitFrame(
  containerWidth: number,
  containerHeight: number,
  frameWidth: number,
  frameHeight: number,
): { scale: number; x: number; y: number } {
  if (containerWidth <= 0 || containerHeight <= 0 || frameWidth <= 0 || frameHeight <= 0) {
    return { scale: 1, x: 0, y: 0 };
  }
  const scale = Math.min(containerWidth / frameWidth, containerHeight / frameHeight);
  return {
    scale,
    x: (containerWidth - frameWidth * scale) / 2,
    y: (containerHeight - frameHeight * scale) / 2,
  };
}

/** Media scaled to sit inside a frame (letterboxed), centred. */
export function fitContain(
  naturalWidth: number,
  naturalHeight: number,
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number; width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { x: 0, y: 0, width: frameWidth, height: frameHeight };
  }
  const scale = Math.min(frameWidth / naturalWidth, frameHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return { x: (frameWidth - width) / 2, y: (frameHeight - height) / 2, width, height };
}
