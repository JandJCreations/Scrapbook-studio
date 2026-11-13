import { create } from "zustand";

import { useAudioStore } from "@/store/use-audio-store";
import { useCanvasStore } from "@/store/use-canvas-store";
import type { AudioClip, AudioTrack } from "@/types/audio";
import type { CanvasObject } from "@/types/canvas";

/**
 * Undo / redo for the editor.
 *
 * Instead of teaching every store action about history, this watches the
 * canvas and audio stores and records a snapshot of a project's content
 * whenever it changes. Snapshots are cheap: the stores are immutable, so a
 * snapshot is just three array references.
 *
 * Rapid-fire changes (dragging a slider, dragging an object) arrive as many
 * small updates; anything within COALESCE_MS of the previous change is folded
 * into the same undo step, so one drag = one undo.
 */

export interface HistorySnapshot {
  objects: CanvasObject[];
  tracks: AudioTrack[];
  clips: AudioClip[];
}

interface ProjectStacks {
  past: HistorySnapshot[];
  future: HistorySnapshot[];
}

const MAX_STEPS = 100;
const COALESCE_MS = 600;
const EMPTY_STACKS: ProjectStacks = { past: [], future: [] };

interface HistoryStore {
  stacksByProject: Record<string, ProjectStacks>;
  undo: (projectId: string) => void;
  redo: (projectId: string) => void;
  /** Forget all history for a project and treat its current content as the baseline. */
  resetHistory: (projectId: string) => void;
}

// Bookkeeping that doesn't need to trigger re-renders.
const lastSnapshot = new Map<string, HistorySnapshot>();
const lastChangeAt = new Map<string, number>();
let restoring = false;

function currentSnapshot(projectId: string): HistorySnapshot {
  return {
    objects: useCanvasStore.getState().objectsByProject[projectId] ?? [],
    tracks: useAudioStore.getState().tracksByProject[projectId] ?? [],
    clips: useAudioStore.getState().clipsByProject[projectId] ?? [],
  };
}

function applySnapshot(projectId: string, snapshot: HistorySnapshot) {
  restoring = true;
  try {
    const canvas = useCanvasStore.getState();
    canvas.loadObjects(projectId, snapshot.objects);
    useAudioStore
      .getState()
      .loadTracksAndClips(projectId, snapshot.tracks, snapshot.clips);

    // Drop selections that point at things that no longer exist.
    const ids = new Set(snapshot.objects.map((o) => o.id));
    const keep = canvas.selectedIds.filter((id) => ids.has(id));
    if (keep.length !== canvas.selectedIds.length) canvas.setSelectedIds(keep);
    const audio = useAudioStore.getState();
    if (
      audio.selectedClipId &&
      !snapshot.clips.some((c) => c.id === audio.selectedClipId)
    ) {
      audio.setSelectedClipId(null);
    }
  } finally {
    restoring = false;
  }
  lastSnapshot.set(projectId, snapshot);
  lastChangeAt.set(projectId, 0);
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  stacksByProject: {},

  undo: (projectId) => {
    const stacks = get().stacksByProject[projectId] ?? EMPTY_STACKS;
    if (stacks.past.length === 0) return;
    const previous = stacks.past[stacks.past.length - 1];
    const now = currentSnapshot(projectId);
    set((state) => ({
      stacksByProject: {
        ...state.stacksByProject,
        [projectId]: {
          past: stacks.past.slice(0, -1),
          future: [...stacks.future, now],
        },
      },
    }));
    applySnapshot(projectId, previous);
  },

  redo: (projectId) => {
    const stacks = get().stacksByProject[projectId] ?? EMPTY_STACKS;
    if (stacks.future.length === 0) return;
    const next = stacks.future[stacks.future.length - 1];
    const now = currentSnapshot(projectId);
    set((state) => ({
      stacksByProject: {
        ...state.stacksByProject,
        [projectId]: {
          past: [...stacks.past, now].slice(-MAX_STEPS),
          future: stacks.future.slice(0, -1),
        },
      },
    }));
    applySnapshot(projectId, next);
  },

  resetHistory: (projectId) => {
    lastSnapshot.set(projectId, currentSnapshot(projectId));
    lastChangeAt.set(projectId, 0);
    set((state) => ({
      stacksByProject: { ...state.stacksByProject, [projectId]: EMPTY_STACKS },
    }));
  },
}));

function recordChange(projectId: string) {
  if (restoring) return;
  const before = lastSnapshot.get(projectId);
  const after = currentSnapshot(projectId);
  lastSnapshot.set(projectId, after);
  // Not baselined yet (project still loading) — nothing to undo back to.
  if (!before) return;

  const now = Date.now();
  const coalesce = now - (lastChangeAt.get(projectId) ?? 0) < COALESCE_MS;
  lastChangeAt.set(projectId, now);

  useHistoryStore.setState((state) => {
    const stacks = state.stacksByProject[projectId] ?? EMPTY_STACKS;
    if (coalesce && stacks.past.length > 0) {
      // Same gesture as the last change: the undo step already holds the
      // state from before the gesture started. Any redo branch is gone.
      return stacks.future.length === 0
        ? state
        : {
            stacksByProject: {
              ...state.stacksByProject,
              [projectId]: { past: stacks.past, future: [] },
            },
          };
    }
    return {
      stacksByProject: {
        ...state.stacksByProject,
        [projectId]: {
          past: [...stacks.past, before].slice(-MAX_STEPS),
          future: [],
        },
      },
    };
  });
}

function changedKeys<T>(
  next: Record<string, T>,
  prev: Record<string, T>,
): string[] {
  if (next === prev) return [];
  return Object.keys(next).filter((k) => next[k] !== prev[k]);
}

useCanvasStore.subscribe((state, prev) => {
  for (const projectId of changedKeys(state.objectsByProject, prev.objectsByProject)) {
    recordChange(projectId);
  }
});

useAudioStore.subscribe((state, prev) => {
  const ids = new Set([
    ...changedKeys(state.tracksByProject, prev.tracksByProject),
    ...changedKeys(state.clipsByProject, prev.clipsByProject),
  ]);
  for (const projectId of ids) recordChange(projectId);
});

export function useCanUndo(projectId: string): boolean {
  return useHistoryStore(
    (s) => (s.stacksByProject[projectId]?.past.length ?? 0) > 0,
  );
}

export function useCanRedo(projectId: string): boolean {
  return useHistoryStore(
    (s) => (s.stacksByProject[projectId]?.future.length ?? 0) > 0,
  );
}
