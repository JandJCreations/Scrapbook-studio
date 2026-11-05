import type * as React from "react";

/**
 * After a mouse click on a button, lets go of its focus. Space is the play key
 * of the timeline, but a focused button keeps Space for itself, so without
 * this a click on "Add" would make the next Space press add again. A keyboard
 * activation (detail 0) keeps focus, so keyboard users do not lose their place.
 */
export function blurOnMouseClick(event: React.MouseEvent<HTMLElement>): void {
  if (event.detail === 0) return;
  (event.target as HTMLElement).closest("button")?.blur();
}
