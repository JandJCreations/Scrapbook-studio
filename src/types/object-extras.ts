/**
 * Newer, optional per-object settings. Everything here is optional so older
 * saved projects (which have no extras) load unchanged. Stored in the
 * `canvas_objects.extras` jsonb column.
 */
export interface ObjectExtras {
  /**
   * Part of the main story track: plays in sequence with the other story
   * clips (laid end to end automatically) instead of floating freely on
   * the timeline.
   */
  inStory?: boolean;
}

export const EMPTY_EXTRAS: ObjectExtras = {};
