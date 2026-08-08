import type Konva from "konva";

interface CaptureOptions {
  frameWidth: number;
  frameHeight: number;
  targetWidth: number;
  mimeType?: string;
  quality?: number;
}

/**
 * Captures the current stage content within the export frame at the
 * requested pixel resolution, without touching React-level viewport state.
 * Temporarily resizes/repositions the Konva stage, draws, then restores it —
 * all synchronously so react-konva never observes the intermediate state.
 */
export function captureStageFrame(
  stage: Konva.Stage,
  options: CaptureOptions,
): string {
  const { frameWidth, frameHeight, targetWidth, mimeType, quality } = options;

  const original = {
    width: stage.width(),
    height: stage.height(),
    x: stage.x(),
    y: stage.y(),
    scaleX: stage.scaleX(),
    scaleY: stage.scaleY(),
  };

  stage.width(frameWidth);
  stage.height(frameHeight);
  stage.x(0);
  stage.y(0);
  stage.scaleX(1);
  stage.scaleY(1);
  stage.batchDraw();

  const pixelRatio = targetWidth / frameWidth;

  const dataUrl = stage.toDataURL({
    x: 0,
    y: 0,
    width: frameWidth,
    height: frameHeight,
    pixelRatio,
    mimeType,
    quality,
  });

  stage.width(original.width);
  stage.height(original.height);
  stage.x(original.x);
  stage.y(original.y);
  stage.scaleX(original.scaleX);
  stage.scaleY(original.scaleY);
  stage.batchDraw();

  return dataUrl;
}

export function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
