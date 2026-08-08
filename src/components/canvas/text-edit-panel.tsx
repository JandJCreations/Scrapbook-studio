"use client";

import * as React from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Type,
  Upload,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AdjustmentSlider } from "@/components/canvas/adjustment-slider";
import { Button } from "@/components/ui/button";
import { EditPanelShell } from "@/components/canvas/edit-panel-shell";
import { Label } from "@/components/ui/label";
import { ObjectTimingPanel } from "@/components/canvas/object-timing-panel";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { GOOGLE_FONTS } from "@/lib/fonts/google-fonts-catalog";
import { loadGoogleFont } from "@/lib/fonts/load-google-font";
import { useCanvasStore } from "@/store/use-canvas-store";
import { useCustomFontStore } from "@/store/use-custom-font-store";
import type { CanvasObject } from "@/types/canvas";
import type { TextAdjustments, TextAlign } from "@/types/text-adjustments";

export function TextEditPanel({
  projectId,
  object,
}: {
  projectId: string;
  object: CanvasObject;
}) {
  const updateTextAdjustments = useCanvasStore((s) => s.updateTextAdjustments);
  const resetTextAdjustments = useCanvasStore((s) => s.resetTextAdjustments);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const customFonts = useCustomFontStore((s) => s.fonts);
  const addFont = useCustomFontStore((s) => s.addFont);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const adjustments = object.textAdjustments;
  if (!adjustments) return null;

  function patch(update: Partial<TextAdjustments>) {
    updateTextAdjustments(projectId, object.id, update);
  }

  async function handleFontChange(family: string) {
    const isCustom = customFonts.some((f) => f.family === family);
    if (!isCustom) await loadGoogleFont(family);
    patch({ fontFamily: family });
  }

  return (
    <EditPanelShell
      title="Edit text"
      onReset={() => resetTextAdjustments(projectId, object.id)}
      onClose={() => setSelectedIds([])}
      footer={
        <div className="border-t border-border p-2 text-center text-[11px] text-muted-foreground">
          <Type className={cn("mr-1 inline size-3")} />
          Double-click the text on canvas to edit its content
        </div>
      }
    >
      <ScrollArea className="flex-1">
        <Accordion
          type="multiple"
          defaultValue={["content", "timing"]}
          className="px-3"
        >
          <AccordionItem value="content">
            <AccordionTrigger>Content &amp; font</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-normal text-muted-foreground">
                  Font
                </Label>
                <Select value={adjustments.fontFamily} onValueChange={handleFontChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {customFonts.length > 0 && (
                      <>
                        {customFonts.map((f) => (
                          <SelectItem key={f.id} value={f.family}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {GOOGLE_FONTS.map((f) => (
                      <SelectItem key={f.family} value={f.family}>
                        {f.family}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  Upload font
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const font = await addFont(file);
                    patch({ fontFamily: font.family });
                  }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={adjustments.align === "left" ? "secondary" : "outline"}
                  size="icon"
                  onClick={() => patch({ align: "left" as TextAlign })}
                  aria-label="Align left"
                >
                  <AlignLeft className="size-3.5" />
                </Button>
                <Button
                  variant={adjustments.align === "center" ? "secondary" : "outline"}
                  size="icon"
                  onClick={() => patch({ align: "center" as TextAlign })}
                  aria-label="Align center"
                >
                  <AlignCenter className="size-3.5" />
                </Button>
                <Button
                  variant={adjustments.align === "right" ? "secondary" : "outline"}
                  size="icon"
                  onClick={() => patch({ align: "right" as TextAlign })}
                  aria-label="Align right"
                >
                  <AlignRight className="size-3.5" />
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-xs font-normal text-muted-foreground">
                  Bold
                </Label>
                <Switch
                  checked={adjustments.fontWeight >= 700}
                  onCheckedChange={(checked) =>
                    patch({ fontWeight: checked ? 700 : 400 })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-xs font-normal text-muted-foreground">
                  Color
                </Label>
                <input
                  type="color"
                  value={adjustments.color}
                  onChange={(e) => patch({ color: e.target.value })}
                  className="size-6 cursor-pointer rounded border border-border bg-transparent"
                />
              </div>

              <AdjustmentSlider
                label="Size"
                value={adjustments.fontSize}
                min={8}
                max={200}
                onChange={(v) => patch({ fontSize: v })}
              />
              <AdjustmentSlider
                label="Letter spacing"
                value={adjustments.letterSpacing}
                min={-5}
                max={40}
                onChange={(v) => patch({ letterSpacing: v })}
              />
              <AdjustmentSlider
                label="Line height"
                value={Math.round(adjustments.lineHeight * 10) / 10}
                min={0.5}
                max={3}
                step={0.1}
                onChange={(v) => patch({ lineHeight: v })}
              />
              <AdjustmentSlider
                label="Curve"
                value={adjustments.curve}
                min={-100}
                max={100}
                onChange={(v) => patch({ curve: v })}
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
              <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Gradient</Label>
                  <Switch
                    checked={adjustments.gradient.enabled}
                    onCheckedChange={(checked) =>
                      patch({ gradient: { ...adjustments.gradient, enabled: checked } })
                    }
                  />
                </div>
                {adjustments.gradient.enabled && (
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={adjustments.gradient.from}
                      onChange={(e) =>
                        patch({
                          gradient: { ...adjustments.gradient, from: e.target.value },
                        })
                      }
                      className="h-6 w-full cursor-pointer rounded border border-border bg-transparent"
                    />
                    <input
                      type="color"
                      value={adjustments.gradient.to}
                      onChange={(e) =>
                        patch({
                          gradient: { ...adjustments.gradient, to: e.target.value },
                        })
                      }
                      className="h-6 w-full cursor-pointer rounded border border-border bg-transparent"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Stroke</Label>
                  <Switch
                    checked={adjustments.stroke.enabled}
                    onCheckedChange={(checked) =>
                      patch({ stroke: { ...adjustments.stroke, enabled: checked } })
                    }
                  />
                </div>
                {adjustments.stroke.enabled && (
                  <>
                    <input
                      type="color"
                      value={adjustments.stroke.color}
                      onChange={(e) =>
                        patch({ stroke: { ...adjustments.stroke, color: e.target.value } })
                      }
                      className="h-6 w-full cursor-pointer rounded border border-border bg-transparent"
                    />
                    <AdjustmentSlider
                      label="Width"
                      value={adjustments.stroke.width}
                      min={0}
                      max={12}
                      onChange={(v) =>
                        patch({ stroke: { ...adjustments.stroke, width: v } })
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
                      onChange={(v) => patch({ glow: { ...adjustments.glow, blur: v } })}
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
                        patch({ shadow: { ...adjustments.shadow, color: e.target.value } })
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
                  </>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          <ObjectTimingPanel projectId={projectId} object={object} />
        </Accordion>
      </ScrollArea>
    </EditPanelShell>
  );
}
