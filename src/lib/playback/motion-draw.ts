import type { DrawState } from "@/lib/playback/draw-state";
import type { ClipMotion } from "@/types/timeline";

/** How much bigger than normal a photo gets at the biggest point of its motion. */
export const MOTION_ZOOM = 1.15;

/**
 * A photo's position and size part-way through its motion; `progress` goes from
 * 0 at the start of the clip to 1 at its end. Zooms are about the centre; pans
 * keep the photo zoomed in a little so its edges never show.
 */
export function motionDraw(motion: ClipMotion, progress: number, draw: DrawState): DrawState {
  const p = Math.min(1, Math.max(0, progress));
  const extra = MOTION_ZOOM - 1;
  let scale = 1;
  let shift = 0; // in fractions of the picture's width, positive to the right
  switch (motion) {
    case "zoom-in":
      scale = 1 + extra * p;
      break;
    case "zoom-out":
      scale = MOTION_ZOOM - extra * p;
      break;
    case "pan-left":
      scale = MOTION_ZOOM;
      shift = extra / 2 - extra * p;
      break;
    case "pan-right":
      scale = MOTION_ZOOM;
      shift = -extra / 2 + extra * p;
      break;
  }
  const width = draw.width * scale;
  const height = draw.height * scale;
  const centreX = draw.x + draw.width / 2 + shift * draw.width;
  const centreY = draw.y + draw.height / 2;
  return { ...draw, x: centreX - width / 2, y: centreY - height / 2, width, height };
}
