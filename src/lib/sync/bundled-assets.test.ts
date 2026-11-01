import { describe, expect, it, vi } from "vitest";

import { ASSET_CATALOG } from "@/lib/assets/asset-catalog";
import { assetMediaId } from "@/lib/assets/asset-keys";
import type { MediaUrlSource } from "@/lib/sync/media-url-store";
import { withBundledAssets } from "@/lib/sync/bundled-assets";

const real = (): MediaUrlSource => ({
  urlFor: vi.fn((id: string) => (id === "file-1" ? "https://signed/file-1" : null)),
  posterFor: vi.fn(() => null),
  ensure: vi.fn(async () => {}),
  subscribe: vi.fn(() => () => {}),
  getVersion: vi.fn(() => 7),
});

describe("withBundledAssets", () => {
  const star = ASSET_CATALOG[0];

  it("answers bundled ids from the catalog without asking the real source", () => {
    const source = real();
    const wrapped = withBundledAssets(source);
    expect(wrapped.urlFor(assetMediaId(star))).toBe(star.src);
    expect(source.urlFor).not.toHaveBeenCalled();
  });

  it("passes every other id through", () => {
    const wrapped = withBundledAssets(real());
    expect(wrapped.urlFor("file-1")).toBe("https://signed/file-1");
    expect(wrapped.urlFor("unknown")).toBeNull();
    expect(wrapped.getVersion()).toBe(7);
  });

  it("never asks the real source to look up a bundled id", async () => {
    const source = real();
    const wrapped = withBundledAssets(source);
    await wrapped.ensure([assetMediaId(star), "file-1"]);
    expect(source.ensure).toHaveBeenCalledWith(["file-1"]);
  });

  it("has no poster for a bundled id and forwards subscriptions", () => {
    const source = real();
    const wrapped = withBundledAssets(source);
    expect(wrapped.posterFor(assetMediaId(star))).toBeNull();
    wrapped.subscribe(() => {});
    expect(source.subscribe).toHaveBeenCalledTimes(1);
  });
});
