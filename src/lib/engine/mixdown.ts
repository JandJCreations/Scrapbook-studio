import { clipGainAt, isAudible } from "@/lib/timeline/active-clips";
import { clipDuration, projectDuration } from "@/lib/timeline/clip-math";
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

/** Everything an offline renderer needs to mix the project's sound for export. */
export function planMixdown(project: TimelineProject): MixdownPlan {
  const trackById = new Map(project.tracks.map((track) => [track.id, track]));
  const anySolo = project.tracks.some((track) => track.solo);

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
        gainPoints: gainEnvelope(audioClipFor(project, clip)),
      }),
    )
    .sort((a, b) => a.startAt - b.startAt || a.clipId.localeCompare(b.clipId));

  return { duration: projectDuration(project), items };
}
