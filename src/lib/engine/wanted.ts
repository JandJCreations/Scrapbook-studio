import { activeClipsAt, clipGainAt, isAudible } from "@/lib/timeline/active-clips";
import { clipEnd } from "@/lib/timeline/clip-math";
import type { Clip, TimelineProject } from "@/types/timeline";

export const LOOKAHEAD_SECONDS = 1.0;
const CONTINUATION_TOLERANCE = 1e-6;

export type MediaElementKind = "video" | "audio";

export interface WantedMedia {
  clipId: string;
  mediaId: string;
  kind: MediaElementKind;
  /** false = prepare early (assigned and positioned, not yet playing). */
  active: boolean;
  /** Position to be at in the source file, in seconds. */
  targetTime: number;
  playbackRate: number;
  reversed: boolean;
  shouldPlay: boolean;
  gain: number;
}

/** Only video and audio clips use media elements; a video needs one to be seen or heard. */
function needsElement(clip: Clip, visible: boolean, audible: boolean): boolean {
  if (clip.kind === "video") return visible || audible;
  if (clip.kind === "audio") return audible;
  return false;
}

/**
 * True when `next` picks up exactly where `prev` ends: same file, speed and
 * direction, starting where `prev` stops on the timeline and in the source.
 * `prev`'s element can then simply keep going; no second element, seek or
 * reload is needed at the cut (the halves of a split are the typical case).
 */
export function isContinuation(prev: Clip, next: Clip): boolean {
  if (prev.mediaId !== next.mediaId || prev.kind !== next.kind) return false;
  if (prev.speed !== next.speed || prev.reversed !== next.reversed) return false;
  if (Math.abs(clipEnd(prev) - next.start) > CONTINUATION_TOLERANCE) return false;
  const sourceGap = prev.reversed
    ? prev.sourceIn - next.sourceOut
    : next.sourceIn - prev.sourceOut;
  return Math.abs(sourceGap) <= CONTINUATION_TOLERANCE;
}

/**
 * The media each clip needs at time `t`. Active clips come first, then (only
 * while playing) clips starting within LOOKAHEAD_SECONDS, unless they
 * continue a clip that is already wanted.
 */
export function planWanted(
  project: TimelineProject,
  t: number,
  playing: boolean,
): WantedMedia[] {
  const wanted: WantedMedia[] = [];
  const chain: Clip[] = [];

  for (const a of activeClipsAt(project, t)) {
    if (!needsElement(a.clip, a.visible, a.audible)) continue;
    chain.push(a.clip);
    wanted.push({
      clipId: a.clip.id,
      mediaId: a.clip.mediaId,
      kind: a.clip.kind as MediaElementKind,
      active: true,
      targetTime: a.sourceTime,
      playbackRate: a.clip.speed,
      reversed: a.clip.reversed,
      shouldPlay: playing && !a.clip.reversed,
      // Browsers cannot play video backwards, so reversed clips are silent live.
      gain: a.audible && !a.clip.reversed ? clipGainAt(a.clip, a.localTime) : 0,
    });
  }

  if (!playing) return wanted;

  const trackById = new Map(project.tracks.map((track) => [track.id, track]));
  const anySolo = project.tracks.some((track) => track.solo);
  const upcoming = project.clips
    .filter((clip) => clip.start > t && clip.start <= t + LOOKAHEAD_SECONDS)
    .sort((a, b) => a.start - b.start);

  for (const clip of upcoming) {
    const track = trackById.get(clip.trackId);
    if (!track) continue;
    if (!needsElement(clip, !track.hidden, isAudible(clip, track, anySolo))) continue;

    const continues = chain.some((earlier) => isContinuation(earlier, clip));
    chain.push(clip);
    if (continues) continue;

    wanted.push({
      clipId: clip.id,
      mediaId: clip.mediaId,
      kind: clip.kind as MediaElementKind,
      active: false,
      targetTime: clip.reversed ? clip.sourceOut : clip.sourceIn,
      playbackRate: clip.speed,
      reversed: clip.reversed,
      shouldPlay: false,
      gain: 0,
    });
  }

  return wanted;
}
