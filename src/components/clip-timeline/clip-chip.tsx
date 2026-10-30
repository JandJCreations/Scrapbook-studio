"use client";

import * as React from "react";

import { ClipVisuals, type MediaVisuals } from "@/components/clip-timeline/clip-visuals";
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
  /** Thumbnails, pictures and waveforms; absent means a plain coloured chip. */
  visuals?: MediaVisuals;
  pps: number;
  /** The visible lane range (from `viewWindow`), in lane pixels. */
  viewFrom: number;
  viewTo: number;
}

function areChipsEqual(a: ClipChipProps, b: ClipChipProps): boolean {
  return (
    a.clip === b.clip &&
    a.selected === b.selected &&
    a.dimmed === b.dimmed &&
    a.rect.x === b.rect.x &&
    a.rect.y === b.rect.y &&
    a.rect.width === b.rect.width &&
    a.rect.height === b.rect.height &&
    a.visuals === b.visuals &&
    a.pps === b.pps &&
    a.viewFrom === b.viewFrom &&
    a.viewTo === b.viewTo
  );
}

/**
 * One clip. Selection is handled once by the lane (it finds the chip through
 * `data-clip-id`), so the chip itself has no handlers and stays memoised.
 */
export const ClipChip = React.memo(function ClipChip({
  clip,
  rect,
  selected,
  dimmed,
  visuals,
  pps,
  viewFrom,
  viewTo,
}: ClipChipProps) {
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
      {visuals && (
        <ClipVisuals
          clip={clip}
          width={rect.width}
          height={rect.height}
          pps={pps}
          visuals={visuals}
          viewFrom={viewFrom - rect.x}
          viewTo={viewTo - rect.x}
        />
      )}
      {rect.width > 16 && (
        <>
          <span
            data-edge="start"
            className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/50"
          />
          <span
            data-edge="end"
            className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/50"
          />
        </>
      )}
      <span className="relative z-10 block truncate leading-tight [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]">
        {clipLabel(clip)}
      </span>
    </button>
  );
}, areChipsEqual);
