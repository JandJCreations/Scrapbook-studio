"use client";

import * as React from "react";
import { Diamond, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { clipDuration } from "@/lib/timeline/clip-math";
import type { Clip } from "@/types/timeline";

interface KeyframesSectionProps {
  clip: Clip;
  /** The playhead, in timeline seconds. */
  playhead: number;
  onSeek(time: number): void;
  /** Adds (or updates) a keyframe at the playhead. */
  onAdd(): void;
  onRemove(keyframeId: string): void;
  onClear(): void;
}

const seconds = (n: number) => `${n.toFixed(1)} s`;

/** Add, jump to and delete a clip's position, rotation and opacity keyframes. */
export function KeyframesSection({ clip, playhead, onSeek, onAdd, onRemove, onClear }: KeyframesSectionProps) {
  const local = playhead - clip.start;
  const inside = local >= 0 && local <= clipDuration(clip);
  const keyframes = [...clip.keyframes].sort((a, b) => a.time - b.time);

  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium">Animation</h3>
        <Button
          size="xs"
          variant="secondary"
          className="gap-1"
          aria-label="Add keyframe"
          disabled={!inside}
          onClick={onAdd}
        >
          <Diamond className="size-3" />
          Keyframe
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {keyframes.length === 0
          ? "Add a keyframe, move the playhead, then drag or rotate the clip on the stage to animate it."
          : "Move the playhead and drag, rotate or fade the clip to set the next keyframe."}
      </p>
      {keyframes.length > 0 && (
        <>
          <ul className="space-y-1">
            {keyframes.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  aria-label={`Go to keyframe at ${seconds(k.time)}`}
                  className="tabular-nums underline-offset-2 hover:underline"
                  onClick={() => onSeek(clip.start + k.time)}
                >
                  {seconds(k.time)}
                </button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Delete keyframe at ${seconds(k.time)}`}
                  onClick={() => onRemove(k.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
          <Button size="xs" variant="ghost" aria-label="Remove all keyframes" onClick={onClear}>
            Remove all
          </Button>
        </>
      )}
    </div>
  );
}
