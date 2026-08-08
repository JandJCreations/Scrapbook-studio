import type { CropRect, ShadowEffect } from "@/types/photo-adjustments";

export interface VideoAdjustments {
  duration: number;
  trimStart: number;
  trimEnd: number;
  crop: CropRect | null;

  playbackRate: number;
  reversed: boolean;
  loop: boolean;

  volume: number;
  muted: boolean;

  opacity: number;
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;

  shadow: ShadowEffect;
}

export function createDefaultVideoAdjustments(duration: number): VideoAdjustments {
  return {
    duration,
    trimStart: 0,
    trimEnd: duration,
    crop: null,

    playbackRate: 1,
    reversed: false,
    loop: false,

    volume: 100,
    muted: false,

    opacity: 100,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    blur: 0,

    shadow: {
      enabled: false,
      color: "#000000",
      blur: 12,
      offsetX: 0,
      offsetY: 6,
      opacity: 40,
    },
  };
}
