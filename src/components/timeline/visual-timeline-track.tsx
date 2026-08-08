"use client";

import { ChevronDown, ChevronUp, Lock, Unlock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { VisualTimelineClip } from "@/components/timeline/visual-timeline-clip";
import { useCanvasStore } from "@/store/use-canvas-store";
import type { CanvasObject } from "@/types/canvas";

const ROW_HEIGHT = 40;

interface VisualTimelineTrackProps {
  projectId: string;
  object: CanvasObject;
  pixelsPerSecond: number;
  isSelected: boolean;
  timelineWidth: number;
}

export function VisualTimelineTrack({
  projectId,
  object,
  pixelsPerSecond,
  isSelected,
  timelineWidth,
}: VisualTimelineTrackProps) {
  const toggleLock = useCanvasStore((s) => s.toggleLock);
  const reorder = useCanvasStore((s) => s.reorder);

  return (
    <div className="flex border-b border-border" style={{ height: ROW_HEIGHT }}>
      <div className="flex w-40 shrink-0 items-center gap-1 border-r border-border bg-background px-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {object.name}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => reorder(projectId, [object.id], "forward")}
          aria-label="Move layer up"
        >
          <ChevronUp className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => reorder(projectId, [object.id], "backward")}
          aria-label="Move layer down"
        >
          <ChevronDown className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => toggleLock(projectId, [object.id])}
          aria-label={object.locked ? "Unlock layer" : "Lock layer"}
        >
          {object.locked ? (
            <Lock className="size-3.5" />
          ) : (
            <Unlock className="size-3.5" />
          )}
        </Button>
      </div>

      <div
        className="relative flex-1 bg-muted/10"
        style={{ minWidth: timelineWidth }}
      >
        <VisualTimelineClip
          projectId={projectId}
          object={object}
          pixelsPerSecond={pixelsPerSecond}
          isSelected={isSelected}
        />
      </div>
    </div>
  );
}
