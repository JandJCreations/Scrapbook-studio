import { create } from "zustand";

export type MediaViewMode = "grid" | "list";

interface MediaUiStore {
  search: string;
  viewMode: MediaViewMode;
  activeFolderId: string | null;
  setSearch: (value: string) => void;
  setViewMode: (mode: MediaViewMode) => void;
  setActiveFolderId: (folderId: string | null) => void;
}

export const useMediaUiStore = create<MediaUiStore>((set) => ({
  search: "",
  viewMode: "grid",
  activeFolderId: null,
  setSearch: (value) => set({ search: value }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setActiveFolderId: (folderId) => set({ activeFolderId: folderId }),
}));
