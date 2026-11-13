import type { DrawState } from "@/lib/playback/draw-state";
import type { TransitionType } from "@/types/timeline";

/**
 * How a clip is drawn while a transition plays: `out` is the clip leaving (drawn
 * on top), `in` the clip arriving (drawn underneath). `progress` goes from 0
 * to 1; `frameWidth` is how far a slide has to travel to be off the frame.
 */
export function transitionDraw(
  role: "in" | "out",
  type: TransitionType,
  progress: number,
  draw: DrawState,
  frameWidth: number,
): DrawState {
  const p = Math.min(1, Math.max(0, progress));
  switch (type) {
    case "fade":
      return role === "out" ? { ...draw, opacity: draw.opacity * (1 - p) } : draw;
    case "dip":
      return role === "out"
        ? { ...draw, opacity: draw.opacity * Math.max(0, 1 - 2 * p) }
        : { ...draw, opacity: draw.opacity * Math.max(0, 2 * p - 1) };
    case "slide-left":
      return role === "out" ? { ...draw, x: draw.x - p * frameWidth } : { ...draw, x: draw.x + (1 - p) * frameWidth };
    case "slide-right":
      return role === "out" ? { ...draw, x: draw.x + p * frameWidth } : { ...draw, x: draw.x - (1 - p) * frameWidth };
  }
}
