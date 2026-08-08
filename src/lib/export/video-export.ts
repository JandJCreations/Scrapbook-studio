import { fetchFile } from "@ffmpeg/util";
import type Konva from "konva";

import { captureStageFrame, waitForNextFrame } from "@/lib/export/capture-frame";
import { getFfmpeg } from "@/lib/export/ffmpeg-client";

export type AnimatedFormat = "gif" | "mp4" | "mov" | "webm";

interface VideoExportOptions {
  format: AnimatedFormat;
  frame: { width: number; height: number };
  targetWidth: number;
  fps: number;
  durationSeconds: number;
  transparent: boolean;
  audioBlob: Blob | null;
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
  const { format, frame, targetWidth, fps, durationSeconds, transparent, audioBlob, onProgress } =
    options;

  const totalFrames = Math.max(1, Math.round(durationSeconds * fps));
  const ffmpeg = await getFfmpeg((ratio) => onProgress("encoding", ratio));

  const frameName = (i: number) => `frame${String(i).padStart(5, "0")}.png`;

  for (let i = 0; i < totalFrames; i++) {
    setPlayheadTime(i / fps);
    await waitForNextFrame();
    await waitForNextFrame();

    const dataUrl = captureStageFrame(stage, {
      frameWidth: frame.width,
      frameHeight: frame.height,
      targetWidth,
      mimeType: "image/png",
    });

    await ffmpeg.writeFile(frameName(i), await fetchFile(dataUrl));
    onProgress("rendering", (i + 1) / totalFrames);
  }

  if (audioBlob) {
    await ffmpeg.writeFile("audio.wav", await fetchFile(audioBlob));
  }

  const outputName = `output.${format}`;
  const args = buildFfmpegArgs(format, fps, targetWidth, transparent, Boolean(audioBlob), outputName);

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
): string[] {
  const inputArgs = ["-framerate", String(fps), "-i", "frame%05d.png"];
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
    "-pix_fmt",
    "yuv420p",
    ...(hasAudio ? ["-c:a", "aac", "-shortest"] : []),
    outputName,
  ];
}
