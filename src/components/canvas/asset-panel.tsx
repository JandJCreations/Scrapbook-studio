"use client";

import * as React from "react";
import { Trash2, Upload } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ASSET_CATEGORY_LABELS,
  getAssetsByCategory,
} from "@/lib/assets/asset-catalog";
import { DEFAULT_OBJECT_SIZE } from "@/lib/canvas/constants";
import { SHAPE_OPTIONS, shapeToDataUrl } from "@/lib/design/shapes";
import type { ShapeKind } from "@/types/object-extras";
import { useCanvasStore } from "@/store/use-canvas-store";
import { useStickerStore } from "@/store/use-sticker-store";
import type { AssetCategory } from "@/types/asset";

const CATEGORIES: AssetCategory[] = [
  "stickers",
  "emojis",
  "frames",
  "washiTape",
  "polaroids",
  "shapes",
  "floral",
  "paperTextures",
  "tornPaper",
  "notebookPaper",
  "cardboard",
];

interface AssetPanelProps {
  projectId: string;
  stageWidth: number;
  stageHeight: number;
}

export function AssetPanel({ projectId, stageWidth, stageHeight }: AssetPanelProps) {
  const addObject = useCanvasStore((s) => s.addObject);
  const addShape = useCanvasStore((s) => s.addShape);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const viewport = useCanvasStore((s) => s.viewport);
  const stickers = useStickerStore((s) => s.stickers);
  const addSticker = useStickerStore((s) => s.addSticker);
  const removeSticker = useStickerStore((s) => s.removeSticker);
  const fetchStickers = useStickerStore((s) => s.fetchStickers);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    fetchStickers();
  }, [fetchStickers]);

  function addAssetToCanvas(src: string, name: string, width: number, height: number) {
    const worldCenterX = (-viewport.x + stageWidth / 2) / viewport.scale;
    const worldCenterY = (-viewport.y + stageHeight / 2) / viewport.scale;
    const aspect = width / height;
    const objWidth = Math.min(DEFAULT_OBJECT_SIZE, width * 1.5);
    const objHeight = objWidth / aspect;

    const newId = addObject(projectId, {
      type: "image",
      mediaId: `asset-${name}`,
      src,
      name,
      x: worldCenterX - objWidth / 2,
      y: worldCenterY - objHeight / 2,
      width: objWidth,
      height: objHeight,
    });
    setSelectedIds([newId]);
  }

  function addBasicShape(kind: ShapeKind) {
    const worldCenterX = (-viewport.x + stageWidth / 2) / viewport.scale;
    const worldCenterY = (-viewport.y + stageHeight / 2) / viewport.scale;
    const width = kind === "line" || kind === "arrow" ? 260 : 200;
    const height = kind === "line" ? 24 : kind === "arrow" ? 120 : 200;
    const newId = addShape(
      projectId,
      { kind, fill: "#8b5cf6", stroke: "#4c1d95", strokeWidth: kind === "line" ? 6 : 0 },
      { x: worldCenterX - width / 2, y: worldCenterY - height / 2, width, height },
    );
    setSelectedIds([newId]);
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-3 p-2">
        <div>
          <p className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">Basic shapes</p>
          <div className="grid grid-cols-4 gap-1.5">
            {SHAPE_OPTIONS.map((option) => (
              <button
                key={option.kind}
                type="button"
                onClick={() => addBasicShape(option.kind)}
                className="flex flex-col items-center gap-1 rounded-md border border-border p-1.5 hover:bg-accent"
                title={`Add ${option.label.toLowerCase()} (colours are editable)`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shapeToDataUrl({
                    kind: option.kind,
                    fill: "#8b5cf6",
                    stroke: "#4c1d95",
                    strokeWidth: option.kind === "line" ? 6 : 0,
                  })}
                  alt=""
                  className="size-8 object-contain"
                />
                <span className="text-[10px] text-muted-foreground">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-xs font-semibold">My stickers</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Upload custom sticker"
            >
              <Upload className="size-3.5" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png"
              multiple
              className="hidden"
              onChange={(e) => {
                Array.from(e.target.files ?? []).forEach((file) => addSticker(file));
                e.target.value = "";
              }}
            />
          </div>
          {stickers.length === 0 ? (
            <p className="px-1 text-[11px] text-muted-foreground">
              Upload your own PNG stickers to use here.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {stickers.map((sticker) => (
                <div key={sticker.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => addAssetToCanvas(sticker.src, sticker.name, 200, 200)}
                    className="flex aspect-square w-full items-center justify-center rounded-md border border-border bg-muted p-2 hover:border-primary"
                    title={`Add "${sticker.name}"`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sticker.src} alt={sticker.name} className="max-h-full max-w-full" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSticker(sticker.id)}
                    className="absolute -top-1 -right-1 hidden size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
                    aria-label={`Remove ${sticker.name}`}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Accordion type="multiple" defaultValue={["stickers", "emojis"]}>
          {CATEGORIES.map((category) => {
            const items = getAssetsByCategory(category);
            return (
              <AccordionItem key={category} value={category}>
                <AccordionTrigger className="text-xs">
                  {ASSET_CATEGORY_LABELS[category]}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-3 gap-1.5">
                    {items.map((assetItem) => (
                      <button
                        key={assetItem.id}
                        type="button"
                        onClick={() =>
                          addAssetToCanvas(
                            assetItem.src,
                            assetItem.name,
                            assetItem.width,
                            assetItem.height,
                          )
                        }
                        className="flex aspect-square items-center justify-center rounded-md border border-border bg-muted/40 p-2 hover:border-primary hover:bg-muted"
                        title={`Add "${assetItem.name}"`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={assetItem.src}
                          alt={assetItem.name}
                          className="max-h-full max-w-full"
                        />
                      </button>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </ScrollArea>
  );
}
