export const ZOOM_MIN = 5;
export const ZOOM_MAX = 400;
export const ZOOM_DEFAULT = 60;
/** Empty space after the last clip, in seconds. */
export const END_PADDING_SECONDS = 5;

const MIN_MAJOR_SPACING_PX = 80;
const STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const MINOR_PER_MAJOR = 4;

export function timeToX(time: number, pps: number): number {
  return time * pps;
}

export function xToTime(x: number, pps: number): number {
  return x / pps;
}

export function clampZoom(pps: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pps));
}

/**
 * Zooms by `factor`, keeping the time under the pointer where it is.
 * `anchorX` is the pointer's distance from the left edge of the visible lane area.
 */
export function zoomAround(
  view: { pps: number; scrollLeft: number },
  factor: number,
  anchorX: number,
): { pps: number; scrollLeft: number } {
  const pps = clampZoom(view.pps * factor);
  const anchorTime = (view.scrollLeft + anchorX) / view.pps;
  return { pps, scrollLeft: Math.max(0, anchorTime * pps - anchorX) };
}

export function timelineWidth(duration: number, pps: number, viewportWidth: number): number {
  return Math.max(viewportWidth, (duration + END_PADDING_SECONDS) * pps);
}

export function formatTimecode(seconds: number, step: number): string {
  const decimals = step < 0.5 ? 2 : step < 1 ? 1 : 0;
  const rounded = Math.max(0, seconds);
  const whole = Math.floor(rounded + 1e-9);
  const fraction = rounded - whole;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const ss = String(secs).padStart(2, "0");
  const tail =
    decimals > 0 ? `.${Math.round(fraction * 10 ** decimals).toString().padStart(decimals, "0")}` : "";
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}${tail}`
    : `${minutes}:${ss}${tail}`;
}

export interface RulerTick {
  time: number;
  major: boolean;
  label: string | null;
}

const round6 = (n: number) => Number(n.toFixed(6));

export function rulerTicks(pps: number, startTime: number, endTime: number): RulerTick[] {
  const step = STEPS.find((s) => s * pps >= MIN_MAJOR_SPACING_PX) ?? STEPS[STEPS.length - 1];
  const first = Math.max(0, Math.floor(startTime / step));
  const last = Math.ceil(endTime / step);
  const ticks: RulerTick[] = [];
  for (let i = first; i <= last; i++) {
    const time = round6(i * step);
    ticks.push({ time, major: true, label: formatTimecode(time, step) });
    if (i < last) {
      for (let m = 1; m < MINOR_PER_MAJOR; m++) {
        ticks.push({ time: round6(time + (step * m) / MINOR_PER_MAJOR), major: false, label: null });
      }
    }
  }
  return ticks.filter((t) => t.time <= endTime + 1e-9).sort((a, b) => a.time - b.time);
}

const WHEEL_NOTCH_PX = 100;
const WHEEL_LINE_PX = 33;
const WHEEL_PAGE_PX = 400;
const WHEEL_ZOOM_RATE = 0.003;

/**
 * Zoom factor for one wheel event. A mouse-wheel notch (about 100 px) is a
 * zoom of about a third; one event never exceeds a notch; trackpad pinch
 * (many small deltas) stays smooth. Negative delta zooms in.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const unit = deltaMode === 1 ? WHEEL_LINE_PX : deltaMode === 2 ? WHEEL_PAGE_PX : 1;
  const pixels = Math.max(-WHEEL_NOTCH_PX, Math.min(WHEEL_NOTCH_PX, deltaY * unit));
  return Math.exp(-pixels * WHEEL_ZOOM_RATE);
}
