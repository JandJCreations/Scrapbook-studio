import { create } from "zustand";

interface TextEditingStore {
  editingObjectId: string | null;
  startEditing: (objectId: string) => void;
  stopEditing: () => void;
}

export const useTextEditingStore = create<TextEditingStore>((set) => ({
  editingObjectId: null,
  startEditing: (objectId) => set({ editingObjectId: objectId }),
  stopEditing: () => set({ editingObjectId: null }),
}));
