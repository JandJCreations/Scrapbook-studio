"use client";

import { ChevronLeft, ChevronRight, Copy, FilePlus2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCanvasFrame } from "@/store/use-canvas-frame-store";
import { useCanvasStore, usePageCount } from "@/store/use-canvas-store";
import { useTimelineStore } from "@/store/use-timeline-store";

/**
 * Pages: several designs in one project (a multi-page scrapbook, a set of
 * posts). Each page has its own canvas, story and timeline; PDF export
 * includes every page.
 */
export function PageBar({ projectId }: { projectId: string }) {
  const page = useCanvasStore((s) => s.currentPage);
  const setCurrentPage = useCanvasStore((s) => s.setCurrentPage);
  const addPage = useCanvasStore((s) => s.addPage);
  const duplicatePage = useCanvasStore((s) => s.duplicatePage);
  const deletePage = useCanvasStore((s) => s.deletePage);
  const count = usePageCount(projectId);
  const frame = useCanvasFrame(projectId);

  function go(next: number) {
    useTimelineStore.getState().pause();
    useTimelineStore.getState().setPlayheadTime(0);
    setCurrentPage(next);
  }

  const iconButton = (label: string, onClick: () => void, icon: React.ReactNode, disabled = false) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <div className="flex h-9 shrink-0 items-center justify-center gap-1 border-t border-border bg-background px-2 text-xs">
      {iconButton("Previous page", () => go(page - 1), <ChevronLeft className="size-4" />, page === 0)}
      <span className="min-w-20 text-center tabular-nums text-muted-foreground">
        Page {page + 1} of {count}
      </span>
      {iconButton("Next page", () => go(page + 1), <ChevronRight className="size-4" />, page >= count - 1)}
      <span className="mx-1 h-4 w-px bg-border" />
      {iconButton("Add page", () => { useTimelineStore.getState().setPlayheadTime(0); addPage(projectId, frame); }, <FilePlus2 className="size-4" />)}
      {iconButton("Duplicate page", () => { useTimelineStore.getState().setPlayheadTime(0); duplicatePage(projectId, page); }, <Copy className="size-3.5" />)}
      {iconButton("Delete page", () => deletePage(projectId, page), <Trash2 className="size-3.5" />, count <= 1)}
    </div>
  );
}
