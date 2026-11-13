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

/**
 * A closed envelope outline: the top edge left to right, then the bottom edge
 * back. Joining the points keeps the waveform solid however far apart the bars
 * land (a long song's bars are many pixels apart); silence stays a thin shape.
 */
export function waveformPath(bars: number[], height = 100): string {
  if (bars.length === 0) return "";
  const mid = height / 2;
  const half = (bar: number) => Math.max(1, (bar * height) / 2);
  const top = bars.map((bar, i) => `${round2(i + 0.5)} ${round2(mid - half(bar))}`);
  const bottom = bars.map((bar, i) => `${round2(i + 0.5)} ${round2(mid + half(bar))}`).reverse();
  return (
    `M${top[0]}` +
    top.slice(1).map((point) => `L${point}`).join("") +
    bottom.map((point) => `L${point}`).join("") +
    "Z"
  );
}

const MIN_PEAK_BUCKETS = 2000;
const MAX_PEAK_BUCKETS = 20000;
const PEAKS_PER_SECOND = 50;

/** How many peaks to keep for a file: more for long ones, so a trimmed part still has detail. */
export function peakBucketCount(durationSeconds: number): number {
  const wanted = Math.ceil(Math.max(0, durationSeconds) * PEAKS_PER_SECOND);
  return Math.min(MAX_PEAK_BUCKETS, Math.max(MIN_PEAK_BUCKETS, wanted));
}
