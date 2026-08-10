"use client";

import * as React from "react";
import { Pause, Play, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDuration } from "@/lib/media/format";
import { MUSIC_LIBRARY, MUSIC_MOODS, type MusicLibraryTrack } from "@/lib/audio/music-library-catalog";

export function MusicLibraryDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (track: MusicLibraryTrack) => void;
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playingId, setPlayingId] = React.useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (!next) {
      audioRef.current?.pause();
      setPlayingId(null);
    }
    onOpenChange(next);
  }

  function togglePreview(track: MusicLibraryTrack) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === track.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = track.src;
    void audio.play();
    setPlayingId(track.id);
  }

  function renderList(tracks: MusicLibraryTrack[]) {
    return (
      <div className="flex flex-col gap-1">
        {tracks.map((track) => (
          <div
            key={track.id}
            className="flex items-center gap-2 rounded-lg border border-border p-2"
          >
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => togglePreview(track)}
              aria-label={playingId === track.id ? `Pause ${track.name}` : `Preview ${track.name}`}
            >
              {playingId === track.id ? (
                <Pause className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )}
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{track.name}</p>
              <p className="text-xs text-muted-foreground">
                {track.mood} &middot; {formatDuration(track.duration)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => {
                audioRef.current?.pause();
                setPlayingId(null);
                onSelect(track);
                onOpenChange(false);
              }}
            >
              <Plus className="size-3.5" />
              Add
            </Button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Music library</DialogTitle>
          <DialogDescription>
            Royalty-free background tracks, ready to drop onto your timeline.
          </DialogDescription>
        </DialogHeader>

        <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />

        <Tabs defaultValue="all">
          <TabsList className="flex-wrap">
            <TabsTrigger value="all">All</TabsTrigger>
            {MUSIC_MOODS.map((mood) => (
              <TabsTrigger key={mood} value={mood}>
                {mood}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="all" className="max-h-80 overflow-y-auto">
            {renderList(MUSIC_LIBRARY)}
          </TabsContent>
          {MUSIC_MOODS.map((mood) => (
            <TabsContent key={mood} value={mood} className="max-h-80 overflow-y-auto">
              {renderList(MUSIC_LIBRARY.filter((t) => t.mood === mood))}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
