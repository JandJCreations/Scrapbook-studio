import type { ClipTransitions, TransitionWindow } from "@/lib/story/story";
import type { TransitionType } from "@/types/object-extras";

/**
 * A temporary visual change layered on top of an object's normal position —
 * used by story transitions (and text animations). Offsets are in canvas
 * units; scale is applied around `origin`.
 */
export interface VisualEffect {
  dx: number;
  dy: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  origin: "center" | "left";
}

export const NO_EFFECT: VisualEffect = {
  dx: 0,
  dy: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  origin: "center",
};

export function combineEffects(a: VisualEffect, b: VisualEffect): VisualEffect {
  return {
    dx: a.dx + b.dx,
    dy: a.dy + b.dy,
    scaleX: a.scaleX * b.scaleX,
    scaleY: a.scaleY * b.scaleY,
    rotation: a.rotation + b.rotation,
    opacity: a.opacity * b.opacity,
    origin: b.origin !== "center" ? b.origin : a.origin,
  };
}

export const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function progress(window: TransitionWindow, time: number): number | null {
  if (time < window.start || time > window.end) return null;
  const span = window.end - window.start;
  return span > 0 ? (time - window.start) / span : 1;
}

/**
 * What a transition does to the clip coming in (`phase: "in"`, p goes 0→1 as
 * it arrives) or the clip going out (`phase: "out"`, p goes 0→1 as it leaves).
 */
export function transitionEffect(
  type: TransitionType,
  phase: "in" | "out",
  p: number,
  frame: { width: number; height: number },
): VisualEffect {
  const e = easeInOut(p);
  switch (type) {
    case "crossfade":
      return { ...NO_EFFECT, opacity: phase === "in" ? e : 1 - e };
    case "fade-through":
      // Out fades away over the first half, in fades up over the second, so
      // there's a beat of the background in the middle.
      return phase === "out"
        ? { ...NO_EFFECT, opacity: Math.max(0, 1 - p * 2) }
        : { ...NO_EFFECT, opacity: Math.max(0, p * 2 - 1) };
    case "slide-left":
      return phase === "in"
        ? { ...NO_EFFECT, dx: (1 - e) * frame.width }
        : { ...NO_EFFECT, dx: -e * frame.width };
    case "slide-up":
      return phase === "in"
        ? { ...NO_EFFECT, dy: (1 - e) * frame.height }
        : { ...NO_EFFECT, dy: -e * frame.height };
    case "zoom":
      return phase === "in"
        ? { ...NO_EFFECT, scaleX: 1.25 - 0.25 * e, scaleY: 1.25 - 0.25 * e, opacity: e }
        : { ...NO_EFFECT, scaleX: 1 + 0.1 * e, scaleY: 1 + 0.1 * e, opacity: 1 - e };
    case "page-flip": {
      // Like turning a scrapbook page: the old page folds shut toward its
      // spine (left edge), then the new one unfolds from it.
      if (phase === "out") {
        const s = Math.max(0, 1 - easeInOut(Math.min(1, p * 2)));
        return { ...NO_EFFECT, scaleX: Math.max(0.001, s), origin: "left", opacity: p < 0.5 ? 1 : 0 };
      }
      const s = p < 0.5 ? 0 : easeInOut((p - 0.5) * 2);
      return { ...NO_EFFECT, scaleX: Math.max(0.001, s), origin: "left", opacity: p < 0.5 ? 0 : 1 };
    }
    case "drop-in": {
      // A photo dropped onto the page: falls in from above with a little
      // tilt that settles. The outgoing clip stays put underneath.
      if (phase === "out") return NO_EFFECT;
      const d = easeOut(p);
      return {
        ...NO_EFFECT,
        dy: -(1 - d) * frame.height * 0.6,
        rotation: -8 * (1 - d),
        opacity: Math.min(1, p * 3),
      };
    }
  }
}

export function clipTransitionEffect(
  windows: ClipTransitions | undefined,
  time: number,
  frame: { width: number; height: number },
): VisualEffect {
  if (!windows) return NO_EFFECT;
  let effect = NO_EFFECT;
  if (windows.in) {
    const p = progress(windows.in, time);
    if (p !== null) effect = combineEffects(effect, transitionEffect(windows.in.type, "in", p, frame));
  }
  if (windows.out) {
    const p = progress(windows.out, time);
    if (p !== null) effect = combineEffects(effect, transitionEffect(windows.out.type, "out", p, frame));
  }
  return effect;
}

/**
 * Konva node props for an object drawn at (x, y) with size (w, h) once an
 * effect is applied — scale is expressed around the effect's origin by
 * shifting the top-left corner.
 */
export function effectNodeProps(
  base: { x: number; y: number; rotation: number; opacity: number },
  size: { width: number; height: number },
  effect: VisualEffect,
) {
  const shiftX =
    effect.origin === "center" ? (size.width * (1 - effect.scaleX)) / 2 : 0;
  const shiftY = (size.height * (1 - effect.scaleY)) / 2;
  return {
    x: base.x + effect.dx + shiftX,
    y: base.y + effect.dy + shiftY,
    rotation: base.rotation + effect.rotation,
    opacity: base.opacity * effect.opacity,
    scaleX: effect.scaleX,
    scaleY: effect.scaleY,
  };
}

export const TRANSITION_OPTIONS: { type: TransitionType; label: string }[] = [
  { type: "crossfade", label: "Crossfade" },
  { type: "fade-through", label: "Fade through" },
  { type: "slide-left", label: "Slide" },
  { type: "slide-up", label: "Push up" },
  { type: "zoom", label: "Zoom" },
  { type: "page-flip", label: "Page flip" },
  { type: "drop-in", label: "Photo drop" },
];

export const TRANSITION_LENGTHS = [
  { seconds: 0.4, label: "Quick" },
  { seconds: 0.8, label: "Medium" },
  { seconds: 1.4, label: "Slow" },
];
