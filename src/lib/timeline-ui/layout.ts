import { clipDuration } from "@/lib/timeline/clip-math";
import type { Clip, TimelineProject, TrackType } from "@/types/timeline";

export const ROW_HEIGHT: Record<TrackType, number> = { overlay: 44, video: 64, audio: 44 };
export const ROW_GAP = 2;
export const MIN_CLIP_WIDTH = 2;
export const HEADER_WIDTH = 112;
export const RULER_HEIGHT = 28;

const RIGHT_MARGIN = 40;
const PAGE_LEAD = 0.1;

export interface TrackRow {
  trackId: string;
  type: TrackType;
  y: number;
  height: number;
}

export interface TrackLayout {
  rows: TrackRow[];
  height: number;
}

export function trackLayout(project: TimelineProject): TrackLayout {
  const sorted = [...project.tracks].sort((a, b) => a.order - b.order);
  const rows: TrackRow[] = [];
  let y = 0;
  for (const track of sorted) {
    const height = ROW_HEIGHT[track.type];
    rows.push({ trackId: track.id, type: track.type, y, height });
    y += height + ROW_GAP;
  }
  const last = rows[rows.length - 1];
  return { rows, height: last ? last.y + last.height : 0 };
}

export interface ClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clipRect(clip: Clip, row: TrackRow, pps: number): ClipRect {
  return {
    x: clip.start * pps,
    y: row.y + 2,
    width: Math.max(clipDuration(clip) * pps, MIN_CLIP_WIDTH),
    height: row.height - 4,
  };
}

export function clipLabel(clip: Clip): string {
  return clip.kind === "text" ? clip.adjustments.text?.content || clip.name : clip.name;
}

/** `laneLeft` is the lane area's left edge on screen; it already moves with scrolling. */
export function pointerToTime(clientX: number, laneLeft: number, pps: number): number {
  return Math.max(0, (clientX - laneLeft) / pps);
}

export function keepPlayheadVisible(args: {
  scrollLeft: number;
  viewportWidth: number;
  playheadX: number;
}): number {
  const { scrollLeft, viewportWidth, playheadX } = args;
  if (playheadX >= scrollLeft && playheadX <= scrollLeft + viewportWidth - RIGHT_MARGIN) {
    return scrollLeft;
  }
  return Math.max(0, playheadX - viewportWidth * PAGE_LEAD);
}

/**
 * Where to scroll after the playhead moved. While the user is scrubbing the
 * view stays put: following the pointer would move the click target out from
 * under it and page the view repeatedly near the edges.
 */
export function scrollAfterTimeChange(args: {
  scrubbing: boolean;
  scrollLeft: number;
  viewportWidth: number;
  playheadX: number;
}): number {
  return args.scrubbing ? args.scrollLeft : keepPlayheadVisible(args);
}
