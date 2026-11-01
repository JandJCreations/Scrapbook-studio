import { describe, expect, it } from "vitest";

import { gridLines, gridSize } from "@/lib/editor/grid";

describe("gridSize", () => {
  it("is a twelfth of the shorter side, so a square cell fits both ways at any frame size", () => {
    expect(gridSize({ width: 1920, height: 1080 })).toBe(90);
    expect(gridSize({ width: 1080, height: 1920 })).toBe(90);
    expect(gridSize({ width: 1080, height: 1080 })).toBe(90);
  });

  it("never reaches zero", () => {
    expect(gridSize({ width: 5, height: 5 })).toBe(1);
  });
});

describe("gridLines", () => {
  it("lists the lines strictly inside the frame", () => {
    const lines = gridLines({ width: 300, height: 200 }, 100);
    expect(lines.vertical).toEqual([100, 200]);
    expect(lines.horizontal).toEqual([100]);
  });
});
