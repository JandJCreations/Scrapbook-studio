import * as React from "react";

import { useAudioClips, useAudioTracks } from "@/store/use-audio-store";
import { useTimelineStore } from "@/store/use-timeline-store";
import type { AudioClip } from "@/types/audio";

function clipEnd(clip: AudioClip) {
  return clip.startTime + (clip.trimEnd - clip.trimStart);
}

export function useTimelinePlayback(projectId: string) {
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const clips = useAudioClips(projectId);
  const tracks = useAudioTracks(projectId);
  const audioElementsRef = React.useRef(new Map<string, HTMLAudioElement>());
  const rafRef = React.useRef<number | null>(null);
  const lastTsRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const audioElements = audioElementsRef.current;
    return () => {
      audioElements.forEach((el) => el.pause());
      audioElements.clear();
    };
  }, []);

  React.useEffect(() => {
    if (!isPlaying) {
      audioElementsRef.current.forEach((el) => el.pause());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    // A clip deleted mid-playback (e.g. removing a music track while
    // auditioning the scrapbook) would otherwise leave its <audio> element
    // orphaned in the map, still playing, since the tick loop below only
    // iterates clips that still exist.
    const liveClipIds = new Set(clips.map((c) => c.id));
    audioElementsRef.current.forEach((el, clipId) => {
      if (!liveClipIds.has(clipId)) {
        el.pause();
        audioElementsRef.current.delete(clipId);
      }
    });

    const hasSolo = tracks.some((t) => t.solo);
    const timelineEnd = clips.reduce(
      (max, c) => Math.max(max, clipEnd(c)),
      0,
    );

    function tick(ts: number) {
      const dt = lastTsRef.current !== null ? (ts - lastTsRef.current) / 1000 : 0;
      lastTsRef.current = ts;

      const nextTime = useTimelineStore.getState().playheadTime + dt;

      if (timelineEnd > 0 && nextTime >= timelineEnd) {
        useTimelineStore.getState().setPlayheadTime(0);
        useTimelineStore.getState().pause();
        audioElementsRef.current.forEach((el) => el.pause());
        return;
      }

      useTimelineStore.getState().setPlayheadTime(nextTime);

      for (const clip of clips) {
        const track = tracks.find((t) => t.id === clip.trackId);
        const audible =
          !clip.muted && track && !track.muted && (!hasSolo || track.solo);
        const end = clipEnd(clip);
        const inRange = nextTime >= clip.startTime && nextTime < end;

        let el = audioElementsRef.current.get(clip.id);
        if (!el) {
          el = new Audio(clip.src);
          el.preload = "auto";
          audioElementsRef.current.set(clip.id, el);
        }

        if (inRange && audible) {
          const sourceTime = clip.trimStart + (nextTime - clip.startTime);
          if (Math.abs(el.currentTime - sourceTime) > 0.3) {
            el.currentTime = sourceTime;
          }
          if (el.paused) void el.play().catch(() => {});

          let volume = clip.volume / 100;
          const relative = nextTime - clip.startTime;
          const remaining = end - nextTime;
          if (clip.fadeIn > 0 && relative < clip.fadeIn) {
            volume *= relative / clip.fadeIn;
          }
          if (clip.fadeOut > 0 && remaining < clip.fadeOut) {
            volume *= remaining / clip.fadeOut;
          }
          el.volume = Math.max(0, Math.min(1, volume));
        } else if (!el.paused) {
          el.pause();
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    lastTsRef.current = null;
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, clips, tracks]);
}
