"use client";

import * as React from "react";

import { FRAME_PRESETS } from "@/lib/export/frame-presets";
import type { FrameSize } from "@/lib/sync/timeline-document";

interface ProjectPanelProps {
  frame: FrameSize | null;
  duration: number;
  clipCount: number;
  onFrameChange(frame: FrameSize): void;
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, "0")}`;
}

// The shapes worth a tile, with a label that names the shape.
const SHAPES = [
  { id: "landscape", label: "Landscape 16:9" },
  { id: "portrait", label: "Portrait 9:16" },
  { id: "square", label: "Square 1:1" },
] as const;

/** What the Details panel shows when no clip is selected: the video itself, its shape and length. */
export function ProjectPanel({ frame, duration, clipCount, onFrameChange }: ProjectPanelProps) {
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <h2 className="text-sm font-semibold">Your video</h2>

      <section className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">Shape</h3>
        <div className="grid grid-cols-3 gap-2">
          {SHAPES.map(({ id, label }) => {
            const preset = FRAME_PRESETS.find((p) => p.id === id)!;
            const current = frame?.width === preset.width && frame?.height === preset.height;
            const ratio = preset.width / preset.height;
            return (
              <button
                key={id}
                type="button"
                aria-label={label}
                aria-pressed={current}
                onClick={() => onFrameChange({ width: preset.width, height: preset.height })}
                className={
                  "flex flex-col items-center gap-2 rounded-md border p-2 text-[11px] hover:border-primary " +
                  (current ? "border-primary text-primary" : "border-border text-muted-foreground")
                }
              >
                <span className="flex h-10 items-center justify-center">
                  <span className="block rounded-sm border-2 border-current" style={{ width: `${Math.round(32 * Math.min(1, ratio))}px`, height: `${Math.round(32 / Math.max(1, ratio))}px` }} />
                </span>
                {label.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-border p-2">
          <dt className="text-muted-foreground">Length</dt>
          <dd className="text-sm font-medium tabular-nums">{clock(duration)}</dd>
        </div>
        <div className="rounded-md border border-border p-2">
          <dt className="text-muted-foreground">In the video</dt>
          <dd className="text-sm font-medium">{clipCount === 1 ? "1 clip" : `${clipCount} clips`}</dd>
        </div>
      </dl>

      <p className="text-xs text-muted-foreground">
        {clipCount === 0
          ? "Import photos or videos in the Media tab, then press Add or drag them onto the timeline."
          : "Select a clip on the timeline to change how it looks, how long it plays and how it sounds."}
      </p>
    </div>
  );
}
