import { describe, expect, it } from "vitest";

import { duplicatePayload } from "@/lib/projects/copy-project";

describe("duplicatePayload", () => {
  const source = {
    name: "Summer",
    folder_id: "f1",
    thumbnail_path: "u/projects/p/thumb.jpg",
    timeline: { schemaVersion: 1, clips: [] },
    frame_width: 1080,
    frame_height: 1920,
  };

  it("copies the content and frame under a new owner-stamped row named as a copy", () => {
    expect(duplicatePayload(source, "user-1")).toEqual({
      owner_id: "user-1",
      name: "Summer (Copy)",
      folder_id: "f1",
      thumbnail_path: null,
      timeline: { schemaVersion: 1, clips: [] },
      timeline_rev: 0,
      frame_width: 1080,
      frame_height: 1920,
    });
  });

  it("copies a project that has never been edited", () => {
    const blank = { ...source, timeline: null, thumbnail_path: null, folder_id: null };
    expect(duplicatePayload(blank, "u")).toMatchObject({ timeline: null, thumbnail_path: null, folder_id: null });
  });

  it("does not share the timeline object with the original", () => {
    const copy = duplicatePayload(source, "u");
    expect(copy.timeline).not.toBe(source.timeline);
  });
});
