"use client";

import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Copy,
  Group as GroupIcon,
  Lock,
  Trash2,
  Ungroup as UngroupIcon,
  Unlock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCanvasObjects, useCanvasStore } from "@/store/use-canvas-store";

interface SelectionToolbarProps {
  projectId: string;
}

export function SelectionToolbar({ projectId }: SelectionToolbarProps) {
  const objects = useCanvasObjects(projectId);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const duplicateObjects = useCanvasStore((s) => s.duplicateObjects);
  const removeObjects = useCanvasStore((s) => s.removeObjects);
  const reorder = useCanvasStore((s) => s.reorder);
  const toggleLock = useCanvasStore((s) => s.toggleLock);
  const group = useCanvasStore((s) => s.group);
  const ungroup = useCanvasStore((s) => s.ungroup);

  if (selectedIds.length === 0) return null;

  const selectedObjects = objects.filter((o) => selectedIds.includes(o.id));
  const allLocked = selectedObjects.every((o) => o.locked);
  const canGroup = selectedObjects.length > 1;
  const canUngroup = selectedObjects.some((o) => o.groupId !== null);

  return (
    <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-card p-1.5 shadow-lg">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Duplicate"
            onClick={() => setSelectedIds(duplicateObjects(projectId, selectedIds))}
          >
            <Copy className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Duplicate</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={allLocked ? "Unlock" : "Lock"}
            onClick={() => toggleLock(projectId, selectedIds)}
          >
            {allLocked ? (
              <Unlock className="size-4" />
            ) : (
              <Lock className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{allLocked ? "Unlock" : "Lock"}</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Bring to front"
            onClick={() => reorder(projectId, selectedIds, "front")}
          >
            <ArrowUpToLine className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Bring to front</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Bring forward"
            onClick={() => reorder(projectId, selectedIds, "forward")}
          >
            <ChevronUp className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Bring forward</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Send backward"
            onClick={() => reorder(projectId, selectedIds, "backward")}
          >
            <ChevronDown className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Send backward</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Send to back"
            onClick={() => reorder(projectId, selectedIds, "back")}
          >
            <ArrowDownToLine className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Send to back</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Group"
            disabled={!canGroup}
            onClick={() => group(projectId, selectedIds)}
          >
            <GroupIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Group</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Ungroup"
            disabled={!canUngroup}
            onClick={() => ungroup(projectId, selectedIds)}
          >
            <UngroupIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ungroup</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:text-destructive"
            aria-label="Delete"
            onClick={() => {
              removeObjects(projectId, selectedIds);
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete</TooltipContent>
      </Tooltip>
    </div>
  );
}
