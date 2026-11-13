import type { CanvasObject } from "@/types/canvas";

/**
 * Which moment of the source video should be showing when the timeline
 * playhead is at `playheadTime`. Accounts for trim, speed and reverse.
 */
export function videoSourceTimeAt(object: CanvasObject, playheadTime: number): number {
  const v = object.videoAdjustments;
  if (!v) return 0;
  const rate = v.playbackRate || 1;
  const elapsed = Math.max(0, playheadTime - object.startTime) * rate;
  const span = Math.max(0, v.trimEnd - v.trimStart);
  let offset = elapsed;
  if (span > 0 && elapsed > span) {
    offset = v.loop ? elapsed % span : span;
  }
  return v.reversed ? v.trimEnd - offset : v.trimStart + offset;
}
