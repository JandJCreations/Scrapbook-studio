import { describe, expect, it } from "vitest";

import { applyHighlights, applySharpness, applyShadows, applyTone, hasTone } from "@/lib/appearance/pixel-tone";

const px = (...rgba: number[]) => new Uint8ClampedArray(rgba);

describe("applyHighlights", () => {
  it("brightens bright pixels far more than dark ones", () => {
    const data = px(240, 240, 240, 255, 20, 20, 20, 255);
    applyHighlights(data, 50);
    expect(data[0]).toBeGreaterThan(240 - 1); // clamped at 255
    expect(data[4]).toBe(20 + Math.round(50 * 0.6 * (20 / 255) ** 2));
  });

  it("darkens with a negative amount, and leaves alpha and zero alone", () => {
    const data = px(200, 200, 200, 128);
    applyHighlights(data, -50);
    expect(data[0]).toBeLessThan(200);
    expect(data[3]).toBe(128);
    const same = px(200, 200, 200, 255);
    applyHighlights(same, 0);
    expect(Array.from(same)).toEqual([200, 200, 200, 255]);
  });
});

describe("applyShadows", () => {
  it("lifts dark pixels far more than bright ones", () => {
    const data = px(10, 10, 10, 255, 250, 250, 250, 255);
    applyShadows(data, 80);
    expect(data[0] - 10).toBeGreaterThan(30);
    expect(data[4]).toBe(250 + Math.round(80 * 0.6 * (1 - 250 / 255) ** 2));
  });
});

describe("applySharpness", () => {
  // A 3x3 image, dark with one bright centre pixel.
  const grid = () => {
    const data = new Uint8ClampedArray(3 * 3 * 4);
    for (let i = 0; i < 9; i++) data.set([100, 100, 100, 255], i * 4);
    data.set([140, 140, 140, 255], 4 * 4);
    return data;
  };

  it("exaggerates an edge: the bright centre gets brighter", () => {
    const data = grid();
    applySharpness(data, 3, 3, 100);
    expect(data[16]).toBeGreaterThan(140);
  });

  it("changes nothing at zero, and keeps the border pixels as they were", () => {
    const untouched = grid();
    applySharpness(untouched, 3, 3, 0);
    expect(Array.from(untouched)).toEqual(Array.from(grid()));
    const data = grid();
    applySharpness(data, 3, 3, 100);
    expect(Array.from(data.slice(0, 4))).toEqual([100, 100, 100, 255]);
  });

  it("does not draw a bright ring where the picture meets transparent pixels", () => {
    // A 3x3 picture: opaque flat grey in the middle column, fully transparent (rgb 0) on the left.
    const data = new Uint8ClampedArray(3 * 3 * 4);
    for (let y = 0; y < 3; y++) {
      data.set([0, 0, 0, 0], (y * 3 + 0) * 4);
      data.set([100, 100, 100, 255], (y * 3 + 1) * 4);
      data.set([100, 100, 100, 255], (y * 3 + 2) * 4);
    }
    applySharpness(data, 3, 3, 100);
    expect(data[(1 * 3 + 1) * 4]).toBe(100); // the centre next to the transparent column is unchanged
  });

  it("does not move a flat area", () => {
    const flat = new Uint8ClampedArray(5 * 5 * 4).fill(90);
    applySharpness(flat, 5, 5, 100);
    expect(new Set(flat)).toEqual(new Set([90]));
  });
});

describe("applyTone and hasTone", () => {
  it("applies every part that is set", () => {
    const data = px(240, 240, 240, 255);
    applyTone({ data, width: 1, height: 1 }, { highlights: -60, shadows: 0, sharpness: 0 });
    expect(data[0]).toBeLessThan(240);
  });

  it("knows when there is nothing to do", () => {
    expect(hasTone({ highlights: 0, shadows: 0, sharpness: 0 })).toBe(false);
    expect(hasTone({ highlights: 0, shadows: 0, sharpness: 5 })).toBe(true);
    expect(hasTone(null)).toBe(false);
  });
});
