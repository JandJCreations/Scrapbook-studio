export interface AudioTrack {
  id: string;
  name: string;
  muted: boolean;
  solo: boolean;
  /** "voiceover" tracks hold recorded narration. */
  role?: "voiceover";
  /**
   * For voiceover tracks: turn every other track down while someone is
   * speaking (on by default).
   */
  duckOthers?: boolean;
}

export function isVoiceoverTrack(track: AudioTrack | undefined): boolean {
  return Boolean(track && (track.role === "voiceover" || track.name === "Voiceover"));
}

/** How far other audio drops while a voiceover is speaking. */
export const DUCKED_VOLUME = 0.3;
/** Seconds to ease the music down before / back up after speech. */
export const DUCK_RAMP_SECONDS = 0.35;

/**
 * Time ranges where a voiceover that ducks other audio is audible, merged
 * so overlapping/adjacent takes form one range.
 */
export function duckingRanges(
  clips: AudioClip[],
  tracks: AudioTrack[],
): { start: number; end: number }[] {
  const hasSolo = tracks.some((t) => t.solo);
  const ranges = clips
    .filter((c) => {
      const track = tracks.find((t) => t.id === c.trackId);
      return (
        isVoiceoverTrack(track) &&
        track!.duckOthers !== false &&
        !track!.muted &&
        (!hasSolo || track!.solo) &&
        !c.muted
      );
    })
    .map((c) => ({ start: c.startTime, end: c.startTime + clipDuration(c) }))
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end + DUCK_RAMP_SECONDS * 2) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

/** 1 normally, easing down to DUCKED_VOLUME around voiceover ranges. */
export function duckFactorAt(time: number, ranges: { start: number; end: number }[]): number {
  let factor = 1;
  for (const r of ranges) {
    let f = 1;
    if (time >= r.start && time <= r.end) f = DUCKED_VOLUME;
    else if (time < r.start && time > r.start - DUCK_RAMP_SECONDS)
      f = 1 - (1 - DUCKED_VOLUME) * (1 - (r.start - time) / DUCK_RAMP_SECONDS);
    else if (time > r.end && time < r.end + DUCK_RAMP_SECONDS)
      f = DUCKED_VOLUME + (1 - DUCKED_VOLUME) * ((time - r.end) / DUCK_RAMP_SECONDS);
    factor = Math.min(factor, f);
  }
  return factor;
}

export interface AudioClip {
  id: string;
  trackId: string;
  mediaId: string;
  src: string;
  name: string;

  startTime: number;
  trimStart: number;
  trimEnd: number;
  sourceDuration: number;

  volume: number;
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
  muted: boolean;

  waveformPeaks: number[] | null;
}

export function clipDuration(clip: AudioClip): number {
  return clip.trimEnd - clip.trimStart;
}
