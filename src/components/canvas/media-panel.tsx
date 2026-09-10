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
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const viewport = useCanvasStore((s) => s.viewport);

  React.useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const placeable = items.filter(
    (i) => i.status === "ready" && (i.type === "image" || i.type === "video"),
  );

  async function handleAdd(item: (typeof placeable)[number]) {
    const worldCenterX = (-viewport.x + stageWidth / 2) / viewport.scale;
    const worldCenterY = (-viewport.y + stageHeight / 2) / viewport.scale;

    // Without this, every new object defaulted to a fixed square, which
    // Konva stretches the source image to fill exactly — any non-square
    // photo (i.e. almost all of them) came in visibly squished/cropped-
    // looking instead of showing the whole picture undistorted. The
    // thumbnail (already loaded/cached from being visible in this grid) is
    // enough to read the real aspect ratio from — no need to wait on the
    // full-resolution original just to measure it.
    let width = DEFAULT_OBJECT_SIZE;
    let height = DEFAULT_OBJECT_SIZE;
    const dimensionSrc = item.thumbnailUrl ?? item.url;
    try {
      const natural = await loadImageDimensions(dimensionSrc);
      if (natural.width > 0 && natural.height > 0) {
        const scale = DEFAULT_OBJECT_SIZE / Math.max(natural.width, natural.height);
        width = Math.round(natural.width * scale);
        height = Math.round(natural.height * scale);
      }
    } catch {
      // Fall back to the default square if dimensions can't be read.
    }

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
