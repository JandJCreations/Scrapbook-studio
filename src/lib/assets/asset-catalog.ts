import * as shapes from "@/lib/assets/svg-shapes";
import type { AssetCategory, ScrapbookAsset } from "@/types/asset";

let counter = 0;
function asset(
  category: AssetCategory,
  name: string,
  src: string,
  width = 160,
  height = 160,
): ScrapbookAsset {
  counter += 1;
  return { id: `${category}-${counter}`, category, name, src, width, height };
}

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  stickers: "Stickers",
  frames: "Frames",
  washiTape: "Washi tape",
  paperTextures: "Paper textures",
  tornPaper: "Torn paper",
  polaroids: "Polaroids",
  shapes: "Shapes",
  floral: "Floral",
  notebookPaper: "Notebook paper",
  cardboard: "Cardboard",
  emojis: "Emojis",
};

export const ASSET_CATALOG: ScrapbookAsset[] = [
  // Stickers
  asset("stickers", "Star", shapes.starSticker()),
  asset("stickers", "Heart", shapes.heartSticker()),
  asset("stickers", "Speech bubble", shapes.speechBubbleSticker()),
  asset("stickers", "Badge", shapes.badgeSticker()),
  asset("stickers", "Arrow", shapes.arrowSticker()),
  asset("stickers", "Thumbs up", shapes.thumbsUpSticker()),
  asset("stickers", "Star (pink)", shapes.starSticker("#f472b6")),
  asset("stickers", "Badge (blue)", shapes.badgeSticker("#60a5fa", "1st")),

  // Frames
  asset("frames", "Thin frame", shapes.thinFrame("#ffffff")),
  asset("frames", "Thick frame", shapes.thickFrame("#ffffff")),
  asset("frames", "Rounded frame", shapes.roundedFrame("#ffffff")),
  asset("frames", "Dotted frame", shapes.dottedFrame("#ffffff")),
  asset("frames", "Gold frame", shapes.thickFrame("#facc15")),

  // Washi tape
  asset("washiTape", "Pink stripes", shapes.washiTape("#f9a8d4"), 220, 60),
  asset("washiTape", "Blue dots", shapes.washiTapeDots("#93c5fd"), 220, 60),
  asset("washiTape", "Mint stripes", shapes.washiTape("#5eead4"), 220, 60),
  asset("washiTape", "Yellow dots", shapes.washiTapeDots("#fde68a"), 220, 60),

  // Paper textures
  asset("paperTextures", "Cream paper", shapes.paperTexture("#fefce8")),
  asset("paperTextures", "White paper", shapes.paperTexture("#ffffff")),
  asset("paperTextures", "Blush paper", shapes.paperTexture("#fdf2f8")),
  asset("paperTextures", "Mint paper", shapes.paperTexture("#f0fdfa")),

  // Torn paper
  asset("tornPaper", "Torn cream", shapes.tornPaper("#fffbeb")),
  asset("tornPaper", "Torn white", shapes.tornPaper("#ffffff")),

  // Polaroids
  asset("polaroids", "Polaroid", shapes.polaroidFrame(0)),
  asset("polaroids", "Polaroid tilted", shapes.polaroidFrame(-6)),
  asset("polaroids", "Polaroid tilted right", shapes.polaroidFrame(6)),

  // Shapes
  asset("shapes", "Circle", shapes.circleShape()),
  asset("shapes", "Blob", shapes.blobShape()),
  asset("shapes", "Hexagon", shapes.hexagonShape()),
  asset("shapes", "Dashed circle", shapes.dashedCircleShape()),
  asset("shapes", "Circle (blue)", shapes.circleShape("#60a5fa")),

  // Floral
  asset("floral", "Flower", shapes.flowerAsset()),
  asset("floral", "Flower (yellow)", shapes.flowerAsset("#fde047", "#f97316")),
  asset("floral", "Leaf", shapes.leafAsset()),
  asset("floral", "Branch", shapes.branchAsset(), 200, 200),

  // Notebook paper
  asset("notebookPaper", "Lined paper", shapes.notebookPaper()),

  // Cardboard
  asset("cardboard", "Cardboard", shapes.cardboardTexture()),

  // Emojis
  asset("emojis", "Heart", shapes.emojiAsset("❤️")),
  asset("emojis", "Smile", shapes.emojiAsset("😊")),
  asset("emojis", "Party", shapes.emojiAsset("🎉")),
  asset("emojis", "Camera", shapes.emojiAsset("📸")),
  asset("emojis", "Sparkles", shapes.emojiAsset("✨")),
  asset("emojis", "Star", shapes.emojiAsset("🌟")),
  asset("emojis", "Balloon", shapes.emojiAsset("🎈")),
  asset("emojis", "Blossom", shapes.emojiAsset("🌸")),
  asset("emojis", "Sun", shapes.emojiAsset("☀️")),
  asset("emojis", "Rainbow", shapes.emojiAsset("🌈")),
  asset("emojis", "Fire", shapes.emojiAsset("🔥")),
  asset("emojis", "100", shapes.emojiAsset("💯")),
];

export function getAssetsByCategory(category: AssetCategory): ScrapbookAsset[] {
  return ASSET_CATALOG.filter((a) => a.category === category);
}
