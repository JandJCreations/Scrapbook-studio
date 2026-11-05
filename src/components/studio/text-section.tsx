"use client";

import * as React from "react";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";

import { PanelSlider } from "@/components/studio/panel-controls";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { TextPosition } from "@/lib/editor/text-ops";
import { TEXT_FONTS } from "@/lib/fonts/text-fonts";
import type { TextAdjustments, TextAlign } from "@/types/text-adjustments";

interface TextSectionProps {
  adjustments: TextAdjustments;
  /** Live feedback while words, size or colour change; no history entry yet. */
  onPreview(patch: Partial<TextAdjustments>): void;
  /** Ends a preview: the changes so far become one undo step. */
  onCommit(): void;
  /** A change that is complete on its own. */
  onApply(patch: Partial<TextAdjustments>): void;
  onPosition(position: TextPosition): void;
}

const ALIGNS: Array<{ value: TextAlign; label: string; Icon: typeof AlignLeft }> = [
  { value: "left", label: "Align left", Icon: AlignLeft },
  { value: "center", label: "Align center", Icon: AlignCenter },
  { value: "right", label: "Align right", Icon: AlignRight },
];
const POSITIONS: TextPosition[] = ["top", "middle", "bottom"];

/** The words and look of a text clip, in the Details panel. */
export function TextSection({ adjustments: adj, onPreview, onCommit, onApply, onPosition }: TextSectionProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">Edit text</h2>

      <textarea
        aria-label="Text"
        value={adj.content}
        rows={3}
        onChange={(event) => onPreview({ content: event.target.value })}
        onBlur={onCommit}
        className="w-full resize-none rounded-md border border-border bg-background p-2 text-sm"
      />

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-normal text-muted-foreground">Font</Label>
        <select
          aria-label="Font"
          value={adj.fontFamily}
          onChange={(event) => onApply({ fontFamily: event.target.value })}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          {!TEXT_FONTS.includes(adj.fontFamily) && <option value={adj.fontFamily}>{adj.fontFamily}</option>}
          {TEXT_FONTS.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </div>

      <PanelSlider label="Size" value={adj.fontSize} min={8} max={400} onChange={(fontSize) => onPreview({ fontSize })} onCommit={onCommit} />

      <div className="flex items-center justify-between">
        <Label className="text-xs font-normal text-muted-foreground">Colour</Label>
        <input
          type="color"
          aria-label="Text colour"
          value={adj.color}
          onChange={(event) => onPreview({ color: event.target.value })}
          onBlur={onCommit}
          className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {ALIGNS.map(({ value, label, Icon }) => (
          <Button
            key={value}
            variant={adj.align === value ? "secondary" : "outline"}
            size="icon"
            aria-label={label}
            onClick={() => onApply({ align: value })}
          >
            <Icon className="size-3.5" />
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {POSITIONS.map((position) => (
          <Button key={position} variant="outline" size="xs" aria-label={`Position ${position}`} className="capitalize" onClick={() => onPosition(position)}>
            {position}
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs font-normal text-muted-foreground">Bold</Label>
        <Switch aria-label="Bold" checked={adj.fontWeight >= 700} onCheckedChange={(on) => onApply({ fontWeight: on ? 700 : 400 })} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-normal text-muted-foreground">Outline</Label>
        <Switch aria-label="Outline" checked={adj.stroke.enabled} onCheckedChange={(enabled) => onApply({ stroke: { ...adj.stroke, enabled } })} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-normal text-muted-foreground">Shadow</Label>
        <Switch aria-label="Shadow" checked={adj.shadow.enabled} onCheckedChange={(enabled) => onApply({ shadow: { ...adj.shadow, enabled } })} />
      </div>
    </div>
  );
}
