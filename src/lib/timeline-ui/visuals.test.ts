import { describe, expect, it } from "vitest";

import {
  MAX_TILES_PER_CLIP,
  quantizeTime,
  sourceTimeAt,
  thumbnailTiles,
  tileWidth,
  viewWindow,
  visibleTiles,
  waveformBars,
  waveformPath,
} from "@/lib/timeline-ui/visuals";
import { makeClip } from "@/lib/timeline/test-utils";

const clip = (extra = {}) =>
  makeClip({ start: 0, sourceIn: 2, sourceOut: 8, sourceDuration: 10, speed: 1, ...extra });

describe("tileWidth", () => {
  it("is a 16:9 frame at chip height, never narrower than 24 px", () => {
    expect(tileWidth(60)).toBe(107);
    expect(tileWidth(10)).toBe(24);
  });
});

describe("sourceTimeAt", () => {
  it("moves forward through the source at the clip's speed", () => {
    expect(sourceTimeAt(clip(), 0)).toBe(2);
    expect(sourceTimeAt(clip(), 3)).toBe(5);
    expect(sourceTimeAt(clip({ speed: 2, sourceOut: 8 }), 1)).toBe(4);
  });

  it("moves backward from the end when reversed", () => {
    expect(sourceTimeAt(clip({ reversed: true }), 0)).toBe(8);
    expect(sourceTimeAt(clip({ reversed: true }), 3)).toBe(5);
  });

  it("stays inside the trimmed range", () => {
    expect(sourceTimeAt(clip(), 99)).toBe(8);
    expect(sourceTimeAt(clip({ reversed: true }), 99)).toBe(2);
    expect(sourceTimeAt(clip(), -5)).toBe(2);
  });
});

describe("quantizeTime", () => {
  it("snaps to the nearest half second without float noise", () => {
    expect(quantizeTime(2.24)).toBe(2);
    expect(quantizeTime(2.26)).toBe(2.5);
    expect(quantizeTime(0.1 + 0.2)).toBe(0.5);
    expect(quantizeTime(7.3, 1)).toBe(7);
  });
});

describe("thumbnailTiles", () => {
  it("covers the clip with equal tiles, each showing the source time at its centre", () => {
    // 6 s at 60 px/s = 360 px; tiles are 107 px, so 4 tiles of 90 px.
    const tiles = thumbnailTiles(clip(), 60, 60);
    expect(tiles).toHaveLength(4);
    expect(tiles.map((t) => t.x)).toEqual([0, 90, 180, 270]);
    expect(tiles.every((t) => t.width === 90)).toBe(true);
    expect(tiles.map((t) => t.sourceTime)).toEqual([2.75, 4.25, 5.75, 7.25]);
  });

  it("shows later source first when reversed, and skips ahead when sped up", () => {
    const reversed = thumbnailTiles(clip({ reversed: true }), 60, 60).map((t) => t.sourceTime);
    expect(reversed).toEqual([7.25, 5.75, 4.25, 2.75]);
    // Speed 2: the same 6 s of source plays in 3 s, so 180 px and 2 tiles.
    const fast = thumbnailTiles(clip({ speed: 2 }), 60, 60);
    expect(fast).toHaveLength(2);
    expect(fast[0].sourceTime).toBeCloseTo(2 + 0.75 * 2, 9);
  });

  it("makes one tile for a very short clip and caps the count for a very long one", () => {
    expect(thumbnailTiles(clip({ sourceIn: 0, sourceOut: 0.2 }), 60, 60)).toHaveLength(1);
    const long = thumbnailTiles(clip({ sourceIn: 0, sourceOut: 600, sourceDuration: 600 }), 100, 60);
    expect(long).toHaveLength(MAX_TILES_PER_CLIP);
    expect(long[long.length - 1].x + long[long.length - 1].width).toBeCloseTo(600 * 100, 6);
  });
});

describe("visibleTiles", () => {
  const tiles = thumbnailTiles(clip(), 60, 60); // x 0, 90, 180, 270 (width 90)

  it("keeps the tiles that overlap the range", () => {
    expect(visibleTiles(tiles, 100, 200).map((t) => t.index)).toEqual([1, 2]);
    expect(visibleTiles(tiles, 0, 1).map((t) => t.index)).toEqual([0]);
  });

  it("drops tiles that only touch the range or lie outside it", () => {
    expect(visibleTiles(tiles, 90, 180).map((t) => t.index)).toEqual([1]);
    expect(visibleTiles(tiles, 400, 900)).toEqual([]);
    expect(visibleTiles(tiles, -500, -1)).toEqual([]);
  });
});

describe("viewWindow", () => {
  it("widens by a page and rounds outward to whole pages", () => {
    expect(viewWindow(0, 800)).toEqual({ from: 0, to: 1280 });
    expect(viewWindow(1000, 800)).toEqual({ from: 512, to: 2304 });
  });

  it("changes only once per page of scrolling", () => {
    expect(viewWindow(1000, 800)).toEqual(viewWindow(1010, 800));
    expect(viewWindow(1000, 800)).not.toEqual(viewWindow(1300, 800));
  });
});

describe("waveformBars", () => {
  // 10 peaks for a 10 s file: peak i covers second i.
  const peaks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

  it("takes the clip's trimmed slice of the file", () => {
    // sourceIn 2 .. sourceOut 8 = peaks 2..7
    expect(waveformBars(peaks, clip(), 6)).toEqual([0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
  });

  it("reduces many peaks to fewer bars by taking each bucket's maximum", () => {
    expect(waveformBars(peaks, clip(), 3)).toEqual([0.3, 0.5, 0.7]);
  });

  it("mirrors a reversed clip", () => {
    expect(waveformBars(peaks, clip({ reversed: true }), 6)).toEqual([0.7, 0.6, 0.5, 0.4, 0.3, 0.2]);
  });

  it("gives every bar a value when there are fewer peaks than bars", () => {
    const bars = waveformBars([0.5, 1], clip({ sourceIn: 0, sourceOut: 10 }), 4);
    expect(bars).toEqual([0.5, 0.5, 1, 1]);
  });

  it("returns nothing it cannot draw and clamps values to 0..1", () => {
    expect(waveformBars([], clip(), 4)).toEqual([]);
    expect(waveformBars(peaks, clip({ sourceDuration: null }), 4)).toEqual([]);
    expect(waveformBars(peaks, clip(), 0)).toEqual([]);
    expect(waveformBars([3, -1, 0.5], clip({ sourceIn: 0, sourceOut: 3, sourceDuration: 3 }), 3)).toEqual([
      1, 0, 0.5,
    ]);
  });
});

describe("waveformPath", () => {
  it("draws one centred vertical stroke per bar", () => {
    expect(waveformPath([1, 0.5], 100)).toBe("M0.5 0V100M1.5 25V75");
  });

  it("keeps silence visible as a thin line and is empty for no bars", () => {
    expect(waveformPath([0], 100)).toBe("M0.5 49V51");
    expect(waveformPath([])).toBe("");
  });
});
