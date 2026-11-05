"use client";

import * as React from "react";
import { Ban, MoveHorizontal, Sparkles, SquareDashed } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TRANSITION_TYPES } from "@/lib/timeline/transitions";
import type { Clip, TransitionType } from "@/types/timeline";

interface TransitionsTabProps {
  /** The selected clip: the transition goes into it, from the clip before. */
  clip: Clip | null;
  hasPrevious: boolean;
  onPick(type: TransitionType | null): void;
  onApplyToAll(): void;
}

const ICONS: Record<TransitionType, typeof Sparkles> = {
  fade: Sparkles,
  dip: SquareDashed,
  "slide-left": MoveHorizontal,
  "slide-right": MoveHorizontal,
};

/** A gallery of transitions: click one to play it between the clip before and the selected clip. */
export function TransitionsTab({ clip, hasPrevious, onPick, onApplyToAll }: TransitionsTabProps) {
  if (!clip || (clip.kind !== "image" && clip.kind !== "video")) {
    return <p className="p-3 text-sm text-muted-foreground">Select a clip on the timeline, then pick the transition into it.</p>;
  }
  if (!hasPrevious) {
    return <p className="p-3 text-sm text-muted-foreground">There is no clip directly before this one to transition from.</p>;
  }
  const current = clip.transition?.type ?? null;
  const tile = (key: string, label: string, type: TransitionType | null, Icon: typeof Sparkles, mirrored = false) => (
    <li key={key}>
      <button
        type="button"
        aria-label={`Transition ${label}`}
        aria-pressed={current === type}
        onClick={() => onPick(type)}
        className={
          "flex w-full flex-col items-center gap-1 rounded-md border p-2 text-[11px] hover:border-primary " +
          (current === type ? "border-primary text-primary" : "border-border text-muted-foreground")
        }
      >
        <span aria-hidden className="flex aspect-video w-full items-center justify-center rounded bg-muted">
          <Icon className={"size-6 " + (mirrored ? "-scale-x-100" : "")} />
        </span>
        {label}
      </button>
    </li>
  );
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <ul className="grid grid-cols-2 gap-2">
        {tile("none", "None", null, Ban)}
        {TRANSITION_TYPES.map(({ type, label }) => tile(type, label, type, ICONS[type], type === "slide-right"))}
      </ul>
      {current !== null && (
        <Button size="xs" variant="outline" onClick={onApplyToAll}>
          Apply to all slides
        </Button>
      )}
    </div>
  );
}
