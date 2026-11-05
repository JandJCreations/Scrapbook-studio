import { FILTER_PRESETS, type FilterPreset, type PhotoAdjustments } from "@/types/photo-adjustments";
import type { VideoAdjustments } from "@/types/video-adjustments";

const LABELS: Record<FilterPreset, string> = {
  none: "None",
  vivid: "Vivid",
  mono: "Mono",
  vintage: "Vintage",
  warm: "Warm",
  cool: "Cool",
  fade: "Fade",
  noir: "Noir",
};

/** The filters to show in the gallery, in order, starting with none. */
export const FILTER_LIST: Array<{ preset: FilterPreset; label: string }> = (Object.keys(FILTER_PRESETS) as FilterPreset[]).map(
  (preset) => ({ preset, label: LABELS[preset] }),
);

/** A preset as the three sliders of a video (which has no exposure or preset of its own). */
export function videoLookForPreset(
  preset: FilterPreset,
): Pick<VideoAdjustments, "brightness" | "contrast" | "saturation"> {
  const p: Partial<Pick<PhotoAdjustments, "brightness" | "contrast" | "saturation" | "exposure">> = FILTER_PRESETS[preset];
  return {
    brightness: (p.brightness ?? 0) + (p.exposure ?? 0),
    contrast: p.contrast ?? 0,
    saturation: p.saturation ?? 0,
  };
}
