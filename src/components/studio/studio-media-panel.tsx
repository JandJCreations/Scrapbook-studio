"use client";

import * as React from "react";

import { MediaThumbnail } from "@/components/media/media-thumbnail";
import { Button } from "@/components/ui/button";
import { AlertCircle, Upload, Wand2 } from "lucide-react";
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
  /** Tries a failed upload again. */
  onRetryUpload?(id: string): void;
  /** Takes a failed upload off the list. */
  onRemoveUpload?(id: string): void;
  /** Filled in with a function that opens the file picker, so the timeline's + button can open it too. */
  openPickerRef?: React.RefObject<(() => void) | null>;
}

/** The user's photos and videos: tick any number and add them to the end of the video. */
export function StudioMediaPanel({
  items,
  loading,
  onAdd,
  onAddMany,
  onMakeVideo,
  onUpload,
  onRetryUpload,
  onRemoveUpload,
  openPickerRef,
}: StudioMediaPanelProps) {
  const pictures = items.filter((item) => isUsable(item) && item.type !== "audio");
  // Uploads that failed stay in view with the reason, rather than quietly disappearing.
  const failed = items.filter((item) => item.status === "error" && item.type !== "audio");
  const busy = pictures.filter((item) => item.status === "processing");
  const [ticked, setTicked] = React.useState<Set<string>>(new Set());
  // In the order of the list, whatever order they were ticked in; items that went away drop out.
  const chosen = pictures.filter((item) => ticked.has(item.id));
  const fileInput = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!openPickerRef || !onUpload) return;
    openPickerRef.current = () => fileInput.current?.click();
    return () => {
      openPickerRef.current = null;
    };
  }, [openPickerRef, onUpload]);
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
          {/* The same line says how uploads are going, so nothing below jumps when they finish. */}
          <p role="status" className="text-xs text-muted-foreground">
            {busy.length > 0
              ? `Uploading ${busy.length} ${busy.length === 1 ? "file" : "files"}. You can add them now.`
              : "Drag photos, videos and songs here"}
          </p>
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

      {failed.length > 0 && (
        <ul aria-label="Uploads that didn't work" className="flex flex-col gap-2">
          {failed.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" title={item.name}>
                  {item.name}
                </p>
                <p className="text-muted-foreground">{item.error ?? "Couldn't upload this file."}</p>
                <div className="mt-1.5 flex gap-1">
                  {item.retryable && onRetryUpload && (
                    <Button size="xs" variant="secondary" aria-label={`Retry ${item.name}`} onClick={() => onRetryUpload(item.id)}>
                      Retry
                    </Button>
                  )}
                  {onRemoveUpload && (
                    <Button size="xs" variant="ghost" aria-label={`Remove ${item.name}`} onClick={() => onRemoveUpload(item.id)}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pictures.length === 0 && failed.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading your media…" : "No photos or videos yet. Import some to start."}
        </p>
      )}

      {pictures.length >= 2 && chosen.length === 0 && onMakeVideo && (
        <p className="text-xs text-muted-foreground">
          Tip: tap pictures to tick them, then press <span className="font-medium text-foreground">Make a video</span>.
        </p>
      )}

      {chosen.length > 0 && (
        // Stays in view at the bottom while the list scrolls, so the next step never scrolls away.
        <div className="sticky bottom-0 z-10 order-last flex flex-wrap items-center gap-1 rounded-md border bg-background p-2 shadow-md">
          <Button
            size="sm"
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
              size="sm"
              className="gap-1"
              title="Photos and clips in order, with movement, transitions, a title and music"
              onClick={() => {
                onMakeVideo(chosen);
                setTicked(new Set());
              }}
            >
              <Wand2 className="size-4" />
              Make a video
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setTicked(new Set())}>
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
            {/* The whole picture ticks it: a big target for a finger. */}
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={() => toggle(item.id)}
              className={"block w-full " + (ticked.has(item.id) ? "ring-2 ring-inset ring-primary" : "")}
            >
              <MediaThumbnail item={item} className="aspect-square w-full" />
            </button>
            <input
              type="checkbox"
              aria-label={`Select ${item.name}`}
              checked={ticked.has(item.id)}
              onChange={() => toggle(item.id)}
              className="absolute left-1.5 top-1.5 size-5 accent-primary"
            />
            {item.status === "processing" && (
              <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                {uploadLabel(item)}
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

function uploadLabel(item: MediaItem): string {
  switch (item.stage) {
    case "waiting":
      return "Waiting…";
    case "shrinking":
      return `Making smaller ${Math.round(item.progress)}%`;
    case "saving":
      return "Saving…";
    default:
      return `Uploading ${Math.round(item.progress)}%`;
  }
}
