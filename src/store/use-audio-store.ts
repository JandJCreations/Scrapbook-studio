import { create } from "zustand";

import type { AudioClip, AudioTrack } from "@/types/audio";

const EMPTY_TRACKS: AudioTrack[] = [];
const EMPTY_CLIPS: AudioClip[] = [];

function id() {
  return crypto.randomUUID();
}

interface AddClipInput {
  trackId: string;
  mediaId: string;
  src: string;
  name: string;
  startTime: number;
  sourceDuration: number;
}

interface AudioStore {
  tracksByProject: Record<string, AudioTrack[]>;
  clipsByProject: Record<string, AudioClip[]>;
  selectedClipId: string | null;

  addTrack: (projectId: string, name?: string) => string;
  removeTrack: (projectId: string, trackId: string) => void;
  toggleTrackMute: (projectId: string, trackId: string) => void;
  toggleTrackSolo: (projectId: string, trackId: string) => void;

  addClip: (projectId: string, input: AddClipInput) => string;
  updateClip: (
    projectId: string,
    clipId: string,
    patch: Partial<AudioClip>,
  ) => void;
  removeClip: (projectId: string, clipId: string) => void;
  duplicateClip: (projectId: string, clipId: string) => string | null;
  splitClip: (
    projectId: string,
    clipId: string,
    atSeconds: number,
  ) => string | null;
  setSelectedClipId: (clipId: string | null) => void;

  loadTracksAndClips: (
    projectId: string,
    tracks: AudioTrack[],
    clips: AudioClip[],
  ) => void;
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  tracksByProject: {},
  clipsByProject: {},
  selectedClipId: null,

  addTrack: (projectId, name) => {
    const trackId = id();
    const existing = get().tracksByProject[projectId] ?? [];
    const track: AudioTrack = {
      id: trackId,
      name: name ?? `Track ${existing.length + 1}`,
      muted: false,
      solo: false,
    };
    set((state) => ({
      tracksByProject: {
        ...state.tracksByProject,
        [projectId]: [...(state.tracksByProject[projectId] ?? []), track],
      },
    }));
    return trackId;
  },

  removeTrack: (projectId, trackId) =>
    set((state) => ({
      tracksByProject: {
        ...state.tracksByProject,
        [projectId]: (state.tracksByProject[projectId] ?? []).filter(
          (t) => t.id !== trackId,
        ),
      },
      clipsByProject: {
        ...state.clipsByProject,
        [projectId]: (state.clipsByProject[projectId] ?? []).filter(
          (c) => c.trackId !== trackId,
        ),
      },
    })),

  toggleTrackMute: (projectId, trackId) =>
    set((state) => ({
      tracksByProject: {
        ...state.tracksByProject,
        [projectId]: (state.tracksByProject[projectId] ?? []).map((t) =>
          t.id === trackId ? { ...t, muted: !t.muted } : t,
        ),
      },
    })),

  toggleTrackSolo: (projectId, trackId) =>
    set((state) => ({
      tracksByProject: {
        ...state.tracksByProject,
        [projectId]: (state.tracksByProject[projectId] ?? []).map((t) =>
          t.id === trackId ? { ...t, solo: !t.solo } : t,
        ),
      },
    })),

  addClip: (projectId, input) => {
    const clipId = id();
    const clip: AudioClip = {
      id: clipId,
      trackId: input.trackId,
      mediaId: input.mediaId,
      src: input.src,
      name: input.name,
      startTime: input.startTime,
      trimStart: 0,
      trimEnd: input.sourceDuration,
      sourceDuration: input.sourceDuration,
      volume: 100,
      fadeIn: 0,
      fadeOut: 0,
      loop: false,
      muted: false,
      waveformPeaks: null,
    };
    set((state) => ({
      clipsByProject: {
        ...state.clipsByProject,
        [projectId]: [...(state.clipsByProject[projectId] ?? []), clip],
      },
    }));
    return clipId;
  },

  updateClip: (projectId, clipId, patch) =>
    set((state) => ({
      clipsByProject: {
        ...state.clipsByProject,
        [projectId]: (state.clipsByProject[projectId] ?? []).map((c) =>
          c.id === clipId ? { ...c, ...patch } : c,
        ),
      },
    })),

  removeClip: (projectId, clipId) =>
    set((state) => ({
      clipsByProject: {
        ...state.clipsByProject,
        [projectId]: (state.clipsByProject[projectId] ?? []).filter(
          (c) => c.id !== clipId,
        ),
      },
      selectedClipId:
        state.selectedClipId === clipId ? null : state.selectedClipId,
    })),

  duplicateClip: (projectId, clipId) => {
    const clips = get().clipsByProject[projectId] ?? [];
    const source = clips.find((c) => c.id === clipId);
    if (!source) return null;
    const newId = id();
    const copy: AudioClip = {
      ...source,
      id: newId,
      startTime: source.startTime + (source.trimEnd - source.trimStart) + 1,
    };
    set((state) => ({
      clipsByProject: {
        ...state.clipsByProject,
        [projectId]: [...(state.clipsByProject[projectId] ?? []), copy],
      },
    }));
    return newId;
  },

  splitClip: (projectId, clipId, atSeconds) => {
    const clips = get().clipsByProject[projectId] ?? [];
    const source = clips.find((c) => c.id === clipId);
    if (!source) return null;

    const duration = source.trimEnd - source.trimStart;
    const clipRelative = atSeconds - source.startTime;
    if (clipRelative <= 0 || clipRelative >= duration) return null;

    const splitSourceTime = source.trimStart + clipRelative;
    const newId = id();
    const rightPart: AudioClip = {
      ...source,
      id: newId,
      startTime: atSeconds,
      trimStart: splitSourceTime,
      fadeIn: 0,
    };

    set((state) => ({
      clipsByProject: {
        ...state.clipsByProject,
        [projectId]: (state.clipsByProject[projectId] ?? []).flatMap((c) =>
          c.id === clipId
            ? [
                { ...c, trimEnd: splitSourceTime, fadeOut: 0 },
                rightPart,
              ]
            : [c],
        ),
      },
    }));

    return newId;
  },

  setSelectedClipId: (clipId) => set({ selectedClipId: clipId }),

  loadTracksAndClips: (projectId, tracks, clips) =>
    set((state) => ({
      tracksByProject: { ...state.tracksByProject, [projectId]: tracks },
      clipsByProject: { ...state.clipsByProject, [projectId]: clips },
    })),
}));

export function useAudioTracks(projectId: string): AudioTrack[] {
  return useAudioStore((s) => s.tracksByProject[projectId] ?? EMPTY_TRACKS);
}

export function useAudioClips(projectId: string): AudioClip[] {
  return useAudioStore((s) => s.clipsByProject[projectId] ?? EMPTY_CLIPS);
}
