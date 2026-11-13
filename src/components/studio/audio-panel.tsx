"use client";

import * as React from "react";

import { PanelSlider } from "@/components/studio/panel-controls";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface AudioValues {
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
}

interface AudioPanelProps extends AudioValues {
  speed: number;
  /** The longest a fade can be: the clip's length on the timeline. */
  maxFade: number;
  onPreview(patch: Partial<AudioValues>): void;
  onCommit(): void;
  onApply(patch: Partial<AudioValues>): void;
  onSpeed(speed: number): void;
}

const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4];

export function AudioPanel({
  volume,
  muted,
  fadeIn,
  fadeOut,
  speed,
  maxFade,
  onPreview,
  onCommit,
  onApply,
  onSpeed,
}: AudioPanelProps) {
  const max = Math.max(0.1, Math.round(maxFade * 10) / 10);
  const known = SPEEDS.includes(speed);
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">Sound</h2>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-normal text-muted-foreground">Mute</Label>
        <Switch aria-label="Mute" checked={muted} onCheckedChange={(next) => onApply({ muted: next })} />
      </div>
      <PanelSlider
        label="Volume"
        value={volume}
        min={0}
        max={100}
        onChange={(next) => onPreview({ volume: next })}
        onCommit={onCommit}
      />
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
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-normal text-muted-foreground">Speed</Label>
        <select
          aria-label="Speed"
          value={speed}
          onChange={(event) => onSpeed(Number(event.target.value))}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          {!known && <option value={speed}>{speed}x</option>}
          {SPEEDS.map((value) => (
            <option key={value} value={value}>
              {value}x
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
