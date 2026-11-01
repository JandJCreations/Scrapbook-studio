"use client";

import * as React from "react";

import { exportableProject } from "@/lib/export/export-plan";
import type { ThumbnailRequest } from "@/lib/export/studio-thumbnail";
import { thumbnailTime } from "@/lib/projects/thumbnail-time";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { selectSavableProject, useClipProjectStore } from "@/store/use-clip-project-store";

/** How long the project must stay unchanged before its thumbnail is remade. */
export const THUMBNAIL_DELAY_MS = 5000;

interface Options {
  /** False until the project has loaded (and while it cannot be saved). */
  enabled: boolean;
  frame: FrameSize | null;
  urlFor(mediaId: string): string | null;
  /** Present only where the project has somewhere to keep a thumbnail. */
  saveThumbnail?: (dataUrl: string) => Promise<void>;
  /** The drawing step; replaced in tests. */
  renderThumbnail?: (request: ThumbnailRequest) => Promise<string>;
}

/**
 * Keeps the project's dashboard thumbnail up to date: a little after edits
 * stop, draws the project's first visible moment off screen and saves it. A
 * thumbnail is never worth an error, so every failure is ignored.
 */
export function useStudioThumbnail({ enabled, frame, urlFor, saveThumbnail, renderThumbnail }: Options): void {
  // Only committed edits count: a drag in progress is not saved, so it is not drawn either.
  const project = useClipProjectStore(selectSavableProject);

  React.useEffect(() => {
    if (!enabled || !frame || !saveThumbnail) return;
    const shown = exportableProject(project);
    const time = thumbnailTime(shown);
    if (time === null) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const render = renderThumbnail ?? (await import("@/lib/export/studio-thumbnail")).renderThumbnail;
        const dataUrl = await render({ project: shown, frame, urlFor, time });
        if (!cancelled) await saveThumbnail(dataUrl);
      } catch {
        // No thumbnail this time; the next edit tries again.
      }
    }, THUMBNAIL_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, frame, project, renderThumbnail, saveThumbnail, urlFor]);
}
