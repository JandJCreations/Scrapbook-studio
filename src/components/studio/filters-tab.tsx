"use client";

import * as React from "react";

import { FILTER_LIST, videoLookForPreset } from "@/lib/appearance/filters";
import { filterPresetToCss, type FilterPreset } from "@/types/photo-adjustments";
import type { Clip } from "@/types/timeline";

interface FiltersTabProps {
  /** The selected clip; filters are for photos and videos. */
  clip: Clip | null;
  onPick(preset: FilterPreset): void;
}

/** A gallery of looks, each shown on a sample picture: click one to give it to the selected photo or video. */
export function FiltersTab({ clip, onPick }: FiltersTabProps) {
  if (!clip || (clip.kind !== "image" && clip.kind !== "video")) {
    return <p className="p-3 text-sm text-muted-foreground">Select a photo or video on the timeline, then pick a filter for it.</p>;
  }
  // A photo remembers which filter it has; a video only has the three sliders a filter sets, so a filter shows
  // as picked when they match it, and none does when the sliders were set by hand.
  const video = clip.adjustments.video;
  const current: FilterPreset | null =
    clip.kind === "image"
      ? (clip.adjustments.photo?.filterPreset ?? "none")
      : (FILTER_LIST.find(({ preset }) => {
          const look = videoLookForPreset(preset);
          return (video?.brightness ?? 0) === look.brightness && (video?.contrast ?? 0) === look.contrast && (video?.saturation ?? 0) === look.saturation;
        })?.preset ?? null);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <ul className="grid grid-cols-3 gap-2">
        {FILTER_LIST.map(({ preset, label }) => (
          <li key={preset}>
            <button
              type="button"
              aria-label={`Filter ${label}`}
              aria-pressed={current === preset}
              onClick={() => onPick(preset)}
              className={
                "flex w-full flex-col items-center gap-1 rounded-md border p-1 text-[11px] hover:border-primary " +
                (current === preset ? "border-primary text-primary" : "border-border text-muted-foreground")
              }
            >
              <span
                aria-hidden
                className="block aspect-square w-full rounded bg-gradient-to-br from-orange-400 via-rose-400 to-sky-500"
                style={{ filter: filterPresetToCss(preset) }}
              />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
