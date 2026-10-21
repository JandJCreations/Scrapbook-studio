import { fadeFactor } from "@/lib/timeline/active-clips";
import type { Keyframe } from "@/types/keyframe";
import type { Clip } from "@/types/timeline";

export interface DrawState {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** x, y, rotation and opacity from the keyframes at `localTime` (clip-relative). */
function keyframed(keyframes: Keyframe[], localTime: number) {
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (localTime <= first.time) return first;
  if (localTime >= last.time) return last;

  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    const span = to.time - from.time;
    if (localTime >= from.time && localTime <= to.time && span > 0) {
      const t = (localTime - from.time) / span;
      return {
        x: lerp(from.x, to.x, t),
        y: lerp(from.y, to.y, t),
        rotation: lerp(from.rotation, to.rotation, t),
        opacity: lerp(from.opacity, to.opacity, t),
      };
    }
  }
  return last;
}

/**
 * What to draw for a clip `localTime` seconds after it starts. Keyframe times
 * are relative to the clip start; when present they replace x, y, rotation
 * and opacity. Fades multiply into opacity.
 */
export function clipDrawState(clip: Clip, localTime: number): DrawState {
  const { transform } = clip;
  const base =
    clip.keyframes.length > 0
      ? keyframed(clip.keyframes, localTime)
      : {
          x: transform.x,
          y: transform.y,
          rotation: transform.rotation,
          opacity: transform.opacity,
        };

  return {
    x: base.x,
    y: base.y,
    width: transform.width,
    height: transform.height,
    rotation: base.rotation,
    opacity: base.opacity * fadeFactor(clip, localTime),
  };
}
