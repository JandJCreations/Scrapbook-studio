import { describe, expect, it } from "vitest";

import {
  clipLabel,
  clipRect,
  keepPlayheadVisible,
  MIN_CLIP_WIDTH,
  pointerToTime,
  scrollAfterTimeChange,
  trackLayout,
} from "@/lib/timeline-ui/layout";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import type { TextAdjustments } from "@/types/text-adjustments";

describe("trackLayout", () => {
  it("stacks rows top to bottom in track order with gaps", () => {
    const layout = trackLayout(makeProject(makeStandardTracks(), []));
    // overlay (44) / video (64) / audio (44), 2 px gaps
    expect(layout.rows.map((r) => [r.trackId, r.y, r.height])).toEqual([
      ["t2", 0, 44],
      ["t1", 46, 64],
      ["t3", 112, 44],
    ]);
    expect(layout.height).toBe(156);
  });

  it("is empty with no tracks", () => {
    expect(trackLayout(makeProject([], []))).toEqual({ rows: [], height: 0 });
  });
});

describe("clipRect", () => {
  const project = makeProject(makeStandardTracks(), []);
  const row = trackLayout(project).rows[1]; // video row at y 46, height 64

  it("positions a clip by its time and length", () => {
    const clip = makeClip({ start: 2, sourceIn: 0, sourceOut: 4 });
    expect(clipRect(clip, row, 50)).toEqual({ x: 100, y: 48, width: 200, height: 60 });
  });

  it("uses the clip's real length when sped up", () => {
    const clip = makeClip({ start: 0, sourceIn: 0, sourceOut: 4, speed: 2 });
    expect(clipRect(clip, row, 50).width).toBe(100);
  });

  it("never becomes narrower than the minimum width", () => {
    const clip = makeClip({ start: 0, sourceIn: 0, sourceOut: 0.1 });
    expect(clipRect(clip, row, 5).width).toBe(MIN_CLIP_WIDTH);
  });
});

describe("clipLabel", () => {
  it("shows text content for text clips, falling back to the name", () => {
    const text = { content: "Hello" } as unknown as TextAdjustments;
    const withText = makeClip({
      kind: "text",
      name: "Title",
      adjustments: { photo: null, video: null, text },
    });
    expect(clipLabel(withText)).toBe("Hello");
    expect(clipLabel(makeClip({ kind: "text", name: "Fallback" }))).toBe("Fallback");
  });

  it("shows the name for everything else", () => {
    expect(clipLabel(makeClip({ kind: "video", name: "beach.mp4" }))).toBe("beach.mp4");
  });
});

describe("pointerToTime", () => {
  it("converts a screen x relative to the lane's left edge", () => {
    expect(pointerToTime(350, 100, 50)).toBe(5);
  });

  it("never goes before the start", () => {
    expect(pointerToTime(40, 100, 50)).toBe(0);
  });
});

describe("keepPlayheadVisible", () => {
  it("leaves the scroll alone while the playhead is in view", () => {
    expect(keepPlayheadVisible({ scrollLeft: 100, viewportWidth: 500, playheadX: 300 })).toBe(100);
  });

  it("pages forward when the playhead passes the right edge", () => {
    expect(keepPlayheadVisible({ scrollLeft: 0, viewportWidth: 500, playheadX: 480 })).toBe(430);
  });

  it("scrolls back when the playhead is left of the view", () => {
    expect(keepPlayheadVisible({ scrollLeft: 400, viewportWidth: 500, playheadX: 100 })).toBe(50);
  });

  it("never scrolls below zero", () => {
    expect(keepPlayheadVisible({ scrollLeft: 400, viewportWidth: 500, playheadX: 10 })).toBe(0);
  });
});

describe("scrollAfterTimeChange", () => {
  const off = { scrollLeft: 0, viewportWidth: 500, playheadX: 900 };

  it("follows the playhead like keepPlayheadVisible when not scrubbing", () => {
    expect(scrollAfterTimeChange({ ...off, scrubbing: false })).toBe(keepPlayheadVisible(off));
  });

  it("leaves the view alone while the user is scrubbing", () => {
    expect(scrollAfterTimeChange({ ...off, scrubbing: true })).toBe(0);
  });
});
