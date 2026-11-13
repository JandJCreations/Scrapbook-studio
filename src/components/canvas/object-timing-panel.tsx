"use client";

import { Clock, Diamond, Plus, Sparkles, Trash2 } from "lucide-react";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AdjustmentSlider } from "@/components/canvas/adjustment-slider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ANIMATION_IN_OPTIONS, ANIMATION_OUT_OPTIONS } from "@/lib/canvas/effects";
import { formatDuration } from "@/lib/media/format";
import { useCanvasStore } from "@/store/use-canvas-store";
import { useTimelineStore } from "@/store/use-timeline-store";
import type { CanvasObject } from "@/types/canvas";
import type { AnimationInType, AnimationOutType } from "@/types/object-extras";

const SPEEDS = [
  { seconds: 0.4, label: "Fast" },
  { seconds: 0.8, label: "Normal" },
  { seconds: 1.5, label: "Slow" },
];

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
  const updateExtras = useCanvasStore((s) => s.updateExtras);
  const setPlayheadTime = useTimelineStore((s) => s.setPlayheadTime);
  const play = useTimelineStore((s) => s.play);
  const animIn = object.extras?.animIn;
  const animOut = object.extras?.animOut;
  const inOptions = ANIMATION_IN_OPTIONS.filter((o) => !o.textOnly || object.type === "text");
  const playheadTime = useTimelineStore((s) => s.playheadTime);

  const duration = object.endTime - object.startTime;
  const sortedKeyframes = [...object.keyframes].sort((a, b) => a.time - b.time);

  return (
    <AccordionItem value="timing">
      <AccordionTrigger>
        <span className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          Timing &amp; animation
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 rounded-md border border-border p-2">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <Sparkles className="size-3.5 text-muted-foreground" />
            Animation
          </span>
          <div className="grid grid-cols-[3rem_1fr_5.5rem] items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">In</span>
            <Select
              value={animIn?.type ?? "none"}
              onValueChange={(v) =>
                updateExtras(projectId, object.id, {
                  animIn:
                    v === "none"
                      ? undefined
                      : { type: v as AnimationInType, duration: animIn?.duration ?? 0.8 },
                })
              }
            >
              <SelectTrigger className="h-7 text-xs" aria-label="Entrance animation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {inOptions.map((o) => (
                  <SelectItem key={o.type} value={o.type}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              disabled={!animIn}
              value={String(animIn?.duration ?? 0.8)}
              onValueChange={(v) =>
                animIn && updateExtras(projectId, object.id, { animIn: { ...animIn, duration: Number(v) } })
              }
            >
              <SelectTrigger className="h-7 text-xs" aria-label="Entrance speed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(SPEEDS.some((sp) => sp.seconds === animIn?.duration) || !animIn
                  ? SPEEDS
                  : [...SPEEDS, { seconds: animIn.duration, label: `${animIn.duration}s` }]
                ).map((sp) => (
                  <SelectItem key={sp.seconds} value={String(sp.seconds)}>
                    {sp.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="text-[11px] text-muted-foreground">Out</span>
            <Select
              value={animOut?.type ?? "none"}
              onValueChange={(v) =>
                updateExtras(projectId, object.id, {
                  animOut:
                    v === "none"
                      ? undefined
                      : { type: v as AnimationOutType, duration: animOut?.duration ?? 0.8 },
                })
              }
            >
              <SelectTrigger className="h-7 text-xs" aria-label="Exit animation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {ANIMATION_OUT_OPTIONS.map((o) => (
                  <SelectItem key={o.type} value={o.type}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              disabled={!animOut}
              value={String(animOut?.duration ?? 0.8)}
              onValueChange={(v) =>
                animOut && updateExtras(projectId, object.id, { animOut: { ...animOut, duration: Number(v) } })
              }
            >
              <SelectTrigger className="h-7 text-xs" aria-label="Exit speed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(SPEEDS.some((sp) => sp.seconds === animOut?.duration) || !animOut
                  ? SPEEDS
                  : [...SPEEDS, { seconds: animOut.duration, label: `${animOut.duration}s` }]
                ).map((sp) => (
                  <SelectItem key={sp.seconds} value={String(sp.seconds)}>
                    {sp.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(animIn || animOut) && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setPlayheadTime(object.startTime);
                play();
              }}
            >
              Preview
            </Button>
          )}
        </div>

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
