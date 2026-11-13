import { describe, expect, it } from "vitest";

import { FILTER_LIST, videoLookForPreset } from "@/lib/appearance/filters";

describe("FILTER_LIST", () => {
  it("lists every preset once, starting with none, with a name to show", () => {
    expect(FILTER_LIST[0]).toMatchObject({ preset: "none", label: "None" });
    expect(new Set(FILTER_LIST.map((f) => f.preset)).size).toBe(FILTER_LIST.length);
    expect(FILTER_LIST.map((f) => f.preset)).toEqual(
      expect.arrayContaining(["vivid", "mono", "vintage", "warm", "cool", "fade", "noir"]),
    );
  });
});

describe("videoLookForPreset", () => {
  it("is all zeros for none, which takes a filter away", () => {
    expect(videoLookForPreset("none")).toEqual({ brightness: 0, contrast: 0, saturation: 0 });
  });

  it("turns a preset into the video's three sliders, folding exposure into brightness", () => {
    expect(videoLookForPreset("vivid")).toEqual({ brightness: 5, contrast: 15, saturation: 35 });
    expect(videoLookForPreset("noir")).toEqual({ brightness: -10, contrast: 30, saturation: -100 });
  });
});
