/** The tone controls CSS filters cannot express, applied to pixels. All amounts are the sliders' own values. */
export interface Tone {
  /** -100..100: brightens or darkens the bright parts. */
  highlights: number;
  /** -100..100: brightens or darkens the dark parts. */
  shadows: number;
  /** 0..100 */
  sharpness: number;
}

export const hasTone = (tone: Tone | null): tone is Tone =>
  tone !== null && (tone.highlights !== 0 || tone.shadows !== 0 || tone.sharpness > 0);

/** Adds a weighted amount to each colour channel; the weight comes from how bright the pixel is. */
function shift(data: Uint8ClampedArray, strength: number, weightOf: (luminance: number) => number) {
  if (strength === 0) return;
  for (let i = 0; i < data.length; i += 4) {
    const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255;
    const delta = strength * weightOf(luminance);
    data[i] += delta;
    data[i + 1] += delta;
    data[i + 2] += delta;
  }
}

export function applyHighlights(data: Uint8ClampedArray, amount: number): void {
  shift(data, amount * 0.6, (l) => l * l);
}

export function applyShadows(data: Uint8ClampedArray, amount: number): void {
  shift(data, amount * 0.6, (l) => (1 - l) * (1 - l));
}

/** A 3x3 sharpen blended in by `amount` (0..100); the one-pixel border is left as it was. */
export function applySharpness(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (amount <= 0) return;
  const mix = Math.min(1, amount / 100);
  const source = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let channel = 0; channel < 3; channel++) {
        const at = (px: number, py: number) => source[(py * width + px) * 4 + channel];
        const sharp =
          5 * at(x, y) - at(x, y - 1) - at(x, y + 1) - at(x - 1, y) - at(x + 1, y);
        data[(y * width + x) * 4 + channel] = at(x, y) * (1 - mix) + sharp * mix;
      }
    }
  }
}

/** Highlights, then shadows, then sharpening, in place. */
export function applyTone(image: { data: Uint8ClampedArray; width: number; height: number }, tone: Tone): void {
  applyHighlights(image.data, tone.highlights);
  applyShadows(image.data, tone.shadows);
  applySharpness(image.data, image.width, image.height, tone.sharpness);
}
