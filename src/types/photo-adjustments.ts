export type BlendMode =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion";

export type FilterPreset =
  | "none"
  | "vivid"
  | "mono"
  | "vintage"
  | "warm"
  | "cool"
  | "fade"
  | "noir";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShadowEffect {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

export interface GlowEffect {
  enabled: boolean;
  color: string;
  blur: number;
  opacity: number;
}

export interface PhotoAdjustments {
  crop: CropRect | null;
  flipHorizontal: boolean;
  flipVertical: boolean;

  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  highlights: number;
  shadowsTone: number;

  blur: number;
  sharpness: number;

  opacity: number;

  borderWidth: number;
  borderColor: string;
  borderRadius: number;

  shadow: ShadowEffect;
  glow: GlowEffect;

  blendMode: BlendMode;
  filterPreset: FilterPreset;

  aiBackgroundRemoved: boolean;
  aiObjectsRemoved: boolean;
}

export const DEFAULT_PHOTO_ADJUSTMENTS: PhotoAdjustments = {
  crop: null,
  flipHorizontal: false,
  flipVertical: false,

  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  highlights: 0,
  shadowsTone: 0,

  blur: 0,
  sharpness: 0,

  opacity: 100,

  borderWidth: 0,
  borderColor: "#ffffff",
  borderRadius: 0,

  shadow: {
    enabled: false,
    color: "#000000",
    blur: 12,
    offsetX: 0,
    offsetY: 6,
    opacity: 40,
  },
  glow: {
    enabled: false,
    color: "#8b5cf6",
    blur: 20,
    opacity: 60,
  },

  blendMode: "source-over",
  filterPreset: "none",

  aiBackgroundRemoved: false,
  aiObjectsRemoved: false,
};

export const FILTER_PRESETS: Record<
  FilterPreset,
  Partial<
    Pick<
      PhotoAdjustments,
      "brightness" | "contrast" | "saturation" | "exposure"
    >
  >
> = {
  none: {},
  vivid: { saturation: 35, contrast: 15, exposure: 5 },
  mono: { saturation: -100, contrast: 10 },
  vintage: { saturation: -25, contrast: -10, exposure: 8 },
  warm: { saturation: 10, exposure: 6 },
  cool: { saturation: -5, exposure: -4 },
  fade: { contrast: -20, exposure: 10, saturation: -15 },
  noir: { saturation: -100, contrast: 30, exposure: -10 },
};
