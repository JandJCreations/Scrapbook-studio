export interface AudioTrack {
  id: string;
  name: string;
  muted: boolean;
  solo: boolean;
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
