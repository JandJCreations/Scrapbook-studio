import { lookFor, type Look } from "@/lib/appearance/look";
import { clipDrawState, type DrawState } from "@/lib/playback/draw-state";
import { transitionDraw } from "@/lib/playback/transition-draw";
import type { PoolElement } from "@/lib/playback/media-pool";
import { activeClipsAt } from "@/lib/timeline/active-clips";
import { activeTransitionsAt } from "@/lib/timeline/transitions";
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
  /** How wide the clip is laid out, before any motion: what blur and corner sizes are measured against, so a zoom does not change them frame by frame. */
  layoutWidth: number;
  /** Filters, flip, border and shadows for pictures and video; null when the clip has none. */
  look: Look | null;
  /** null = nothing to draw for this clip right now (e.g. its video element is not ready). */
  content: SceneContent | null;
}

function contentFor(
  clip: Clip,
  elementFor: (clipId: string) => PoolElement | undefined,
): SceneContent | null {
  // An empty slot has no media to draw or play: show a labelled stand-in.
  if (clip.isPlaceholder) return { type: "placeholder", label: clip.name };
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
      // Catalog art or one of the user's own pictures is drawn like any picture; a sticker with no art shows a stand-in.
      return clip.mediaId !== ""
        ? { type: "image", mediaId: clip.mediaId }
        : { type: "placeholder", label: clip.name };
    case "audio":
      return null;
  }
}

/**
 * What to draw at `time`: one item per active clip on a visible track, in
 * paint order (bottom first). Audio clips draw nothing and are left out. A
 * video clip never borrows another clip's element: without its own it is empty.
 *
 * While a transition plays, the clip that is about to start is drawn too (at
 * its first frame), under the clip that is leaving, and both are moved or
 * faded by the transition.
 */
export function buildScene(
  project: TimelineProject,
  time: number,
  elementFor: (clipId: string) => PoolElement | undefined,
  frame?: { width: number; height: number },
): SceneItem[] {
  const transitions = new Map(activeTransitionsAt(project, time).map((t) => [t.outgoing.id, t]));
  const items: SceneItem[] = [];
  for (const active of activeClipsAt(project, time)) {
    if (!active.visible || active.clip.kind === "audio") continue;
    const slideDistance = frame?.width ?? active.clip.transform.width;
    const transition = transitions.get(active.clip.id);
    if (transition) {
      const incoming = transition.incoming;
      // The arriving clip's own fade-in must not hide it while the transition brings it in.
      const arrivingDraw = clipDrawState({ ...incoming, fadeIn: 0 }, 0);
      items.push({
        clipId: incoming.id,
        draw: transitionDraw("in", transition.type, transition.progress, arrivingDraw, slideDistance),
        layoutWidth: incoming.transform.width,
        look: lookFor(incoming),
        content: contentFor(incoming, elementFor),
      });
      items.push({
        clipId: active.clip.id,
        draw: transitionDraw("out", transition.type, transition.progress, clipDrawState(active.clip, active.localTime), slideDistance),
        layoutWidth: active.clip.transform.width,
        look: lookFor(active.clip),
        content: contentFor(active.clip, elementFor),
      });
      continue;
    }
    items.push({
      clipId: active.clip.id,
      draw: clipDrawState(active.clip, active.localTime),
      layoutWidth: active.clip.transform.width,
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
