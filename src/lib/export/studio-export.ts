import { fetchFile } from "@ffmpeg/util";
import { jsPDF } from "jspdf";

import { planMixdown } from "@/lib/engine/mixdown";
import { buildEncodeArgs, type EncodeFormat } from "@/lib/export/encode-args";
import { exportableProject, exportFrameTimes, stillTime } from "@/lib/export/export-plan";
import { ANIMATED_FORMATS, TRANSPARENCY_SUPPORTED_FORMATS, type ExportFormat } from "@/lib/export/export-formats";
import { getFfmpeg } from "@/lib/export/ffmpeg-client";
import { renderMixdown } from "@/lib/export/studio-audio-render";
import { createFrameRenderer } from "@/lib/export/studio-frame-renderer";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { projectDuration } from "@/lib/timeline/clip-math";
import type { TimelineProject } from "@/types/timeline";

export type ExportStage = "preparing" | "mixing" | "rendering" | "encoding";

export interface StudioExportOptions {
  project: TimelineProject;
  frame: FrameSize;
  urlFor(mediaId: string): string | null;
  format: ExportFormat;
  /** Width of the exported picture in pixels. */
  targetWidth: number;
  fps: number;
  transparent: boolean;
  /** Where a still picture is taken from, in timeline seconds. */
  playhead: number;
  onProgress(stage: ExportStage, ratio: number): void;
  signal?: AbortSignal;
}

export interface StudioExportResult {
  blob: Blob;
  extension: string;
}

const MIME: Record<ExportFormat, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** Renders the project to a file in the chosen format, using the same painter as the stage. */
export async function exportStudioProject(options: StudioExportOptions): Promise<StudioExportResult> {
  const { format, frame, urlFor, fps, playhead, onProgress, signal } = options;
  const project = exportableProject(options.project);
  const duration = projectDuration(project);
  // H.264 and VP9 want even sides; the width is kept even, the height is trimmed by the encoder.
  const targetWidth = Math.max(2, Math.round(options.targetWidth / 2) * 2);
  const targetHeight = Math.max(2, Math.round((targetWidth * frame.height) / frame.width));
  const transparent = options.transparent && TRANSPARENCY_SUPPORTED_FORMATS.includes(format);

  onProgress("preparing", 0);
  const renderer = createFrameRenderer({
    project,
    frame,
    urlFor,
    background: transparent ? null : "#000000",
  });

  try {
    await renderer.prepare();
    throwIfAborted(signal);

    if (!ANIMATED_FORMATS.includes(format)) {
      await renderer.renderAt(stillTime(playhead, duration));
      const dataUrl = renderer.capture({
        width: targetWidth,
        mimeType: format === "png" ? "image/png" : "image/jpeg",
        quality: format === "pdf" ? 0.95 : 0.92,
      });
      if (format === "pdf") {
        const pdf = new jsPDF({
          orientation: targetWidth >= targetHeight ? "landscape" : "portrait",
          unit: "px",
          format: [targetWidth, targetHeight],
        });
        pdf.addImage(dataUrl, "JPEG", 0, 0, targetWidth, targetHeight);
        return { blob: pdf.output("blob"), extension: "pdf" };
      }
      return { blob: await dataUrlToBlob(dataUrl), extension: format };
    }

    // Animated: render every frame, mix the sound, then let FFmpeg put them together.
    const encodeFormat = format as EncodeFormat;
    onProgress("mixing", 0);
    const audio = encodeFormat === "gif" ? null : await renderMixdown(planMixdown(project), urlFor, signal);
    throwIfAborted(signal);

    const ffmpeg = await getFfmpeg((ratio) => onProgress("encoding", ratio));
    const times = exportFrameTimes(duration, fps);
    const frameName = (i: number) => `frame${String(i).padStart(5, "0")}.png`;
    const outputName = `output.${encodeFormat}`;
    let written = 0;
    try {
      for (let i = 0; i < times.length; i++) {
        throwIfAborted(signal);
        await renderer.renderAt(times[i]);
        const dataUrl = renderer.capture({ width: targetWidth, mimeType: "image/png" });
        await ffmpeg.writeFile(frameName(i), await fetchFile(dataUrl));
        written = i + 1;
        onProgress("rendering", written / times.length);
      }
      if (audio) await ffmpeg.writeFile("audio.wav", await fetchFile(audio));
      throwIfAborted(signal);

      await ffmpeg.exec(
        buildEncodeArgs({ format: encodeFormat, fps, targetWidth, transparent, hasAudio: audio !== null, outputName }),
      );
      const data = await ffmpeg.readFile(outputName);
      return {
        blob: new Blob([new Uint8Array(data as Uint8Array)], { type: MIME[format] }),
        extension: encodeFormat,
      };
    } finally {
      // FFmpeg's disk lives in memory: always give it back, even after a failure or a cancel.
      for (let i = 0; i < written; i++) await ffmpeg.deleteFile(frameName(i)).catch(() => {});
      await ffmpeg.deleteFile(outputName).catch(() => {});
      await ffmpeg.deleteFile("audio.wav").catch(() => {});
    }
  } finally {
    renderer.dispose();
  }
}
