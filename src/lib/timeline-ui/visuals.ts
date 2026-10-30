import { clipDuration } from "@/lib/timeline/clip-math";
import type { Clip } from "@/types/timeline";

export const THUMB_ASPECT = 16 / 9;
export const MAX_TILES_PER_CLIP = 60;
/** Frames are taken at multiples of this many seconds, so zooming reuses them. */
export const THUMB_TIME_STEP = 0.5;
export const VISIBLE_PAGE_PX = 256;

const MIN_TILE_WIDTH = 24;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round6 = (n: number) => Number(n.toFixed(6));

export function tileWidth(chipHeight: number): number {
  return Math.max(MIN_TILE_WIDTH, Math.round(chipHeight * THUMB_ASPECT));
}

/** The source time on screen `local` seconds after the clip starts, kept inside the trim. */
export function sourceTimeAt(clip: Clip, local: number): number {
  const raw = clip.reversed
    ? clip.sourceOut - local * clip.speed
    : clip.sourceIn + local * clip.speed;
  return Math.min(Math.max(raw, clip.sourceIn), clip.sourceOut);
}

export function quantizeTime(time: number, step: number = THUMB_TIME_STEP): number {
  return round6(Math.round(time / step) * step);
}

export interface ThumbTile {
  index: number;
  /** Pixels from the clip's left edge. */
  x: number;
  width: number;
  sourceTime: number;
}

export function thumbnailTiles(clip: Clip, pps: number, chipHeight: number): ThumbTile[] {
  const clipWidth = clipDuration(clip) * pps;
  const count = Math.min(
    MAX_TILES_PER_CLIP,
    Math.max(1, Math.ceil(clipWidth / tileWidth(chipHeight))),
  );
  const width = clipWidth / count;
  return Array.from({ length: count }, (_, index) => ({
    index,
    x: index * width,
    width,
    sourceTime: sourceTimeAt(clip, ((index + 0.5) * width) / pps),
  }));
}

/** Tiles overlapping `[from, to)`, both measured from the clip's left edge. */
export function visibleTiles(tiles: ThumbTile[], from: number, to: number): ThumbTile[] {
  return tiles.filter((tile) => tile.x + tile.width > from && tile.x < to);
}

/**
 * The lane range worth drawing: the visible range plus one page each side,
 * rounded outward, so it only changes once per page of scrolling.
 */
export function viewWindow(
  scrollLeft: number,
  viewportWidth: number,
): { from: number; to: number } {
  const page = VISIBLE_PAGE_PX;
  return {
    from: Math.floor(Math.max(0, scrollLeft - page) / page) * page,
    to: Math.ceil((scrollLeft + viewportWidth + page) / page) * page,
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Bar heights (0 to 1) for the part of the file this clip plays. */
export function waveformBars(peaks: number[], clip: Clip, barCount: number): number[] {
  const total = clip.sourceDuration;
  if (peaks.length === 0 || total === null || !(total > 0) || barCount < 1) return [];

  const first = Math.min(peaks.length - 1, Math.floor((clip.sourceIn / total) * peaks.length));
  const last = Math.max(
    first + 1,
    Math.min(peaks.length, Math.ceil((clip.sourceOut / total) * peaks.length)),
  );
  const slice = peaks.slice(first, last);

  const bars: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const from = Math.floor((i * slice.length) / barCount);
    const to = Math.max(from + 1, Math.floor(((i + 1) * slice.length) / barCount));
    let max = 0;
    for (let j = from; j < Math.min(to, slice.length); j++) max = Math.max(max, slice[j]);
    bars.push(clamp01(max));
  }
  return clip.reversed ? bars.reverse() : bars;
}

/** One vertical stroke per bar, centred; silence stays a thin visible line. */
export function waveformPath(bars: number[], height = 100): string {
  const mid = height / 2;
  return bars
    .map((bar, i) => {
      const half = Math.max(1, (bar * height) / 2);
      return `M${round2(i + 0.5)} ${round2(mid - half)}V${round2(mid + half)}`;
    })
    .join("");
}
