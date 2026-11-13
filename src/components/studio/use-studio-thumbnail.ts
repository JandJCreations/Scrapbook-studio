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
  /** True when the project already has a thumbnail: it is then remade only after an edit, not on every open. */
  hasThumbnail?: boolean;
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
export function useStudioThumbnail({ enabled, frame, urlFor, saveThumbnail, renderThumbnail, hasThumbnail }: Options): void {
  // Only committed edits count: a drag in progress is not saved, so it is not drawn either.
  const project = useClipProjectStore(selectSavableProject);

  // The callbacks are read when the timer fires, not watched: saving a thumbnail
  // changes the caller's state, which makes new callbacks, which must not start the wait over.
  const latest = React.useRef({ urlFor, saveThumbnail, renderThumbnail });
  React.useEffect(() => {
    latest.current = { urlFor, saveThumbnail, renderThumbnail };
  });
  const canSave = Boolean(saveThumbnail);

  // The project as it was when the editor became ready; unchanged since, it needs no new thumbnail if it has one.
  const opened = React.useRef<{ project: typeof project; hadThumbnail: boolean } | null>(null);
  React.useEffect(() => {
    if (!enabled) opened.current = null;
    else if (opened.current === null) opened.current = { project, hadThumbnail: hasThumbnail ?? false };
    // Once edited, the saved thumbnail shows an edit: coming back to the opened state (undo) needs a new one.
    else if (opened.current.project !== project) opened.current.hadThumbnail = false;
  });

  React.useEffect(() => {
    if (!enabled || !frame || !canSave) return;
    if (opened.current?.hadThumbnail && opened.current.project === project) return;
    const shown = exportableProject(project);
    const time = thumbnailTime(shown);
    if (time === null) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { urlFor: urls, saveThumbnail: save, renderThumbnail: draw } = latest.current;
        const render = draw ?? (await import("@/lib/export/studio-thumbnail")).renderThumbnail;
        const dataUrl = await render({ project: shown, frame, urlFor: urls, time });
        if (!cancelled) await save?.(dataUrl);
      } catch {
        // No thumbnail this time; the next edit tries again.
      }
    }, THUMBNAIL_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, frame, project, canSave]);
}
