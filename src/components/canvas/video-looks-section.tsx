"use client";

import { Palette } from "lucide-react";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/use-canvas-store";
import type { CanvasObject } from "@/types/canvas";
import {
  FILTER_PRESETS,
  filterPresetToCss,
  type FilterPreset,
} from "@/types/photo-adjustments";

const LOOKS: { value: FilterPreset; label: string }[] = [
  { value: "none", label: "Original" },
  { value: "vivid", label: "Vivid" },
  { value: "mono", label: "Mono" },
  { value: "vintage", label: "Vintage" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
  { value: "fade", label: "Fade" },
  { value: "noir", label: "Noir" },
];

/**
 * The same looks photos have, for video. Video renders through a simpler
 * filter chain (brightness/contrast/saturation), so a look sets those
 * sliders — which you can then fine-tune — rather than a separate filter.
 */
export function VideoLooksSection({
  projectId,
  object,
}: {
  projectId: string;
  object: CanvasObject;
}) {
  const updateVideoAdjustments = useCanvasStore((s) => s.updateVideoAdjustments);
  const adjustments = object.videoAdjustments;
  if (!adjustments) return null;
  const active = adjustments.filterPreset ?? "none";

  function apply(preset: FilterPreset) {
    const p = FILTER_PRESETS[preset];
    updateVideoAdjustments(projectId, object.id, {
      filterPreset: preset,
      // Video's brightness is -100..100 like photo exposure+brightness.
      brightness: Math.round((p.brightness ?? 0) + (p.exposure ?? 0)),
      contrast: p.contrast ?? 0,
      saturation: p.saturation ?? 0,
    });
  }

  return (
    <AccordionItem value="looks">
      <AccordionTrigger>
        <span className="flex items-center gap-2">
          <Palette className="size-4 text-muted-foreground" />
          Looks
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="grid grid-cols-4 gap-1.5">
          {LOOKS.map((look) => (
            <button
              key={look.value}
              type="button"
              onClick={() => apply(look.value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md p-1 transition-colors",
                active === look.value ? "text-primary" : "text-muted-foreground hover:bg-accent",
              )}
            >
              <span
                className={cn(
                  "aspect-square w-full overflow-hidden rounded-md border-2 bg-muted bg-cover bg-center",
                  active === look.value ? "border-primary" : "border-transparent",
                )}
                style={{
                  backgroundImage: object.src ? `url(${object.src})` : undefined,
                  filter: filterPresetToCss(look.value),
                }}
              />
              <span className="text-[11px] font-medium">{look.label}</span>
            </button>
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
