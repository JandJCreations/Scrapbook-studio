import { describe, expect, it } from "vitest";

import { assetMediaId, findAssetByMediaId, isBundledAssetId } from "@/lib/assets/asset-keys";
import { ASSET_CATALOG } from "@/lib/assets/asset-catalog";

describe("asset media ids", () => {
  it("names an asset by its category and name", () => {
    const star = ASSET_CATALOG.find((a) => a.category === "stickers" && a.name === "Star")!;
    expect(assetMediaId(star)).toBe("asset:stickers/Star");
  });

  it("gives every catalog asset its own id, so none can be mistaken for another", () => {
    const ids = ASSET_CATALOG.map(assetMediaId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("finds an asset again from its id, and finds nothing for anything else", () => {
    for (const asset of ASSET_CATALOG) {
      expect(findAssetByMediaId(assetMediaId(asset))).toBe(asset);
    }
    expect(findAssetByMediaId("asset:stickers/Nope")).toBeUndefined();
    expect(findAssetByMediaId("11111111-1111-4111-8111-111111111111")).toBeUndefined();
  });

  it("tells bundled ids from file ids", () => {
    expect(isBundledAssetId("asset:frames/Thin frame")).toBe(true);
    expect(isBundledAssetId("11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(isBundledAssetId("")).toBe(false);
  });
});
