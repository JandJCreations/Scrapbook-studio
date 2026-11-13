import { fetchFile } from "@ffmpeg/util";
import type Konva from "konva";

import { captureStageFrame, waitForNextFrame } from "@/lib/export/capture-frame";
import { getFfmpeg } from "@/lib/export/ffmpeg-client";
import { hasPendingSeeks, waitForPendingSeeks } from "@/lib/canvas/video-seek-registry";

export type AnimatedFormat = "gif" | "mp4" | "mov" | "webm";

interface VideoExportOptions {
  format: AnimatedFormat;
  frame: { width: number; height: number };
  targetWidth: number;
  fps: number;
  durationSeconds: number;
  transparent: boolean;
  audioBlob: Blob | null;
  /** Videos on the page need an extra frame for their seek to start. */
  hasVideo?: boolean;
  onProgress: (stage: "rendering" | "encoding", ratio: number) => void;
}

const MIME_BY_FORMAT: Record<AnimatedFormat, string> = {
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export async function exportAnimated(
  stage: Konva.Stage,
  setPlayheadTime: (time: number) => void,
  options: VideoExportOptions,
): Promise<Blob> {
  const {
    format,
    frame,
    targetWidth,
    fps,
    durationSeconds,
    transparent,
    audioBlob,
    onProgress,
    hasVideo = true,
  } = options;

  const totalFrames = Math.max(1, Math.round(durationSeconds * fps));
  const ffmpeg = await getFfmpeg((ratio) => onProgress("encoding", ratio));

  // JPEG frames are several times quicker to capture and hand to ffmpeg
  // than PNG; PNG only when the output keeps transparency.
  const keepAlpha = transparent && format !== "mp4" && format !== "mov";
  const frameExt = keepAlpha ? "png" : "jpg";
  const frameName = (i: number) => `frame${String(i).padStart(5, "0")}.${frameExt}`;
  const pendingWrites: Promise<unknown>[] = [];

  for (let i = 0; i < totalFrames; i++) {
    setPlayheadTime(i / fps);
    // One frame for React to apply the new moment to the canvas nodes (and,
    // with video on the page, one more for the seeks it triggers to start).
    await waitForNextFrame();
    if (hasVideo) await waitForNextFrame();
    // Videos seek asynchronously — wait until each is on the right frame,
    // then give the canvas one more frame to pick it up.
    if (hasPendingSeeks()) {
      await waitForPendingSeeks();
      await waitForNextFrame();
    }

    const dataUrl = captureStageFrame(stage, {
      frameWidth: frame.width,
      frameHeight: frame.height,
      targetWidth,
      mimeType: keepAlpha ? "image/png" : "image/jpeg",
      quality: 0.92,
    });

    // Hand the frame to ffmpeg's worker without waiting, so the next frame
    // renders while this one is copied; drain every so often to cap memory.
    pendingWrites.push(ffmpeg.writeFile(frameName(i), dataUrlToBytes(dataUrl)));
    if (pendingWrites.length >= 24) await Promise.all(pendingWrites.splice(0));
    onProgress("rendering", (i + 1) / totalFrames);
  }
  await Promise.all(pendingWrites);

  if (audioBlob) {
    await ffmpeg.writeFile("audio.wav", await fetchFile(audioBlob));
  }

  const outputName = `output.${format}`;
  const args = buildFfmpegArgs(
    format,
    fps,
    targetWidth,
    keepAlpha,
    Boolean(audioBlob),
    outputName,
    frameExt,
  );

  await ffmpeg.exec(args);
  const data = await ffmpeg.readFile(outputName);

  for (let i = 0; i < totalFrames; i++) {
    await ffmpeg.deleteFile(frameName(i)).catch(() => {});
  }
  await ffmpeg.deleteFile(outputName).catch(() => {});
  if (audioBlob) await ffmpeg.deleteFile("audio.wav").catch(() => {});

  const bytes = new Uint8Array(data as Uint8Array);
  return new Blob([bytes], { type: MIME_BY_FORMAT[format] });
}

function buildFfmpegArgs(
  format: AnimatedFormat,
  fps: number,
  targetWidth: number,
  transparent: boolean,
  hasAudio: boolean,
  outputName: string,
  frameExt: "png" | "jpg",
): string[] {
  const inputArgs = ["-framerate", String(fps), "-i", `frame%05d.${frameExt}`];
  const audioInput = hasAudio ? ["-i", "audio.wav"] : [];

  if (format === "gif") {
    return [
      ...inputArgs,
      "-vf",
      `fps=${fps},scale=${targetWidth}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      "-loop",
      "0",
      outputName,
    ];
  }

  if (format === "webm") {
    return [
      ...inputArgs,
      ...audioInput,
      "-c:v",
      "libvpx-vp9",
      // Realtime settings: far faster in the browser, still good quality.
      "-deadline",
      "realtime",
      "-cpu-used",
      "8",
      "-b:v",
      "0",
      "-crf",
      "32",
      "-pix_fmt",
      transparent ? "yuva420p" : "yuv420p",
      ...(hasAudio ? ["-c:a", "libopus", "-shortest"] : []),
      outputName,
    ];
  }

  // mp4 / mov — no alpha support, always yuv420p
  return [
    ...inputArgs,
    ...audioInput,
    "-c:v",
    "libx264",
    // ffmpeg in the browser is single-threaded; the default "medium" preset
    // spends most of the export here for little visible gain.
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    ...(hasAudio ? ["-c:a", "aac", "-shortest"] : []),
    outputName,
  ];
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
