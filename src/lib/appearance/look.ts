import type { Clip } from "@/types/timeline";
import {
  FILTER_PRESETS,
  type CropRect,
  type GlowEffect,
  type PhotoAdjustments,
  type ShadowEffect,
} from "@/types/photo-adjustments";

/** How the painter should dress a picture or video clip. */
export interface Look {
  /** A canvas `filter` value without the blur; "none" when there is nothing to apply. */
  filter: string;
  /** Blur radius in frame units; the painter scales it to the picture it blurs. */
  blurPx: number;
  /** The part of the file to show, in the file's own pixels; null shows all of it. */
  crop: CropRect | null;
  flipX: boolean;
  flipY: boolean;
  border: { width: number; color: string; radius: number };
  shadow: ShadowEffect | null;
  glow: GlowEffect | null;
}

const round = (n: number) => Number(n.toFixed(4));
const factor = (percent: number) => Math.max(0, round(1 + percent / 100));

interface Tone {
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  blur: number;
}

function filterFor(tone: Omit<Tone, "blur">): string {
  const parts: string[] = [];
  const brightness = factor(tone.brightness) * factor(tone.exposure);
  if (round(brightness) !== 1) parts.push(`brightness(${round(brightness)})`);
  if (tone.contrast !== 0) parts.push(`contrast(${factor(tone.contrast)})`);
  if (tone.saturation !== 0) parts.push(`saturate(${factor(tone.saturation)})`);
  return parts.length > 0 ? parts.join(" ") : "none";
}

function photoLook(adj: PhotoAdjustments): Look {
  const preset = FILTER_PRESETS[adj.filterPreset];
  return {
    filter: filterFor({
      brightness: adj.brightness + (preset.brightness ?? 0),
      contrast: adj.contrast + (preset.contrast ?? 0),
      saturation: adj.saturation + (preset.saturation ?? 0),
      exposure: adj.exposure + (preset.exposure ?? 0),
    }),
    blurPx: adj.blur,
    crop: adj.crop,
    flipX: adj.flipHorizontal,
    flipY: adj.flipVertical,
    border: { width: adj.borderWidth, color: adj.borderColor, radius: adj.borderRadius },
    shadow: adj.shadow.enabled ? adj.shadow : null,
    glow: adj.glow.enabled ? adj.glow : null,
  };
}

function isNeutral(look: Look): boolean {
  return (
    look.filter === "none" &&
    look.blurPx === 0 &&
    look.crop === null &&
    !look.flipX &&
    !look.flipY &&
    look.border.width === 0 &&
    look.border.radius === 0 &&
    look.shadow === null &&
    look.glow === null
  );
}

/**
 * The look of a picture or video clip, or null when it has none (other kinds,
 * no adjustments, or adjustments that change nothing) so the painter can skip
 * all the extra work.
 */
export function lookFor(clip: Clip): Look | null {
  let look: Look | null = null;
  if (clip.kind === "image" && clip.adjustments.photo) {
    look = photoLook(clip.adjustments.photo);
  } else if (clip.kind === "video" && clip.adjustments.video) {
    const adj = clip.adjustments.video;
    look = {
      filter: filterFor({
        brightness: adj.brightness,
        contrast: adj.contrast,
        saturation: adj.saturation,
        exposure: 0,
      }),
      blurPx: adj.blur,
      crop: adj.crop,
      flipX: false,
      flipY: false,
      border: { width: 0, color: "#ffffff", radius: 0 },
      shadow: adj.shadow.enabled ? adj.shadow : null,
      glow: null,
    };
  }
  return look && !isNeutral(look) ? look : null;
}
