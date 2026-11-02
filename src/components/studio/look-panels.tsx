"use client";

import * as React from "react";

import { PanelSlider } from "@/components/studio/panel-controls";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FILTER_PRESETS, type FilterPreset, type PhotoAdjustments } from "@/types/photo-adjustments";
import type { VideoAdjustments } from "@/types/video-adjustments";

interface PanelHandlers<P> {
  /** Live feedback while a slider moves; no history entry yet. */
  onPreview(patch: Partial<P>): void;
  /** Ends a preview: the changes so far become one undo step. */
  onCommit(): void;
  /** A change that is complete on its own. */
  onApply(patch: Partial<P>): void;
  onReset(): void;
}

interface PhotoPanelProps extends PanelHandlers<PhotoAdjustments> {
  adjustments: PhotoAdjustments;
}

interface VideoPanelProps extends PanelHandlers<VideoAdjustments> {
  adjustments: VideoAdjustments;
}

function Header({ title, onReset }: { title: string; onReset(): void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onReset}>
        Reset
      </Button>
    </div>
  );
}

/** Colour and tone for a photo: a filter, then sliders. */
export function PhotoPanel({ adjustments: adj, onPreview, onCommit, onApply, onReset }: PhotoPanelProps) {
  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    toPatch: (v: number) => Partial<PhotoAdjustments>,
  ) => (
    <PanelSlider key={label} label={label} value={value} min={min} max={max} onChange={(v) => onPreview(toPatch(v))} onCommit={onCommit} />
  );
  return (
    <div className="space-y-3">
      <Header title="Edit photo" onReset={onReset} />

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-normal text-muted-foreground">Filter</Label>
        <select
          aria-label="Filter"
          value={adj.filterPreset}
          onChange={(event) => onApply({ filterPreset: event.target.value as FilterPreset })}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs capitalize"
        >
          {(Object.keys(FILTER_PRESETS) as FilterPreset[]).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {slider("Brightness", adj.brightness, -100, 100, (brightness) => ({ brightness }))}
      {slider("Contrast", adj.contrast, -100, 100, (contrast) => ({ contrast }))}
      {slider("Saturation", adj.saturation, -100, 100, (saturation) => ({ saturation }))}
      {slider("Exposure", adj.exposure, -100, 100, (exposure) => ({ exposure }))}
      {slider("Highlights", adj.highlights, -100, 100, (highlights) => ({ highlights }))}
      {slider("Shadows", adj.shadowsTone, -100, 100, (shadowsTone) => ({ shadowsTone }))}
      {slider("Sharpness", adj.sharpness, 0, 100, (sharpness) => ({ sharpness }))}
      {slider("Blur", adj.blur, 0, 20, (blur) => ({ blur }))}
    </div>
  );
}

/** Colour and tone for a video clip. */
export function VideoPanel({ adjustments: adj, onPreview, onCommit, onReset }: VideoPanelProps) {
  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    toPatch: (v: number) => Partial<VideoAdjustments>,
  ) => (
    <PanelSlider key={label} label={label} value={value} min={min} max={max} onChange={(v) => onPreview(toPatch(v))} onCommit={onCommit} />
  );
  return (
    <div className="space-y-3">
      <Header title="Edit video" onReset={onReset} />
      {slider("Brightness", adj.brightness, -100, 100, (brightness) => ({ brightness }))}
      {slider("Contrast", adj.contrast, -100, 100, (contrast) => ({ contrast }))}
      {slider("Saturation", adj.saturation, -100, 100, (saturation) => ({ saturation }))}
      {slider("Blur", adj.blur, 0, 20, (blur) => ({ blur }))}
    </div>
  );
}
