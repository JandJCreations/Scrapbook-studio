import { create } from "zustand";

export type MediaViewMode = "grid" | "list";

interface MediaUiStore {
  search: string;
  viewMode: MediaViewMode;
  activeFolderId: string | null;
  selectionMode: boolean;
  selectedIds: Set<string>;
  setSearch: (value: string) => void;
  setViewMode: (mode: MediaViewMode) => void;
  setActiveFolderId: (folderId: string | null) => void;
  setSelectionMode: (on: boolean) => void;
  toggleSelected: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
}

export const useMediaUiStore = create<MediaUiStore>((set) => ({
  search: "",
  viewMode: "grid",
  activeFolderId: null,
  selectionMode: false,
  selectedIds: new Set(),
  setSearch: (value) => set({ search: value }),
  setViewMode: (mode) => set({ viewMode: mode }),
  // Switching folders while items are selected would silently carry a
  // selection made in one folder over into bulk actions run in another.
  setActiveFolderId: (folderId) => set({ activeFolderId: folderId, selectedIds: new Set() }),
  setSelectionMode: (on) => set({ selectionMode: on, selectedIds: new Set() }),
  toggleSelected: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedIds: next };
    }),
  selectAll: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set() }),
}));
