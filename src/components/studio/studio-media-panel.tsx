"use client";

import * as React from "react";

import { MediaThumbnail } from "@/components/media/media-thumbnail";
import { Button } from "@/components/ui/button";
import type { MediaItem } from "@/types/media";

interface StudioMediaPanelProps {
  items: MediaItem[];
  loading: boolean;
  /** Puts one photo or video at the end of the video. */
  onAdd(item: MediaItem): void;
  /** Puts several, in the order of the list. */
  onAddMany(items: MediaItem[]): void;
  onUpload?(files: File[]): void;
}

/** The user's photos and videos: tick any number and add them to the end of the video. */
export function StudioMediaPanel({ items, loading, onAdd, onAddMany, onUpload }: StudioMediaPanelProps) {
  const pictures = items.filter((item) => item.status === "ready" && item.type !== "audio");
  const [ticked, setTicked] = React.useState<Set<string>>(new Set());
  // In the order of the list, whatever order they were ticked in; items that went away drop out.
  const chosen = pictures.filter((item) => ticked.has(item.id));
  const toggle = (id: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {onUpload && (
        <label className="block text-xs text-muted-foreground">
          <span className="mb-1 block font-medium text-foreground">Import</span>
          <input
            type="file"
            multiple
            accept="video/*,audio/*,image/*"
            className="block w-full text-xs"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) onUpload(files);
            }}
          />
        </label>
      )}

      {pictures.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading your media…" : "No photos or videos yet. Import some to start."}
        </p>
      )}

      {chosen.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-2">
          <Button
            size="xs"
            variant="secondary"
            onClick={() => {
              onAddMany(chosen);
              setTicked(new Set());
            }}
          >
            Add {chosen.length} to the video
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setTicked(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-2">
        {pictures.map((item) => (
          <li key={item.id} className="relative overflow-hidden rounded-md border">
            <MediaThumbnail item={item} className="aspect-square w-full" />
            <input
              type="checkbox"
              aria-label={`Select ${item.name}`}
              checked={ticked.has(item.id)}
              onChange={() => toggle(item.id)}
              className="absolute left-1.5 top-1.5 size-4"
            />
            <div className="flex items-center gap-1 p-1">
              <span className="min-w-0 flex-1 truncate text-[11px]" title={item.name}>
                {item.name}
              </span>
              <Button size="xs" variant="secondary" aria-label={`Add ${item.name} to the video`} onClick={() => onAdd(item)}>
                Add
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
