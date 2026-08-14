import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

const CORE_BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
// @ffmpeg/ffmpeg's own worker.js (referenced internally via
// `new URL("./worker.js", import.meta.url)`) does a runtime-dynamic
// `import(_coreURL)` that Turbopack can't statically bundle — it fails at
// runtime with "Cannot find module as expression is too dynamic". Fetching
// the worker script ourselves and handing it a blob: URL (same trick as
// coreURL/wasmURL below) keeps Turbopack from ever having to bundle it.
const FFMPEG_PKG_BASE_URL = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

// Fetches an ES module's source and rewrites its relative import specifiers
// to point at already-blobbed dependencies, then returns a blob: URL for it.
async function blobifyModule(
  url: string,
  importMap: Record<string, string> = {},
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (cause) {
    throw new Error(`Failed to fetch ${url}: ${String(cause)}`, { cause });
  }
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  let text = await res.text();
  for (const [specifier, blobUrl] of Object.entries(importMap)) {
    text = text
      .replaceAll(`"${specifier}"`, `"${blobUrl}"`)
      .replaceAll(`'${specifier}'`, `'${blobUrl}'`);
  }
  return URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
}

async function getClassWorkerURL(): Promise<string> {
  const constURL = await blobifyModule(`${FFMPEG_PKG_BASE_URL}/const.js`);
  const errorsURL = await blobifyModule(`${FFMPEG_PKG_BASE_URL}/errors.js`);
  return blobifyModule(`${FFMPEG_PKG_BASE_URL}/worker.js`, {
    "./const.js": constURL,
    "./errors.js": errorsURL,
  });
}

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

    const [coreURL, wasmURL, classWorkerURL] = await Promise.all([
      toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
      toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
      getClassWorkerURL(),
    ]);

    await ffmpeg.load({ coreURL, wasmURL, classWorkerURL });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}
