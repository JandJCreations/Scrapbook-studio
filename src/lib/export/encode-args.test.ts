import { describe, expect, it } from "vitest";

import { buildEncodeArgs } from "@/lib/export/encode-args";

const args = (format: "gif" | "mp4" | "mov" | "webm", opts: { transparent?: boolean; audio?: boolean } = {}) =>
  buildEncodeArgs({
    format,
    fps: 30,
    targetWidth: 1280,
    transparent: opts.transparent ?? false,
    hasAudio: opts.audio ?? false,
    outputName: `output.${format}`,
  });

describe("buildEncodeArgs", () => {
  it("reads the numbered frames at the frame rate and ends with the output name", () => {
    const a = args("mp4");
    expect(a.slice(0, 4)).toEqual(["-framerate", "30", "-i", "frame%05d.png"]);
    expect(a[a.length - 1]).toBe("output.mp4");
  });

  it("makes a looping gif with its own palette and never adds sound", () => {
    const a = args("gif", { audio: true });
    expect(a.join(" ")).toContain("palettegen");
    expect(a.join(" ")).toContain("scale=1280:-1");
    expect(a).toContain("-loop");
    expect(a).not.toContain("audio.wav");
  });

  it("encodes mp4 and mov as h264, with aac sound only when there is sound", () => {
    for (const format of ["mp4", "mov"] as const) {
      const withSound = args(format, { audio: true });
      expect(withSound).toContain("libx264");
      expect(withSound).toContain("yuv420p");
      expect(withSound).toContain("audio.wav");
      expect(withSound).toContain("aac");
      const silent = args(format);
      expect(silent).not.toContain("audio.wav");
      expect(silent).not.toContain("aac");
    }
  });

  it("encodes webm as vp9, with a transparent pixel format when asked, and opus sound", () => {
    expect(args("webm", { transparent: true })).toContain("yuva420p");
    expect(args("webm")).toContain("yuv420p");
    expect(args("webm", { audio: true })).toContain("libopus");
    expect(args("webm")).toContain("libvpx-vp9");
  });
});
