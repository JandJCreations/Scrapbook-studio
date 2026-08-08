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
