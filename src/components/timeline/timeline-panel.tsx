"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Minus, Pause, Play, Plus, PlusCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { TimelineRuler } from "@/components/timeline/timeline-ruler";
import { TimelineTrack } from "@/components/timeline/timeline-track";
import { VisualTimelineTrack } from "@/components/timeline/visual-timeline-track";
import { useTimelinePlayback } from "@/hooks/use-timeline-playback";
import { formatDuration } from "@/lib/media/format";
import { cn } from "@/lib/utils";
import { useAudioClips, useAudioStore, useAudioTracks } from "@/store/use-audio-store";
import { useCanvasObjects, useCanvasStore } from "@/store/use-canvas-store";
import { useEditorUiStore } from "@/store/use-editor-ui-store";
import { useTimelineStore } from "@/store/use-timeline-store";
import type { AudioClip } from "@/types/audio";

const EMPTY_CLIPS: AudioClip[] = [];

export function TimelinePanel({ projectId }: { projectId: string }) {
  useTimelinePlayback(projectId);

  const tracks = useAudioTracks(projectId);
  const clips = useAudioClips(projectId);
  const addTrack = useAudioStore((s) => s.addTrack);
  const selectedClipId = useAudioStore((s) => s.selectedClipId);
  const setSelectedClipId = useAudioStore((s) => s.setSelectedClipId);

  const objects = useCanvasObjects(projectId);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const visualRows = [...objects].reverse();

  const collapsed = useEditorUiStore((s) => s.timelineCollapsed);
  const toggleCollapsed = useEditorUiStore((s) => s.toggleTimelineCollapsed);

  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const toggle = useTimelineStore((s) => s.toggle);
  const playheadTime = useTimelineStore((s) => s.playheadTime);
  const setPlayheadTime = useTimelineStore((s) => s.setPlayheadTime);
  const pixelsPerSecond = useTimelineStore((s) => s.pixelsPerSecond);
  const zoomIn = useTimelineStore((s) => s.zoomIn);
  const zoomOut = useTimelineStore((s) => s.zoomOut);

  const clipsByTrack = React.useMemo(() => {
    const map = new Map<string, AudioClip[]>();
    for (const clip of clips) {
      const existing = map.get(clip.trackId);
      if (existing) existing.push(clip);
      else map.set(clip.trackId, [clip]);
    }
    return map;
  }, [clips]);

  const audioEnd = clips.reduce(
    (max, c) => Math.max(max, c.startTime + (c.trimEnd - c.trimStart)),
    0,
  );
  const visualEnd = objects.reduce((max, o) => Math.max(max, o.endTime), 0);
  const contentEnd = Math.max(30, audioEnd, visualEnd);
  const timelineWidth = (contentEnd + 20) * pixelsPerSecond;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col border-t border-border bg-background",
        collapsed ? "h-10" : "h-64 sm:h-80",
      )}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Button
          variant="secondary"
          size="icon"
          className="size-7"
          onClick={toggle}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </Button>
        <span className="w-16 text-xs tabular-nums text-muted-foreground">
          {formatDuration(playheadTime)}
        </span>

        <Separator orientation="vertical" className="h-5" />

        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => addTrack(projectId)}
        >
          <PlusCircle className="size-3.5" />
          <span className="hidden sm:inline">Add audio track</span>
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="hidden size-7 sm:inline-flex" onClick={zoomOut} aria-label="Zoom out timeline">
            <Minus className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden size-7 sm:inline-flex" onClick={zoomIn} aria-label="Zoom in timeline">
            <Plus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand timeline" : "Collapse timeline"}
          >
            {collapsed ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </Button>
        </div>
      </div>

      {!collapsed && (
      <ScrollArea className="flex-1">
        <div
          className="relative"
          style={{ width: timelineWidth + 160 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedClipId(null);
              setSelectedIds([]);
            }
          }}
        >
          <div className="sticky top-0 z-10 flex bg-background">
            <div className="flex w-40 shrink-0 items-center border-r border-b border-border px-2 text-[10px] font-medium text-muted-foreground">
              Layers
            </div>
            <div
              className="cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                setPlayheadTime(Math.max(0, x / pixelsPerSecond));
              }}
            >
              <TimelineRuler pixelsPerSecond={pixelsPerSecond} width={timelineWidth} />
            </div>
          </div>

          {visualRows.length === 0 ? (
            <div className="flex h-10 items-center border-b border-border px-3 text-xs text-muted-foreground">
              No layers yet
            </div>
          ) : (
            visualRows.map((object) => (
              <VisualTimelineTrack
                key={object.id}
                projectId={projectId}
                object={object}
                pixelsPerSecond={pixelsPerSecond}
                isSelected={selectedIds.includes(object.id)}
                timelineWidth={timelineWidth}
              />
            ))
          )}

          {tracks.map((track) => (
            <TimelineTrack
              key={track.id}
              projectId={projectId}
              track={track}
              clips={clipsByTrack.get(track.id) ?? EMPTY_CLIPS}
              pixelsPerSecond={pixelsPerSecond}
              selectedClipId={selectedClipId}
              timelineWidth={timelineWidth}
            />
          ))}

          <div
            className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-primary"
            style={{ left: 160 + playheadTime * pixelsPerSecond }}
          >
            <div className="absolute -top-0 -left-[5px] size-[11px] rounded-full bg-primary" />
          </div>
        </div>
      </ScrollArea>
      )}
    </div>
  );
}
