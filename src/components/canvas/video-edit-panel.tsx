"use client";

import * as React from "react";
import {
  Crop,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Scissors,
  Volume2,
  VolumeX,
} from "lucide-react";

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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useImageElement } from "@/hooks/use-image-element";
import { formatDuration } from "@/lib/media/format";
import { useCanvasStore } from "@/store/use-canvas-store";
import { useVideoPlaybackStore } from "@/store/use-video-playback-store";
import type { CanvasObject } from "@/types/canvas";
import type { VideoAdjustments } from "@/types/video-adjustments";

export function VideoEditPanel({
  projectId,
  object,
}: {
  projectId: string;
  object: CanvasObject;
}) {
  const updateVideoAdjustments = useCanvasStore((s) => s.updateVideoAdjustments);
  const resetVideoAdjustments = useCanvasStore((s) => s.resetVideoAdjustments);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const splitVideoObject = useCanvasStore((s) => s.splitVideoObject);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const isPlaying = useVideoPlaybackStore((s) => s.isPlaying(object.id));
  const togglePlay = useVideoPlaybackStore((s) => s.toggle);

  const [cropOpen, setCropOpen] = React.useState(false);
  const posterEl = useImageElement(object.src);
  const [splitPoint, setSplitPoint] = React.useState(
    object.videoAdjustments
      ? (object.videoAdjustments.trimStart + object.videoAdjustments.trimEnd) / 2
      : 0,
  );

  const adjustments = object.videoAdjustments;
  if (!adjustments) return null;

  function patch(update: Partial<VideoAdjustments>) {
    updateVideoAdjustments(projectId, object.id, update);
  }

  function handleSplit() {
    const newId = splitVideoObject(projectId, object.id, splitPoint);
    if (newId) setSelectedIds([object.id, newId]);
  }

  return (
    <>
      <EditPanelShell
        title="Edit video"
        onReset={() => resetVideoAdjustments(projectId, object.id)}
        onClose={() => setSelectedIds([])}
      >
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Button
          variant="secondary"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => togglePlay(object.id)}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </Button>
        <span className="text-xs text-muted-foreground">
          {formatDuration(adjustments.trimStart)} – {formatDuration(adjustments.trimEnd)}
        </span>
      </div>

      <ScrollArea className="flex-1">
        <Accordion
          type="multiple"
          defaultValue={["timing", "trim", "playback"]}
          className="px-3"
        >
          <ObjectTimingPanel projectId={projectId} object={object} />

          <AccordionItem value="trim">
            <AccordionTrigger>Trim &amp; split</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-normal text-muted-foreground">
                    Trim range
                  </Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatDuration(adjustments.trimEnd - adjustments.trimStart)}
                  </span>
                </div>
                <Slider
                  value={[adjustments.trimStart, adjustments.trimEnd]}
                  min={0}
                  max={adjustments.duration}
                  step={0.1}
                  onValueChange={([start, end]) =>
                    patch({ trimStart: start, trimEnd: end })
                  }
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-normal text-muted-foreground">
                    Split point
                  </Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatDuration(splitPoint)}
                  </span>
                </div>
                <Slider
                  value={[splitPoint]}
                  min={adjustments.trimStart}
                  max={adjustments.trimEnd}
                  step={0.1}
                  onValueChange={([v]) => setSplitPoint(v)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={handleSplit}
              >
                <Scissors className="size-3.5" />
                Split here
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => setCropOpen(true)}
                disabled={!posterEl}
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
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="playback">
            <AccordionTrigger>Playback</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              <AdjustmentSlider
                label="Speed"
                value={Math.round(adjustments.playbackRate * 100)}
                min={25}
                max={400}
                step={5}
                onChange={(v) => patch({ playbackRate: v / 100 })}
              />
              <div className="flex items-center justify-between">
                <Label className="text-xs font-normal text-muted-foreground">
                  Reverse
                </Label>
                <Switch
                  checked={adjustments.reversed}
                  onCheckedChange={(checked) => patch({ reversed: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  <Repeat className="size-3.5" />
                  Loop
                </Label>
                <Switch
                  checked={adjustments.loop}
                  onCheckedChange={(checked) => patch({ loop: checked })}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="audio">
            <AccordionTrigger>Audio</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              <AdjustmentSlider
                label="Volume"
                value={adjustments.volume}
                min={0}
                max={100}
                onChange={(v) => patch({ volume: v })}
              />
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  {adjustments.muted ? (
                    <VolumeX className="size-3.5" />
                  ) : (
                    <Volume2 className="size-3.5" />
                  )}
                  Mute
                </Label>
                <Switch
                  checked={adjustments.muted}
                  onCheckedChange={(checked) => patch({ muted: checked })}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="appearance">
            <AccordionTrigger>Appearance</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              <AdjustmentSlider
                label="Opacity"
                value={adjustments.opacity}
                min={0}
                max={100}
                onChange={(v) => patch({ opacity: v })}
              />
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
                label="Saturation"
                value={adjustments.saturation}
                min={-100}
                max={100}
                onChange={(v) => patch({ saturation: v })}
              />
              <AdjustmentSlider
                label="Blur"
                value={adjustments.blur}
                min={0}
                max={20}
                onChange={(v) => patch({ blur: v })}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="style">
            <AccordionTrigger>Style</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
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
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </ScrollArea>
      </EditPanelShell>

      {posterEl && (
        <CropDialog
          objectId={object.id}
          previewSrc={object.src}
          initialCrop={adjustments.crop}
          naturalWidth={posterEl.naturalWidth}
          naturalHeight={posterEl.naturalHeight}
          open={cropOpen}
          onOpenChange={setCropOpen}
          title="Crop video"
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
