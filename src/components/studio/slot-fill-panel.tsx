"use client";

import * as React from "react";

import { MediaThumbnail } from "@/components/media/media-thumbnail";
import { Button } from "@/components/ui/button";
import type { MediaItem } from "@/types/media";

interface SlotFillPanelProps {
  items: MediaItem[];
  loading: boolean;
  onFill(item: MediaItem): void;
}

/** Shown for a selected empty slot: pick one of your pictures or videos to put in it. */
export function SlotFillPanel({ items, loading, onFill }: SlotFillPanelProps) {
  const usable = items.filter((i) => i.status === "ready" && (i.type === "image" || i.type === "video"));
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <div>
        <h2 className="text-sm font-semibold">Fill this slot</h2>
        <p className="text-xs text-muted-foreground">Pick a photo or video to put here.</p>
      </div>
      {usable.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading your media…" : "Upload a photo or video in the Media tab first."}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {usable.map((item) => (
          <li key={item.id} className="flex items-center gap-2 rounded-md border p-2">
            <MediaThumbnail item={item} className="size-12 shrink-0 rounded" />
            <span className="min-w-0 flex-1 truncate text-sm" title={item.name}>
              {item.name}
            </span>
            <Button size="xs" variant="secondary" aria-label={`Put ${item.name} in this slot`} onClick={() => onFill(item)}>
              Use
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
