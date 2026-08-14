"use client";

import * as React from "react";

import { loadProjectContent, saveProjectContent } from "@/lib/sync/project-content-sync";
import { useAudioClips, useAudioStore, useAudioTracks } from "@/store/use-audio-store";
import { useCanvasFrameStore } from "@/store/use-canvas-frame-store";
import { useCanvasObjects, useCanvasStore } from "@/store/use-canvas-store";

const AUTOSAVE_DELAY_MS = 1500;
const MAX_LOAD_ATTEMPTS = 4;
const LOAD_RETRY_DELAY_MS = 1500;
const loadedProjects = new Set<string>();

/**
 * Marks a project's content as already loaded, skipping the initial Supabase
 * fetch in useProjectContentSync. Call this after populating a brand-new
 * project's canvas/audio state locally (e.g. from a template) and before
 * navigating to its editor — otherwise the editor's mount-time fetch would
 * overwrite that local state with the (still-empty) database rows.
 */
export function markProjectContentLoaded(projectId: string) {
  loadedProjects.add(projectId);
}

export function useProjectContentSync(projectId: string) {
  const [trackedProjectId, setTrackedProjectId] = React.useState(projectId);
  const [contentLoaded, setContentLoaded] = React.useState(() =>
    loadedProjects.has(projectId),
  );
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [retryNonce, setRetryNonce] = React.useState(0);

  if (projectId !== trackedProjectId) {
    setTrackedProjectId(projectId);
    setContentLoaded(loadedProjects.has(projectId));
    setLoadError(null);
  }

  const loadObjects = useCanvasStore((s) => s.loadObjects);
  const loadTracksAndClips = useAudioStore((s) => s.loadTracksAndClips);
  const setFrame = useCanvasFrameStore((s) => s.setFrame);

  const objects = useCanvasObjects(projectId);
  const tracks = useAudioTracks(projectId);
  const clips = useAudioClips(projectId);

  React.useEffect(() => {
    if (loadedProjects.has(projectId)) return;

    let cancelled = false;
    // A local counter, not React state — the whole retry sequence for this
    // effect invocation lives here so it can't be affected by any state-
    // update/re-render timing. Each attempt is scheduled only after the
    // previous one has actually rejected.
    let attempts = 0;

    function attempt() {
      attempts += 1;
      loadProjectContent(projectId)
        .then((content) => {
          if (cancelled) return;
          loadObjects(projectId, content.objects);
          loadTracksAndClips(projectId, content.tracks, content.clips);
          if (content.frame) setFrame(projectId, content.frame);
          loadedProjects.add(projectId);
          setLoadError(null);
          setContentLoaded(true);
        })
        .catch((error) => {
          if (cancelled) return;
          console.error("Failed to load project content:", error);
          // Never mark this project "loaded" on failure — doing so used to
          // let the autosave effect below fire with empty/unpopulated local
          // state a moment later, and its delete-missing sync would then
          // wipe every real row for this project from the database. Retry a
          // few times (most failures here are transient — a network blip, a
          // dev-server restart mid-request), and only surface a permanent
          // error state that blocks autosave entirely once attempts run out.
          if (attempts >= MAX_LOAD_ATTEMPTS) {
            setLoadError(
              error instanceof Error ? error.message : "Failed to load project content",
            );
          } else {
            setTimeout(() => {
              if (!cancelled) attempt();
            }, LOAD_RETRY_DELAY_MS);
          }
        });
    }

    attempt();

    return () => {
      cancelled = true;
    };
  }, [projectId, retryNonce, loadObjects, loadTracksAndClips, setFrame]);

  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kept current every render so the flush-on-hide effect below (which only
  // needs to attach its listeners once) can always save the latest edit,
  // not whatever was current when it was set up.
  const latestRef = React.useRef({ projectId, objects, tracks, clips });
  React.useEffect(() => {
    latestRef.current = { projectId, objects, tracks, clips };
  });

  React.useEffect(() => {
    if (!contentLoaded) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveProjectContent(projectId, objects, tracks, clips).catch((error) => {
        console.error("Failed to autosave project content:", error);
      });
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [projectId, objects, tracks, clips, contentLoaded]);

  function flushPendingSave() {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const { projectId, objects, tracks, clips } = latestRef.current;
    void saveProjectContent(projectId, objects, tracks, clips).catch((error) => {
      console.error("Failed to save project content on exit:", error);
    });
  }

  // A debounced save still pending when the user leaves would otherwise
  // silently never fire and the edit is lost — three distinct ways to leave,
  // none of which the debounce effect above covers on its own:
  //  - client-side route change (e.g. "Back to dashboard"): the component
  //    unmounts, which today just clearTimeout()s the pending save.
  //  - backgrounding the tab/app: visibilitychange fires while the page is
  //    still alive, well before any actual unload — the reliable modern
  //    alternative to beforeunload, which iOS Safari doesn't fire consistently.
  //  - closing the tab/real navigation: pagehide.
  React.useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") flushPendingSave();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flushPendingSave);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flushPendingSave);
      flushPendingSave();
    };
  }, []);

  function retryLoad() {
    setLoadError(null);
    setRetryNonce((n) => n + 1);
  }

  return { contentLoaded, loadError, retryLoad };
}
