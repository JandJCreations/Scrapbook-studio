import { afterEach, describe, expect, it, vi } from "vitest";

const toBlobURL = vi.fn();
vi.mock("@ffmpeg/util", () => ({ toBlobURL: (...args: unknown[]) => toBlobURL(...args) }));
vi.mock("@ffmpeg/ffmpeg", () => ({
  FFmpeg: class {
    loaded = false;
    on() {}
    async load() {
      this.loaded = true;
    }
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  toBlobURL.mockReset();
});

describe("getFfmpeg", () => {
  it("tries the download again after a failed one, instead of failing until the page reloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("export {}")));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x" }));
    toBlobURL.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue("blob:core");
    const { getFfmpeg } = await import("@/lib/export/ffmpeg-client");

    await expect(getFfmpeg()).rejects.toThrow(/check your internet connection/i);
    await expect(getFfmpeg()).resolves.toBeTruthy();
  });
});
