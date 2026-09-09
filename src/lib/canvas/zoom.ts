import { MAX_ZOOM, MIN_ZOOM } from "@/lib/canvas/constants";

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export function zoomAtPoint(
  viewport: Viewport,
  point: { x: number; y: number },
  factor: number,
): Viewport {
  const newScale = clamp(viewport.scale * factor, MIN_ZOOM, MAX_ZOOM);
  const worldPoint = {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  };
  return {
    scale: newScale,
    x: point.x - worldPoint.x * newScale,
    y: point.y - worldPoint.y * newScale,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * The canvas frame is defined in world units (e.g. 1920x1080 for Landscape)
 * that are almost always larger than the visible stage, especially on
 * mobile. Opening a project at scale 1 with the viewport pinned to (0,0)
 * only shows a small corner of the frame — anything placed outside that
 * corner (i.e. most content) looks like a blank canvas even though it's
 * really just off-screen. This centers the whole frame in the stage instead.
 */
export function fitViewportToFrame(
  frame: { width: number; height: number },
  stageWidth: number,
  stageHeight: number,
  paddingRatio = 0.9,
): Viewport {
  if (frame.width <= 0 || frame.height <= 0 || stageWidth <= 0 || stageHeight <= 0) {
    return { x: 0, y: 0, scale: 1 };
  }

  const scale = clamp(
    Math.min((stageWidth * paddingRatio) / frame.width, (stageHeight * paddingRatio) / frame.height),
    MIN_ZOOM,
    MAX_ZOOM,
  );

  return {
    scale,
    x: (stageWidth - frame.width * scale) / 2,
    y: (stageHeight - frame.height * scale) / 2,
  };
}
