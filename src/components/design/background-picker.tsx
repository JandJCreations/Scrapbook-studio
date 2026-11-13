"use client";

import { PaintBucket } from "lucide-react";

import { ColorField } from "@/components/design/color-field";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BACKGROUND_PRESETS, backgroundCss } from "@/lib/design/shapes";
import { pageOf } from "@/lib/story/story";
import { cn } from "@/lib/utils";
import { useCanvasFrame } from "@/store/use-canvas-frame-store";
import { useCanvasObjects, useCanvasStore } from "@/store/use-canvas-store";

/** Page background: preset colours/gradients, a custom colour, or none. */
export function BackgroundPicker({ projectId }: { projectId: string }) {
  const objects = useCanvasObjects(projectId);
  const page = useCanvasStore((s) => s.currentPage);
  const setPageBackground = useCanvasStore((s) => s.setPageBackground);
  const frame = useCanvasFrame(projectId);
  const current = objects.find((o) => o.extras?.background && pageOf(o) === page)?.extras
    ?.background;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="shrink-0 gap-2" aria-label="Page background">
          <span
            className="size-4 rounded border border-border"
            style={{ background: current ? backgroundCss(current) : "transparent" }}
          />
          <span className="hidden lg:inline">Background</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-3">
        <DropdownMenuLabel className="flex items-center gap-2 px-0">
          <PaintBucket className="size-4" /> Page background
        </DropdownMenuLabel>
        <div className="grid grid-cols-6 gap-1.5 py-2">
          {BACKGROUND_PRESETS.map((bg) => {
            const active =
              current?.color === bg.color && (current?.color2 ?? null) === (bg.color2 ?? null);
            return (
              <button
                key={`${bg.color}-${bg.color2 ?? ""}`}
                type="button"
                onClick={() => setPageBackground(projectId, bg, frame)}
                className={cn(
                  "aspect-square rounded-md border",
                  active ? "ring-2 ring-primary" : "border-border",
                )}
                style={{ background: backgroundCss(bg) }}
                aria-label={bg.color2 ? `Gradient ${bg.color} to ${bg.color2}` : `Colour ${bg.color}`}
              />
            );
          })}
        </div>
        <ColorField
          label="Custom colour"
          value={current?.color ?? "#ffffff"}
          onChange={(color) => setPageBackground(projectId, { color }, frame)}
        />
        {current && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full text-xs"
            onClick={() => setPageBackground(projectId, null, frame)}
          >
            Remove background
          </Button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
