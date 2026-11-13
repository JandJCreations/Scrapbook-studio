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

export type AnimationInType =
  | "fade"
  | "pop"
  | "rise"
  | "slide-right"
  | "drop"
  | "zoom"
  | "spin"
  | "typewriter";

export type AnimationOutType = "fade" | "shrink" | "sink" | "slide-left" | "fly-up" | "spin";

export interface AnimationSpec<T extends string> {
  type: T;
  /** Seconds. */
  duration: number;
}

export type MotionType =
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "float"
  | "pulse"
  | "shake";

export interface ObjectExtras {
  /**
   * Part of the main story track: plays in sequence with the other story
   * clips (laid end to end automatically) instead of floating freely on
   * the timeline.
   */
  inStory?: boolean;
  /** How this story clip comes in from the clip before it. */
  transitionIn?: TransitionSpec;
  /** One-tap entrance animation (titles, stickers, photos...). */
  animIn?: AnimationSpec<AnimationInType>;
  /** One-tap exit animation. */
  animOut?: AnimationSpec<AnimationOutType>;
  /**
   * Movement for the whole time the object is on screen: a slow zoom/pan
   * across a photo (the classic documentary look), or a playful float,
   * pulse or shake.
   */
  motion?: MotionType;
}

export const EMPTY_EXTRAS: ObjectExtras = {};
