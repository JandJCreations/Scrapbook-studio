import { clamp, clipDuration, clipEnd, EPS } from "@/lib/timeline/clip-math";
import { isClipLocked } from "@/lib/timeline/lookup";
import type { Clip, ClipTransition, TimelineProject, TransitionType } from "@/types/timeline";

export const TRANSITION_TYPES: Array<{ type: TransitionType; label: string }> = [
  { type: "fade", label: "Fade" },
  { type: "dip", label: "Dip to black" },
  { type: "slide-left", label: "Slide left" },
  { type: "slide-right", label: "Slide right" },
];

export const MIN_TRANSITION_SECONDS = 0.1;
export const MAX_TRANSITION_SECONDS = 2;
export const DEFAULT_TRANSITION_SECONDS = 0.6;

/** The clip that ends exactly where `clip` starts, on the same track: the one a transition leaves. */
export function previousClip(project: TimelineProject, clip: Clip): Clip | null {
  return (
    project.clips.find(
      (other) =>
        other.id !== clip.id && other.trackId === clip.trackId && Math.abs(clipEnd(other) - clip.start) <= EPS,
    ) ?? null
  );
}

export interface EffectiveTransition extends ClipTransition {
  outgoing: Clip;
}

/** A clip's transition as it will really play: it needs a previous clip, and cannot be longer than either clip. */
export function effectiveTransition(project: TimelineProject, clip: Clip): EffectiveTransition | null {
  if (!clip.transition) return null;
  const outgoing = previousClip(project, clip);
  if (!outgoing) return null;
  const longest = Math.min(MAX_TRANSITION_SECONDS, clipDuration(outgoing), clipDuration(clip));
  return {
    type: clip.transition.type,
    duration: clamp(clip.transition.duration, Math.min(MIN_TRANSITION_SECONDS, longest), longest),
    outgoing,
  };
}

export interface ActiveTransition {
  type: TransitionType;
  outgoing: Clip;
  incoming: Clip;
  /** 0 when it begins, 1 when the incoming clip takes over. */
  progress: number;
}

/**
 * Every transition playing at timeline time `t`: one per track at most, during
 * the last stretch of the outgoing clip, before the incoming clip starts. A
 * track that is hidden draws nothing, so its transitions are left out.
 */
export function activeTransitionsAt(project: TimelineProject, t: number): ActiveTransition[] {
  const hidden = new Set(project.tracks.filter((track) => track.hidden).map((track) => track.id));
  const active: ActiveTransition[] = [];
  for (const clip of project.clips) {
    if (hidden.has(clip.trackId)) continue;
    const effective = effectiveTransition(project, clip);
    if (!effective) continue;
    const begins = clip.start - effective.duration;
    if (t >= begins && t < clip.start) {
      active.push({
        type: effective.type,
        outgoing: effective.outgoing,
        incoming: clip,
        progress: (t - begins) / effective.duration,
      });
    }
  }
  return active;
}

/** The first transition playing at `t`, if any. */
export function activeTransitionAt(project: TimelineProject, t: number): ActiveTransition | null {
  return activeTransitionsAt(project, t)[0] ?? null;
}

/**
 * Puts the same transition (or with null, none) into every clip that has a clip
 * right before it. Locked clips and the first clip of a strip are left alone.
 * The same project comes back when nothing would change.
 */
export function setAllTransitions(project: TimelineProject, transition: ClipTransition | null): TimelineProject {
  let result = project;
  for (const clip of project.clips) {
    if (transition !== null && !previousClip(result, clip)) continue;
    result = setTransition(result, clip.id, transition);
  }
  return result;
}

/**
 * The clip as its sound should be heard: while a transition plays, the sound of
 * the clip leaving fades out and the sound of the clip arriving fades in, over
 * the length of the transition (a longer fade the user set is kept). The picture
 * is untouched; the clip itself comes back when no transition touches it.
 */
export function audioClipFor(project: TimelineProject, clip: Clip): Clip {
  let fadeIn = clip.fadeIn;
  let fadeOut = clip.fadeOut;
  const own = effectiveTransition(project, clip);
  if (own) fadeIn = Math.max(fadeIn, own.duration);
  for (const other of project.clips) {
    if (other.trackId !== clip.trackId || other.id === clip.id) continue;
    const next = effectiveTransition(project, other);
    if (next && next.outgoing.id === clip.id) fadeOut = Math.max(fadeOut, next.duration);
  }
  return fadeIn === clip.fadeIn && fadeOut === clip.fadeOut ? clip : { ...clip, fadeIn, fadeOut };
}

/**
 * Sets (or with null, removes) the transition into a clip. It needs a previous
 * clip to leave; the duration is clamped into the allowed range. The same
 * project comes back when nothing would change.
 */
export function setTransition(
  project: TimelineProject,
  clipId: string,
  transition: ClipTransition | null,
): TimelineProject {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip || isClipLocked(project, clip)) return project;
  const next =
    transition === null
      ? null
      : { type: transition.type, duration: clamp(transition.duration, MIN_TRANSITION_SECONDS, MAX_TRANSITION_SECONDS) };
  if (next !== null && !previousClip(project, clip)) return project;
  const current = clip.transition ?? null;
  if (JSON.stringify(current) === JSON.stringify(next)) return project;
  return { ...project, clips: project.clips.map((c) => (c.id === clipId ? { ...c, transition: next } : c)) };
}
