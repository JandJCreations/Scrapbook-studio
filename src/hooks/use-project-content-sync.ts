"use client";

import * as React from "react";

import { loadProjectContent, saveProjectContent } from "@/lib/sync/project-content-sync";
import { useAudioClips, useAudioStore, useAudioTracks } from "@/store/use-audio-store";
import { useCanvasFrameStore } from "@/store/use-canvas-frame-store";
import { useCanvasObjects, useCanvasStore } from "@/store/use-canvas-store";

const AUTOSAVE_DELAY_MS = 1500;
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

  if (projectId !== trackedProjectId) {
    setTrackedProjectId(projectId);
    setContentLoaded(loadedProjects.has(projectId));
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
    loadProjectContent(projectId)
      .then((content) => {
        if (cancelled) return;
        loadObjects(projectId, content.objects);
        loadTracksAndClips(projectId, content.tracks, content.clips);
        if (content.frame) setFrame(projectId, content.frame);
        loadedProjects.add(projectId);
        setContentLoaded(true);
      })
      .catch((error) => {
        console.error("Failed to load project content:", error);
        setContentLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, loadObjects, loadTracksAndClips, setFrame]);

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

  return { contentLoaded };
}
