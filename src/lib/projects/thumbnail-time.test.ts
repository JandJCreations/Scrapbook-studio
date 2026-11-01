import { describe, expect, it } from "vitest";

import { thumbnailTime } from "@/lib/projects/thumbnail-time";
import { makeClip, makeProject, makeStandardTracks, makeTrack } from "@/lib/timeline/test-utils";

describe("thumbnailTime", () => {
  it("is the first moment something can be seen", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "later", trackId: "t1", start: 4 }),
      makeClip({ id: "early", trackId: "t2", kind: "image", sourceDuration: null, start: 1.5 }),
    ]);
    expect(thumbnailTime(project)).toBe(1.5);
  });

  it("ignores sound, empty slots and hidden tracks", () => {
    const tracks = [
      makeTrack({ id: "o", type: "overlay", order: 0, hidden: true }),
      makeTrack({ id: "v", type: "video", order: 1 }),
      makeTrack({ id: "a", type: "audio", order: 2 }),
    ];
    const project = makeProject(tracks, [
      makeClip({ id: "snd", trackId: "a", kind: "audio", start: 0 }),
      makeClip({ id: "hid", trackId: "o", kind: "image", sourceDuration: null, start: 0 }),
      makeClip({ id: "slot", trackId: "v", kind: "image", sourceDuration: null, start: 0, isPlaceholder: true }),
      makeClip({ id: "pic", trackId: "v", start: 7 }),
    ]);
    expect(thumbnailTime(project)).toBe(7);
  });

  it("is null when there is nothing to show", () => {
    expect(thumbnailTime(makeProject(makeStandardTracks(), []))).toBeNull();
  });
});
