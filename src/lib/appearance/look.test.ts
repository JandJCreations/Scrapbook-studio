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

  it("carries highlights, shadows and sharpness as tone, and is not neutral because of them", () => {
    const look = lookFor(photo({ highlights: -20, shadowsTone: 30, sharpness: 40 }));
    expect(look?.tone).toEqual({ highlights: -20, shadows: 30, sharpness: 40 });
    expect(look?.filter).toBe("none");
    expect(lookFor(photo({ sharpness: 1 }))).not.toBeNull();
    expect(lookFor(photo({}))?.tone ?? null).toBeNull();
  });

  it("gives a video no tone", () => {
    expect(lookFor(makeClip({ kind: "video", adjustments: { photo: null, video: { ...createDefaultVideoAdjustments(10), blur: 2 }, text: null } }))?.tone).toBeNull();
  });

  it("turns the sliders into a canvas filter", () => {
    const look = lookFor(photo({ brightness: 20, contrast: -10, saturation: 50, blur: 3 }));
    expect(look?.filter).toBe("brightness(1.2) contrast(0.9) saturate(1.5)");
    expect(look?.blurPx).toBe(3);
  });

  it("folds exposure into brightness", () => {
    expect(lookFor(photo({ brightness: 10, exposure: 10 }))?.filter).toBe("brightness(1.21)");
  });

  it("adds the preset's changes under the sliders", () => {
    // mono: saturation -100, contrast +10
    const look = lookFor(photo({ filterPreset: "mono", saturation: 20 }));
    expect(look?.filter).toBe("contrast(1.1) saturate(0.2)");
  });

  it("counts a blur alone as a look", () => {
    expect(lookFor(photo({ blur: 4 }))).toMatchObject({ filter: "none", blurPx: 4 });
  });

  it("carries a crop, for pictures and for video", () => {
    const crop = { x: 10, y: 20, width: 100, height: 80 };
    expect(lookFor(photo({ crop }))).toMatchObject({ filter: "none", crop });
    const video = makeClip({
      kind: "video",
      adjustments: { photo: null, video: { ...createDefaultVideoAdjustments(10), crop }, text: null },
    });
    expect(lookFor(video)?.crop).toEqual(crop);
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
      filter: "brightness(0.5)",
      blurPx: 2,
      flipX: false,
      flipY: false,
      border: { width: 0, color: "#ffffff", radius: 0 },
      glow: null,
    });
  });
});
