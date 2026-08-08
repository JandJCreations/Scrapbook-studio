import type Konva from "konva";

export type KonvaFilterFn = (this: Konva.Node, imageData: ImageData) => void;

function clamp255(value: number) {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

/** Custom Konva filter: multiplicative exposure adjustment. Reads `exposure` (-100..100) off the node. */
export const ExposureFilter: KonvaFilterFn = function (
  this: Konva.Node,
  imageData: ImageData,
) {
  const exposure = (this.getAttr("exposure") as number) ?? 0;
  if (exposure === 0) return;

  const factor = 1 + exposure / 100;
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp255(data[i] * factor);
    data[i + 1] = clamp255(data[i + 1] * factor);
    data[i + 2] = clamp255(data[i + 2] * factor);
  }
};

/** Custom Konva filter: brightens/darkens highlight-weighted pixels. Reads `highlights` (-100..100). */
export const HighlightsFilter: KonvaFilterFn = function (
  this: Konva.Node,
  imageData: ImageData,
) {
  const highlights = (this.getAttr("highlights") as number) ?? 0;
  if (highlights === 0) return;

  const strength = highlights * 0.6;
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255;
    const weight = luminance * luminance;
    const delta = strength * weight;
    data[i] = clamp255(data[i] + delta);
    data[i + 1] = clamp255(data[i + 1] + delta);
    data[i + 2] = clamp255(data[i + 2] + delta);
  }
};

/** Custom Konva filter: brightens/darkens shadow-weighted pixels. Reads `shadowsTone` (-100..100). */
export const ShadowsFilter: KonvaFilterFn = function (
  this: Konva.Node,
  imageData: ImageData,
) {
  const shadows = (this.getAttr("shadowsTone") as number) ?? 0;
  if (shadows === 0) return;

  const strength = shadows * 0.6;
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255;
    const weight = (1 - luminance) * (1 - luminance);
    const delta = strength * weight;
    data[i] = clamp255(data[i] + delta);
    data[i + 1] = clamp255(data[i + 1] + delta);
    data[i + 2] = clamp255(data[i + 2] + delta);
  }
};

/** Custom Konva filter: unsharp-mask style sharpen. Reads `sharpness` (0..100). */
export const SharpnessFilter: KonvaFilterFn = function (
  this: Konva.Node,
  imageData: ImageData,
) {
  const sharpness = (this.getAttr("sharpness") as number) ?? 0;
  if (sharpness <= 0) return;

  const amount = sharpness / 100;
  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let k = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            sum += src[idx] * kernel[k];
            k++;
          }
        }
        const idx = (y * width + x) * 4 + c;
        data[idx] = clamp255(src[idx] * (1 - amount) + sum * amount);
      }
    }
  }
};
