import { create } from "zustand";

export interface CustomFont {
  id: string;
  name: string;
  family: string;
}

interface CustomFontStore {
  fonts: CustomFont[];
  addFont: (file: File) => Promise<CustomFont>;
}

function id() {
  return Math.random().toString(36).slice(2, 10);
}

export const useCustomFontStore = create<CustomFontStore>((set) => ({
  fonts: [],
  addFont: async (file) => {
    const name = file.name.replace(/\.[^.]+$/, "");
    const family = `custom-${id()}`;
    const buffer = await file.arrayBuffer();
    const fontFace = new FontFace(family, buffer);
    await fontFace.load();
    document.fonts.add(fontFace);

    const font: CustomFont = { id: id(), name, family };
    set((state) => ({ fonts: [font, ...state.fonts] }));
    return font;
  },
}));
