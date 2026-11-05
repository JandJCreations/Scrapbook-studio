"use client";

import * as React from "react";

import type { MediaVisuals } from "@/components/clip-timeline/clip-visuals";
import { createScenePainter } from "@/components/playback/scene-painter";
import {
  browserNow,
  browserSchedule,
  createBrowserAudioContext,
  createBrowserElement,
} from "@/lib/playback/browser";
import { loadGoogleFont } from "@/lib/fonts/load-google-font";
import { createImageCache } from "@/lib/playback/image-cache";
import { buildScene } from "@/lib/playback/scene";
import { createPlaybackSession, type PlaybackSession } from "@/lib/playback/session";
import type { MediaUrlSource } from "@/lib/sync/media-url-store";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { createVideoFrameExtractor, loadPeaksFromUrl } from "@/lib/timeline-ui/browser-media";
import { createThumbnailService } from "@/lib/timeline-ui/thumbnail-service";
import { createWaveformService } from "@/lib/timeline-ui/waveform-service";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";

/**
 * The studio's playback for one mounted editor: audio, the painter, the
 * session and the timeline visuals. Everything is created once the frame and
 * the container exist and torn down, in order, when either goes away.
 */
export function useStudioPlayback(options: { media: MediaUrlSource; frame: FrameSize | null }): {
  /** A callback ref: attach it to the painter's container element. */
  containerRef: React.RefCallback<HTMLDivElement>;
  session: PlaybackSession | null;
  visuals: MediaVisuals | null;
} {
  const { media, frame } = options;
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
  const [session, setSession] = React.useState<PlaybackSession | null>(null);
  const [visuals, setVisuals] = React.useState<MediaVisuals | null>(null);

  const width = frame?.width ?? 0;
  const height = frame?.height ?? 0;

  React.useEffect(() => {
    if (!container || width <= 0 || height <= 0) return;
    let alive = true;
    const size = { width, height };
    const sessionHolder: { current: PlaybackSession | null } = { current: null };

    const thumbnails = createThumbnailService({
      urlFor: (mediaId) => media.urlFor(mediaId),
      extractor: createVideoFrameExtractor(),
    });
    const waveforms = createWaveformService({
      urlFor: (mediaId) => media.urlFor(mediaId),
      loadPeaks: loadPeaksFromUrl,
    });

    const audioContext = createBrowserAudioContext();
    const imageCache = createImageCache({
      urlFor: (mediaId) => media.urlFor(mediaId),
      onLoad: () => {
        if (alive) sessionHolder.current?.wake();
      },
      createImage: () => new Image(),
    });
    // Each font is requested once; when it has loaded the text is laid out again.
    const requestedFonts = new Set<string>();
    const painter = createScenePainter({
      container,
      frame: size,
      getImage: (mediaId) => imageCache.get(mediaId),
      requestFont: (family) => {
        if (requestedFonts.has(family)) return;
        requestedFonts.add(family);
        void loadGoogleFont(family).then(() => {
          if (!alive) return;
          painter.invalidateText();
          sessionHolder.current?.wake();
        });
      },
    });
    const getProject = () => selectProject(useClipProjectStore.getState());

    const created = createPlaybackSession({
      getProject,
      audioContext,
      createElement: createBrowserElement,
      urlFor: (mediaId) => media.urlFor(mediaId),
      now: browserNow,
      schedule: browserSchedule,
      onFrame: (frameState, pool) => {
        if (!alive) return;
        useTransportStore.getState().setFrame(frameState.time, frameState.playing);
        painter.render(
          buildScene(getProject(), frameState.time, (clipId) => pool.elementForClip(clipId), size),
        );
      },
      onDispose: () => {
        imageCache.dispose();
      },
    });
    sessionHolder.current = created;

    const resize = () => painter.resize(container.clientWidth, container.clientHeight);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    // An edit, or new media URLs arriving, re-plans and redraws once.
    const unsubscribeProject = useClipProjectStore.subscribe(() => created.wake());
    const unsubscribeMedia = media.subscribe(() => created.wake());

    // The session and services belong to the external playback system; React
    // state only holds handles to them so the view can render and call them.
    /* eslint-disable react-hooks/set-state-in-effect */
    setSession(created);
    setVisuals({ thumbnails, waveforms, urlFor: (mediaId) => media.urlFor(mediaId) });
    /* eslint-enable react-hooks/set-state-in-effect */
    useTransportStore.getState().reset();
    created.wake();

    return () => {
      alive = false;
      sessionHolder.current = null;
      unsubscribeProject();
      unsubscribeMedia();
      observer.disconnect();
      thumbnails.dispose();
      waveforms.dispose();
      setVisuals(null);
      setSession(null);
      painter.destroy();
      void created.dispose();
      useTransportStore.getState().reset();
    };
  }, [media, container, width, height]);

  return { containerRef: setContainer, session, visuals };
}
