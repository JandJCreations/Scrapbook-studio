import { describe, expect, it } from "vitest";

import { fittedSize, MAX_PHOTO_EDGE, preparePhoto } from "@/lib/media/prepare-photo";

describe("fittedSize", () => {
  it("leaves a 12 megapixel iPhone photo alone", () => {
    expect(fittedSize(4032, 3024)).toBeNull();
    expect(fittedSize(1080, 1920)).toBeNull();
  });

  it("shrinks a 24 or 48 megapixel photo to the longest side allowed, keeping its shape", () => {
    expect(fittedSize(5712, 4284)).toEqual({ width: MAX_PHOTO_EDGE, height: 3072 });
    const tall = fittedSize(6048, 8064)!;
    expect(tall.height).toBe(MAX_PHOTO_EDGE);
    expect(tall.width).toBe(3072);
  });

  it("keeps a very wide panorama under iPhone's canvas size limit", () => {
    const pano = fittedSize(16000, 4000)!;
    expect(pano.width * pano.height).toBeLessThanOrEqual(16_000_000);
    expect(pano.width).toBeLessThanOrEqual(MAX_PHOTO_EDGE);
  });
});

describe("preparePhoto", () => {
  it("passes PNGs, GIFs and videos through untouched", async () => {
    const png = new File(["x"], "a.png", { type: "image/png" });
    expect(await preparePhoto(png)).toBe(png);
    const gif = new File(["x"], "a.gif", { type: "image/gif" });
    expect(await preparePhoto(gif)).toBe(gif);
  });
});
