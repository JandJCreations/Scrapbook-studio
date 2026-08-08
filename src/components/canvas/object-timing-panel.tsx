"use client";

import { Diamond, Plus, Trash2 } from "lucide-react";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AdjustmentSlider } from "@/components/canvas/adjustment-slider";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/media/format";
import { useCanvasStore } from "@/store/use-canvas-store";
import { useTimelineStore } from "@/store/use-timeline-store";
import type { CanvasObject } from "@/types/canvas";

export function ObjectTimingPanel({
  projectId,
  object,
}: {
  projectId: string;
  object: CanvasObject;
}) {
  const updateObject = useCanvasStore((s) => s.updateObject);
  const addKeyframeAtPlayhead = useCanvasStore((s) => s.addKeyframeAtPlayhead);
  const removeKeyframe = useCanvasStore((s) => s.removeKeyframe);
  const playheadTime = useTimelineStore((s) => s.playheadTime);

  const duration = object.endTime - object.startTime;
  const sortedKeyframes = [...object.keyframes].sort((a, b) => a.time - b.time);

  return (
    <AccordionItem value="timing">
      <AccordionTrigger>Timing &amp; animation</AccordionTrigger>
      <AccordionContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          On screen {formatDuration(object.startTime)} – {formatDuration(object.endTime)}
        </p>

        <AdjustmentSlider
          label="Fade in"
          value={Math.round(object.fadeIn * 10) / 10}
          min={0}
          max={Math.max(0.1, Math.min(duration / 2, 10))}
          step={0.1}
          onChange={(v) => updateObject(projectId, object.id, { fadeIn: v })}
        />
        <AdjustmentSlider
          label="Fade out"
          value={Math.round(object.fadeOut * 10) / 10}
          min={0}
          max={Math.max(0.1, Math.min(duration / 2, 10))}
          step={0.1}
          onChange={(v) => updateObject(projectId, object.id, { fadeOut: v })}
        />

        <div className="flex flex-col gap-1.5 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Keyframes</span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() =>
                addKeyframeAtPlayhead(projectId, object.id, playheadTime)
              }
            >
              <Plus className="size-3" />
              Add at playhead
            </Button>
          </div>

          {sortedKeyframes.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No keyframes yet. Move the playhead, position the object, then add
              a keyframe to animate it over time.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {sortedKeyframes.map((kf) => (
                <li
                  key={kf.id}
                  className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs"
                >
                  <Diamond className="size-2.5 shrink-0 fill-amber-400 text-amber-500" />
                  <span className="flex-1 tabular-nums text-muted-foreground">
                    {formatDuration(kf.time)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeKeyframe(projectId, object.id, kf.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remove keyframe at ${formatDuration(kf.time)}`}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
