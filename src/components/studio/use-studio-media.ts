"use client";

import * as React from "react";

import type { MediaUrlSource } from "@/lib/sync/media-url-store";
import { collectMediaIds } from "@/lib/sync/media-urls";
import type { TimelineProject } from "@/types/timeline";

const REFRESH_EVERY_MS = 10 * 60 * 1000;

/** Keeps the URL source filled for every Storage-backed file the project uses. */
export function useStudioMedia(media: MediaUrlSource, project: TimelineProject): void {
  const ids = React.useMemo(() => collectMediaIds(project), [project]);
  const key = ids.join(",");

  React.useEffect(() => {
    const wanted = key === "" ? [] : key.split(",");
    void media.ensure(wanted);
    const timer = window.setInterval(() => void media.ensure(wanted), REFRESH_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [media, key]);
}
