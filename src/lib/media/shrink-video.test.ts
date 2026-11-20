import { describe, expect, it } from "vitest";

import { bitrateToFit, fitDimensions, longSideFor } from "@/lib/media/shrink-video";

const MB = 1024 * 1024;

describe("bitrateToFit", () => {
  it("picks a bitrate that keeps the video and its sound under the limit", () => {
    const seconds = 90;
    const bitrate = bitrateToFit(seconds, 50 * MB)!;
    expect(((bitrate + 128_000) * seconds) / 8).toBeLessThan(50 * MB);
  });

  it("caps short clips at a sensible bitrate", () => {
    expect(bitrateToFit(10, 50 * MB)).toBe(6_000_000);
  });

  it("gives up on clips too long to look good at the limit", () => {
    expect(bitrateToFit(20 * 60, 50 * MB)).toBeNull();
    expect(bitrateToFit(0, 50 * MB)).toBeNull();
  });
});

describe("fitDimensions", () => {
  it("scales the long side down and keeps both sides even", () => {
    expect(fitDimensions(3840, 2160, 1280)).toEqual({ width: 1280, height: 720 });
    expect(fitDimensions(1080, 1920, 1280)).toEqual({ width: 720, height: 1280 });
  });

  it("never makes a video bigger", () => {
    expect(fitDimensions(640, 360, 1920)).toEqual({ width: 640, height: 360 });
  });
});

describe("longSideFor", () => {
  it("uses smaller sizes for lower bitrates", () => {
    expect(longSideFor(6_000_000)).toBe(1920);
    expect(longSideFor(2_500_000)).toBe(1280);
    expect(longSideFor(900_000)).toBe(960);
  });
});
