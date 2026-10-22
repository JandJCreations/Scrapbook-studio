import { describe, expect, it } from "vitest";

import { createImageCache, type ImageLike } from "@/lib/playback/image-cache";

class FakeImage implements ImageLike {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  /** The order in which properties were assigned. */
  assigned: string[] = [];
  private cross: string | null = null;
  private source = "";
  get crossOrigin() {
    return this.cross;
  }
  set crossOrigin(value: string | null) {
    this.assigned.push("crossOrigin");
    this.cross = value;
  }
  get src() {
    return this.source;
  }
  set src(value: string) {
    this.assigned.push("src");
    this.source = value;
  }
}

function setup(urls: Record<string, string | null> = { m: "blob:img" }) {
  const images: FakeImage[] = [];
  const loads = { count: 0 };
  const cache = createImageCache({
    urlFor: (id) => urls[id] ?? null,
    onLoad: () => {
      loads.count += 1;
    },
    createImage: () => {
      const image = new FakeImage();
      images.push(image);
      return image;
    },
  });
  return { cache, images, loads, urls };
}

describe("createImageCache", () => {
  it("returns null while loading, then the image once loaded, calling onLoad", () => {
    const { cache, images, loads } = setup();
    expect(cache.get("m")).toBeNull();
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe("blob:img");

    images[0].onload?.();
    expect(loads.count).toBe(1);
    expect(cache.get("m")).toBe(images[0]);
    expect(images).toHaveLength(1);
  });

  it("sets crossOrigin before src and starts each load only once", () => {
    const { cache, images } = setup();
    cache.get("m");
    cache.get("m");
    expect(images).toHaveLength(1);
    expect(images[0].assigned).toEqual(["crossOrigin", "src"]);
    expect(images[0].crossOrigin).toBe("anonymous");
  });

  it("does not cache a media id that has no URL yet", () => {
    const { cache, images, urls } = setup({});
    expect(cache.get("m")).toBeNull();
    expect(images).toHaveLength(0);
    urls.m = "blob:late";
    cache.get("m");
    expect(images).toHaveLength(1);
  });

  it("does not retry a failed load until invalidated", () => {
    const { cache, images } = setup();
    cache.get("m");
    images[0].onerror?.();
    expect(cache.get("m")).toBeNull();
    expect(images).toHaveLength(1);

    cache.invalidate("m");
    cache.get("m");
    expect(images).toHaveLength(2);
  });

  it("detaches handlers on dispose so late loads do nothing", () => {
    const { cache, images, loads } = setup();
    cache.get("m");
    cache.dispose();
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
    expect(loads.count).toBe(0);
  });
});
