import { describe, expect, it } from "vitest";

import { clamp, clipDuration, clipEnd, projectDuration, timelineExtent } from "@/lib/timeline/clip-math";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";

describe("clipDuration", () => {
  it("is the source span divided by speed", () => {
    expect(clipDuration(makeClip({ sourceIn: 2, sourceOut: 12, speed: 2 }))).toBe(5);
  });

  it("is longer at slow speeds", () => {
    expect(clipDuration(makeClip({ sourceIn: 0, sourceOut: 4, speed: 0.5 }))).toBe(8);
  });
});

describe("clipEnd", () => {
  it("is start plus duration", () => {
    expect(clipEnd(makeClip({ start: 3, sourceIn: 0, sourceOut: 4 }))).toBe(7);
  });
});

describe("projectDuration", () => {
  it("is 0 for an empty project", () => {
    expect(projectDuration(makeProject(makeStandardTracks(), []))).toBe(0);
  });

  it("is the latest clip end across all tracks", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", trackId: "t1", start: 0, sourceOut: 5 }),
      makeClip({ id: "b", trackId: "t2", start: 8, sourceOut: 4 }),
      makeClip({ id: "c", trackId: "t3", start: 1, sourceOut: 2 }),
    ]);
    expect(projectDuration(project)).toBe(12);
  });
});

describe("the length of the video", () => {
  const song = (length: number) => makeClip({ id: "song", trackId: "t3", kind: "audio", start: 0, sourceOut: length, sourceDuration: 500 });
  const picture = (end: number) => makeClip({ id: "pic", trackId: "t1", kind: "image", sourceDuration: null, start: 0, sourceOut: end });

  it("ends with the last picture or video, even when the music plays on longer", () => {
    const project = makeProject(makeStandardTracks(), [picture(5), song(60)]);
    expect(projectDuration(project)).toBe(5);
    expect(timelineExtent(project)).toBe(60);
  });

  it("is the music's length when there is nothing else, and 0 for an empty project", () => {
    expect(projectDuration(makeProject(makeStandardTracks(), [song(30)]))).toBe(30);
    expect(timelineExtent(makeProject(makeStandardTracks(), []))).toBe(0);
  });
});

describe("clamp", () => {
  it("limits a value to the range", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it("lets the minimum win when the range is inverted", () => {
    expect(clamp(5, 10, 1)).toBe(10);
  });
});

describe("the video does not run on for text", () => {
  it("ends with the last picture or video even if a caption or title runs past it", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "pic", trackId: "t1", kind: "image", sourceDuration: null, start: 0, sourceOut: 5 }),
      makeClip({ id: "txt", trackId: "t2", kind: "text", sourceDuration: null, start: 4, sourceOut: 5 }),
    ]);
    expect(projectDuration(project)).toBe(5);
    expect(timelineExtent(project)).toBe(9);
  });
});
