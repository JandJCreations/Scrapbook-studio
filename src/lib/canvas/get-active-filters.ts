import Konva from "konva";

import {
  ExposureFilter,
  HighlightsFilter,
  ShadowsFilter,
  SharpnessFilter,
  type KonvaFilterFn,
} from "@/lib/canvas/konva-filters";
import { FILTER_PRESETS, type PhotoAdjustments } from "@/types/photo-adjustments";

/** Merges slider values with the active preset's deltas (sliders stack on top of the preset). */
export function resolveEffectiveAdjustments(adjustments: PhotoAdjustments) {
  const preset = FILTER_PRESETS[adjustments.filterPreset];
  return {
    brightness: adjustments.brightness + (preset.brightness ?? 0),
    contrast: adjustments.contrast + (preset.contrast ?? 0),
    saturation: adjustments.saturation + (preset.saturation ?? 0),
    exposure: adjustments.exposure + (preset.exposure ?? 0),
  };
}

type KonvaFilterEntry = KonvaFilterFn | string;

export function getActiveFilters(
  adjustments: PhotoAdjustments,
): KonvaFilterEntry[] {
  const effective = resolveEffectiveAdjustments(adjustments);
  const filters: KonvaFilterEntry[] = [];

  if (effective.exposure !== 0) filters.push(ExposureFilter);
  if (adjustments.highlights !== 0) filters.push(HighlightsFilter);
  if (adjustments.shadowsTone !== 0) filters.push(ShadowsFilter);
  if (effective.brightness !== 0) filters.push(Konva.Filters.Brighten);
  if (effective.contrast !== 0) filters.push(Konva.Filters.Contrast);
  if (effective.saturation !== 0) filters.push(Konva.Filters.HSL);
  if (adjustments.sharpness > 0) filters.push(SharpnessFilter);
  if (adjustments.blur > 0) filters.push(Konva.Filters.Blur);

  return filters;
}

/** Applies the numeric attrs each filter function reads via node.getAttr(...) / built-in setters. */
export function applyFilterAttrs(
  node: Konva.Image,
  adjustments: PhotoAdjustments,
) {
  const effective = resolveEffectiveAdjustments(adjustments);

  node.setAttr("exposure", effective.exposure);
  node.setAttr("highlights", adjustments.highlights);
  node.setAttr("shadowsTone", adjustments.shadowsTone);
  node.setAttr("sharpness", adjustments.sharpness);

  node.brightness(effective.brightness / 100);
  node.contrast(effective.contrast);
  node.saturation(effective.saturation / 100);
  node.blurRadius(adjustments.blur);
}
