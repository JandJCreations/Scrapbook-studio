"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, Unlock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { moveTrack, updateTrack } from "@/lib/timeline/tracks";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";
import type { Clip, Track } from "@/types/timeline";

const TYPE_LABEL: Record<Track["type"], string> = {
  overlay: "Layer",
  video: "Main video",
  audio: "Audio",
};

/** The stacking order: tracks front to back with their clips; move, hide and lock them. */
export function LayersTab() {
  const project = useClipProjectStore(selectProject);
  const selectedIds = useClipProjectStore((s) => s.selectedClipIds);

  const tracks = [...project.tracks].sort((a, b) => a.order - b.order);
  if (tracks.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">Nothing here yet. Add media, text or stickers.</p>;
  }
  const overlays = tracks.filter((t) => t.type === "overlay");
  const apply = useClipProjectStore.getState().apply;

  return (
    <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      {tracks.map((track) => {
        const clips: Clip[] = project.clips
          .filter((c) => c.trackId === track.id)
          .sort((a, b) => a.start - b.start);
        const name = clips[0]?.name ?? `${TYPE_LABEL[track.type]} (empty)`;
        const overlayIndex = overlays.findIndex((t) => t.id === track.id);
        return (
          <li key={track.id} className="rounded-lg border border-border p-2">
            <div className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate text-xs font-medium" title={name}>
                {TYPE_LABEL[track.type]}: {name}
              </span>
              {track.type === "overlay" && (
                <>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Bring ${name} forward`}
                    disabled={overlayIndex === 0}
                    onClick={() => apply((p) => moveTrack(p, track.id, "up"))}
                  >
                    <ArrowUp className="size-3" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Send ${name} backward`}
                    disabled={overlayIndex === overlays.length - 1}
                    onClick={() => apply((p) => moveTrack(p, track.id, "down"))}
                  >
                    <ArrowDown className="size-3" />
                  </Button>
                </>
              )}
              {track.type !== "audio" && (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`${track.hidden ? "Show" : "Hide"} ${name}`}
                  onClick={() => apply((p) => updateTrack(p, track.id, { hidden: !track.hidden }))}
                >
                  {track.hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                </Button>
              )}
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`${track.locked ? "Unlock" : "Lock"} ${name}`}
                onClick={() => apply((p) => updateTrack(p, track.id, { locked: !track.locked }))}
              >
                {track.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
              </Button>
            </div>
            {clips.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {clips.map((clip) => (
                  <button
                    key={clip.id}
                    type="button"
                    aria-label={`Select ${clip.name}`}
                    aria-pressed={selectedIds.includes(clip.id)}
                    onClick={() => useClipProjectStore.getState().setSelectedClipIds([clip.id])}
                    className={
                      "max-w-full truncate rounded px-1.5 py-0.5 text-xs " +
                      (selectedIds.includes(clip.id) ? "bg-accent text-accent-foreground" : "bg-muted/50 hover:bg-muted")
                    }
                  >
                    {clip.name}
                  </button>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
