"use client";

import * as React from "react";
import { Maximize, Mic, Pause, Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PreviewControlsProps {
  time: number;
  duration: number;
  playing: boolean;
  onToggle(): void;
  onSeek(time: number): void;
  onFullscreen(): void;
  /** Present where a voiceover can be recorded. */
  voiceover?: {
    recording: boolean;
    busy: boolean;
    /** Seconds recorded so far. */
    elapsed: number;
    onToggle(): void;
  };
}

function clock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${(safe - minutes * 60).toFixed(1).padStart(4, "0")}`;
}

/** Under the preview: the time, a bar to drag to any moment, a big play button and full screen. */
export function PreviewControls({ time, duration, playing, onToggle, onSeek, onFullscreen, voiceover }: PreviewControlsProps) {
  return (
    <div className="flex flex-col gap-2 border-t px-4 py-2">
      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={Math.max(duration, 0.01)}
        step={0.01}
        value={Math.min(time, Math.max(duration, 0.01))}
        disabled={duration <= 0}
        onChange={(event) => onSeek(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer accent-primary"
      />
      <div className="grid grid-cols-3 items-center">
        <span className="text-sm tabular-nums">
          {clock(time)} <span className="text-muted-foreground">/</span> <span className="text-muted-foreground">{clock(duration)}</span>
        </span>
        <div className="flex justify-center">
          <Button size="icon" variant="secondary" className="size-10 rounded-full" aria-label={playing ? "Pause" : "Play"} onClick={onToggle}>
            {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
          </Button>
        </div>
        <div className="flex items-center justify-end gap-1">
          {voiceover && (
            <Button
              size="sm"
              variant={voiceover.recording ? "destructive" : "ghost"}
              className="gap-1.5"
              aria-label={voiceover.recording ? "Stop recording voiceover" : "Record voiceover"}
              title={voiceover.recording ? "Stop and keep the recording" : "Record your voice over the video from the playhead"}
              disabled={voiceover.busy}
              onClick={voiceover.onToggle}
            >
              {voiceover.recording ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}
              <span className="tabular-nums">{voiceover.recording ? clock(voiceover.elapsed) : "Voiceover"}</span>
            </Button>
          )}
          <Button size="icon" variant="ghost" aria-label="Full screen" onClick={onFullscreen}>
            <Maximize className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
