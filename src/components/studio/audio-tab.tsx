"use client";

import * as React from "react";
import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { blurOnMouseClick } from "@/lib/dom/blur-on-mouse-click";
import { writeMediaDrag } from "@/lib/dom/media-drag";
import { MUSIC_LIBRARY, type MusicLibraryTrack } from "@/lib/audio/music-library-catalog";
import { formatDuration } from "@/lib/media/format";
import type { MediaItem } from "@/types/media";

interface AudioTabProps {
  /** The whole library; only its audio files are listed. */
  items: MediaItem[];
  loading: boolean;
  onAddAudio(item: MediaItem): void;
  onAddMusic(track: MusicLibraryTrack): void;
}

/** The music to put under the video: the user's own audio files, then the built-in library. */
export function AudioTab({ items, loading, onAddAudio, onAddMusic }: AudioTabProps) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playingId, setPlayingId] = React.useState<string | null>(null);
  const mine = items.filter((item) => item.type === "audio" && item.status === "ready");

  // A preview stops when the tab is left.
  React.useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, []);

  function togglePreview(track: MusicLibraryTrack) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === track.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = track.src;
    setPlayingId(track.id);
    // A browser that refuses to play leaves the button saying "Preview", not "Pause".
    Promise.resolve(audio.play()).catch(() => setPlayingId(null));
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3" onClickCapture={blurOnMouseClick}>
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />

      <section>
        <h2 className="mb-1 text-xs font-semibold">Your audio</h2>
        {mine.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {loading ? "Loading your audio…" : "Upload a song in the Media tab and it will show here."}
          </p>
        ) : (
          <ul className="space-y-1">
            {mine.map((item) => (
              <li
                key={item.id}
                draggable
                onDragStart={(event) => writeMediaDrag(event.dataTransfer, { source: "library", id: item.id }, "audio")}
                className="flex cursor-grab items-center gap-2 rounded-md border p-1.5"
              >
                <p className="min-w-0 flex-1 truncate text-xs font-medium" title={item.name}>
                  {item.name}
                </p>
                <Button
                  size="xs"
                  variant="secondary"
                  aria-label={`Add ${item.name} as music`}
                  onClick={() => onAddAudio(item)}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-xs font-semibold">Music library</h2>
        <ul className="space-y-1">
          {MUSIC_LIBRARY.map((track) => (
            <li
              key={track.id}
              draggable
              onDragStart={(event) => writeMediaDrag(event.dataTransfer, { source: "music", id: track.id }, "audio")}
              className="flex cursor-grab items-center gap-2 rounded-md border p-1.5"
            >
              <Button
                size="icon-xs"
                variant="secondary"
                aria-label={playingId === track.id ? `Pause ${track.name}` : `Preview ${track.name}`}
                onClick={() => togglePreview(track)}
              >
                {playingId === track.id ? <Pause className="size-3" /> : <Play className="size-3" />}
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{track.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {track.mood} · {formatDuration(track.duration)}
                </p>
              </div>
              <Button
                size="xs"
                variant="secondary"
                aria-label={`Add ${track.name} as music`}
                onClick={() => {
                  audioRef.current?.pause();
                  setPlayingId(null);
                  onAddMusic(track);
                }}
              >
                Add
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
