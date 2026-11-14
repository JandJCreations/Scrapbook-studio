"use client";

import * as React from "react";

import { MediaThumbnail } from "@/components/media/media-thumbnail";
import { Button } from "@/components/ui/button";
import { Upload, Wand2 } from "lucide-react";
import { blurOnMouseClick } from "@/lib/dom/blur-on-mouse-click";
import { writeMediaDrag } from "@/lib/dom/media-drag";
import { isUsable } from "@/lib/media/local-media";
import type { MediaItem } from "@/types/media";

interface StudioMediaPanelProps {
  items: MediaItem[];
  loading: boolean;
  /** Puts one photo or video at the end of the video. */
  onAdd(item: MediaItem): void;
  /** Puts several, in the order of the list. */
  onAddMany(items: MediaItem[]): void;
  /** Present where the ticked items can be turned into a finished video in one go. */
  onMakeVideo?(items: MediaItem[]): void;
  onUpload?(files: File[]): void;
}

/** The user's photos and videos: tick any number and add them to the end of the video. */
export function StudioMediaPanel({ items, loading, onAdd, onAddMany, onMakeVideo, onUpload }: StudioMediaPanelProps) {
  const pictures = items.filter((item) => isUsable(item) && item.type !== "audio");
  const [ticked, setTicked] = React.useState<Set<string>>(new Set());
  // In the order of the list, whatever order they were ticked in; items that went away drop out.
  const chosen = pictures.filter((item) => ticked.has(item.id));
  const fileInput = React.useRef<HTMLInputElement>(null);
  /** Files dropped anywhere on the panel are imported; any other drop is left alone. */
  const handleFileDrop = (event: React.DragEvent<HTMLElement>) => {
    if (!onUpload) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    onUpload(files);
  };
  const toggle = (id: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
      onClickCapture={blurOnMouseClick}
      onDragOver={(event) => {
        if (onUpload && Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => handleFileDrop(event)}
    >
      {onUpload && (
        <div
          data-testid="import-area"
          className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-4 text-center"
        >
          <Upload className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-xs text-muted-foreground">Drag photos, videos and songs here</p>
          <Button size="sm" onClick={() => fileInput.current?.click()} aria-label="Import">
            Import
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="video/*,audio/*,image/*"
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) onUpload(files);
            }}
          />
        </div>
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
          {onMakeVideo && chosen.length >= 2 && (
            <Button
              size="xs"
              className="gap-1"
              title="Photos and clips in order, with movement, transitions, a title and music"
              onClick={() => {
                onMakeVideo(chosen);
                setTicked(new Set());
              }}
            >
              <Wand2 className="size-3" />
              Make a video
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => setTicked(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-2">
        {pictures.map((item) => (
          <li
            key={item.id}
            draggable
            onDragStart={(event) => writeMediaDrag(event.dataTransfer, { source: "library", id: item.id }, "visual")}
            className="relative cursor-grab overflow-hidden rounded-md border"
          >
            <MediaThumbnail item={item} className="aspect-square w-full" />
            <input
              type="checkbox"
              aria-label={`Select ${item.name}`}
              checked={ticked.has(item.id)}
              onChange={() => toggle(item.id)}
              className="absolute left-1.5 top-1.5 size-4"
            />
            {item.status === "processing" && (
              <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                Uploading {Math.round(item.progress)}%
              </span>
            )}
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
