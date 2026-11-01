import { describe, expect, it } from "vitest";

import { CROP_ASPECTS, controlsFromCrop, cropFor } from "@/lib/appearance/crop";

const natural = { width: 400, height: 300 };

describe("cropFor", () => {
  it("is the whole picture for the original shape at 1x", () => {
    expect(cropFor(natural, null, 1, 50, 50)).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });

  it("fits the biggest square, centred, at 1x", () => {
    expect(cropFor(natural, 1, 1, 50, 50)).toEqual({ x: 50, y: 0, width: 300, height: 300 });
  });

  it("fits a wide shape inside a tall picture", () => {
    expect(cropFor({ width: 300, height: 400 }, 16 / 9, 1, 50, 50)).toEqual({
      x: 0,
      y: 116,
      width: 300,
      height: 169,
    });
  });

  it("zooms in on the middle and pans within what is left", () => {
    expect(cropFor(natural, 1, 2, 50, 50)).toEqual({ x: 125, y: 75, width: 150, height: 150 });
    expect(cropFor(natural, 1, 2, 0, 0)).toEqual({ x: 0, y: 0, width: 150, height: 150 });
    expect(cropFor(natural, 1, 2, 100, 100)).toEqual({ x: 250, y: 150, width: 150, height: 150 });
  });

  it("keeps zoom between 1x and 5x and pan between 0 and 100", () => {
    expect(cropFor(natural, 1, 0.2, 50, 50).width).toBe(300);
    expect(cropFor(natural, 1, 99, 50, 50).width).toBe(60);
    expect(cropFor(natural, 1, 1, -10, 500)).toMatchObject({ x: 0, y: 0 });
  });
});

describe("controlsFromCrop", () => {
  it("starts at the original shape, 1x, centred, when there is no crop", () => {
    expect(controlsFromCrop(natural, null)).toEqual({ aspect: "original", zoom: 1, panX: 50, panY: 50 });
  });

  it("reads a preset's shape, zoom and position back out of a crop", () => {
    // A picture that is not itself 4:3, so the shape is the preset and not "original".
    const wide = { width: 500, height: 300 };
    const crop = cropFor(wide, 4 / 3, 2, 25, 75);
    const controls = controlsFromCrop(wide, crop);
    expect(controls.aspect).toBe("4:3");
    expect(controls.zoom).toBeCloseTo(2, 1);
    expect(controls.panX).toBeCloseTo(25, 0);
    expect(controls.panY).toBeCloseTo(75, 0);
  });

  it("calls an odd shape free", () => {
    expect(controlsFromCrop(natural, { x: 0, y: 0, width: 200, height: 70 }).aspect).toBe("free");
  });

  it("offers the expected presets", () => {
    expect(CROP_ASPECTS.map((a) => a.id)).toEqual(["original", "1:1", "4:3", "16:9", "9:16", "3:4"]);
  });
});
