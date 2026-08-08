"use client";

import * as React from "react";
import {
  Crop,
  FlipHorizontal,
  FlipVertical,
  RotateCcw,
  RotateCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AdjustmentSlider } from "@/components/canvas/adjustment-slider";
import { Button } from "@/components/ui/button";
import { CropDialog } from "@/components/canvas/crop-dialog";
import { EditPanelShell } from "@/components/canvas/edit-panel-shell";
import { ObjectTimingPanel } from "@/components/canvas/object-timing-panel";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useImageElement } from "@/hooks/use-image-element";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/use-canvas-store";
import type {
  BlendMode,
  FilterPreset,
  PhotoAdjustments,
} from "@/types/photo-adjustments";
import type { CanvasObject } from "@/types/canvas";

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: "source-over", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "darken", label: "Darken" },
  { value: "lighten", label: "Lighten" },
  { value: "color-dodge", label: "Color dodge" },
  { value: "color-burn", label: "Color burn" },
  { value: "hard-light", label: "Hard light" },
  { value: "soft-light", label: "Soft light" },
  { value: "difference", label: "Difference" },
  { value: "exclusion", label: "Exclusion" },
];

const FILTER_PRESET_OPTIONS: { value: FilterPreset; label: string }[] = [
  { value: "none", label: "None" },
  { value: "vivid", label: "Vivid" },
  { value: "mono", label: "Mono" },
  { value: "vintage", label: "Vintage" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
  { value: "fade", label: "Fade" },
  { value: "noir", label: "Noir" },
];

export function PhotoEditPanel({
  projectId,
  object,
}: {
  projectId: string;
  object: CanvasObject;
}) {
  const updateAdjustments = useCanvasStore((s) => s.updateAdjustments);
  const resetAdjustments = useCanvasStore((s) => s.resetAdjustments);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const [cropOpen, setCropOpen] = React.useState(false);
  const imageEl = useImageElement(object.src);

  const adjustments = object.adjustments;
  if (!adjustments) return null;

  function patch(update: Partial<PhotoAdjustments>) {
    updateAdjustments(projectId, object.id, update);
  }

  return (
    <>
      <EditPanelShell
        title="Edit photo"
        onReset={() => resetAdjustments(projectId, object.id)}
        onClose={() => setSelectedIds([])}
      >
      <ScrollArea className="flex-1">
        <Accordion
          type="multiple"
          defaultValue={["timing", "transform", "light", "color"]}
          className="px-3"
        >
          <ObjectTimingPanel projectId={projectId} object={object} />

          <AccordionItem value="transform">
            <AccordionTrigger>Crop &amp; transform</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => setCropOpen(true)}
                disabled={!imageEl}
              >
                <Crop className="size-3.5" />
                Crop
              </Button>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    updateObject(projectId, object.id, {
                      rotation: (object.rotation - 90 + 360) % 360,
                    })
                  }
                >
                  <RotateCcw className="size-3.5" />
                  Rotate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    updateObject(projectId, object.id, {
                      rotation: (object.rotation + 90) % 360,
                    })
                  }
                >
                  <RotateCw className="size-3.5" />
                  Rotate
                </Button>
              </div>

              <AdjustmentSlider
                label="Angle"
                value={Math.round(object.rotation)}
                min={0}
                max={359}
                onChange={(v) =>
                  updateObject(projectId, object.id, { rotation: v })
                }
              />

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={adjustments.flipHorizontal ? "secondary" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    patch({ flipHorizontal: !adjustments.flipHorizontal })
                  }
                >
                  <FlipHorizontal className="size-3.5" />
                  Flip H
                </Button>
                <Button
                  variant={adjustments.flipVertical ? "secondary" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    patch({ flipVertical: !adjustments.flipVertical })
                  }
                >
                  <FlipVertical className="size-3.5" />
                  Flip V
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="light">
            <AccordionTrigger>Light</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              <AdjustmentSlider
                label="Brightness"
                value={adjustments.brightness}
                min={-100}
                max={100}
                onChange={(v) => patch({ brightness: v })}
              />
              <AdjustmentSlider
                label="Contrast"
                value={adjustments.contrast}
                min={-100}
                max={100}
                onChange={(v) => patch({ contrast: v })}
              />
              <AdjustmentSlider
                label="Exposure"
                value={adjustments.exposure}
                min={-100}
                max={100}
                onChange={(v) => patch({ exposure: v })}
              />
              <AdjustmentSlider
                label="Highlights"
                value={adjustments.highlights}
                min={-100}
                max={100}
                onChange={(v) => patch({ highlights: v })}
              />
              <AdjustmentSlider
                label="Shadows"
                value={adjustments.shadowsTone}
                min={-100}
                max={100}
                onChange={(v) => patch({ shadowsTone: v })}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="color">
            <AccordionTrigger>Color &amp; filters</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              <AdjustmentSlider
                label="Saturation"
                value={adjustments.saturation}
                min={-100}
                max={100}
                onChange={(v) => patch({ saturation: v })}
              />

              <div className="grid grid-cols-4 gap-1.5">
                {FILTER_PRESET_OPTIONS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => patch({ filterPreset: preset.value })}
                    className={cn(
                      "rounded-md border px-1.5 py-1.5 text-[11px] font-medium transition-colors",
                      adjustments.filterPreset === preset.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="effects">
            <AccordionTrigger>Effects</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              <AdjustmentSlider
                label="Blur"
                value={adjustments.blur}
                min={0}
                max={20}
                onChange={(v) => patch({ blur: v })}
              />
              <AdjustmentSlider
                label="Sharpness"
                value={adjustments.sharpness}
                min={0}
                max={100}
                onChange={(v) => patch({ sharpness: v })}
              />
              <AdjustmentSlider
                label="Opacity"
                value={adjustments.opacity}
                min={0}
                max={100}
                onChange={(v) => patch({ opacity: v })}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="style">
            <AccordionTrigger>Style</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-normal text-muted-foreground">
                    Border
                  </Label>
                  <input
                    type="color"
                    value={adjustments.borderColor}
                    onChange={(e) => patch({ borderColor: e.target.value })}
                    className="size-6 cursor-pointer rounded border border-border bg-transparent"
                  />
                </div>
                <AdjustmentSlider
                  label="Width"
                  value={adjustments.borderWidth}
                  min={0}
                  max={40}
                  onChange={(v) => patch({ borderWidth: v })}
                />
              </div>

              <AdjustmentSlider
                label="Rounded corners"
                value={adjustments.borderRadius}
                min={0}
                max={100}
                onChange={(v) => patch({ borderRadius: v })}
              />

              <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Shadow</Label>
                  <Switch
                    checked={adjustments.shadow.enabled}
                    onCheckedChange={(checked) =>
                      patch({ shadow: { ...adjustments.shadow, enabled: checked } })
                    }
                  />
                </div>
                {adjustments.shadow.enabled && (
                  <>
                    <input
                      type="color"
                      value={adjustments.shadow.color}
                      onChange={(e) =>
                        patch({
                          shadow: { ...adjustments.shadow, color: e.target.value },
                        })
                      }
                      className="h-6 w-full cursor-pointer rounded border border-border bg-transparent"
                    />
                    <AdjustmentSlider
                      label="Blur"
                      value={adjustments.shadow.blur}
                      min={0}
                      max={60}
                      onChange={(v) =>
                        patch({ shadow: { ...adjustments.shadow, blur: v } })
                      }
                    />
                    <AdjustmentSlider
                      label="Offset X"
                      value={adjustments.shadow.offsetX}
                      min={-40}
                      max={40}
                      onChange={(v) =>
                        patch({ shadow: { ...adjustments.shadow, offsetX: v } })
                      }
                    />
                    <AdjustmentSlider
                      label="Offset Y"
                      value={adjustments.shadow.offsetY}
                      min={-40}
                      max={40}
                      onChange={(v) =>
                        patch({ shadow: { ...adjustments.shadow, offsetY: v } })
                      }
                    />
                    <AdjustmentSlider
                      label="Opacity"
                      value={adjustments.shadow.opacity}
                      min={0}
                      max={100}
                      onChange={(v) =>
                        patch({ shadow: { ...adjustments.shadow, opacity: v } })
                      }
                    />
                  </>
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Glow</Label>
                  <Switch
                    checked={adjustments.glow.enabled}
                    onCheckedChange={(checked) =>
                      patch({ glow: { ...adjustments.glow, enabled: checked } })
                    }
                  />
                </div>
                {adjustments.glow.enabled && (
                  <>
                    <input
                      type="color"
                      value={adjustments.glow.color}
                      onChange={(e) =>
                        patch({ glow: { ...adjustments.glow, color: e.target.value } })
                      }
                      className="h-6 w-full cursor-pointer rounded border border-border bg-transparent"
                    />
                    <AdjustmentSlider
                      label="Blur"
                      value={adjustments.glow.blur}
                      min={0}
                      max={60}
                      onChange={(v) =>
                        patch({ glow: { ...adjustments.glow, blur: v } })
                      }
                    />
                    <AdjustmentSlider
                      label="Opacity"
                      value={adjustments.glow.opacity}
                      min={0}
                      max={100}
                      onChange={(v) =>
                        patch({ glow: { ...adjustments.glow, opacity: v } })
                      }
                    />
                  </>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-normal text-muted-foreground">
                  Blend mode
                </Label>
                <Select
                  value={adjustments.blendMode}
                  onValueChange={(v) => patch({ blendMode: v as BlendMode })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BLEND_MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="ai">
            <AccordionTrigger>AI tools</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-2">
              <Button
                variant={adjustments.aiBackgroundRemoved ? "secondary" : "outline"}
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => {
                  patch({ aiBackgroundRemoved: !adjustments.aiBackgroundRemoved });
                  toast.info("AI background removal is coming soon");
                }}
              >
                <Wand2 className="size-3.5" />
                Remove background
              </Button>
              <Button
                variant={adjustments.aiObjectsRemoved ? "secondary" : "outline"}
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => {
                  patch({ aiObjectsRemoved: !adjustments.aiObjectsRemoved });
                  toast.info("AI object removal is coming soon");
                }}
              >
                <Sparkles className="size-3.5" />
                Remove objects
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </ScrollArea>
      </EditPanelShell>

      {imageEl && (
        <CropDialog
          objectId={object.id}
          previewSrc={object.src}
          initialCrop={adjustments.crop}
          naturalWidth={imageEl.naturalWidth}
          naturalHeight={imageEl.naturalHeight}
          open={cropOpen}
          onOpenChange={setCropOpen}
          onApply={(crop) => {
            patch({ crop });
            const aspect = crop.width / crop.height;
            updateObject(projectId, object.id, {
              height: Math.round(object.width / aspect),
            });
          }}
        />
      )}
    </>
  );
}
