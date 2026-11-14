import { describe, expect, it } from "vitest";

import { planMixdown } from "@/lib/engine/mixdown";
import { planWanted } from "@/lib/engine/wanted";
import {
  DUCK_RAMP_SECONDS,
  DUCKED_GAIN,
  duckFactorAt,
  duckingRanges,
} from "@/lib/timeline/ducking";
import { makeClip, makeProject, makeTrack } from "@/lib/timeline/test-utils";
import type { Track } from "@/types/timeline";

const music = makeTrack({ id: "music", type: "audio", order: 1 });
const voice = (overrides: Partial<Track> = {}) =>
  makeTrack({ id: "voice", type: "audio", order: 2, role: "voiceover", ...overrides });

const song = makeClip({ id: "song", trackId: "music", kind: "audio", mediaId: "song", sourceDuration: 60, sourceOut: 30 });
const words = (id: string, start: number, length: number) =>
  makeClip({ id, trackId: "voice", kind: "audio", mediaId: id, sourceDuration: length, start, sourceOut: length });

describe("duckingRanges", () => {
  it("merges voice clips that sit close together and ignores ordinary audio", () => {
    const project = makeProject([music, voice()], [song, words("a", 2, 3), words("b", 5.3, 2), words("c", 12, 1)]);
    expect(duckingRanges(project)).toEqual([
      { start: 2, end: 7.3 },
      { start: 12, end: 13 },
    ]);
  });

  it("is empty when the voiceover track doesn't duck, or is muted", () => {
    expect(duckingRanges(makeProject([music, voice({ duckOthers: false })], [song, words("a", 2, 3)]))).toEqual([]);
    expect(duckingRanges(makeProject([music, voice({ muted: true })], [song, words("a", 2, 3)]))).toEqual([]);
  });
});

describe("duckFactorAt", () => {
  const ranges = [{ start: 4, end: 6 }];
  it("is 1 away from the voice and DUCKED_GAIN while it speaks", () => {
    expect(duckFactorAt(ranges, 1)).toBe(1);
    expect(duckFactorAt(ranges, 5)).toBeCloseTo(DUCKED_GAIN);
    expect(duckFactorAt(ranges, 9)).toBe(1);
  });

  it("ramps down before the voice and back up after it", () => {
    const half = 1 - 0.5 * (1 - DUCKED_GAIN);
    expect(duckFactorAt(ranges, 4 - DUCK_RAMP_SECONDS / 2)).toBeCloseTo(half);
    expect(duckFactorAt(ranges, 6 + DUCK_RAMP_SECONDS / 2)).toBeCloseTo(half);
  });
});

describe("ducking in playback and export", () => {
  const project = makeProject([music, voice()], [song, words("a", 4, 2)]);

  it("dips the music but not the voice while it speaks", () => {
    const wanted = planWanted(project, 5, true);
    expect(wanted.find((w) => w.clipId === "song")?.gain).toBeCloseTo(DUCKED_GAIN);
    expect(wanted.find((w) => w.clipId === "a")?.gain).toBe(1);
    expect(planWanted(project, 1, true).find((w) => w.clipId === "song")?.gain).toBe(1);
  });

  it("puts the same dip into the export mix", () => {
    const plan = planMixdown(project);
    const songPoints = plan.items.find((item) => item.clipId === "song")!.gainPoints;
    expect(songPoints.find((p) => p.time === 5)?.value).toBeCloseTo(DUCKED_GAIN);
    expect(songPoints[0].value).toBe(1);
    expect(songPoints[songPoints.length - 1].value).toBe(1);
    const voicePoints = plan.items.find((item) => item.clipId === "a")!.gainPoints;
    expect(voicePoints.every((p) => p.value === 1)).toBe(true);
  });
});
