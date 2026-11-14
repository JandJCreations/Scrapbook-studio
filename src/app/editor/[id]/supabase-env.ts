"use client";

import * as React from "react";

import type { StudioEnv } from "@/components/studio/studio-env";
import { createClient } from "@/lib/supabase/client";
import { createStoreLocalFiles, withLocalFiles, type LocalFiles } from "@/lib/media/local-media";
import { createMediaUrlStore, type MediaUrlStore } from "@/lib/sync/media-url-store";
import { saveProjectFrameChecked } from "@/lib/sync/project-frame";
import { createSupabaseMediaDeps } from "@/lib/sync/supabase-media-deps";
import { createSupabaseTimelineStorage } from "@/lib/sync/supabase-timeline-storage";
import { useMediaStore } from "@/store/use-media-store";
import { useProjectStore } from "@/store/use-project-store";

const saveFrame = (projectId: string, frame: { width: number; height: number }) =>
  saveProjectFrameChecked(createClient(), projectId, frame);

/** The files picked in this session, as the editor's media source needs them. */
const localFiles: LocalFiles = createStoreLocalFiles(useMediaStore);

/**
 * The studio's environment backed by Supabase. `env` is null until the project
 * list and the media store are ready; `missing` is true when the list has
 * loaded and does not contain this project.
 */
export function useSupabaseStudioEnv(projectId: string): { env: StudioEnv | null; missing: boolean } {
  const storage = React.useMemo(() => createSupabaseTimelineStorage(createClient()), []);

  const [media, setMedia] = React.useState<MediaUrlStore | null>(null);
  React.useEffect(() => {
    const store = createMediaUrlStore({
      deps: createSupabaseMediaDeps(createClient()),
      now: () => Date.now(),
    });
    // The store is an external resource owned by this effect; state holds its handle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMedia(store);
    return () => {
      store.dispose();
      setMedia(null);
    };
  }, [projectId]);

  const projects = useProjectStore((s) => s.projects);
  const projectsLoaded = useProjectStore((s) => s.loaded);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const library = useMediaStore((s) => s.items);
  const libraryLoading = useMediaStore((s) => s.loading);
  const fetchMedia = useMediaStore((s) => s.fetchMedia);

  React.useEffect(() => {
    void fetchProjects();
    void fetchMedia();
  }, [fetchProjects, fetchMedia]);

  // Only the name matters here: saving a thumbnail replaces the project object, which must not remake the environment.
  const found = projects.find((p) => p.id === projectId);
  const projectName = found?.name;
  const hasThumbnail = Boolean(found?.thumbnailUrl);

  // Made once per media store: the environment is rebuilt on every upload tick, and a new source each time would restart playback.
  const mediaSource = React.useMemo(() => (media ? withLocalFiles(media, localFiles) : null), [media]);

  const env = React.useMemo<StudioEnv | null>(() => {
    if (!mediaSource || projectName === undefined) return null;
    return {
      projectId,
      projectName,
      backHref: "/dashboard",
      welcomeTour: true,
      hasThumbnail,
      storage,
      media: mediaSource,
      library,
      libraryLoading,
      saveFrame: (frame) => saveFrame(projectId, frame),
      saveThumbnail: (dataUrl) => useProjectStore.getState().saveProjectThumbnail(projectId, dataUrl),
      uploadFiles: (files) => useMediaStore.getState().addFiles(files, null),
    };
  }, [mediaSource, projectName, hasThumbnail, projectId, storage, library, libraryLoading]);

  return { env, missing: projectsLoaded && projectName === undefined };
}
