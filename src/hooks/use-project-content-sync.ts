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

  return { contentLoaded };
}
