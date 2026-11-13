"use client";

import * as React from "react";
import { Captions, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TEXT_STYLES, type TextStyle } from "@/lib/editor/text-ops";

interface TextTabProps {
  /** True while a text clip is selected: a style then restyles it instead of adding new text. */
  selectedIsText: boolean;
  /** True while a photo or video is selected: a caption can be made for it. */
  canCaption: boolean;
  onAddText(): void;
  onPickStyle(style: TextStyle): void;
  onAddCaption(): void;
}

/** Text for the video: plain text, a caption for a slide, and a gallery of styles. */
export function TextTab({ selectedIsText, canCaption, onAddText, onPickStyle, onAddCaption }: TextTabProps) {
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <div className="flex flex-col gap-2">
        <Button size="sm" onClick={onAddText} aria-label="Add text">
          <Plus className="size-4" />
          Add text
        </Button>
        <Button size="sm" variant="outline" disabled={!canCaption} onClick={onAddCaption} aria-label="Caption for selected slide">
          <Captions className="size-4" />
          Caption for selected slide
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {selectedIsText ? "Pick a style to restyle the selected text." : "Pick a style to add text in that style."}
      </p>
      <p className="text-xs text-muted-foreground">A caption stays where it is if you later move or trim its slide.</p>
      <ul className="grid grid-cols-2 gap-2">
        {TEXT_STYLES.map((style) => (
          <li key={style.id}>
            <button
              type="button"
              aria-label={`Text style ${style.label}`}
              onClick={() => onPickStyle(style)}
              className="flex w-full flex-col items-center gap-1 rounded-md border border-border p-1.5 text-[11px] text-muted-foreground hover:border-primary"
            >
              <span
                aria-hidden
                className="flex aspect-video w-full items-center justify-center overflow-hidden rounded bg-black text-2xl"
                style={{
                  fontFamily: `"${style.adjustments.fontFamily}", sans-serif`,
                  fontWeight: style.adjustments.fontWeight,
                  color: style.adjustments.color,
                  textShadow: style.adjustments.glow?.enabled
                    ? `0 0 12px ${style.adjustments.glow.color}`
                    : style.adjustments.shadow?.enabled
                      ? "0 2px 4px rgba(0,0,0,0.8)"
                      : undefined,
                  WebkitTextStroke: style.adjustments.stroke?.enabled ? "1px #000" : undefined,
                }}
              >
                Aa
              </span>
              {style.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
