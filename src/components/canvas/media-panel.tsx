"use client";

import * as React from "react";
import { ImagePlus, X } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { MediaThumbnail } from "@/components/media/media-thumbnail";
import { MediaUploadButton } from "@/components/media/media-upload-button";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DEFAULT_OBJECT_SIZE } from "@/lib/canvas/constants";
import { cn } from "@/lib/utils";
import { useCanvasObjects, useCanvasStore } from "@/store/use-canvas-store";
import { useEditorUiStore } from "@/store/use-editor-ui-store";
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
  const fillPlaceholder = useCanvasStore((s) => s.fillPlaceholder);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const viewport = useCanvasStore((s) => s.viewport);
  const objects = useCanvasObjects(projectId);
  const fillTargetObjectId = useEditorUiStore((s) => s.fillTargetObjectId);
  const clearFillTarget = useEditorUiStore((s) => s.clearFillTarget);
  const setSidebarOpen = useEditorUiStore((s) => s.setSidebarOpen);

  React.useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const fillTarget = fillTargetObjectId
    ? (objects.find((o) => o.id === fillTargetObjectId) ?? null)
    : null;

  // Includes items still processing (or errored) so uploads show up with a
  // thumbnail/progress indicator right away instead of vanishing from the
  // grid until they finish — only "ready" ones are actually clickable below.
  const placeable = items.filter(
    (i) =>
      (i.type === "image" || i.type === "video") &&
      (!fillTarget || i.type === fillTarget.type),
  );

  function handleAdd(item: (typeof placeable)[number]) {
    if (item.status !== "ready") return;

    if (fillTargetObjectId) {
      // Filling an existing template slot keeps its position/size exactly
      // as laid out — unlike a freely-added object, there's no "centered at
      // default size, corrected to aspect ratio moments later" dance here.
      fillPlaceholder(projectId, fillTargetObjectId, {
        mediaId: item.id,
        src: item.type === "video" ? (item.thumbnailUrl ?? item.url) : item.url,
        videoSrc: item.type === "video" ? item.url : undefined,
        duration: item.duration ?? undefined,
        name: item.name,
      });
      setSelectedIds([fillTargetObjectId]);
      clearFillTarget();
      setSidebarOpen(false);
      return;
    }

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

  const fillBanner = fillTarget && (
    <div className="flex items-center justify-between gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
      <span className="text-xs font-medium text-primary">
        Choose a {fillTarget.type} for this slot
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        aria-label="Cancel"
        onClick={() => clearFillTarget()}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );

  if (placeable.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {fillBanner}
        <EmptyState
          compact
          icon={ImagePlus}
          title={fillTarget ? `No ${fillTarget.type}s yet` : "No media yet"}
          description={
            fillTarget
              ? `Upload a ${fillTarget.type} to fill this slot.`
              : "Upload photos or video to add them here."
          }
          action={<MediaUploadButton folderId={null} />}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {fillBanner}
      <ScrollArea className="flex-1">
      <div className="flex items-center justify-between gap-2 p-2 pb-0">
        <span className="text-xs font-medium text-muted-foreground">Your media</span>
        <MediaUploadButton folderId={null} />
      </div>
      <div className="grid grid-cols-3 gap-2 p-2">
        {placeable.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={item.status !== "ready"}
            onClick={() => handleAdd(item)}
            className={cn(
              "group relative overflow-hidden rounded-md border border-border",
              item.status !== "ready" && "cursor-default",
            )}
            title={
              item.status === "ready"
                ? `Add "${item.name}" to canvas`
                : item.status === "error"
                  ? item.error
                  : "Uploading…"
            }
          >
            <MediaThumbnail item={item} className="aspect-square w-full" />
            {item.status === "ready" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                <ImagePlus className="size-5 text-white" />
              </div>
            )}
          </button>
        ))}
      </div>
      </ScrollArea>
    </div>
  );
}
