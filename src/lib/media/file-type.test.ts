import { describe, expect, it } from "vitest";

import { detectMediaType, friendlyMediaName, isHeic, mimeTypeFor } from "@/lib/media/file-type";

const file = (name: string, type: string, lastModified = new Date(2026, 10, 26, 15, 4).getTime()) =>
  new File(["x"], name, { type, lastModified });

describe("detectMediaType", () => {
  it("uses the MIME type when there is one", () => {
    expect(detectMediaType(file("a.jpg", "image/jpeg"))).toBe("image");
    expect(detectMediaType(file("a.mov", "video/quicktime"))).toBe("video");
    expect(detectMediaType(file("a.m4a", "audio/mp4"))).toBe("audio");
  });

  it("falls back to the name when an iPhone sends no type", () => {
    expect(detectMediaType(file("IMG_0001.HEIC", ""))).toBe("image");
    expect(detectMediaType(file("IMG_0002.MOV", ""))).toBe("video");
    expect(detectMediaType(file("memo.m4a", "application/octet-stream"))).toBe("audio");
    expect(detectMediaType(file("notes.pdf", ""))).toBeNull();
    expect(detectMediaType(file("notes.pdf", "application/pdf"))).toBeNull();
  });
});

describe("isHeic and mimeTypeFor", () => {
  it("knows an iPhone photo by its type or its name", () => {
    expect(isHeic(file("a.heic", "image/heic"))).toBe(true);
    expect(isHeic(file("a.HEIF", ""))).toBe(true);
    expect(isHeic(file("a.jpg", "image/jpeg"))).toBe(false);
  });

  it("fills in a missing type from the name", () => {
    expect(mimeTypeFor(file("a.MOV", ""))).toBe("video/quicktime");
    expect(mimeTypeFor(file("a.heic", ""))).toBe("image/heic");
    expect(mimeTypeFor(file("a.png", "image/png"))).toBe("image/png");
    expect(mimeTypeFor(file("a.xyz", ""))).toBe("application/octet-stream");
  });
});

describe("friendlyMediaName", () => {
  it("gives iPhone's same-for-every-file names a number and a time", () => {
    const name = friendlyMediaName(file("image.jpg", "image/jpeg"), "image", 3);
    expect(name).toMatch(/^Photo 3, .*Nov.*26.*\.jpg$/);
    expect(friendlyMediaName(file("trim.1F2E3D4C-AAAA-BBBB.MOV", "video/quicktime"), "video", 1)).toMatch(/^Video 1, .*\.MOV$/);
  });

  it("keeps real names", () => {
    expect(friendlyMediaName(file("IMG_1234.jpeg", "image/jpeg"), "image", 1)).toBe("IMG_1234.jpeg");
    expect(friendlyMediaName(file("Beach day.mov", "video/quicktime"), "video", 1)).toBe("Beach day.mov");
    expect(friendlyMediaName(file("image.m4a", "audio/mp4"), "audio", 1)).toBe("image.m4a");
  });
});
