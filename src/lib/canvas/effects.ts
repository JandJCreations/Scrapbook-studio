import type { ClipTransitions, TransitionWindow } from "@/lib/story/story";
import type { CanvasObject } from "@/types/canvas";
import type {
  AnimationInType,
  AnimationOutType,
  MotionType,
  TransitionType,
} from "@/types/object-extras";

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
  /** For text: how much of it is typed out so far (0–1). */
  reveal?: number;
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
    reveal:
      a.reveal === undefined && b.reveal === undefined
        ? undefined
        : (a.reveal ?? 1) * (b.reveal ?? 1),
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

const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const easeOutBounce = (t: number) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

/** Entrance animation; p goes 0→1 as the object arrives. */
export function animationInEffect(
  type: AnimationInType,
  p: number,
  size: { width: number; height: number },
): VisualEffect {
  switch (type) {
    case "fade":
      return { ...NO_EFFECT, opacity: easeOut(p) };
    case "pop": {
      const s = Math.max(0.001, easeOutBack(p));
      return { ...NO_EFFECT, scaleX: s, scaleY: s, opacity: Math.min(1, p * 4) };
    }
    case "rise":
      return { ...NO_EFFECT, dy: (1 - easeOut(p)) * size.height * 0.6, opacity: easeOut(p) };
    case "slide-right":
      return { ...NO_EFFECT, dx: -(1 - easeOut(p)) * size.width * 0.8, opacity: easeOut(p) };
    case "drop":
      return { ...NO_EFFECT, dy: -(1 - easeOutBounce(p)) * size.height * 1.2, opacity: Math.min(1, p * 5) };
    case "zoom": {
      const s = 2 - easeOut(p);
      return { ...NO_EFFECT, scaleX: s, scaleY: s, opacity: easeOut(p) };
    }
    case "spin": {
      const s = Math.max(0.001, easeOut(p));
      return { ...NO_EFFECT, rotation: -180 * (1 - easeOut(p)), scaleX: s, scaleY: s, opacity: Math.min(1, p * 3) };
    }
    case "typewriter":
      return { ...NO_EFFECT, reveal: p };
  }
}

/** Exit animation; p goes 0→1 as the object leaves. */
export function animationOutEffect(
  type: AnimationOutType,
  p: number,
  size: { width: number; height: number },
): VisualEffect {
  const e = easeInOut(p);
  switch (type) {
    case "fade":
      return { ...NO_EFFECT, opacity: 1 - e };
    case "shrink": {
      const s = Math.max(0.001, 1 - e);
      return { ...NO_EFFECT, scaleX: s, scaleY: s };
    }
    case "sink":
      return { ...NO_EFFECT, dy: e * size.height * 0.6, opacity: 1 - e };
    case "slide-left":
      return { ...NO_EFFECT, dx: -e * size.width * 0.8, opacity: 1 - e };
    case "fly-up":
      return { ...NO_EFFECT, dy: -e * size.height * 1.5, opacity: 1 - e };
    case "spin": {
      const s = Math.max(0.001, 1 - e);
      return { ...NO_EFFECT, rotation: 180 * e, scaleX: s, scaleY: s, opacity: 1 - e };
    }
  }
}

/** The entrance/exit animation (if any) for an object at `time`. */
export function objectAnimationEffect(object: CanvasObject, time: number): VisualEffect {
  const { animIn, animOut } = object.extras ?? {};
  if (!animIn && !animOut) return NO_EFFECT;
  const length = object.endTime - object.startTime;
  let effect = NO_EFFECT;
  if (animIn && animIn.duration > 0) {
    const d = Math.min(animIn.duration, length);
    const p = (time - object.startTime) / d;
    if (p >= 0 && p < 1) effect = combineEffects(effect, animationInEffect(animIn.type, p, object));
  }
  if (animOut && animOut.duration > 0) {
    const d = Math.min(animOut.duration, length);
    const p = 1 - (object.endTime - time) / d;
    if (p > 0 && p <= 1) effect = combineEffects(effect, animationOutEffect(animOut.type, p, object));
  }
  return effect;
}

export const ANIMATION_IN_OPTIONS: { type: AnimationInType; label: string; textOnly?: boolean }[] = [
  { type: "fade", label: "Fade in" },
  { type: "pop", label: "Pop" },
  { type: "rise", label: "Rise" },
  { type: "slide-right", label: "Slide in" },
  { type: "drop", label: "Bounce drop" },
  { type: "zoom", label: "Zoom in" },
  { type: "spin", label: "Spin in" },
  { type: "typewriter", label: "Typewriter", textOnly: true },
];

export const ANIMATION_OUT_OPTIONS: { type: AnimationOutType; label: string }[] = [
  { type: "fade", label: "Fade out" },
  { type: "shrink", label: "Shrink" },
  { type: "sink", label: "Sink" },
  { type: "slide-left", label: "Slide out" },
  { type: "fly-up", label: "Fly up" },
  { type: "spin", label: "Spin out" },
];

/** Continuous movement across the object's whole time on screen. */
export function objectMotionEffect(object: CanvasObject, time: number): VisualEffect {
  const motion: MotionType | undefined = object.extras?.motion;
  if (!motion) return NO_EFFECT;
  const length = object.endTime - object.startTime;
  if (length <= 0 || time < object.startTime || time > object.endTime) return NO_EFFECT;
  const elapsed = time - object.startTime;
  const p = elapsed / length;
  switch (motion) {
    case "zoom-in": {
      const s = 1 + 0.15 * p;
      return { ...NO_EFFECT, scaleX: s, scaleY: s };
    }
    case "zoom-out": {
      const s = 1.15 - 0.15 * p;
      return { ...NO_EFFECT, scaleX: s, scaleY: s };
    }
    case "pan-left":
      // Slightly enlarged so the pan never reveals an edge.
      return { ...NO_EFFECT, scaleX: 1.12, scaleY: 1.12, dx: object.width * 0.05 * (1 - 2 * p) };
    case "pan-right":
      return { ...NO_EFFECT, scaleX: 1.12, scaleY: 1.12, dx: -object.width * 0.05 * (1 - 2 * p) };
    case "float":
      return { ...NO_EFFECT, dy: Math.sin(elapsed * 2) * object.height * 0.03, rotation: Math.sin(elapsed * 1.3) * 1.5 };
    case "pulse": {
      const s = 1 + 0.04 * Math.max(0, Math.sin(elapsed * Math.PI * 2));
      return { ...NO_EFFECT, scaleX: s, scaleY: s };
    }
    case "shake": {
      const a = object.width * 0.01;
      return { ...NO_EFFECT, dx: Math.sin(elapsed * 47) * a, dy: Math.cos(elapsed * 53) * a, rotation: Math.sin(elapsed * 31) * 0.8 };
    }
  }
}

export const MOTION_OPTIONS: { type: MotionType; label: string; hint: string }[] = [
  { type: "zoom-in", label: "Slow zoom in", hint: "Gently pushes in over the clip" },
  { type: "zoom-out", label: "Slow zoom out", hint: "Starts close and eases back" },
  { type: "pan-left", label: "Pan left", hint: "Drifts across from right to left" },
  { type: "pan-right", label: "Pan right", hint: "Drifts across from left to right" },
  { type: "float", label: "Float", hint: "Bobs gently, like it's on water" },
  { type: "pulse", label: "Pulse", hint: "A soft heartbeat, once a second" },
  { type: "shake", label: "Shake", hint: "Handheld jitter for energy" },
];
