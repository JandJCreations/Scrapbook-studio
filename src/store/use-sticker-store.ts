import { create } from "zustand";

export interface CustomSticker {
  id: string;
  name: string;
  src: string;
}

interface StickerStore {
  stickers: CustomSticker[];
  addSticker: (file: File) => void;
  removeSticker: (id: string) => void;
}

function id() {
  return Math.random().toString(36).slice(2, 10);
}

export const useStickerStore = create<StickerStore>((set) => ({
  stickers: [],
  addSticker: (file) => {
    const url = URL.createObjectURL(file);
    const sticker: CustomSticker = {
      id: id(),
      name: file.name.replace(/\.[^.]+$/, ""),
      src: url,
    };
    set((state) => ({ stickers: [sticker, ...state.stickers] }));
  },
  removeSticker: (stickerId) =>
    set((state) => {
      const target = state.stickers.find((s) => s.id === stickerId);
      if (target) URL.revokeObjectURL(target.src);
      return { stickers: state.stickers.filter((s) => s.id !== stickerId) };
    }),
}));
