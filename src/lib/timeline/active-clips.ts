import { clipDuration, clipEnd } from "@/lib/timeline/clip-math";
import type { Clip, TimelineProject, Track } from "@/types/timeline";

export interface ActiveClip {
  clip: Clip;
  track: Track;
  /** Seconds since the clip started, in timeline time. */
  localTime: number;
  /** Position to read from the source media, in source seconds. */
  sourceTime: number;
  visible: boolean;
  audible: boolean;
}

/**
 * Whether a clip contributes sound: only video and audio clips, not muted, on
 * a track that is not muted and, if any track is soloed, is itself soloed.
 */
export function isAudible(clip: Clip, track: Track, anySolo: boolean): boolean {
  const hasSound = clip.kind === "video" || clip.kind === "audio";
  return hasSound && !clip.muted && !track.muted && (!anySolo || track.solo);
}

/**
 * Every clip playing at timeline time `t`, in paint order: highest track
 * `order` first, so the top overlay is painted last. A clip covers
 * [start, end), so at an exact cut the next clip owns the instant.
 */
export function activeClipsAt(project: TimelineProject, t: number): ActiveClip[] {
  const trackById = new Map(project.tracks.map((track) => [track.id, track]));
  const anySolo = project.tracks.some((track) => track.solo);

  const active: ActiveClip[] = [];
  for (const clip of project.clips) {
    const track = trackById.get(clip.trackId);
    if (!track) continue;
    if (t < clip.start || t >= clipEnd(clip)) continue;

    const localTime = t - clip.start;
    const sourceTime = clip.reversed
      ? clip.sourceOut - localTime * clip.speed
      : clip.sourceIn + localTime * clip.speed;

    active.push({
      clip,
      track,
      localTime,
      sourceTime,
      visible: !track.hidden,
      audible: isAudible(clip, track, anySolo),
    });
  }

  return active.sort(
    (a, b) => b.track.order - a.track.order || a.clip.start - b.clip.start,
  );
}

/** Linear gain for a clip at `localTime`: volume times the fade ramps, never below 0. */
export function clipGainAt(clip: Clip, localTime: number): number {
  let gain = clip.volume / 100;
  if (clip.fadeIn > 0 && localTime < clip.fadeIn) {
    gain *= Math.max(0, localTime) / clip.fadeIn;
  }
  const remaining = clipDuration(clip) - localTime;
  if (clip.fadeOut > 0 && remaining < clip.fadeOut) {
    gain *= Math.max(0, remaining) / clip.fadeOut;
  }
  return Math.max(0, gain);
}
