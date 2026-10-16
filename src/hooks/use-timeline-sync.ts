"use client";

import * as React from "react";

import { createClient } from "@/lib/supabase/client";
import { createSupabaseTimelineStorage } from "@/lib/sync/supabase-timeline-storage";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { createTimelineSync, type SyncStatus, type TimelineSync } from "@/lib/sync/timeline-sync";
import { selectSavableProject, useClipProjectStore } from "@/store/use-clip-project-store";

/**
 * Loads a project's timeline into the clip store and keeps it saved. `reload`
 * retries after a load error or discards local edits after a conflict.
 */
export function useTimelineSync(projectId: string) {
  const [status, setStatus] = React.useState<SyncStatus>({ phase: "loading", error: null });
  const [frame, setFrame] = React.useState<FrameSize | null>(null);
  const syncRef = React.useRef<TimelineSync | null>(null);

  React.useEffect(() => {
    const sync = createTimelineSync({
      projectId,
      storage: createSupabaseTimelineStorage(createClient()),
      getSavable: () => selectSavableProject(useClipProjectStore.getState()),
      subscribe: (listener) => useClipProjectStore.subscribe(listener),
      loadProject: (project, loadedFrame) => {
        useClipProjectStore.getState().load(project);
        setFrame(loadedFrame);
      },
      onStatus: setStatus,
    });
    syncRef.current = sync;
    sync.load();

    function flushWhenHidden() {
      if (document.visibilityState === "hidden") void sync.flush();
    }
    function flushNow() {
      void sync.flush();
    }
    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("pagehide", flushNow);

    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("pagehide", flushNow);
      syncRef.current = null;
      void sync.stop();
    };
  }, [projectId]);

  const reload = React.useCallback(() => {
    syncRef.current?.load();
  }, []);

  return { status, frame, reload };
}
