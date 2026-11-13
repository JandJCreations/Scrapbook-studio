import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { describe, expect, it } from "vitest";

import {
  buildSampleArgs,
  generateSampleClip,
  SAMPLE_CLIPS,
  type FfmpegLike,
} from "@/lib/playback/sample-clips";

// Compile-time check: the real FFmpeg class satisfies FfmpegLike.
const realFfmpegFits = (ffmpeg: FFmpeg): FfmpegLike => ffmpeg;
void realFfmpegFits;

function fakeFfmpeg(options: { exitCode?: number; output?: Uint8Array | string } = {}) {
  const calls = { exec: [] as string[][], read: [] as string[], deleted: [] as string[] };
  const ffmpeg: FfmpegLike = {
    exec: async (args) => {
      calls.exec.push(args);
      return options.exitCode ?? 0;
    },
    readFile: async (path) => {
      calls.read.push(path);
      return options.output ?? new Uint8Array([1, 2, 3, 4]);
    },
    deleteFile: async (path) => {
      calls.deleted.push(path);
      return true;
    },
  };
  return { ffmpeg, calls };
}

describe("SAMPLE_CLIPS", () => {
  it("defines two distinct clips", () => {
    expect(SAMPLE_CLIPS).toHaveLength(2);
    expect(new Set(SAMPLE_CLIPS.map((c) => c.toneHz)).size).toBe(2);
    expect(SAMPLE_CLIPS.some((c) => c.negate)).toBe(true);
  });
});

describe("buildSampleArgs", () => {
  const spec = SAMPLE_CLIPS[0];

  it("describes a timecode test pattern and a tone of the right length", () => {
    const args = buildSampleArgs(spec, "out.mp4");
    expect(args).toContain(`testsrc=duration=${spec.duration}:size=640x360:rate=${spec.fps}`);
    expect(args).toContain(`sine=frequency=${spec.toneHz}:duration=${spec.duration}`);
    expect(args[args.length - 1]).toBe("out.mp4");
  });

  it("inverts the colours only when asked", () => {
    expect(buildSampleArgs(SAMPLE_CLIPS[0], "a.mp4")).not.toContain("negate");
    expect(buildSampleArgs(SAMPLE_CLIPS[1], "b.mp4")).toContain("negate");
  });

  it("encodes for broad browser support", () => {
    const args = buildSampleArgs(spec, "out.mp4");
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args).toContain("aac");
  });
});

describe("generateSampleClip", () => {
  it("returns an mp4 blob with the encoded bytes and cleans up", async () => {
    const { ffmpeg, calls } = fakeFfmpeg();
    const blob = await generateSampleClip(ffmpeg, SAMPLE_CLIPS[0]);
    expect(blob.type).toBe("video/mp4");
    expect(blob.size).toBe(4);
    expect(calls.read).toEqual(calls.deleted);
    expect(calls.exec[0][calls.exec[0].length - 1]).toBe(calls.read[0]);
  });

  it("uses a different output file for each clip", async () => {
    const first = fakeFfmpeg();
    const second = fakeFfmpeg();
    await generateSampleClip(first.ffmpeg, SAMPLE_CLIPS[0]);
    await generateSampleClip(second.ffmpeg, SAMPLE_CLIPS[1]);
    expect(first.calls.read[0]).not.toBe(second.calls.read[0]);
  });

  it("explains a failure and still removes the output", async () => {
    const { ffmpeg, calls } = fakeFfmpeg({ exitCode: 1 });
    await expect(generateSampleClip(ffmpeg, SAMPLE_CLIPS[0])).rejects.toThrow(/exit code 1/);
    expect(calls.deleted).toHaveLength(1);
  });

  it("rejects text output instead of bytes", async () => {
    const { ffmpeg } = fakeFfmpeg({ output: "not bytes" });
    await expect(generateSampleClip(ffmpeg, SAMPLE_CLIPS[0])).rejects.toThrow(/no video data/);
  });
});
