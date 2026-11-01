import { ASSET_CATALOG } from "@/lib/assets/asset-catalog";
import type { ScrapbookAsset } from "@/types/asset";

const PREFIX = "asset:";

/**
 * The media id a sticker clip stores for a catalog asset: its category and name,
 * which stay put when the catalog is edited (the catalog's own counter ids do not).
 */
export function assetMediaId(asset: ScrapbookAsset): string {
  return `${PREFIX}${asset.category}/${asset.name}`;
}

export function isBundledAssetId(mediaId: string): boolean {
  return mediaId.startsWith(PREFIX);
}

let byMediaId: Map<string, ScrapbookAsset> | null = null;

export function findAssetByMediaId(mediaId: string): ScrapbookAsset | undefined {
  if (!isBundledAssetId(mediaId)) return undefined;
  byMediaId ??= new Map(ASSET_CATALOG.map((asset) => [assetMediaId(asset), asset]));
  return byMediaId.get(mediaId);
}
