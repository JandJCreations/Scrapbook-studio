"use client";

import * as React from "react";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";

import { PanelColor, PanelSlider, PanelToggleSection } from "@/components/studio/panel-controls";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { isCustomFontFamily, type CustomFont } from "@/lib/fonts/custom-fonts";
import { GOOGLE_FONTS } from "@/lib/fonts/google-fonts-catalog";
import type { TextAdjustments, TextAlign } from "@/types/text-adjustments";

interface TextPanelProps {
  adjustments: TextAdjustments;
  /** Live feedback while a slider, colour or the words change; no history entry yet. */
  onPreview(patch: Partial<TextAdjustments>): void;
  /** Ends a preview: the changes so far become one undo step. */
  onCommit(): void;
  /** A change that is complete on its own (a switch, a button, a choice). */
  onApply(patch: Partial<TextAdjustments>): void;
  onReset(): void;
  /** Present where the user may bring their own fonts. */
  customFonts?: { fonts: CustomFont[]; add(file: File): Promise<void> };
}

const ALIGNS: Array<{ value: TextAlign; label: string; Icon: typeof AlignLeft }> = [
  { value: "left", label: "Align left", Icon: AlignLeft },
  { value: "center", label: "Align center", Icon: AlignCenter },
  { value: "right", label: "Align right", Icon: AlignRight },
];

