"use client";

import { LayoutGrid, List, Search, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useMediaUiStore } from "@/store/use-media-ui-store";

export function MediaToolbar({ onUploadClick }: { onUploadClick: () => void }) {
  const search = useMediaUiStore((s) => s.search);
  const setSearch = useMediaUiStore((s) => s.setSearch);
  const viewMode = useMediaUiStore((s) => s.viewMode);
  const setViewMode = useMediaUiStore((s) => s.setViewMode);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search media..."
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-border p-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "size-8",
                  viewMode === "grid" && "bg-accent text-accent-foreground",
                )}
                onClick={() => setViewMode("grid")}
                aria-pressed={viewMode === "grid"}
                aria-label="Grid view"
              >
                <LayoutGrid className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Grid view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "size-8",
                  viewMode === "list" && "bg-accent text-accent-foreground",
                )}
                onClick={() => setViewMode("list")}
                aria-pressed={viewMode === "list"}
                aria-label="List view"
              >
                <List className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>List view</TooltipContent>
          </Tooltip>
        </div>

        <Button onClick={onUploadClick} className="gap-2">
          <Upload className="size-4" />
          Upload
        </Button>
      </div>
    </div>
  );
}
