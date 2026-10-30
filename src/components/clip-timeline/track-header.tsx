"use client";

import * as React from "react";

import { updateTrack, type TrackPatch } from "@/lib/timeline/tracks";
import { useClipProjectStore } from "@/store/use-clip-project-store";
import type { Track } from "@/types/timeline";

const NAME: Record<Track["type"], string> = { overlay: "Overlay", video: "Video", audio: "Audio" };

const TOGGLES = [
  { key: "muted", short: "M", title: "Mute" },
  { key: "hidden", short: "H", title: "Hide" },
  { key: "locked", short: "L", title: "Lock" },
  { key: "solo", short: "S", title: "Solo" },
] as const;

export const TrackHeader = React.memo(function TrackHeader({ track }: { track: Track }) {
  return (
    <div className="flex h-full flex-col justify-center gap-1 px-2 text-xs">
      <span className="font-medium">{NAME[track.type]}</span>
      <div className="flex gap-1">
        {TOGGLES.map(({ key, short, title }) => (
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
            className={`h-5 w-5 rounded border text-[10px] leading-none ${
              track[key] ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            {short}
          </button>
        ))}
      </div>
    </div>
  );
});
