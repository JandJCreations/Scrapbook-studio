"use client";

import * as React from "react";
import { Eye, EyeOff, Headphones, Lock, LockOpen, Volume2, VolumeX } from "lucide-react";

import { updateTrack, type TrackPatch } from "@/lib/timeline/tracks";
import { useClipProjectStore } from "@/store/use-clip-project-store";
import type { Track } from "@/types/timeline";

const NAME: Record<Track["type"], string> = { overlay: "Overlay", video: "Video", audio: "Audio" };

/** Each switch shows an icon for what it does now: the picture when it is off, the crossed-out one when it is on. */
const TOGGLES = [
  { key: "muted", title: "Mute", off: Volume2, on: VolumeX },
  { key: "hidden", title: "Hide", off: Eye, on: EyeOff },
  { key: "locked", title: "Lock", off: LockOpen, on: Lock },
  { key: "solo", title: "Solo", off: Headphones, on: Headphones },
] as const;

export const TrackHeader = React.memo(function TrackHeader({ track }: { track: Track }) {
  return (
    <div className="flex h-full flex-col justify-center gap-1 px-2 text-xs">
      <span className="font-medium">{NAME[track.type]}</span>
      <div className="flex gap-1">
        {TOGGLES.map(({ key, title, off, on }) => {
          const Icon = track[key] ? on : off;
          return (
          <button
            key={key}
            type="button"
            title={title}
            aria-label={`${title} ${NAME[track.type]} track`}
            aria-pressed={track[key]}
            // Keep keyboard focus off the header so Space stays play/pause.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const patch: TrackPatch = { [key]: !track[key] };
              useClipProjectStore.getState().apply((p) => updateTrack(p, track.id, patch));
            }}
            className={`flex size-6 items-center justify-center rounded-md ${
              track[key] ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="size-3.5" />
          </button>
          );
        })}
      </div>
    </div>
  );
});
