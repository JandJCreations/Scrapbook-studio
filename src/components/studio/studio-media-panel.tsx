"use client";

import * as React from "react";

import { MediaThumbnail } from "@/components/media/media-thumbnail";
import { Button } from "@/components/ui/button";
import type { MediaItem } from "@/types/media";

interface StudioMediaPanelProps {
  items: MediaItem[];
  loading: boolean;
  onAdd(item: MediaItem, mode: "sequence" | "overlay"): void;
  onUpload?(files: File[]): void;
}

export function StudioMediaPanel({ items, loading, onAdd, onUpload }: StudioMediaPanelProps) {
  const ready = items.filter((item) => item.status === "ready");

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

      <ul className="flex flex-col gap-2">
        {ready.map((item) => (
          <li key={item.id} className="flex items-center gap-2 rounded-md border p-2">
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
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
