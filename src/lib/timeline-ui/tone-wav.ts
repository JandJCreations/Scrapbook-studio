const HEADER_BYTES = 44;
const MIN_VOLUME = 0.1;

/**
 * A sample tone as 16-bit mono WAV bytes. Its volume rises from 10% to 100% in
 * the middle and falls back, so a waveform drawn from it has a visible shape.
 */
export function makeToneWav(options: {
  seconds: number;
  hz: number;
  sampleRate?: number;
}): Uint8Array {
  const sampleRate = options.sampleRate ?? 8000;
  const samples = Math.round(options.seconds * sampleRate);
  const bytes = new Uint8Array(HEADER_BYTES + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);

  for (let i = 0; i < samples; i++) {
    const progress = samples > 1 ? i / (samples - 1) : 0;
    const volume = MIN_VOLUME + (1 - MIN_VOLUME) * (1 - Math.abs(progress * 2 - 1));
    const value = Math.sin((2 * Math.PI * options.hz * i) / sampleRate) * volume * 0.9;
    view.setInt16(HEADER_BYTES + i * 2, Math.round(value * 32767), true);
  }
  return bytes;
}
