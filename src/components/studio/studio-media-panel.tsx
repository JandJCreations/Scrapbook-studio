"use client";

import * as React from "react";

import { MediaThumbnail } from "@/components/media/media-thumbnail";
import { Button } from "@/components/ui/button";
import type { MediaItem } from "@/types/media";

interface StudioMediaPanelProps {
  items: MediaItem[];
  loading: boolean;
  onAdd(item: MediaItem, mode: "sequence" | "overlay"): void;
  /** Present where several items may be ticked and added together. */
  onAddMany?(items: MediaItem[], mode: "sequence" | "overlay"): void;
  /** Present where a picture may be added as a sticker. */
  onAddSticker?(item: MediaItem): void;
  onUpload?(files: File[]): void;
}

export function StudioMediaPanel({ items, loading, onAdd, onAddMany, onAddSticker, onUpload }: StudioMediaPanelProps) {
  const ready = items.filter((item) => item.status === "ready");
  const [ticked, setTicked] = React.useState<Set<string>>(new Set());
  // In the order of the list, whatever order they were ticked in; items that went away drop out.
  const chosen = ready.filter((item) => ticked.has(item.id));
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
          <span className="mb-1 block font-medium text-foreground">Upload</span>
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

      {ready.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading your media…" : "No media yet. Upload photos, videos or music to start."}
        </p>
      )}

      {onAddMany && chosen.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-2">
          <Button
            size="xs"
            variant="secondary"
            onClick={() => {
              onAddMany(chosen, "sequence");
              setTicked(new Set());
            }}
          >
            Add {chosen.length} to the sequence
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              onAddMany(chosen, "overlay");
              setTicked(new Set());
            }}
          >
            Add {chosen.length} as overlays
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setTicked(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {ready.map((item) => (
          <li key={item.id} className="flex items-center gap-2 rounded-md border p-2">
            {onAddMany && (
              <input
                type="checkbox"
                aria-label={`Select ${item.name}`}
                checked={ticked.has(item.id)}
                onChange={() => toggle(item.id)}
              />
            )}
            <MediaThumbnail item={item} className="size-12 shrink-0 rounded" />
            <span className="min-w-0 flex-1 truncate text-sm" title={item.name}>
              {item.name}
            </span>
            {item.type === "audio" ? (
              <Button
                size="xs"
                variant="secondary"
                aria-label={`Add ${item.name} as music`}
                onClick={() => onAdd(item, "sequence")}
              >
                Add
              </Button>
            ) : (
              <span className="flex gap-1">
                <Button
                  size="xs"
                  variant="secondary"
                  aria-label={`Add ${item.name} to the sequence`}
                  onClick={() => onAdd(item, "sequence")}
                >
                  Add
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label={`Add ${item.name} as an overlay`}
                  onClick={() => onAdd(item, "overlay")}
                >
                  Overlay
                </Button>
                {item.type === "image" && onAddSticker && (
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label={`Add ${item.name} as a sticker`}
                    onClick={() => onAddSticker(item)}
                  >
                    Sticker
                  </Button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
