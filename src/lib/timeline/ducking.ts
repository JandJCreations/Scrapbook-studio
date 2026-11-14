import { isAudible } from "@/lib/timeline/active-clips";
import { clipEnd } from "@/lib/timeline/clip-math";
import type { TimelineProject, Track } from "@/types/timeline";

/** How loud other sound plays while the voiceover speaks (30%). */
export const DUCKED_GAIN = 0.3;
/** Seconds to dip down before the voice starts, and to come back up after it stops. */
export const DUCK_RAMP_SECONDS = 0.35;

/** A stretch of timeline seconds, [start, end). */
export interface DuckRange {
  start: number;
  end: number;
}

export function isVoiceoverTrack(track: Track | undefined): boolean {
  return track?.type === "audio" && track.role === "voiceover";
}

/**
 * Where the voiceover speaks: every audible clip on a voiceover track that
 * ducks the rest, merged where they touch or overlap (or sit closer than two
 * ramps apart, so the music doesn't bob up between sentences).
 */
export function duckingRanges(project: TimelineProject): DuckRange[] {
  const trackById = new Map(project.tracks.map((track) => [track.id, track]));
  const anySolo = project.tracks.some((track) => track.solo);
  const spans = project.clips
    .filter((clip) => {
      const track = trackById.get(clip.trackId);
      return (
        track !== undefined &&
        isVoiceoverTrack(track) &&
        track.duckOthers !== false &&
        isAudible(clip, track, anySolo)
      );
    })
    .map((clip) => ({ start: clip.start, end: clipEnd(clip) }))
    .sort((a, b) => a.start - b.start);

  const merged: DuckRange[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end + 2 * DUCK_RAMP_SECONDS) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/** The dip at timeline time `t`: 1 away from the voice, DUCKED_GAIN while it speaks, ramping in between. */
export function duckFactorAt(ranges: DuckRange[], t: number): number {
  let factor = 1;
  for (const range of ranges) {
    const rampStart = range.start - DUCK_RAMP_SECONDS;
    const rampEnd = range.end + DUCK_RAMP_SECONDS;
    if (t <= rampStart || t >= rampEnd) continue;
    let depth: number;
    if (t < range.start) depth = (t - rampStart) / DUCK_RAMP_SECONDS;
    else if (t > range.end) depth = (rampEnd - t) / DUCK_RAMP_SECONDS;
    else depth = 1;
    factor = Math.min(factor, 1 - depth * (1 - DUCKED_GAIN));
  }
  return factor;
}

/** The timeline seconds within [from, to] where the dip changes slope, for drawing it as straight lines. */
export function duckBreakpoints(ranges: DuckRange[], from: number, to: number): number[] {
  const marks: number[] = [];
  for (const range of ranges) {
    for (const mark of [
      range.start - DUCK_RAMP_SECONDS,
      range.start,
      range.end,
      range.end + DUCK_RAMP_SECONDS,
    ]) {
      if (mark > from && mark < to) marks.push(mark);
    }
  }
  return marks;
}
