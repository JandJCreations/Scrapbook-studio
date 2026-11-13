import { describe, expect, it } from "vitest";

import { makeToneWav } from "@/lib/timeline-ui/tone-wav";

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.slice(from, to));

describe("makeToneWav", () => {
  const bytes = makeToneWav({ seconds: 2, hz: 440, sampleRate: 8000 });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  it("writes a valid 16-bit mono PCM header", () => {
    expect(ascii(bytes, 0, 4)).toBe("RIFF");
    expect(ascii(bytes, 8, 12)).toBe("WAVE");
    expect(ascii(bytes, 12, 16)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(bytes, 36, 40)).toBe("data");
  });

  it("has exactly the requested length", () => {
    const samples = 2 * 8000;
    expect(view.getUint32(40, true)).toBe(samples * 2);
    expect(bytes.length).toBe(44 + samples * 2);
    expect(view.getUint32(4, true)).toBe(bytes.length - 8);
  });

  it("is quiet at the ends and loud in the middle", () => {
    const peakAround = (centreSecond: number) => {
      let max = 0;
      const start = Math.floor(centreSecond * 8000) - 200;
      for (let i = start; i < start + 400; i++) {
        max = Math.max(max, Math.abs(view.getInt16(44 + i * 2, true)));
      }
      return max;
    };
    expect(peakAround(0.05)).toBeLessThan(peakAround(1) * 0.4);
    expect(peakAround(1.95)).toBeLessThan(peakAround(1) * 0.4);
    expect(peakAround(1)).toBeGreaterThan(20000);
  });
});
