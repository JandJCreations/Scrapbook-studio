export type AssetCategory =
  | "stickers"
  | "frames"
  | "washiTape"
  | "paperTextures"
  | "tornPaper"
  | "polaroids"
  | "shapes"
  | "floral"
  | "notebookPaper"
  | "cardboard"
  | "emojis";

export interface ScrapbookAsset {
  id: string;
  category: AssetCategory;
  name: string;
  src: string;
  width: number;
  height: number;
}
