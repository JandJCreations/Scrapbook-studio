"use client";

import * as React from "react";

import { PanelSlider } from "@/components/studio/panel-controls";

interface FadeSectionProps {
  fadeIn: number;
  fadeOut: number;
  /** The longest a fade can be: the clip's length on the timeline. */
  maxFade: number;
  onPreview(patch: { fadeIn?: number; fadeOut?: number }): void;
  onCommit(): void;
}

/** How long a picture, sticker or text takes to fade in at its start and out at its end. */
export function FadeSection({ fadeIn, fadeOut, maxFade, onPreview, onCommit }: FadeSectionProps) {
  const max = Math.max(0.1, Math.round(maxFade * 10) / 10);
  return (
    <div className="space-y-3 rounded-lg border border-border p-2.5">
      <h3 className="text-xs font-medium">Fade</h3>
      <PanelSlider
        label="Fade in"
        value={Math.round(fadeIn * 10) / 10}
        min={0}
        max={max}
        step={0.1}
        onChange={(next) => onPreview({ fadeIn: next })}
        onCommit={onCommit}
      />
      <PanelSlider
        label="Fade out"
        value={Math.round(fadeOut * 10) / 10}
        min={0}
        max={max}
        step={0.1}
        onChange={(next) => onPreview({ fadeOut: next })}
        onCommit={onCommit}
      />
    </div>
  );
}
