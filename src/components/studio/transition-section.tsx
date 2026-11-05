"use client";

import * as React from "react";

import { PanelSlider } from "@/components/studio/panel-controls";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_TRANSITION_SECONDS,
  MAX_TRANSITION_SECONDS,
  MIN_TRANSITION_SECONDS,
  TRANSITION_TYPES,
} from "@/lib/timeline/transitions";
import type { ClipTransition, TransitionType } from "@/types/timeline";

interface TransitionSectionProps {
  transition: ClipTransition | null;
  /** False for the first clip of a strip: nothing comes before it to transition from. */
  hasPrevious: boolean;
  /** Picks a kind (or "none" for a plain cut) at the usual length, as one complete change. */
  onType(type: TransitionType | null): void;
  /** Live feedback while the length slider moves. */
  onDurationPreview(seconds: number): void;
  onCommit(): void;
}

/** How this clip comes in after the one before it, shown in the Details panel. */
export function TransitionSection({ transition, hasPrevious, onType, onDurationPreview, onCommit }: TransitionSectionProps) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-2.5">
      <h3 className="text-xs font-medium">Transition</h3>
      {!hasPrevious ? (
        <p className="text-xs text-muted-foreground">The first clip has nothing before it to transition from.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-normal text-muted-foreground">Into this clip</Label>
            <select
              aria-label="Transition"
              value={transition?.type ?? "none"}
              onChange={(event) => onType(event.target.value === "none" ? null : (event.target.value as TransitionType))}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            >
              <option value="none">None (cut)</option>
              {TRANSITION_TYPES.map(({ type, label }) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {transition && (
            <PanelSlider
              label="Transition length (seconds)"
              value={Math.round((transition.duration ?? DEFAULT_TRANSITION_SECONDS) * 10) / 10}
              min={MIN_TRANSITION_SECONDS}
              max={MAX_TRANSITION_SECONDS}
              step={0.1}
              onChange={onDurationPreview}
              onCommit={onCommit}
            />
          )}
        </>
      )}
    </div>
  );
}