export function TextPanel({ adjustments, onPreview, onCommit, onApply, onReset, customFonts }: TextPanelProps) {
  const [fontError, setFontError] = React.useState<string | null>(null);
  const mine = customFonts?.fonts.find((f) => f.family === adjustments.fontFamily);
  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    toPatch: (v: number) => Partial<TextAdjustments>,
    step = 1,
  ) => (
    <PanelSlider
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(v) => onPreview(toPatch(v))}
      onCommit={onCommit}
    />
  );

  const known = GOOGLE_FONTS.some((f) => f.family === adjustments.fontFamily) || mine !== undefined;

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Edit text</h2>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onReset}>
          Reset
        </Button>
      </div>

      <textarea
        aria-label="Text content"
        value={adjustments.content}
        rows={3}
        onChange={(event) => onPreview({ content: event.target.value })}
        onBlur={onCommit}
        className="w-full resize-none rounded-md border border-border bg-background p-2 text-sm"
      />

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-normal text-muted-foreground">Font</Label>
        <select
          aria-label="Font"
          value={adjustments.fontFamily}
          onChange={(event) => onApply({ fontFamily: event.target.value })}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          {!known && (
            <option value={adjustments.fontFamily}>
              {isCustomFontFamily(adjustments.fontFamily) ? "Missing font" : adjustments.fontFamily}
            </option>
          )}
          {customFonts && customFonts.fonts.length > 0 && (
            <optgroup label="Your fonts">
              {customFonts.fonts.map((f) => (
                <option key={f.id} value={f.family}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          )}
          {GOOGLE_FONTS.map((f) => (
            <option key={f.family} value={f.family}>
              {f.family}
            </option>
          ))}
        </select>
        {customFonts && (
          <>
            <input
              type="file"
              aria-label="Upload a font"
              accept=".ttf,.otf,.woff,.woff2,font/*"
              className="block w-full text-xs"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setFontError(null);
                customFonts.add(file).catch((error: unknown) => {
                  setFontError(error instanceof Error ? error.message : "That font could not be added.");
                });
              }}
            />
            {fontError && (
              <p role="alert" className="text-xs text-destructive">
                {fontError}
              </p>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {ALIGNS.map(({ value, label, Icon }) => (
          <Button
            key={value}
            variant={adjustments.align === value ? "secondary" : "outline"}
            size="icon"
            aria-label={label}
            onClick={() => onApply({ align: value })}
          >
            <Icon className="size-3.5" />
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs font-normal text-muted-foreground">Bold</Label>
        <Switch
          aria-label="Bold"
          checked={adjustments.fontWeight >= 700}
          onCheckedChange={(checked) => onApply({ fontWeight: checked ? 700 : 400 })}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs font-normal text-muted-foreground">Colour</Label>
        <PanelColor
          label="Text colour"
          value={adjustments.color}
          onChange={(color) => onPreview({ color })}
          onCommit={onCommit}
        />
      </div>

      {slider("Size", adjustments.fontSize, 8, 400, (fontSize) => ({ fontSize }))}
      {slider("Letter spacing", adjustments.letterSpacing, -5, 40, (letterSpacing) => ({
        letterSpacing,
      }))}
      {slider(
        "Line height",
        Math.round(adjustments.lineHeight * 10) / 10,
        0.5,
        3,
        (lineHeight) => ({ lineHeight }),
        0.1,
      )}
      {slider("Curve", adjustments.curve, -100, 100, (curve) => ({ curve }))}
      {slider("Opacity", adjustments.opacity, 0, 100, (opacity) => ({ opacity }))}

      <PanelToggleSection
        title="Gradient"
        enabled={adjustments.gradient.enabled}
        onToggle={(enabled) => onApply({ gradient: { ...adjustments.gradient, enabled } })}
      >
        <div className="flex gap-2">
          <PanelColor
            label="Gradient from"
            value={adjustments.gradient.from}
            onChange={(from) => onPreview({ gradient: { ...adjustments.gradient, from } })}
            onCommit={onCommit}
          />
          <PanelColor
            label="Gradient to"
            value={adjustments.gradient.to}
            onChange={(to) => onPreview({ gradient: { ...adjustments.gradient, to } })}
            onCommit={onCommit}
          />
        </div>
      </PanelToggleSection>

      <PanelToggleSection
        title="Stroke"
        enabled={adjustments.stroke.enabled}
        onToggle={(enabled) => onApply({ stroke: { ...adjustments.stroke, enabled } })}
      >
        <PanelColor
          label="Stroke colour"
          value={adjustments.stroke.color}
          onChange={(color) => onPreview({ stroke: { ...adjustments.stroke, color } })}
          onCommit={onCommit}
        />
        {slider("Stroke width", adjustments.stroke.width, 0, 12, (width) => ({
          stroke: { ...adjustments.stroke, width },
        }))}
      </PanelToggleSection>

      <PanelToggleSection
        title="Glow"
        enabled={adjustments.glow.enabled}
        onToggle={(enabled) => onApply({ glow: { ...adjustments.glow, enabled } })}
      >
        <PanelColor
          label="Glow colour"
          value={adjustments.glow.color}
          onChange={(color) => onPreview({ glow: { ...adjustments.glow, color } })}
          onCommit={onCommit}
        />
        {slider("Glow blur", adjustments.glow.blur, 0, 60, (blur) => ({
          glow: { ...adjustments.glow, blur },
        }))}
        {slider("Glow opacity", adjustments.glow.opacity, 0, 100, (opacity) => ({
          glow: { ...adjustments.glow, opacity },
        }))}
      </PanelToggleSection>

      <PanelToggleSection
        title="Shadow"
        enabled={adjustments.shadow.enabled}
        onToggle={(enabled) => onApply({ shadow: { ...adjustments.shadow, enabled } })}
      >
        <PanelColor
          label="Shadow colour"
          value={adjustments.shadow.color}
          onChange={(color) => onPreview({ shadow: { ...adjustments.shadow, color } })}
          onCommit={onCommit}
        />
        {slider("Shadow blur", adjustments.shadow.blur, 0, 60, (blur) => ({
          shadow: { ...adjustments.shadow, blur },
        }))}
        {slider("Shadow offset X", adjustments.shadow.offsetX, -40, 40, (offsetX) => ({
          shadow: { ...adjustments.shadow, offsetX },
        }))}
        {slider("Shadow offset Y", adjustments.shadow.offsetY, -40, 40, (offsetY) => ({
          shadow: { ...adjustments.shadow, offsetY },
        }))}
      </PanelToggleSection>
    </div>
  );
}
