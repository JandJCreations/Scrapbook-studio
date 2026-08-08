"use client";

import * as React from "react";
import { Film, ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/use-canvas-store";
import { useTimelineStore } from "@/store/use-timeline-store";
import type { CanvasObject } from "@/types/canvas";

const MIN_CLIP_SECONDS = 0.2;

interface VisualTimelineClipProps {
  projectId: string;
  object: CanvasObject;
  pixelsPerSecond: number;
  isSelected: boolean;
}

type DragMode =
  | { kind: "move"; startX: number; originStart: number; originEnd: number }
  | { kind: "trim-left"; startX: number; originStart: number }
  | { kind: "trim-right"; startX: number; originEnd: number }
  | null;

export const VisualTimelineClip = React.memo(function VisualTimelineClip({
  projectId,
  object,
  pixelsPerSecond,
  isSelected,
}: VisualTimelineClipProps) {
  const updateObject = useCanvasStore((s) => s.updateObject);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const setPlayheadTime = useTimelineStore((s) => s.setPlayheadTime);
  const dragRef = React.useRef<DragMode>(null);

  const duration = object.endTime - object.startTime;
  const width = Math.max(4, duration * pixelsPerSecond);
  const left = object.startTime * pixelsPerSecond;

  React.useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const dxSeconds = (e.clientX - drag.startX) / pixelsPerSecond;

      if (drag.kind === "move") {
        const span = drag.originEnd - drag.originStart;
        const newStart = Math.max(0, drag.originStart + dxSeconds);
        updateObject(projectId, object.id, {
          startTime: newStart,
          endTime: newStart + span,
        });
      } else if (drag.kind === "trim-left") {
        const newStart = Math.min(
          object.endTime - MIN_CLIP_SECONDS,
          Math.max(0, drag.originStart + dxSeconds),
        );
        updateObject(projectId, object.id, { startTime: newStart });
      } else if (drag.kind === "trim-right") {
        const newEnd = Math.max(
          object.startTime + MIN_CLIP_SECONDS,
          drag.originEnd + dxSeconds,
        );
        updateObject(projectId, object.id, { endTime: newEnd });
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
  }, [projectId, object, pixelsPerSecond, updateObject]);

  function selectWithModifier(shiftKey: boolean) {
    if (shiftKey) {
      if (selectedIds.includes(object.id)) {
        setSelectedIds(selectedIds.filter((id) => id !== object.id));
      } else {
        setSelectedIds([...selectedIds, object.id]);
      }
    } else {
      setSelectedIds([object.id]);
    }
  }

  return (
    <div
      className={cn(
        "absolute top-1 bottom-1 flex cursor-grab select-none items-center gap-1 overflow-hidden rounded-md border bg-gradient-to-b from-sky-500/80 to-sky-600/80 px-1.5 shadow-sm active:cursor-grabbing",
        isSelected ? "border-primary ring-2 ring-primary" : "border-sky-700/40",
      )}
      style={{ left, width }}
      onMouseDown={(e) => {
        selectWithModifier(e.shiftKey);
        setPlayheadTime(object.startTime);
        dragRef.current = {
          kind: "move",
          startX: e.clientX,
          originStart: object.startTime,
          originEnd: object.endTime,
        };
      }}
    >
      {object.type === "video" ? (
        <Film className="size-3 shrink-0 text-white/80" />
      ) : (
        <ImageIcon className="size-3 shrink-0 text-white/80" />
      )}
      <span className="truncate text-[10px] font-medium text-white/90">
        {object.name}
      </span>

      {object.keyframes.map((kf) => (
        <div
          key={kf.id}
          className="pointer-events-none absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-amber-300"
          style={{ left: (kf.time - object.startTime) * pixelsPerSecond }}
        />
      ))}

      <div
        className="absolute top-0 left-0 h-full w-2 cursor-ew-resize bg-white/0 hover:bg-white/20"
        onMouseDown={(e) => {
          e.stopPropagation();
          dragRef.current = {
            kind: "trim-left",
            startX: e.clientX,
            originStart: object.startTime,
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
            originEnd: object.endTime,
          };
        }}
      />
    </div>
  );
});
