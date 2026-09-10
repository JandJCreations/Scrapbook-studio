"use client";

import * as React from "react";
import Link from "next/link";
import { Film, ImagePlus } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DEFAULT_OBJECT_SIZE } from "@/lib/canvas/constants";
import { useCanvasStore } from "@/store/use-canvas-store";
import { useMediaStore } from "@/store/use-media-store";

interface MediaPanelProps {
  projectId: string;
  stageWidth: number;
  stageHeight: number;
}

function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

export function MediaPanel({ projectId, stageWidth, stageHeight }: MediaPanelProps) {
  const items = useMediaStore((s) => s.items);
  const fetchMedia = useMediaStore((s) => s.fetchMedia);
  const addObject = useCanvasStore((s) => s.addObject);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const viewport = useCanvasStore((s) => s.viewport);

  React.useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const placeable = items.filter(
    (i) => i.status === "ready" && (i.type === "image" || i.type === "video"),
  );

  function handleAdd(item: (typeof placeable)[number]) {
    const worldCenterX = (-viewport.x + stageWidth / 2) / viewport.scale;
    const worldCenterY = (-viewport.y + stageHeight / 2) / viewport.scale;
    const width = DEFAULT_OBJECT_SIZE;
    const height = DEFAULT_OBJECT_SIZE;

    // Placed instantly at the default square — tapping a photo should feel
    // immediate, not wait on a network/decode round trip first.
    const newId = addObject(projectId, {
      type: item.type as "image" | "video",
      mediaId: item.id,
      src: item.type === "video" ? (item.thumbnailUrl ?? item.url) : item.url,
      videoSrc: item.type === "video" ? item.url : undefined,
      duration: item.duration ?? undefined,
      name: item.name,
      width,
      height,
      x: worldCenterX - width / 2,
      y: worldCenterY - height / 2,
    });
    setSelectedIds([newId]);

    // Corrected moments later once the real aspect ratio is known — without
    // this, Konva stretches the square to fill exactly, so any non-square
    // photo (nearly all of them) looked visibly squished/cropped instead of
    // showing the whole picture. The thumbnail is already loaded/cached
    // from being visible in this grid, so this resolves near-instantly in
    // practice — a brief size correction, not a perceptible delay.
    const dimensionSrc = item.thumbnailUrl ?? item.url;
    loadImageDimensions(dimensionSrc)
      .then((natural) => {
        if (natural.width <= 0 || natural.height <= 0) return;
        const scale = DEFAULT_OBJECT_SIZE / Math.max(natural.width, natural.height);
        const correctedWidth = Math.round(natural.width * scale);
        const correctedHeight = Math.round(natural.height * scale);
        updateObject(projectId, newId, {
          width: correctedWidth,
          height: correctedHeight,
          x: worldCenterX - correctedWidth / 2,
          y: worldCenterY - correctedHeight / 2,
        });
      })
      .catch(() => {
        // Keep the default square if dimensions can't be read.
      });
  }

  if (placeable.length === 0) {
    return (
      <EmptyState
        compact
        icon={ImagePlus}
        title="No media yet"
        description="Upload photos or video to your media library to add them here."
        action={
          <Link
            href="/dashboard/media"
            className="text-xs font-medium text-primary hover:underline"
          >
            Go to Media Library
          </Link>
        }
      />
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="grid grid-cols-3 gap-2 p-2">
        {placeable.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleAdd(item)}
            className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
            title={`Add "${item.name}" to canvas`}
          >
            {item.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbnailUrl}
                alt={item.name}
                className="size-full object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <Film className="size-5 text-muted-foreground" />
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
              <ImagePlus className="size-5 text-white" />
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
