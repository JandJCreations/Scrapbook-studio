"use client";

import * as React from "react";

import { PanelSlider } from "@/components/studio/panel-controls";
import { Button } from "@/components/ui/button";
import { CROP_ASPECTS, type CropControls } from "@/lib/appearance/crop";

interface CropSectionProps {
  controls: CropControls;
  /** False until the file's own size is known; the crop cannot be worked out before. */
  ready: boolean;
  /** Live feedback while a slider moves; no history entry yet. */
  onPreview(next: CropControls): void;
  onCommit(): void;
  /** A change that is complete on its own (an aspect button). */
  onApply(next: CropControls): void;
}

/** Crop to a shape, then zoom and move within the picture. */
export function CropSection({ controls, ready, onPreview, onCommit, onApply }: CropSectionProps) {
  if (!ready) {
    return (
      <div className="rounded-lg border border-border p-2.5 text-xs text-muted-foreground">
        Loading the picture size to crop…
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-lg border border-border p-2.5">
      <h3 className="text-xs font-medium">Crop</h3>
      <div className="flex flex-wrap gap-1">
        {CROP_ASPECTS.map((aspect) => (
          <Button
            key={aspect.id}
            size="xs"
            variant={controls.aspect === aspect.id ? "secondary" : "outline"}
            aria-pressed={controls.aspect === aspect.id}
            aria-label={aspect.id === "original" ? "Original" : aspect.label}
            onClick={() => onApply({ ...controls, aspect: aspect.id })}
          >
            {aspect.label}
          </Button>
        ))}
      </div>
      <PanelSlider
        label="Zoom"
        value={Math.round(controls.zoom * 10) / 10}
        min={1}
        max={5}
        step={0.1}
        onChange={(zoom) => onPreview({ ...controls, zoom })}
        onCommit={onCommit}
      />
      <PanelSlider
        label="Left-right"
        value={Math.round(controls.panX)}
        min={0}
        max={100}
        onChange={(panX) => onPreview({ ...controls, panX })}
        onCommit={onCommit}
      />
      <PanelSlider
        label="Up-down"
        value={Math.round(controls.panY)}
        min={0}
        max={100}
        onChange={(panY) => onPreview({ ...controls, panY })}
        onCommit={onCommit}
      />
    </div>
  );
}
