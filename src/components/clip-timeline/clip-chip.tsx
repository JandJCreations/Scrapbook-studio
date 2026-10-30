"use client";

import * as React from "react";

import { clipLabel, type ClipRect } from "@/lib/timeline-ui/layout";
import type { Clip } from "@/types/timeline";

const TONE: Record<Clip["kind"], string> = {
  video: "bg-sky-500/70 border-sky-300",
  image: "bg-emerald-500/70 border-emerald-300",
  text: "bg-amber-500/70 border-amber-300",
  sticker: "bg-pink-500/70 border-pink-300",
  audio: "bg-violet-500/70 border-violet-300",
};

interface ClipChipProps {
  clip: Clip;
  rect: ClipRect;
  selected: boolean;
  dimmed: boolean;
}

function areChipsEqual(a: ClipChipProps, b: ClipChipProps): boolean {
  return (
    a.clip === b.clip &&
    a.selected === b.selected &&
    a.dimmed === b.dimmed &&
    a.rect.x === b.rect.x &&
    a.rect.y === b.rect.y &&
    a.rect.width === b.rect.width &&
    a.rect.height === b.rect.height
  );
}

/**
 * One clip. Selection is handled once by the lane (it finds the chip through
 * `data-clip-id`), so the chip itself has no handlers and stays memoised.
 */
export const ClipChip = React.memo(function ClipChip({ clip, rect, selected, dimmed }: ClipChipProps) {
  return (
    <button
      type="button"
      data-clip-id={clip.id}
      aria-pressed={selected}
      title={`${clipLabel(clip)} (${clip.kind})`}
      // Do not take keyboard focus on click, so Space keeps meaning play/pause.
      onMouseDown={(event) => event.preventDefault()}
      className={`absolute cursor-grab overflow-hidden rounded-md border px-1.5 text-left text-xs text-white shadow-sm ${
        TONE[clip.kind]
      } ${selected ? "ring-2 ring-white" : ""} ${dimmed ? "opacity-40" : ""}`}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      {rect.width > 16 && (
        <>
          <span
            data-edge="start"
            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/50"
          />
          <span
            data-edge="end"
            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/50"
          />
        </>
      )}
      <span className="block truncate leading-tight">{clipLabel(clip)}</span>
    </button>
  );
}, areChipsEqual);
