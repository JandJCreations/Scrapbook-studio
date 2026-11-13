import { jsPDF } from "jspdf";

import { captureStageFrame } from "@/lib/export/capture-frame";
import type Konva from "konva";

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportPng(
  stage: Konva.Stage,
  frameWidth: number,
  frameHeight: number,
  targetWidth: number,
  filename: string,
) {
  const dataUrl = captureStageFrame(stage, {
    frameWidth,
    frameHeight,
    targetWidth,
    mimeType: "image/png",
  });
  downloadDataUrl(dataUrl, filename);
}

export function exportJpg(
  stage: Konva.Stage,
  frameWidth: number,
  frameHeight: number,
  targetWidth: number,
  filename: string,
) {
  const dataUrl = captureStageFrame(stage, {
    frameWidth,
    frameHeight,
    targetWidth,
    mimeType: "image/jpeg",
    quality: 0.92,
  });
  downloadDataUrl(dataUrl, filename);
}

export function exportPdf(
  stage: Konva.Stage,
  frameWidth: number,
  frameHeight: number,
  targetWidth: number,
  targetHeight: number,
  filename: string,
) {
  const dataUrl = captureStageFrame(stage, {
    frameWidth,
    frameHeight,
    targetWidth,
    mimeType: "image/jpeg",
    quality: 0.95,
  });

  const orientation = targetWidth >= targetHeight ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "px",
    format: [targetWidth, targetHeight],
  });
  pdf.addImage(dataUrl, "JPEG", 0, 0, targetWidth, targetHeight);
  pdf.save(filename);
}

/**
 * A multi-page PDF: `capturePage(i)` switches the editor to page i and
 * resolves once it has been drawn; each page becomes one PDF page.
 */
export async function exportPdfPages(
  stage: Konva.Stage,
  pageCount: number,
  capturePage: (page: number) => Promise<void>,
  frameWidth: number,
  frameHeight: number,
  targetWidth: number,
  targetHeight: number,
  filename: string,
  onProgress?: (ratio: number) => void,
) {
  const orientation = targetWidth >= targetHeight ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "px", format: [targetWidth, targetHeight] });
  for (let page = 0; page < pageCount; page++) {
    await capturePage(page);
    const dataUrl = captureStageFrame(stage, {
      frameWidth,
      frameHeight,
      targetWidth,
      mimeType: "image/jpeg",
      quality: 0.95,
    });
    if (page > 0) pdf.addPage([targetWidth, targetHeight], orientation);
    pdf.addImage(dataUrl, "JPEG", 0, 0, targetWidth, targetHeight);
    onProgress?.((page + 1) / pageCount);
  }
  pdf.save(filename);
}
