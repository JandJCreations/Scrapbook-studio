"use client";

import * as React from "react";

import { decodeAudioFile } from "@/lib/audio/decode-audio";
import { computeWaveformPeaks } from "@/lib/audio/waveform";
import { cn } from "@/lib/utils";
import { useAudioStore } from "@/store/use-audio-store";
import type { AudioClip } from "@/types/audio";

const WAVEFORM_BUCKETS = 200;
const MIN_CLIP_SECONDS = 0.2;

interface TimelineClipProps {
  projectId: string;
  clip: AudioClip;
  pixelsPerSecond: number;
  isSelected: boolean;
}

type DragMode =
  | { kind: "move"; startX: number; originStart: number }
  | { kind: "trim-left"; startX: number; originStart: number; originTrimStart: number }
  | { kind: "trim-right"; startX: number; originTrimEnd: number }
  | null;

export const TimelineClip = React.memo(function TimelineClip({
  projectId,
  clip,
  pixelsPerSecond,
  isSelected,
}: TimelineClipProps) {
  const updateClip = useAudioStore((s) => s.updateClip);
  const setSelectedClipId = useAudioStore((s) => s.setSelectedClipId);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const dragRef = React.useRef<DragMode>(null);

  const duration = clip.trimEnd - clip.trimStart;
  const width = Math.max(4, duration * pixelsPerSecond);
  const left = clip.startTime * pixelsPerSecond;

  React.useEffect(() => {
    if (clip.waveformPeaks) return;
    let cancelled = false;

    decodeAudioFile(clip.src)
      .then((buffer) => {
        if (cancelled) return;
        const peaks = computeWaveformPeaks(buffer, WAVEFORM_BUCKETS);
        updateClip(projectId, clip.id, { waveformPeaks: peaks });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.src]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !clip.waveformPeaks) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const peaks = clip.waveformPeaks;
    const totalDuration = clip.sourceDuration;
    const startFrac = clip.trimStart / totalDuration;
    const endFrac = clip.trimEnd / totalDuration;
    const startIdx = Math.floor(startFrac * peaks.length);
    const endIdx = Math.max(startIdx + 1, Math.ceil(endFrac * peaks.length));
    const visible = peaks.slice(startIdx, endIdx);

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const barWidth = cssWidth / visible.length;
    const mid = cssHeight / 2;
    visible.forEach((peak, i) => {
      const h = Math.max(1, peak * cssHeight);
      ctx.fillRect(i * barWidth, mid - h / 2, Math.max(1, barWidth - 0.5), h);
    });
  }, [clip.waveformPeaks, clip.trimStart, clip.trimEnd, clip.sourceDuration, width]);

  React.useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const dxSeconds = (e.clientX - drag.startX) / pixelsPerSecond;

      if (drag.kind === "move") {
        updateClip(projectId, clip.id, {
          startTime: Math.max(0, drag.originStart + dxSeconds),
        });
      } else if (drag.kind === "trim-left") {
        const maxDelta = clip.trimEnd - clip.trimStart - MIN_CLIP_SECONDS;
        const delta = Math.min(
          maxDelta,
          Math.max(-drag.originTrimStart, dxSeconds),
        );
        updateClip(projectId, clip.id, {
          trimStart: drag.originTrimStart + delta,
          startTime: drag.originStart + delta,
        });
      } else if (drag.kind === "trim-right") {
        const newTrimEnd = Math.min(
          clip.sourceDuration,
          Math.max(clip.trimStart + MIN_CLIP_SECONDS, drag.originTrimEnd + dxSeconds),
        );
        updateClip(projectId, clip.id, { trimEnd: newTrimEnd });
      }
    }

    function onUp() {
      dragRef.current = null;
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [projectId, clip, pixelsPerSecond, updateClip]);

  return (
    <div
      className={cn(
        "absolute top-1 bottom-1 flex cursor-grab select-none flex-col overflow-hidden rounded-md border bg-gradient-to-b from-emerald-500/80 to-emerald-600/80 shadow-sm active:cursor-grabbing",
        isSelected ? "border-primary ring-2 ring-primary" : "border-emerald-700/40",
      )}
      style={{ left, width }}
      onMouseDown={(e) => {
        setSelectedClipId(clip.id);
        dragRef.current = {
          kind: "move",
          startX: e.clientX,
          originStart: clip.startTime,
        };
      }}
    >
      <div className="truncate px-1.5 pt-0.5 text-[10px] font-medium text-white/90">
        {clip.name}
      </div>
      <canvas ref={canvasRef} className="h-full w-full flex-1" />

      <div
        className="absolute top-0 left-0 h-full w-2 cursor-ew-resize bg-white/0 hover:bg-white/20"
        onMouseDown={(e) => {
          e.stopPropagation();
          dragRef.current = {
            kind: "trim-left",
            startX: e.clientX,
            originStart: clip.startTime,
            originTrimStart: clip.trimStart,
          };
        }}
      />
      <div
        className="absolute top-0 right-0 h-full w-2 cursor-ew-resize bg-white/0 hover:bg-white/20"
        onMouseDown={(e) => {
          e.stopPropagation();
          dragRef.current = {
            kind: "trim-right",
            startX: e.clientX,
            originTrimEnd: clip.trimEnd,
          };
        }}
      />

      {clip.fadeIn > 0 && (
        <div
          className="pointer-events-none absolute top-0 left-0 h-full bg-gradient-to-r from-black/50 to-transparent"
          style={{ width: clip.fadeIn * pixelsPerSecond }}
        />
      )}
      {clip.fadeOut > 0 && (
        <div
          className="pointer-events-none absolute top-0 right-0 h-full bg-gradient-to-l from-black/50 to-transparent"
          style={{ width: clip.fadeOut * pixelsPerSecond }}
        />
      )}
    </div>
  );
});
