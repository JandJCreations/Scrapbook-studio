"use client";

import * as React from "react";

import type { ThumbnailService } from "@/lib/timeline-ui/thumbnail-service";
import {
  thumbnailTiles,
  visibleTiles,
  waveformBars,
  waveformPath,
} from "@/lib/timeline-ui/visuals";
import type { WaveformService } from "@/lib/timeline-ui/waveform-service";
import type { Clip } from "@/types/timeline";

export interface MediaVisuals {
  thumbnails: ThumbnailService;
  waveforms: WaveformService;
  urlFor(mediaId: string): string | null;
}

interface ClipVisualsProps {
  clip: Clip;
  width: number;
  height: number;
  pps: number;
  visuals: MediaVisuals;
  /** The visible range of the lane, measured from this clip's left edge. */
  viewFrom: number;
  viewTo: number;
}

const MAX_BARS = 1500;

function VideoStrip({ clip, height, pps, visuals, viewFrom, viewTo }: ClipVisualsProps) {
  // Subscribing re-renders this strip when a frame arrives; the chip around it need not.
  React.useSyncExternalStore(
    visuals.thumbnails.subscribe,
    visuals.thumbnails.getVersion,
    visuals.thumbnails.getVersion,
  );
  const tiles = React.useMemo(() => thumbnailTiles(clip, pps, height), [clip, pps, height]);
  return (
    <>
      {visibleTiles(tiles, viewFrom, viewTo).map((tile) => {
        const frame = visuals.thumbnails.get(clip.mediaId, tile.sourceTime);
        return (
          <div
            key={tile.index}
            data-testid="thumb-tile"
            className="absolute top-0 h-full bg-cover bg-center"
            style={{
              left: tile.x,
              width: tile.width,
              backgroundImage: frame ? `url("${frame}")` : undefined,
            }}
          />
        );
      })}
    </>
  );
}

function PictureFill({ clip, visuals }: ClipVisualsProps) {
  const url = visuals.urlFor(clip.mediaId);
  if (!url) return null;
  return (
    <div
      data-testid="clip-picture"
      className="absolute inset-0"
      style={{
        backgroundImage: `url("${url}")`,
        backgroundRepeat: "repeat-x",
        backgroundSize: "auto 100%",
      }}
    />
  );
}

function Waveform({ clip, width, visuals }: ClipVisualsProps) {
  React.useSyncExternalStore(
    visuals.waveforms.subscribe,
    visuals.waveforms.getVersion,
    visuals.waveforms.getVersion,
  );
  const peaks = visuals.waveforms.get(clip.mediaId);
  const barCount = Math.min(MAX_BARS, Math.max(8, Math.floor(width / 2)));
  const path = React.useMemo(
    () => (peaks ? waveformPath(waveformBars(peaks, clip, barCount)) : ""),
    [peaks, clip, barCount],
  );
  if (!peaks || path === "") return null;
  return (
    <svg
      data-testid="clip-waveform"
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${barCount} 100`}
      preserveAspectRatio="none"
    >
      <path
        d={path}
        stroke="rgba(255,255,255,0.8)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        fill="none"
      />
    </svg>
  );
}

export const ClipVisuals = React.memo(function ClipVisuals(props: ClipVisualsProps) {
  switch (props.clip.kind) {
    case "video":
      return <VideoStrip {...props} />;
    case "image":
      return <PictureFill {...props} />;
    case "audio":
      return <Waveform {...props} />;
    default:
      return null;
  }
});
