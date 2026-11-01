import type { GainPoint, MixdownItem } from "@/lib/engine/mixdown";

export interface MixSchedule {
  /** Timeline second to start at. */
  when: number;
  /** Where in the file to start, in the file's own seconds. */
  offset: number;
  /** How much of the file to play, in the file's own seconds (the speed does not change it). */
  duration: number;
  rate: number;
  reversed: boolean;
}

export function scheduleMixItem(item: MixdownItem): MixSchedule {
  return {
    when: Math.max(0, item.startAt),
    offset: item.sourceIn,
    duration: item.sourceOut - item.sourceIn,
    rate: item.playbackRate,
    reversed: item.reversed,
  };
}

/** The part of an audio parameter the gain curve needs. */
export interface GainParam {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
}

/** Sets the first point, then ramps in a straight line to each later one. */
export function applyGainPoints(param: GainParam, points: GainPoint[]): void {
  points.forEach((point, index) => {
    if (index === 0) param.setValueAtTime(point.value, point.time);
    else param.linearRampToValueAtTime(point.value, point.time);
  });
}
