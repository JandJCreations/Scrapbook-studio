"use client";

import * as React from "react";

import { readMediaInfo } from "@/lib/playback/browser";
import type { MediaUrlSource } from "@/lib/sync/media-url-store";
import type { Clip } from "@/types/timeline";

interface Size {
  width: number;
  height: number;
}

// A file's own size does not change, so it is read once per file.
const sizes = new Map<string, Size>();

/** The picture or video file's own size in pixels, once it has been read; null before, and for other clips. */
export function useNaturalSize(media: MediaUrlSource, clip: Clip | null): Size | null {
  const mediaId = clip && (clip.kind === "image" || clip.kind === "video") ? clip.mediaId : null;
  const kind = clip?.kind === "video" ? "video" : "image";
  const [, setReads] = React.useState(0);

  React.useEffect(() => {
    if (!mediaId || sizes.has(mediaId)) return;
    let alive = true;
    void (async () => {
      await media.ensure([mediaId]);
      const url = media.urlFor(mediaId);
      if (!url) return;
      try {
        const info = await readMediaInfo(url, kind);
        if (info.width > 0 && info.height > 0) {
          sizes.set(mediaId, { width: info.width, height: info.height });
          if (alive) setReads((n) => n + 1);
        }
      } catch {
        // The crop stays unavailable for a file that cannot be read.
      }
    })();
    return () => {
      alive = false;
    };
  }, [media, mediaId, kind]);

  return mediaId ? (sizes.get(mediaId) ?? null) : null;
}
