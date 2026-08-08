"use client";

import * as React from "react";
import { Music, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAudioStore } from "@/store/use-audio-store";
import { useMediaStore } from "@/store/use-media-store";
import { useTimelineStore } from "@/store/use-timeline-store";

export function AddAudioPopover({
  projectId,
  trackId,
  compact = false,
}: {
  projectId: string;
  trackId: string;
  compact?: boolean;
}) {
  const items = useMediaStore((s) => s.items);
  const fetchMedia = useMediaStore((s) => s.fetchMedia);
  const addClip = useAudioStore((s) => s.addClip);
  const playheadTime = useTimelineStore((s) => s.playheadTime);

  React.useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const audioItems = items.filter(
    (i) => i.type === "audio" && i.status === "ready",
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={compact ? "ghost" : "outline"}
          size={compact ? "icon" : "sm"}
          className={compact ? "size-6" : "gap-2"}
        >
          <Plus className="size-3.5" />
          {!compact && "Add audio"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Add to track</DropdownMenuLabel>
        {audioItems.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Upload audio in the Media Library first.
          </div>
        ) : (
          audioItems.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onSelect={() =>
                addClip(projectId, {
                  trackId,
                  mediaId: item.id,
                  src: item.url,
                  name: item.name,
                  startTime: playheadTime,
                  sourceDuration: item.duration ?? 10,
                })
              }
            >
              <Music className="size-4" />
              {item.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
