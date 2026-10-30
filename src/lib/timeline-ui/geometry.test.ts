import { describe, expect, it } from "vitest";

import {
  clampZoom,
  END_PADDING_SECONDS,
  formatTimecode,
  rulerTicks,
  timelineWidth,
  wheelZoomFactor,
  timeToX,
  xToTime,
  zoomAround,
  ZOOM_MAX,
  ZOOM_MIN,
} from "@/lib/timeline-ui/geometry";

describe("time and pixels", () => {
  it("converts both ways", () => {
    expect(timeToX(2, 50)).toBe(100);
    expect(xToTime(100, 50)).toBe(2);
  });

  it("clamps zoom to its range", () => {
    expect(clampZoom(1)).toBe(ZOOM_MIN);
    expect(clampZoom(1000)).toBe(ZOOM_MAX);
    expect(clampZoom(60)).toBe(60);
  });

  it("sizes the content to the project plus padding, never below the viewport", () => {
    expect(timelineWidth(10, 50, 300)).toBe((10 + END_PADDING_SECONDS) * 50);
    expect(timelineWidth(1, 50, 1000)).toBe(1000);
  });
});

describe("zoomAround", () => {
  it("keeps the time under the pointer fixed", () => {
    // Time under the pointer: (100 + 50) / 50 = 3 s.
    const next = zoomAround({ pps: 50, scrollLeft: 100 }, 2, 50);
    expect(next.pps).toBe(100);
    expect(next.scrollLeft).toBe(250); // 3 s * 100 px/s - 50
  });

  it("keeps the anchor fixed even when the zoom range clamps the factor", () => {
    const next = zoomAround({ pps: 300, scrollLeft: 0 }, 2, 100);
    expect(next.pps).toBe(ZOOM_MAX);
    expect(next.scrollLeft).toBeCloseTo((100 / 300) * 400 - 100, 6);
  });

  it("never scrolls to a negative position", () => {
    const next = zoomAround({ pps: 100, scrollLeft: 0 }, 0.5, 200);
    expect(next.pps).toBe(50);
    expect(next.scrollLeft).toBe(0);
  });
});

describe("formatTimecode", () => {
  it("formats whole-second steps as m:ss", () => {
    expect(formatTimecode(0, 1)).toBe("0:00");
    expect(formatTimecode(5, 1)).toBe("0:05");
    expect(formatTimecode(65, 5)).toBe("1:05");
  });

  it("adds decimals for sub-second steps", () => {
    expect(formatTimecode(65.5, 0.5)).toBe("1:05.5");
    expect(formatTimecode(0.25, 0.25)).toBe("0:00.25");
  });

  it("adds hours when needed", () => {
    expect(formatTimecode(3725, 1)).toBe("1:02:05");
  });
});

describe("rulerTicks", () => {
  const majors = (ticks: ReturnType<typeof rulerTicks>) =>
    ticks.filter((t) => t.major).map((t) => t.time);

  it("uses one-second marks at 100 px per second", () => {
    const ticks = rulerTicks(100, 0, 3);
    expect(majors(ticks)).toEqual([0, 1, 2, 3]);
    expect(ticks.filter((t) => t.major).map((t) => t.label)).toEqual(["0:00", "0:01", "0:02", "0:03"]);
  });

  it("puts three unlabelled minor ticks between majors", () => {
    const ticks = rulerTicks(100, 0, 1);
    const minors = ticks.filter((t) => !t.major);
    expect(minors.map((t) => t.time)).toEqual([0.25, 0.5, 0.75]);
    expect(minors.every((t) => t.label === null)).toBe(true);
  });

  it("widens the step when zoomed out", () => {
    expect(majors(rulerTicks(10, 0, 25))).toEqual([0, 10, 20]);
  });

  it("starts at the major tick at or before the visible start", () => {
    expect(majors(rulerTicks(100, 1.2, 3))).toEqual([1, 2, 3]);
  });

  it("never returns negative times and is sorted", () => {
    const ticks = rulerTicks(100, 0, 2);
    const times = ticks.map((t) => t.time);
    expect(times.every((t) => t >= 0)).toBe(true);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe("wheelZoomFactor", () => {
  it("zooms about one third per mouse-wheel notch, symmetrically", () => {
    const zoomIn = wheelZoomFactor(-100, 0);
    expect(zoomIn).toBeGreaterThan(1.2);
    expect(zoomIn).toBeLessThan(1.5);
    expect(wheelZoomFactor(100, 0)).toBeCloseTo(1 / zoomIn, 9);
  });

  it("never jumps more than one notch for a huge delta", () => {
    expect(wheelZoomFactor(-5000, 0)).toBeCloseTo(wheelZoomFactor(-100, 0), 9);
  });

  it("treats three lines as one notch and leaves small trackpad deltas small", () => {
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(wheelZoomFactor(-99, 0), 9);
    expect(wheelZoomFactor(-4, 0)).toBeLessThan(1.02);
  });
});
