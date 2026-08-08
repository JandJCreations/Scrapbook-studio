import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

const CORE_BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

export function getFfmpeg(
  onProgress?: (ratio: number) => void,
): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return Promise.resolve(ffmpegInstance);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();

    if (onProgress) {
      ffmpeg.on("progress", ({ progress }) => {
        onProgress(Math.max(0, Math.min(1, progress)));
      });
    }

    const coreURL = await toBlobURL(
      `${CORE_BASE_URL}/ffmpeg-core.js`,
      "text/javascript",
    );
    const wasmURL = await toBlobURL(
      `${CORE_BASE_URL}/ffmpeg-core.wasm`,
      "application/wasm",
    );

    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}
