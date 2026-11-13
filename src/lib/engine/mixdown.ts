import { clipGainAt, isAudible } from "@/lib/timeline/active-clips";
import { clipDuration, projectDuration } from "@/lib/timeline/clip-math";
import { duckBreakpoints, duckFactorAt, duckingRanges, isVoiceoverTrack, type DuckRange } from "@/lib/timeline/ducking";
import { audioClipFor } from "@/lib/timeline/transitions";
import type { Clip, TimelineProject } from "@/types/timeline";

/** Absolute timeline seconds; linear between points. */
export interface GainPoint {
  time: number;
  value: number;
}

export interface MixdownItem {
  clipId: string;
  mediaId: string;
  /** Timeline second at which playback of this clip begins. */
  startAt: number;
  /** The span of the source file to play, in source seconds. */
  sourceIn: number;
  sourceOut: number;
  /** The glue plays the span at this rate, so it lasts (out - in) / rate. */
  playbackRate: number;
  /** The glue reverses the samples of the span. */
  reversed: boolean;
  gainPoints: GainPoint[];
}

export interface MixdownPlan {
  duration: number;
  items: MixdownItem[];
}

const OVERLAP_SAMPLES = 32;

/**
 * The clip's gain over time as breakpoints. With non-overlapping fades the
 * envelope is exactly piecewise-linear. Overlapping fades multiply into a
 * curve, so that case is sampled evenly across the clip.
 */
export function gainEnvelope(clip: Clip): GainPoint[] {
  const duration = clipDuration(clip);

  let locals: number[];
  if (clip.fadeIn + clip.fadeOut > duration) {
    locals = Array.from({ length: OVERLAP_SAMPLES }, (_, i) =>
      i === OVERLAP_SAMPLES - 1 ? duration : (duration * i) / (OVERLAP_SAMPLES - 1),
    );
  } else {
    const marks = new Set<number>([0, duration]);
    if (clip.fadeIn > 0) marks.add(clip.fadeIn);
    if (clip.fadeOut > 0) marks.add(duration - clip.fadeOut);
    locals = Array.from(marks).sort((a, b) => a - b);
  }

  return locals.map((local) => ({ time: clip.start + local, value: clipGainAt(clip, local) }));
}

/**
 * The clip's envelope with the voiceover dip multiplied in. Both curves are
 * straight between their own breakpoints, so the product is sampled at every
 * breakpoint of either, plus a midpoint in each span to follow the bend.
 */
export function duckedEnvelope(clip: Clip, ranges: DuckRange[]): GainPoint[] {
  const base = gainEnvelope(clip);
  const from = base[0].time;
  const to = base[base.length - 1].time;
  const marks = duckBreakpoints(ranges, from, to);
  if (marks.length === 0 && duckFactorAt(ranges, (from + to) / 2) === 1) return base;

  const times = Array.from(new Set([...base.map((p) => p.time), ...marks])).sort((a, b) => a - b);
  const withMid: number[] = [];
  times.forEach((time, i) => {
    if (i > 0) withMid.push((times[i - 1] + time) / 2);
    withMid.push(time);
  });
  return withMid.map((time) => ({
    time,
    value: clipGainAt(clip, time - clip.start) * duckFactorAt(ranges, time),
  }));
}

/** Everything an offline renderer needs to mix the project's sound for export. */
export function planMixdown(project: TimelineProject): MixdownPlan {
  const trackById = new Map(project.tracks.map((track) => [track.id, track]));
  const anySolo = project.tracks.some((track) => track.solo);
  const ducking = duckingRanges(project);

  const items = project.clips
    .filter((clip) => {
      const track = trackById.get(clip.trackId);
      return track !== undefined && isAudible(clip, track, anySolo);
    })
    .map(
      (clip): MixdownItem => ({
        clipId: clip.id,
        mediaId: clip.mediaId,
        startAt: clip.start,
        sourceIn: clip.sourceIn,
        sourceOut: clip.sourceOut,
        playbackRate: clip.speed,
        reversed: clip.reversed,
        gainPoints: isVoiceoverTrack(trackById.get(clip.trackId))
          ? gainEnvelope(audioClipFor(project, clip))
          : duckedEnvelope(audioClipFor(project, clip), ducking),
      }),
    )
    .sort((a, b) => a.startAt - b.startAt || a.clipId.localeCompare(b.clipId));

  return { duration: projectDuration(project), items };
}
