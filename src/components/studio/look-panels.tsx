"use client";

import * as React from "react";
import { FlipHorizontal2, FlipVertical2 } from "lucide-react";

import { PanelColor, PanelSlider, PanelToggleSection } from "@/components/studio/panel-controls";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  FILTER_PRESETS,
  type FilterPreset,
  type GlowEffect,
  type PhotoAdjustments,
  type ShadowEffect,
} from "@/types/photo-adjustments";
import type { VideoAdjustments } from "@/types/video-adjustments";

interface PanelHandlers<P> {
  /** Live feedback while a slider or colour moves; no history entry yet. */
  onPreview(patch: Partial<P>): void;
  /** Ends a preview: the changes so far become one undo step. */
  onCommit(): void;
  /** A change that is complete on its own. */
  onApply(patch: Partial<P>): void;
  /** The clip's opacity as a fraction (0 to 1), previewed like the sliders. */
  onOpacity(opacity: number): void;
  onReset(): void;
}

interface PhotoPanelProps extends PanelHandlers<PhotoAdjustments> {
  adjustments: PhotoAdjustments;
  opacity: number;
}

interface VideoPanelProps extends PanelHandlers<VideoAdjustments> {
  adjustments: VideoAdjustments;
  opacity: number;
}

type SliderMaker = (
  label: string,
  value: number,
  min: number,
  max: number,
  onChange: (value: number) => void,
) => React.ReactNode;

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

/** A drop shadow or glow: a switch with colour, blur, opacity and (for shadows) offsets. */
function EffectSection<E extends ShadowEffect | GlowEffect>({
  title,
  effect,
  slider,
  onPreview,
  onCommit,
  onApply,
  withOffsets,
}: {
  title: string;
  effect: E;
  slider: SliderMaker;
  onPreview(patch: E): void;
  onCommit(): void;
  onApply(patch: E): void;
  withOffsets: boolean;
}) {
  const shadow = effect as ShadowEffect;
  return (
    <PanelToggleSection
      title={title}
      enabled={effect.enabled}
      onToggle={(enabled) => onApply({ ...effect, enabled })}
    >
      <PanelColor
        label={`${title} colour`}
        value={effect.color}
        onChange={(color) => onPreview({ ...effect, color })}
        onCommit={onCommit}
      />
      {slider(`${title} blur`, effect.blur, 0, 60, (blur) => onPreview({ ...effect, blur }))}
      {slider(`${title} opacity`, effect.opacity, 0, 100, (opacity) =>
        onPreview({ ...effect, opacity }),
      )}
      {withOffsets &&
        slider(`${title} offset X`, shadow.offsetX, -60, 60, (offsetX) =>
          onPreview({ ...effect, offsetX }),
        )}
      {withOffsets &&
        slider(`${title} offset Y`, shadow.offsetY, -60, 60, (offsetY) =>
          onPreview({ ...effect, offsetY }),
        )}
    </PanelToggleSection>
  );
}

function makeSlider(onCommit: () => void): SliderMaker {
  const Slider: SliderMaker = (label, value, min, max, onChange) => (
    <PanelSlider
      key={label}
      label={label}
      value={value}
      min={min}
      max={max}
      onChange={onChange}
      onCommit={onCommit}
    />
  );
  return Slider;
}

export function PhotoPanel({
  adjustments: adj,
  opacity,
  onPreview,
  onCommit,
  onApply,
  onOpacity,
  onReset,
}: PhotoPanelProps) {
  const slider = makeSlider(onCommit);
  return (
    <div className="space-y-3">
      <Header title="Edit picture" onReset={onReset} />

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

      {slider("Brightness", adj.brightness, -100, 100, (brightness) => onPreview({ brightness }))}
      {slider("Contrast", adj.contrast, -100, 100, (contrast) => onPreview({ contrast }))}
      {slider("Saturation", adj.saturation, -100, 100, (saturation) => onPreview({ saturation }))}
      {slider("Exposure", adj.exposure, -100, 100, (exposure) => onPreview({ exposure }))}
      {slider("Blur", adj.blur, 0, 20, (blur) => onPreview({ blur }))}
      {slider("Opacity", Math.round(opacity * 100), 0, 100, (v) => onOpacity(v / 100))}

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={adj.flipHorizontal ? "secondary" : "outline"}
          size="icon"
          aria-label="Flip horizontally"
          onClick={() => onApply({ flipHorizontal: !adj.flipHorizontal })}
        >
          <FlipHorizontal2 className="size-4" />
        </Button>
        <Button
          variant={adj.flipVertical ? "secondary" : "outline"}
          size="icon"
          aria-label="Flip vertically"
          onClick={() => onApply({ flipVertical: !adj.flipVertical })}
        >
          <FlipVertical2 className="size-4" />
        </Button>
      </div>

      <div className="space-y-2 rounded-lg border border-border p-2.5">
        <Label className="text-xs font-medium">Border</Label>
        {slider("Border width", adj.borderWidth, 0, 30, (borderWidth) => onPreview({ borderWidth }))}
        <PanelColor
          label="Border colour"
          value={adj.borderColor}
          onChange={(borderColor) => onPreview({ borderColor })}
          onCommit={onCommit}
        />
        {slider("Corner radius", adj.borderRadius, 0, 300, (borderRadius) =>
          onPreview({ borderRadius }),
        )}
      </div>

      <EffectSection
        title="Shadow"
        effect={adj.shadow}
        slider={slider}
        withOffsets
        onPreview={(shadow) => onPreview({ shadow })}
        onCommit={onCommit}
        onApply={(shadow) => onApply({ shadow })}
      />
      <EffectSection
        title="Glow"
        effect={adj.glow}
        slider={slider}
        withOffsets={false}
        onPreview={(glow) => onPreview({ glow })}
        onCommit={onCommit}
        onApply={(glow) => onApply({ glow })}
      />
    </div>
  );
}

export function VideoPanel({
  adjustments: adj,
  opacity,
  onPreview,
  onCommit,
  onApply,
  onOpacity,
  onReset,
}: VideoPanelProps) {
  const slider = makeSlider(onCommit);
  return (
    <div className="space-y-3">
      <Header title="Edit video" onReset={onReset} />
      {slider("Brightness", adj.brightness, -100, 100, (brightness) => onPreview({ brightness }))}
      {slider("Contrast", adj.contrast, -100, 100, (contrast) => onPreview({ contrast }))}
      {slider("Saturation", adj.saturation, -100, 100, (saturation) => onPreview({ saturation }))}
      {slider("Blur", adj.blur, 0, 20, (blur) => onPreview({ blur }))}
      {slider("Opacity", Math.round(opacity * 100), 0, 100, (v) => onOpacity(v / 100))}
      <EffectSection
        title="Shadow"
        effect={adj.shadow}
        slider={slider}
        withOffsets
        onPreview={(shadow) => onPreview({ shadow })}
        onCommit={onCommit}
        onApply={(shadow) => onApply({ shadow })}
      />
    </div>
  );
}
