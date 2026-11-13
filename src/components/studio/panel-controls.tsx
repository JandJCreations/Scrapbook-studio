"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

interface PanelSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Fires continuously while the thumb moves. */
  onChange(value: number): void;
  /** Fires once when the move ends. */
  onCommit(): void;
}

export function PanelSlider({ label, value, min, max, step = 1, onChange, onCommit }: PanelSliderProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">{value}</span>
      </div>
      <Slider
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        // Radix reports the end of a keyboard step before the value change itself,
        // so the commit waits a tick to land after the preview it should close.
        onValueCommit={() => {
          window.setTimeout(onCommit, 0);
        }}
      />
    </div>
  );
}

interface PanelColorProps {
  label: string;
  value: string;
  onChange(value: string): void;
  onCommit(): void;
}

export function PanelColor({ label, value, onChange, onCommit }: PanelColorProps) {
  return (
    <input
      type="color"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      className="h-6 w-full cursor-pointer rounded border border-border bg-transparent"
    />
  );
}

interface PanelToggleSectionProps {
  title: string;
  enabled: boolean;
  onToggle(enabled: boolean): void;
  children: React.ReactNode;
}

/** A bordered group with an on/off switch; its controls show only while it is on. */
export function PanelToggleSection({ title, enabled, onToggle, children }: PanelToggleSectionProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{title}</Label>
        <Switch aria-label={title} checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && children}
    </div>
  );
}
