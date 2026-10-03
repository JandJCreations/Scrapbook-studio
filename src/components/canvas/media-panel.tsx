"use client";

import * as React from "react";
import { Check, CheckSquare, ImagePlus, X } from "lucide-react";

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
import type { MediaItem } from "@/types/media";

interface MediaPanelProps {
  projectId: string;
  stageWidth: number;
  stageHeight: number;
}

// Screen pixels between each item in a staggered multi-add, converted to
// world units so the cascade looks the same size regardless of zoom level.
const STAGGER_SCREEN_PX = 28;

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

  const [selectMode, setSelectMode] = React.useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = React.useState<Set<string>>(new Set());

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

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedMediaIds(new Set());
  }

  function toggleMediaSelected(id: string) {
    setSelectedMediaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Places one item at the viewport center, offset by `index` steps so a
  // batch add fans items out diagonally instead of stacking them exactly on
  // top of each other. Returns the new object's id so callers can select
  // everything they just placed together.
  function addItemToCanvas(item: MediaItem, index: number): string {
    const stagger = (STAGGER_SCREEN_PX * index) / viewport.scale;
    const worldCenterX = (-viewport.x + stageWidth / 2) / viewport.scale + stagger;
    const worldCenterY = (-viewport.y + stageHeight / 2) / viewport.scale + stagger;
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

    return newId;
  }

  function handleAdd(item: MediaItem) {
    if (item.status !== "ready") return;

    if (selectMode) {
      toggleMediaSelected(item.id);
      return;
    }

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

    const newId = addItemToCanvas(item, 0);
    setSelectedIds([newId]);
  }

  function handleAddSelected() {
    const toAdd = placeable.filter((i) => i.status === "ready" && selectedMediaIds.has(i.id));
    if (toAdd.length === 0) return;
    const newIds = toAdd.map((item, index) => addItemToCanvas(item, index));
    // Selecting everything just placed lets you immediately drag, nudge, or
    // batch-edit the whole group together via the selection toolbar —
    // picking several media items should let you work with them as a set,
    // not just drop them one by one.
    setSelectedIds(newIds);
    exitSelectMode();
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

  const selectBar = selectMode && (
    <div className="flex items-center justify-between gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
      <span className="text-xs font-medium text-primary">
        {selectedMediaIds.size === 0
          ? "Select media to add"
          : `${selectedMediaIds.size} selected`}
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          className="h-7 px-2.5 text-xs"
          disabled={selectedMediaIds.size === 0}
          onClick={handleAddSelected}
        >
          Add to canvas
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          aria-label="Cancel"
          onClick={exitSelectMode}
        >
          <X className="size-3.5" />
        </Button>
      </div>
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
      {selectBar}
      <ScrollArea className="flex-1">
      <div className="flex items-center justify-between gap-2 p-2 pb-0">
        <span className="text-xs font-medium text-muted-foreground">Your media</span>
        <div className="flex items-center gap-1">
          {!fillTarget && (
            <Button
              variant={selectMode ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              aria-pressed={selectMode}
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            >
              <CheckSquare className="size-3.5" />
              Select
            </Button>
          )}
          <MediaUploadButton folderId={null} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 p-2">
        {placeable.map((item) => {
          const isSelected = selectedMediaIds.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.status !== "ready"}
              onClick={() => handleAdd(item)}
              className={cn(
                "group relative overflow-hidden rounded-md border",
                isSelected ? "border-primary ring-2 ring-primary" : "border-border",
                item.status !== "ready" && "cursor-default",
              )}
              title={
                item.status === "ready"
                  ? selectMode
                    ? `Select "${item.name}"`
                    : `Add "${item.name}" to canvas`
                  : item.status === "error"
                    ? item.error
                    : "Uploading…"
              }
            >
              <MediaThumbnail item={item} className="aspect-square w-full" />
              {selectMode && item.status === "ready" && (
                <span
                  className={cn(
                    "absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full border-2 border-white shadow",
                    isSelected ? "bg-primary" : "bg-black/30",
                  )}
                >
                  {isSelected && <Check className="size-3.5 text-primary-foreground" />}
                </span>
              )}
              {!selectMode && item.status === "ready" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                  <ImagePlus className="size-5 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      </ScrollArea>
    </div>
  );
}
