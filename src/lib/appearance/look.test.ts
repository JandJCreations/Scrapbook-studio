import { describe, expect, it } from "vitest";

import { lookFor } from "@/lib/appearance/look";
import { makeClip } from "@/lib/timeline/test-utils";
import { createDefaultVideoAdjustments } from "@/types/video-adjustments";
import { DEFAULT_PHOTO_ADJUSTMENTS, type PhotoAdjustments } from "@/types/photo-adjustments";

const photo = (patch: Partial<PhotoAdjustments>) =>
  makeClip({
    kind: "image",
    sourceDuration: null,
    adjustments: { photo: { ...DEFAULT_PHOTO_ADJUSTMENTS, ...patch }, video: null, text: null },
  });

describe("lookFor", () => {
  it("is null for clips with no adjustments and for neutral ones", () => {
    expect(lookFor(makeClip({ kind: "image", sourceDuration: null }))).toBeNull();
    expect(lookFor(photo({}))).toBeNull();
    expect(lookFor(makeClip({ kind: "text" }))).toBeNull();
    expect(lookFor(makeClip({ kind: "audio" }))).toBeNull();
  });

  it("turns the sliders into a canvas filter", () => {
    const look = lookFor(photo({ brightness: 20, contrast: -10, saturation: 50, blur: 3 }));
    expect(look?.filter).toBe("brightness(1.2) contrast(0.9) saturate(1.5) blur(3px)");
  });

  it("folds exposure into brightness", () => {
    expect(lookFor(photo({ brightness: 10, exposure: 10 }))?.filter).toBe("brightness(1.21)");
  });

  it("adds the preset's changes under the sliders", () => {
    // mono: saturation -100, contrast +10
    const look = lookFor(photo({ filterPreset: "mono", saturation: 20 }));
    expect(look?.filter).toBe("contrast(1.1) saturate(0.2)");
  });

  it("never lets a factor go negative", () => {
    expect(lookFor(photo({ saturation: -100, brightness: -100 }))?.filter).toBe(
      "brightness(0) saturate(0)",
    );
  });

  it("carries flip, border, shadow and glow even when the filter is none", () => {
    const shadow = { ...DEFAULT_PHOTO_ADJUSTMENTS.shadow, enabled: true };
    const glow = { ...DEFAULT_PHOTO_ADJUSTMENTS.glow, enabled: true };
    const look = lookFor(
      photo({
        flipHorizontal: true,
        borderWidth: 4,
        borderColor: "#ff0000",
        borderRadius: 12,
        shadow,
        glow,
      }),
    );
    expect(look).toMatchObject({
      filter: "none",
      flipX: true,
      flipY: false,
      border: { width: 4, color: "#ff0000", radius: 12 },
      shadow,
      glow,
    });
  });

  it("leaves a disabled shadow and glow out", () => {
    const look = lookFor(photo({ flipVertical: true }));
    expect(look?.shadow).toBeNull();
    expect(look?.glow).toBeNull();
  });

  it("reads video clips from their video adjustments, without flip, border or glow", () => {
    const clip = makeClip({
      kind: "video",
      adjustments: {
        photo: null,
        video: { ...createDefaultVideoAdjustments(10), brightness: -50, blur: 2 },
        text: null,
      },
    });
    expect(lookFor(clip)).toMatchObject({
      filter: "brightness(0.5) blur(2px)",
      flipX: false,
      flipY: false,
      border: { width: 0, color: "#ffffff", radius: 0 },
      glow: null,
    });
  });
});
