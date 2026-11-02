import { create } from "zustand";

import {
  cancelGesture,
  commit,
  createHistory,
  endGesture,
  preview,
  redo,
  undo,
  type HistoryState,
} from "@/lib/timeline/history";
import type { TimelineProject } from "@/types/timeline";

export const EMPTY_PROJECT: TimelineProject = { id: "", tracks: [], clips: [] };

export type ProjectOp = (project: TimelineProject) => TimelineProject;

interface ClipProjectStore {
  history: HistoryState<TimelineProject>;
  selectedClipIds: string[];

  load: (project: TimelineProject) => void;
  apply: (op: ProjectOp) => void;
  /** Live drag feedback; `op` always runs against the pre-drag project. */
  previewApply: (op: ProjectOp) => void;
  endGesture: () => void;
  /** Abandons the open drag without adding history (for Escape). */
  cancelGesture: () => void;
  /** Mid-drag, undo and redo only cancel the drag. */
  undo: () => void;
  redo: () => void;
  setSelectedClipIds: (ids: string[]) => void;
}

function pruneSelection(ids: string[], project: TimelineProject): string[] {
  const live = new Set(project.clips.map((clip) => clip.id));
  const kept = ids.filter((id) => live.has(id));
  return kept.length === ids.length ? ids : kept;
}

function withHistory(state: ClipProjectStore, history: HistoryState<TimelineProject>) {
  return { history, selectedClipIds: pruneSelection(state.selectedClipIds, history.present) };
}

export const useClipProjectStore = create<ClipProjectStore>((set) => ({
  history: createHistory(EMPTY_PROJECT),
  selectedClipIds: [],

  load: (project) => set({ history: createHistory(project), selectedClipIds: [] }),
  apply: (op) =>
    set((s) => withHistory(s, commit(s.history, op(s.history.present)))),
  previewApply: (op) =>
    set((s) => {
      const base = s.history.gestureBase ?? s.history.present;
      return withHistory(s, preview(s.history, op(base)));
    }),
  endGesture: () => set((s) => ({ history: endGesture(s.history) })),
  cancelGesture: () => set((s) => withHistory(s, cancelGesture(s.history))),
  undo: () => set((s) => withHistory(s, undo(s.history))),
  redo: () => set((s) => withHistory(s, redo(s.history))),
  setSelectedClipIds: (ids) => set({ selectedClipIds: ids }),
}));

export const selectProject = (s: ClipProjectStore) => s.history.present;
/** The last committed project: a drag in progress is never saved. */
export const selectSavableProject = (s: ClipProjectStore) =>
  s.history.gestureBase ?? s.history.present;
export const selectCanUndo = (s: ClipProjectStore) =>
  s.history.past.length > 0 || s.history.gestureBase !== null;
export const selectCanRedo = (s: ClipProjectStore) => s.history.future.length > 0;
