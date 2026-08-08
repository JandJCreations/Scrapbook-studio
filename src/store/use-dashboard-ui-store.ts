import { create } from "zustand";

interface DashboardUiStore {
  search: string;
  setSearch: (value: string) => void;
  activeFolderId: string | null;
  setActiveFolderId: (id: string | null) => void;
}

export const useDashboardUiStore = create<DashboardUiStore>((set) => ({
  search: "",
  setSearch: (value) => set({ search: value }),
  activeFolderId: null,
  setActiveFolderId: (id) => set({ activeFolderId: id }),
}));
