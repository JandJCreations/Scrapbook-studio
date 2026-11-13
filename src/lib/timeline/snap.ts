import { clipEnd } from "@/lib/timeline/clip-math";
import type { TimelineProject } from "@/types/timeline";

export interface SnapResult {
  start: number;
  snappedTo: number | null;
}

export function snapThresholdSeconds(thresholdPx: number, pixelsPerSecond: number): number {
  return thresholdPx / pixelsPerSecond;
}

/** Times a dragged edge can snap to: 0, the playhead, and other clips' edges. */
export function collectSnapTargets(
  project: TimelineProject,
  excludeClipIds: string[],
  playhead: number,
): number[] {
  const excluded = new Set(excludeClipIds);
  const targets = [0, playhead];
  for (const clip of project.clips) {
    if (excluded.has(clip.id)) continue;
    targets.push(clip.start, clipEnd(clip));
  }
  return targets;
}

/** Snaps one edge (trim handle or playhead) to the nearest target in range. */
export function snapTime(
  time: number,
  targets: number[],
  thresholdSeconds: number,
): { time: number; snappedTo: number | null } {
  let best: number | null = null;
  for (const target of targets) {
    const distance = Math.abs(target - time);
    if (distance <= thresholdSeconds && (best === null || distance < Math.abs(best - time))) {
      best = target;
    }
  }
  return best === null ? { time, snappedTo: null } : { time: best, snappedTo: best };
}

/**
 * Snaps a moving clip: either its start edge or its end edge may land on a
 * target, whichever is closest. Returns the adjusted start.
 */
export function snapClipStart(
  start: number,
  duration: number,
  targets: number[],
  thresholdSeconds: number,
): SnapResult {
  let best: SnapResult | null = null;
  // Candidate starts that put the clip's start edge, or its end edge, exactly
  // on the target (computed directly so the result has no float drift).
  for (const target of targets) {
    for (const candidate of [target, target - duration]) {
      const distance = Math.abs(candidate - start);
      if (
        distance <= thresholdSeconds &&
        (best === null || distance < Math.abs(best.start - start))
      ) {
        best = { start: candidate, snappedTo: target };
      }
    }
  }
  return best ?? { start, snappedTo: null };
}
