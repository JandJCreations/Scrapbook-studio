"use client";

import { Film, Layers, Lock, Type, Unlock } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useCanvasObjects, useCanvasStore } from "@/store/use-canvas-store";

interface LayersPanelProps {
  projectId: string;
}

export function LayersPanel({ projectId }: LayersPanelProps) {
  const objects = useCanvasObjects(projectId);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const toggleLock = useCanvasStore((s) => s.toggleLock);

  const layered = [...objects].reverse();

  if (layered.length === 0) {
    return (
      <EmptyState
        compact
        icon={Layers}
        title="No layers yet"
        description="Nothing on the canvas yet. Add media from the Media tab."
      />
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-0.5 p-2">
        {layered.map((object) => {
          const isSelected = selectedIds.includes(object.id);

          function selectLayer() {
            const groupMembers = object.groupId
              ? objects
                  .filter((o) => o.groupId === object.groupId)
                  .map((o) => o.id)
              : [object.id];
            setSelectedIds(groupMembers);
          }

          return (
            <div
              key={object.id}
              role="button"
              tabIndex={0}
              onClick={selectLayer}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectLayer();
                }
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                isSelected
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
            >
              <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                {object.type === "video" ? (
                  <Film className="size-3.5 text-muted-foreground" />
                ) : object.type === "text" ? (
                  <Type className="size-3.5 text-muted-foreground" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={object.src}
                    alt=""
                    className="size-full object-cover"
                  />
                )}
              </div>
              <span className="min-w-0 flex-1 truncate">{object.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLock(projectId, [object.id]);
                }}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label={object.locked ? "Unlock layer" : "Lock layer"}
              >
                {object.locked ? (
                  <Lock className="size-3.5" />
                ) : (
                  <Unlock className="size-3.5" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
