import type { CanvasObject } from "@/types/canvas";
import type { InterpolatedTransform } from "@/types/keyframe";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function getInterpolatedTransform(
  object: CanvasObject,
  playheadTime: number,
): InterpolatedTransform {
  const base: InterpolatedTransform = {
    x: object.x,
    y: object.y,
    rotation: object.rotation,
    opacity: 1,
  };

  if (object.keyframes.length > 0) {
    const sorted = [...object.keyframes].sort((a, b) => a.time - b.time);

    if (playheadTime <= sorted[0].time) {
      base.x = sorted[0].x;
      base.y = sorted[0].y;
      base.rotation = sorted[0].rotation;
      base.opacity = sorted[0].opacity;
    } else if (playheadTime >= sorted[sorted.length - 1].time) {
      const last = sorted[sorted.length - 1];
      base.x = last.x;
      base.y = last.y;
      base.rotation = last.rotation;
      base.opacity = last.opacity;
    } else {
      let prev = sorted[0];
      let next = sorted[sorted.length - 1];
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].time <= playheadTime && sorted[i + 1].time >= playheadTime) {
          prev = sorted[i];
          next = sorted[i + 1];
          break;
        }
      }
      const span = next.time - prev.time;
      const t = span > 0 ? (playheadTime - prev.time) / span : 0;
      base.x = lerp(prev.x, next.x, t);
      base.y = lerp(prev.y, next.y, t);
      base.rotation = lerp(prev.rotation, next.rotation, t);
      base.opacity = lerp(prev.opacity, next.opacity, t);
    }
  }

  const relativeStart = playheadTime - object.startTime;
  const relativeEnd = object.endTime - playheadTime;
  let fadeMultiplier = 1;
  if (object.fadeIn > 0 && relativeStart < object.fadeIn) {
    fadeMultiplier *= Math.max(0, relativeStart / object.fadeIn);
  }
  if (object.fadeOut > 0 && relativeEnd < object.fadeOut) {
    fadeMultiplier *= Math.max(0, relativeEnd / object.fadeOut);
  }
  base.opacity *= fadeMultiplier;

  return base;
}

export function isObjectVisibleAt(object: CanvasObject, playheadTime: number) {
  return playheadTime >= object.startTime && playheadTime <= object.endTime;
}
