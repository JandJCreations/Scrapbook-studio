import { fitFrame } from "@/lib/playback/scene";

/** How the stage is looking at the frame: a zoom on top of "fit the frame", and a pan in stage pixels. */
export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface ViewGeometry {
  width: number;
  height: number;
  frameWidth: number;
  frameHeight: number;
}

export const DEFAULT_VIEW: ViewState = { zoom: 1, panX: 0, panY: 0 };
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;
/** However far it is panned, at least this much of the frame stays on the stage. */
const KEEP_VISIBLE = 48;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Where the frame is drawn on the stage: the fit, zoomed about the stage's centre, then panned. */
export function viewFit(geometry: ViewGeometry, view: ViewState): { scale: number; x: number; y: number } {
  const base = fitFrame(geometry.width, geometry.height, geometry.frameWidth, geometry.frameHeight);
  const scale = base.scale * view.zoom;
  return {
    scale,
    x: geometry.width / 2 + view.panX - (geometry.frameWidth * scale) / 2,
    y: geometry.height / 2 + view.panY - (geometry.frameHeight * scale) / 2,
  };
}

/** Keeps the frame from being panned off the stage; a frame that fits (zoom 1 or less) is not panned at all. */
function clampPan(geometry: ViewGeometry, view: ViewState): ViewState {
  if (view.zoom <= 1) return { zoom: view.zoom, panX: 0, panY: 0 };
  const { scale } = viewFit(geometry, view);
  const halfW = (geometry.frameWidth * scale) / 2;
  const halfH = (geometry.frameHeight * scale) / 2;
  const limitX = halfW + geometry.width / 2 - KEEP_VISIBLE;
  const limitY = halfH + geometry.height / 2 - KEEP_VISIBLE;
  return {
    zoom: view.zoom,
    panX: Math.min(limitX, Math.max(-limitX, view.panX)),
    panY: Math.min(limitY, Math.max(-limitY, view.panY)),
  };
}

/** Zooms by a factor while the frame point under `anchor` (stage pixels) stays under it. */
export function zoomAt(
  geometry: ViewGeometry,
  view: ViewState,
  factor: number,
  anchor: { x: number; y: number },
): ViewState {
  const zoom = clampZoom(view.zoom * factor);
  const before = viewFit(geometry, view);
  const frameX = (anchor.x - before.x) / before.scale;
  const frameY = (anchor.y - before.y) / before.scale;
  const base = fitFrame(geometry.width, geometry.height, geometry.frameWidth, geometry.frameHeight).scale;
  const scale = base * zoom;
  const x = anchor.x - frameX * scale;
  const y = anchor.y - frameY * scale;
  return clampPan(geometry, {
    zoom,
    panX: x - geometry.width / 2 + (geometry.frameWidth * scale) / 2,
    panY: y - geometry.height / 2 + (geometry.frameHeight * scale) / 2,
  });
}

/** Sets the zoom outright, about the stage's centre; exactly 1 is the default view again. */
export function zoomTo(geometry: ViewGeometry, view: ViewState, zoom: number): ViewState {
  if (zoom === 1) return DEFAULT_VIEW;
  const centre = { x: geometry.width / 2, y: geometry.height / 2 };
  return zoomAt(geometry, view, clampZoom(zoom) / view.zoom, centre);
}

export function panBy(geometry: ViewGeometry, view: ViewState, dx: number, dy: number): ViewState {
  return clampPan(geometry, { ...view, panX: view.panX + dx, panY: view.panY + dy });
}
