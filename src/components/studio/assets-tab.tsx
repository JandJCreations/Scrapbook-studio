"use client";

import * as React from "react";

import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ASSET_CATALOG, ASSET_CATEGORY_LABELS } from "@/lib/assets/asset-catalog";
import { MUSIC_LIBRARY, type MusicLibraryTrack } from "@/lib/audio/music-library-catalog";
import { formatDuration } from "@/lib/media/format";
import { TEMPLATE_CATALOG } from "@/lib/templates/template-catalog";
import type { ScrapbookTemplate } from "@/types/template";
import type { AssetCategory, ScrapbookAsset } from "@/types/asset";

const CATEGORIES: AssetCategory[] = [
  "stickers",
  "emojis",
  "frames",
  "washiTape",
  "polaroids",
  "shapes",
  "floral",
  "paperTextures",
  "tornPaper",
  "notebookPaper",
  "cardboard",
];

/** The bundled stickers, frames, tapes and papers, grouped by category. Clicking one adds it. */
export function AssetsTab({
  onAdd,
  onTemplate,
  onAddMusic,
}: {
  onAdd(asset: ScrapbookAsset): void;
  onTemplate(template: ScrapbookTemplate): void;
  onAddMusic(track: MusicLibraryTrack): void;
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playingId, setPlayingId] = React.useState<string | null>(null);

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
    void audio.play();
    setPlayingId(track.id);
  }

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      <details>
        <summary className="cursor-pointer py-1 text-xs font-semibold">Music</summary>
        <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />
        <ul className="space-y-1 pt-1">
          {MUSIC_LIBRARY.map((track) => (
            <li key={track.id} className="flex items-center gap-2 rounded-md border p-1.5">
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
      </details>

      <details>
        <summary className="cursor-pointer py-1 text-xs font-semibold">Templates</summary>
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          {TEMPLATE_CATALOG.map((template) => (
            <button
              key={template.id}
              type="button"
              aria-label={`Use the ${template.name} template`}
              title={template.description}
              onClick={() => onTemplate(template)}
              className="flex flex-col gap-1 rounded-md border border-border p-1.5 text-left hover:border-primary"
            >
              <span className={`h-10 w-full rounded bg-gradient-to-br ${template.swatch}`} />
              <span className="truncate text-xs font-medium">{template.name}</span>
            </button>
          ))}
        </div>
      </details>
      {CATEGORIES.map((category) => {
        const assets = ASSET_CATALOG.filter((asset) => asset.category === category);
        if (assets.length === 0) return null;
        return (
          <details key={category} open={category === "stickers" || category === "emojis"}>
            <summary className="cursor-pointer py-1 text-xs font-semibold">
              {ASSET_CATEGORY_LABELS[category]}
            </summary>
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  aria-label={`Add ${asset.name}, ${ASSET_CATEGORY_LABELS[category]}`}
                  title={`Add ${asset.name}`}
                  onClick={() => onAdd(asset)}
                  className="flex aspect-square items-center justify-center rounded-md border border-border bg-muted/40 p-2 hover:border-primary hover:bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.src} alt="" className="max-h-full max-w-full" />
                </button>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
