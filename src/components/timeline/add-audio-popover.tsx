"use client";

import * as React from "react";
import { Disc3, Music, Plus, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MusicLibraryDialog } from "@/components/timeline/music-library-dialog";
import type { MusicLibraryTrack } from "@/lib/audio/music-library-catalog";
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
  const addFiles = useMediaStore((s) => s.addFiles);
  const addClip = useAudioStore((s) => s.addClip);
  const playheadTime = useTimelineStore((s) => s.playheadTime);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const pendingUploadId = React.useRef<string | null>(null);
  const [libraryOpen, setLibraryOpen] = React.useState(false);

  React.useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const audioItems = items.filter(
    (i) => i.type === "audio" && i.status === "ready",
  );

  React.useEffect(() => {
    const pendingId = pendingUploadId.current;
    if (!pendingId) return;
    const item = items.find((i) => i.id === pendingId);
    if (!item || item.status !== "ready") return;
    pendingUploadId.current = null;
    addClip(projectId, {
      trackId,
      mediaId: item.id,
      src: item.url,
      name: item.name,
      startTime: playheadTime,
      sourceDuration: item.duration ?? 10,
    });
  }, [items, projectId, trackId, playheadTime, addClip]);

  function addLibraryTrack(track: MusicLibraryTrack) {
    addClip(projectId, {
      trackId,
      mediaId: `library-${track.id}`,
      src: track.src,
      name: track.name,
      startTime: playheadTime,
      sourceDuration: track.duration,
    });
  }

  return (
    <>
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
          <DropdownMenuItem onSelect={() => setLibraryOpen(true)}>
            <Disc3 className="size-4" />
            Browse music library
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
            <Upload className="size-4" />
            Upload from device
          </DropdownMenuItem>

          {audioItems.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Your audio</DropdownMenuLabel>
              {audioItems.map((item) => (
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
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const [newId] = addFiles([file], null);
          pendingUploadId.current = newId;
        }}
      />

      <MusicLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onSelect={addLibraryTrack}
      />
    </>
  );
}
