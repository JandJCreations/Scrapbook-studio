import { describe, expect, it } from "vitest";

import { MUSIC_LIBRARY } from "@/lib/audio/music-library-catalog";
import { findTrackByMediaId, isMusicMediaId, musicMediaId } from "@/lib/audio/music-keys";

describe("music media ids", () => {
  it("names a library track by its id", () => {
    expect(musicMediaId(MUSIC_LIBRARY[0])).toBe(`music:${MUSIC_LIBRARY[0].id}`);
  });

  it("finds each track again, and nothing else", () => {
    for (const track of MUSIC_LIBRARY) expect(findTrackByMediaId(musicMediaId(track))).toBe(track);
    expect(findTrackByMediaId("music:nope")).toBeUndefined();
    expect(findTrackByMediaId("asset:stickers/Star")).toBeUndefined();
    expect(findTrackByMediaId("11111111-1111-4111-8111-111111111111")).toBeUndefined();
  });

  it("tells library ids from file ids", () => {
    expect(isMusicMediaId("music:confetti")).toBe(true);
    expect(isMusicMediaId("asset:x/y")).toBe(false);
    expect(isMusicMediaId("")).toBe(false);
  });
});
