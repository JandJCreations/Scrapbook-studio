"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CropRect } from "@/types/photo-adjustments";

const DISPLAY_MAX = 440;
const HANDLE_SIZE = 12;

type Rect = CropRect;

interface CropDialogProps {
  objectId: string;
  previewSrc: string;
  initialCrop: CropRect | null;
  naturalWidth: number;
  naturalHeight: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (crop: CropRect) => void;
  title?: string;
}

export function CropDialog({
  objectId,
  previewSrc,
  initialCrop,
  naturalWidth,
  naturalHeight,
  open,
  onOpenChange,
  onApply,
  title = "Crop image",
}: CropDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {open && (
          <CropDialogBody
            key={objectId}
            previewSrc={previewSrc}
            initialCrop={initialCrop}
            naturalWidth={naturalWidth}
            naturalHeight={naturalHeight}
            onApply={onApply}
            onDone={() => onOpenChange(false)}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="crop-form">
            Apply crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DragMode =
  | { kind: "move"; startX: number; startY: number; origin: Rect }
  | {
      kind: "resize";
      handle: "nw" | "ne" | "sw" | "se";
      startX: number;
      startY: number;
      origin: Rect;
    }
  | null;

function CropDialogBody({
  previewSrc,
  initialCrop,
  naturalWidth,
  naturalHeight,
  onApply,
  onDone,
}: {
  previewSrc: string;
  initialCrop: CropRect | null;
  naturalWidth: number;
  naturalHeight: number;
  onApply: (crop: CropRect) => void;
  onDone: () => void;
}) {
  const displayScale = Math.min(
    DISPLAY_MAX / naturalWidth,
    DISPLAY_MAX / naturalHeight,
    1,
  );
  const displayWidth = naturalWidth * displayScale;
  const displayHeight = naturalHeight * displayScale;

  const [crop, setCrop] = React.useState<Rect>(() =>
    toDisplayRect(
      initialCrop ?? {
        x: 0,
        y: 0,
        width: naturalWidth,
        height: naturalHeight,
      },
      displayScale,
    ),
  );
  const dragRef = React.useRef<DragMode>(null);

  React.useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.kind === "move") {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        setCrop({
          ...drag.origin,
          x: clamp(drag.origin.x + dx, 0, displayWidth - drag.origin.width),
          y: clamp(drag.origin.y + dy, 0, displayHeight - drag.origin.height),
        });
      } else if (drag.kind === "resize") {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        setCrop(
          resizeRect(drag.origin, drag.handle, dx, dy, displayWidth, displayHeight),
        );
      }
    }

    function onUp() {
      dragRef.current = null;
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [displayWidth, displayHeight]);

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    const naturalCrop = {
      x: Math.round(crop.x / displayScale),
      y: Math.round(crop.y / displayScale),
      width: Math.round(crop.width / displayScale),
      height: Math.round(crop.height / displayScale),
    };
    onApply(naturalCrop);
    onDone();
  }

  return (
    <form id="crop-form" onSubmit={handleConfirm}>
      <div
        className="relative mx-auto select-none overflow-hidden rounded-md bg-muted"
        style={{ width: displayWidth, height: displayHeight }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewSrc}
          alt=""
          className="pointer-events-none absolute inset-0 size-full object-fill opacity-50"
          draggable={false}
        />
        <div
          className="absolute cursor-move overflow-hidden border-2 border-primary"
          style={{
            left: crop.x,
            top: crop.y,
            width: crop.width,
            height: crop.height,
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            dragRef.current = {
              kind: "move",
              startX: e.clientX,
              startY: e.clientY,
              origin: crop,
            };
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewSrc}
            alt=""
            draggable={false}
            className="pointer-events-none absolute"
            style={{
              width: displayWidth,
              height: displayHeight,
              left: -crop.x,
              top: -crop.y,
            }}
          />

          {(["nw", "ne", "sw", "se"] as const).map((handle) => (
            <div
              key={handle}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dragRef.current = {
                  kind: "resize",
                  handle,
                  startX: e.clientX,
                  startY: e.clientY,
                  origin: crop,
                };
              }}
              className="absolute rounded-full border-2 border-primary bg-background"
              style={{
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
                left: handle.includes("w") ? -HANDLE_SIZE / 2 : undefined,
                right: handle.includes("e") ? -HANDLE_SIZE / 2 : undefined,
                top: handle.includes("n") ? -HANDLE_SIZE / 2 : undefined,
                bottom: handle.includes("s") ? -HANDLE_SIZE / 2 : undefined,
                cursor:
                  handle === "nw" || handle === "se" ? "nwse-resize" : "nesw-resize",
              }}
            />
          ))}
        </div>
      </div>
    </form>
  );
}

function toDisplayRect(rect: Rect, scale: number): Rect {
  return {
    x: rect.x * scale,
    y: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function resizeRect(
  origin: Rect,
  handle: "nw" | "ne" | "sw" | "se",
  dx: number,
  dy: number,
  boundsWidth: number,
  boundsHeight: number,
): Rect {
  const MIN = 24;
  let { x, y, width, height } = origin;

  if (handle.includes("e")) {
    width = clamp(origin.width + dx, MIN, boundsWidth - origin.x);
  }
  if (handle.includes("s")) {
    height = clamp(origin.height + dy, MIN, boundsHeight - origin.y);
  }
  if (handle.includes("w")) {
    const newX = clamp(origin.x + dx, 0, origin.x + origin.width - MIN);
    width = origin.width + (origin.x - newX);
    x = newX;
  }
  if (handle.includes("n")) {
    const newY = clamp(origin.y + dy, 0, origin.y + origin.height - MIN);
    height = origin.height + (origin.y - newY);
    y = newY;
  }

  return { x, y, width, height };
}
