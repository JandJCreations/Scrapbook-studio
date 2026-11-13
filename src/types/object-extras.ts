/**
 * Newer, optional per-object settings. Everything here is optional so older
 * saved projects (which have no extras) load unchanged. Stored in the
 * `canvas_objects.extras` jsonb column.
 */
export type TransitionType =
  | "crossfade"
  | "fade-through"
  | "slide-left"
  | "slide-up"
  | "zoom"
  | "page-flip"
  | "drop-in";

export interface TransitionSpec {
  type: TransitionType;
  /** Seconds the two clips overlap for. */
  duration: number;
}

export interface ObjectExtras {
  /**
   * Part of the main story track: plays in sequence with the other story
   * clips (laid end to end automatically) instead of floating freely on
   * the timeline.
   */
  inStory?: boolean;
  /** How this story clip comes in from the clip before it. */
  transitionIn?: TransitionSpec;
}

export const EMPTY_EXTRAS: ObjectExtras = {};
