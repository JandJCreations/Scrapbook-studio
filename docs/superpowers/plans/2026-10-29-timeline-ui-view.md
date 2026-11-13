# Timeline UI, Part 1: View, Selection, Scrub, Zoom (plan 4a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real timeline you can see and navigate: ruler, tracks with headers, clips as labelled chips, a draggable playhead, zoom, selection, track mute/lock/hide/solo, and transport keys (Space, arrows). It reads the existing clip store and drives the existing playback session, and it is mounted on the `/dev/playback` test page. No clip dragging or trimming yet (plan 4b) and no thumbnails or waveforms yet (plan 4c).

**Architecture:** All maths (time to pixels, zoom, ruler ticks, row layout, selection, key bindings, auto-scroll) is pure code in `src/lib/timeline-ui/`, unit-tested. A thin React layer in `src/components/clip-timeline/` renders it and wires pointer and keyboard events. The old `src/components/timeline/` files belong to the old model and are not touched.

**Tech Stack:** TypeScript (strict), Vitest, React 19 client components, Tailwind (existing), zustand stores (`useClipProjectStore`, `useTransportStore`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-clip-timeline-design.md`, section 6 (Timeline UI). Plan 4a covers: layout, track headers, ruler, draggable playhead, ruler click-to-seek, Ctrl+wheel zoom, selection (click, shift/ctrl-click), Space and arrow keys. Plans 4b (move, trim, snap, reorder, new tracks, marquee, split/delete/duplicate keys, drag from the media panel) and 4c (thumbnail strips, waveforms) follow.

**Decisions made here (the builder's calls, not the user's):**
- The timeline is built and verified on the `/dev/playback` page first. Putting it into the real editor page is spec step 5 ("port scrapbook features"), because the real editor still runs on the old model.
- One scroll container holds the ruler, headers and lanes; headers and ruler are sticky.
- Default zoom 60 px per second, range 5 to 400.

## Global Constraints

- Work on branch `feature/timeline-ui` (already created from `main`; the plan is its first commit). Never commit to `main`.
- Read before writing: `AGENTS.md` says this is not the Next.js you know. This plan adds only client components and plain TypeScript, no routing changes. If a component needs a Next API, read `node_modules/next/dist/docs/` first.
- New code lives in `src/lib/timeline-ui/` (pure, no `window`, `document`, `performance` or React) and `src/components/clip-timeline/` (React). Existing files this plan may change: `src/components/playback/playback-harness.tsx` (mount the timeline) and nothing else outside new files.
- Pure modules must pass this grep with no output: `grep -rnE "document\.|window\.|requestAnimationFrame|setTimeout|setInterval|performance\.|Date\.now" src/lib/timeline-ui --include=*.ts --exclude=*.test.ts`.
- Shortcuts must never fire while the user types in an input, select or textarea (the test page has several).
- Run tests with `npx vitest run <file>`; type-check with `npx tsc --noEmit`; lint with `npx eslint <paths>`. If `node` is not found, run `$env:Path += ";C:\Program Files\nodejs"` (PowerShell) or `export PATH="$PATH:/c/Program Files/nodejs"` (bash). Start shell commands with an absolute `cd` into the repo.
- Write files with the Write/Edit tools; do not rely on Python (not installed).
- End every commit message with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (second `-m`).
- Chrome work (Task 5): read the `anthropic-skills:chrome-browser` skill first; use a new tab; if `list_connected_browsers` is empty, stop and ask the user to enable Claude in Chrome and bring that window to the front (a covered window throttles `requestAnimationFrame` to about 2 fps and gives false results; check `requestAnimationFrame` runs near 60 per second before trusting any timing).

## Review Focus

- Scrubbing and zooming: the playhead follows the pointer exactly, releasing outside the window or losing capture never leaves a stuck drag, and Ctrl+wheel zoom keeps the time under the pointer fixed.
- Header and lane alignment: with a sticky header column and ruler, a clip's pixel position matches its time at every zoom and scroll position.
- Keyboard: shortcuts work with focus on the page body and never while typing in inputs; `Space` does not scroll the page; undo/redo shortcuts do not fire inside inputs.
- Listener lifecycle: window and wheel listeners are removed on unmount and on StrictMode's double mount, with no duplicates.
- Selection stays consistent with the store when clips are deleted or undone, and clicking a clip never also starts a scrub.
- Many clips (200+) still render and scroll smoothly.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/timeline-ui/geometry.ts` | Time/pixel maths, zoom, ruler ticks, timecode text |
| `src/lib/timeline-ui/layout.ts` | Track rows, clip rectangles, labels, pointer-to-time, auto-scroll |
| `src/lib/timeline-ui/interactions.ts` | Selection rules, key-to-command mapping |
| `src/components/clip-timeline/timeline-view.tsx` | The timeline component |
| `src/components/clip-timeline/timeline-ruler.tsx` | Ruler row with ticks and scrub handling |
| `src/components/clip-timeline/track-header.tsx` | Track name and mute/lock/hide/solo buttons |
| `src/components/clip-timeline/clip-chip.tsx` | One clip as a labelled chip |
| `src/components/playback/playback-harness.tsx` | Modified: mounts the timeline |
| `src/lib/timeline-ui/index.ts` | Barrel |

Each `*.test.ts` sits beside the file it tests.

---

### Task 1: Geometry and ruler maths

**Files:**
- Create: `src/lib/timeline-ui/geometry.ts`
- Test: `src/lib/timeline-ui/geometry.test.ts`

**Interfaces:**
- Produces:
  - `ZOOM_MIN = 5`, `ZOOM_MAX = 400`, `ZOOM_DEFAULT = 60` (pixels per second), `END_PADDING_SECONDS = 5`
  - `timeToX(time, pps): number` (`time * pps`), `xToTime(x, pps): number` (`x / pps`)
  - `clampZoom(pps): number`
  - `zoomAround(view: { pps: number; scrollLeft: number }, factor: number, anchorX: number): { pps: number; scrollLeft: number }`. `anchorX` is the pointer's distance from the left edge of the visible lane area. The time under the pointer stays under it; `scrollLeft` never goes below 0; `pps` is clamped.
  - `timelineWidth(duration, pps, viewportWidth): number` (`max(viewportWidth, (duration + END_PADDING_SECONDS) * pps)`)
  - `formatTimecode(seconds, step): string`. `step < 0.5`: `m:ss.cc` (two decimals); `step < 1`: `m:ss.d`; otherwise `m:ss`; hours as `h:mm:ss`.
  - `interface RulerTick { time: number; major: boolean; label: string | null }`
  - `rulerTicks(pps, startTime, endTime): RulerTick[]`. Picks the smallest step from `[0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]` whose spacing is at least 80 px. Major ticks every step (with labels), 3 minor ticks between majors. Ticks run from the major at or before `startTime` up to `endTime`, never below 0, sorted by time, times rounded to 6 decimals.

- [ ] **Step 1: Write the failing test**

`src/lib/timeline-ui/geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  clampZoom,
  END_PADDING_SECONDS,
  formatTimecode,
  rulerTicks,
  timelineWidth,
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui/geometry.test.ts`
Expected: FAIL; `@/lib/timeline-ui/geometry` cannot be resolved.

- [ ] **Step 3: Implement**

`src/lib/timeline-ui/geometry.ts`:

```ts
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
  const tail = decimals > 0 ? `.${Math.round(fraction * 10 ** decimals).toString().padStart(decimals, "0")}` : "";
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
```

- [ ] **Step 4: Run the test and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui/geometry.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors. (No tick after `endTime` is ever returned, so `rulerTicks(10, 0, 25)` has majors `[0, 10, 20]` and `rulerTicks(100, 0, 1)` has minors exactly `[0.25, 0.5, 0.75]`.) If a test fails, fix the implementation, not the test.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/timeline-ui/geometry.ts src/lib/timeline-ui/geometry.test.ts
git commit -m "feat: add timeline geometry and ruler maths" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Track and clip layout, pointer maths, auto-scroll

**Files:**
- Create: `src/lib/timeline-ui/layout.ts`
- Test: `src/lib/timeline-ui/layout.test.ts`

**Interfaces:**
- Consumes: `clipDuration` (`@/lib/timeline/clip-math`); types `Clip`, `Track`, `TimelineProject`; `timeToX` (Task 1).
- Produces:
  - `ROW_HEIGHT: Record<TrackType, number>` = `{ overlay: 44, video: 64, audio: 44 }`, `ROW_GAP = 2`, `MIN_CLIP_WIDTH = 2`, `HEADER_WIDTH = 112`, `RULER_HEIGHT = 28`
  - `interface TrackRow { trackId: string; type: TrackType; y: number; height: number }`
  - `interface TrackLayout { rows: TrackRow[]; height: number }`
  - `trackLayout(project): TrackLayout` (rows in ascending `order`, top first; `y` accumulates `height + ROW_GAP`; `height` is the bottom of the last row, `0` with no tracks)
  - `interface ClipRect { x: number; y: number; width: number; height: number }`
  - `clipRect(clip: Clip, row: TrackRow, pps: number): ClipRect` (`x = start*pps`, `width = max(duration*pps, MIN_CLIP_WIDTH)`, `y = row.y + 2`, `height = row.height - 4`)
  - `clipLabel(clip: Clip): string` (text clips: `adjustments.text?.content || name`; all others: `name`)
  - `pointerToTime(clientX, laneLeft, pps): number` (`max(0, (clientX - laneLeft) / pps)`; `laneLeft` is the lane area's left edge on screen, which already moves with scrolling)
  - `keepPlayheadVisible(args: { scrollLeft: number; viewportWidth: number; playheadX: number }): number`. Returns the same `scrollLeft` when the playhead is inside `[scrollLeft, scrollLeft + viewportWidth - 40]`; otherwise `max(0, playheadX - viewportWidth * 0.1)`.

- [ ] **Step 1: Write the failing test**

`src/lib/timeline-ui/layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  clipLabel,
  clipRect,
  keepPlayheadVisible,
  MIN_CLIP_WIDTH,
  pointerToTime,
  trackLayout,
} from "@/lib/timeline-ui/layout";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import type { TextAdjustments } from "@/types/text-adjustments";

describe("trackLayout", () => {
  it("stacks rows top to bottom in track order with gaps", () => {
    const layout = trackLayout(makeProject(makeStandardTracks(), []));
    // overlay (44) / video (64) / audio (44), 2 px gaps
    expect(layout.rows.map((r) => [r.trackId, r.y, r.height])).toEqual([
      ["t2", 0, 44],
      ["t1", 46, 64],
      ["t3", 112, 44],
    ]);
    expect(layout.height).toBe(156);
  });

  it("is empty with no tracks", () => {
    expect(trackLayout(makeProject([], []))).toEqual({ rows: [], height: 0 });
  });
});

describe("clipRect", () => {
  const project = makeProject(makeStandardTracks(), []);
  const row = trackLayout(project).rows[1]; // video row at y 46, height 64

  it("positions a clip by its time and length", () => {
    const clip = makeClip({ start: 2, sourceIn: 0, sourceOut: 4 });
    expect(clipRect(clip, row, 50)).toEqual({ x: 100, y: 48, width: 200, height: 60 });
  });

  it("uses the clip's real length when sped up", () => {
    const clip = makeClip({ start: 0, sourceIn: 0, sourceOut: 4, speed: 2 });
    expect(clipRect(clip, row, 50).width).toBe(100);
  });

  it("never becomes narrower than the minimum width", () => {
    const clip = makeClip({ start: 0, sourceIn: 0, sourceOut: 0.1 });
    expect(clipRect(clip, row, 5).width).toBe(MIN_CLIP_WIDTH);
  });
});

describe("clipLabel", () => {
  it("shows text content for text clips, falling back to the name", () => {
    const text = { content: "Hello" } as unknown as TextAdjustments;
    const withText = makeClip({
      kind: "text",
      name: "Title",
      adjustments: { photo: null, video: null, text },
    });
    expect(clipLabel(withText)).toBe("Hello");
    expect(clipLabel(makeClip({ kind: "text", name: "Fallback" }))).toBe("Fallback");
  });

  it("shows the name for everything else", () => {
    expect(clipLabel(makeClip({ kind: "video", name: "beach.mp4" }))).toBe("beach.mp4");
  });
});

describe("pointerToTime", () => {
  it("converts a screen x relative to the lane's left edge", () => {
    expect(pointerToTime(350, 100, 50)).toBe(5);
  });

  it("never goes before the start", () => {
    expect(pointerToTime(40, 100, 50)).toBe(0);
  });
});

describe("keepPlayheadVisible", () => {
  it("leaves the scroll alone while the playhead is in view", () => {
    expect(keepPlayheadVisible({ scrollLeft: 100, viewportWidth: 500, playheadX: 300 })).toBe(100);
  });

  it("pages forward when the playhead passes the right edge", () => {
    expect(keepPlayheadVisible({ scrollLeft: 0, viewportWidth: 500, playheadX: 480 })).toBe(430);
  });

  it("scrolls back when the playhead is left of the view", () => {
    expect(keepPlayheadVisible({ scrollLeft: 400, viewportWidth: 500, playheadX: 100 })).toBe(50);
  });

  it("never scrolls below zero", () => {
    expect(keepPlayheadVisible({ scrollLeft: 400, viewportWidth: 500, playheadX: 10 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui/layout.test.ts`
Expected: FAIL; module cannot be resolved.

- [ ] **Step 3: Implement**

`src/lib/timeline-ui/layout.ts`:

```ts
import { clipDuration } from "@/lib/timeline/clip-math";
import type { Clip, TimelineProject, TrackType } from "@/types/timeline";

export const ROW_HEIGHT: Record<TrackType, number> = { overlay: 44, video: 64, audio: 44 };
export const ROW_GAP = 2;
export const MIN_CLIP_WIDTH = 2;
export const HEADER_WIDTH = 112;
export const RULER_HEIGHT = 28;

const RIGHT_MARGIN = 40;
const PAGE_LEAD = 0.1;

export interface TrackRow {
  trackId: string;
  type: TrackType;
  y: number;
  height: number;
}

export interface TrackLayout {
  rows: TrackRow[];
  height: number;
}

export function trackLayout(project: TimelineProject): TrackLayout {
  const sorted = [...project.tracks].sort((a, b) => a.order - b.order);
  const rows: TrackRow[] = [];
  let y = 0;
  for (const track of sorted) {
    const height = ROW_HEIGHT[track.type];
    rows.push({ trackId: track.id, type: track.type, y, height });
    y += height + ROW_GAP;
  }
  const last = rows[rows.length - 1];
  return { rows, height: last ? last.y + last.height : 0 };
}

export interface ClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clipRect(clip: Clip, row: TrackRow, pps: number): ClipRect {
  return {
    x: clip.start * pps,
    y: row.y + 2,
    width: Math.max(clipDuration(clip) * pps, MIN_CLIP_WIDTH),
    height: row.height - 4,
  };
}

export function clipLabel(clip: Clip): string {
  return clip.kind === "text" ? clip.adjustments.text?.content || clip.name : clip.name;
}

/** `laneLeft` is the lane area's left edge on screen; it already moves with scrolling. */
export function pointerToTime(clientX: number, laneLeft: number, pps: number): number {
  return Math.max(0, (clientX - laneLeft) / pps);
}

export function keepPlayheadVisible(args: {
  scrollLeft: number;
  viewportWidth: number;
  playheadX: number;
}): number {
  const { scrollLeft, viewportWidth, playheadX } = args;
  if (playheadX >= scrollLeft && playheadX <= scrollLeft + viewportWidth - RIGHT_MARGIN) {
    return scrollLeft;
  }
  return Math.max(0, playheadX - viewportWidth * PAGE_LEAD);
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui/layout.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors. `TrackType` must be exported from `@/types/timeline`; if it is not, import it from where `tracks.ts` imports it.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/timeline-ui/layout.ts src/lib/timeline-ui/layout.test.ts
git commit -m "feat: add timeline row and clip layout maths" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Selection rules and key bindings

**Files:**
- Create: `src/lib/timeline-ui/interactions.ts`
- Test: `src/lib/timeline-ui/interactions.test.ts`

**Interfaces:**
- Produces:
  - `nextSelection(current: string[], clipId: string, mods: { shift: boolean; ctrl: boolean }): string[]`. With shift or ctrl: adds the clip if absent, removes it if present (order of the rest kept). Without: `[clipId]`.
  - `type TimelineCommand = { type: "toggle-play" } | { type: "step"; direction: 1 | -1 } | { type: "seek-start" } | { type: "seek-end" } | { type: "undo" } | { type: "redo" }`
  - `interface KeyInput { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; editable: boolean }` (`editable` is true when focus is in an input, select, textarea or contenteditable)
  - `commandForKey(input: KeyInput): TimelineCommand | null`. Returns `null` when `editable` or `altKey`. `" "` (Space) with no ctrl/meta: toggle-play. `ArrowLeft`/`ArrowRight` with no ctrl/meta: step -1 / +1. `Home` / `End`: seek-start / seek-end. With ctrl or meta: `z` undo, `Z` or shift+`z` redo, `y` redo; any other key with ctrl/meta: `null`.

- [ ] **Step 1: Write the failing test**

`src/lib/timeline-ui/interactions.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { commandForKey, nextSelection, type KeyInput } from "@/lib/timeline-ui/interactions";

const key = (overrides: Partial<KeyInput>): KeyInput => ({
  key: "",
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  editable: false,
  ...overrides,
});

describe("nextSelection", () => {
  const none = { shift: false, ctrl: false };

  it("replaces the selection with a plain click", () => {
    expect(nextSelection(["a", "b"], "c", none)).toEqual(["c"]);
    expect(nextSelection(["a", "b"], "a", none)).toEqual(["a"]);
  });

  it("adds with shift or ctrl and removes when already selected", () => {
    expect(nextSelection(["a"], "b", { shift: true, ctrl: false })).toEqual(["a", "b"]);
    expect(nextSelection(["a", "b"], "a", { shift: false, ctrl: true })).toEqual(["b"]);
  });
});

describe("commandForKey", () => {
  it("maps transport keys", () => {
    expect(commandForKey(key({ key: " " }))).toEqual({ type: "toggle-play" });
    expect(commandForKey(key({ key: "ArrowRight" }))).toEqual({ type: "step", direction: 1 });
    expect(commandForKey(key({ key: "ArrowLeft" }))).toEqual({ type: "step", direction: -1 });
    expect(commandForKey(key({ key: "Home" }))).toEqual({ type: "seek-start" });
    expect(commandForKey(key({ key: "End" }))).toEqual({ type: "seek-end" });
  });

  it("maps undo and redo for ctrl and cmd", () => {
    expect(commandForKey(key({ key: "z", ctrlKey: true }))).toEqual({ type: "undo" });
    expect(commandForKey(key({ key: "z", metaKey: true }))).toEqual({ type: "undo" });
    expect(commandForKey(key({ key: "Z", ctrlKey: true, shiftKey: true }))).toEqual({ type: "redo" });
    expect(commandForKey(key({ key: "z", ctrlKey: true, shiftKey: true }))).toEqual({ type: "redo" });
    expect(commandForKey(key({ key: "y", ctrlKey: true }))).toEqual({ type: "redo" });
  });

  it("ignores everything while typing in a field", () => {
    expect(commandForKey(key({ key: " ", editable: true }))).toBeNull();
    expect(commandForKey(key({ key: "z", ctrlKey: true, editable: true }))).toBeNull();
    expect(commandForKey(key({ key: "ArrowLeft", editable: true }))).toBeNull();
  });

  it("ignores alt combinations and unrelated keys", () => {
    expect(commandForKey(key({ key: " ", altKey: true }))).toBeNull();
    expect(commandForKey(key({ key: "a" }))).toBeNull();
    expect(commandForKey(key({ key: "ArrowLeft", ctrlKey: true }))).toBeNull();
    expect(commandForKey(key({ key: " ", metaKey: true }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui/interactions.test.ts`
Expected: FAIL; module cannot be resolved.

- [ ] **Step 3: Implement**

`src/lib/timeline-ui/interactions.ts`:

```ts
export function nextSelection(
  current: string[],
  clipId: string,
  mods: { shift: boolean; ctrl: boolean },
): string[] {
  if (!mods.shift && !mods.ctrl) return [clipId];
  return current.includes(clipId) ? current.filter((id) => id !== clipId) : [...current, clipId];
}

export type TimelineCommand =
  | { type: "toggle-play" }
  | { type: "step"; direction: 1 | -1 }
  | { type: "seek-start" }
  | { type: "seek-end" }
  | { type: "undo" }
  | { type: "redo" };

export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** True when focus is in an input, select, textarea or contenteditable element. */
  editable: boolean;
}

export function commandForKey(input: KeyInput): TimelineCommand | null {
  if (input.editable || input.altKey) return null;
  const modifier = input.ctrlKey || input.metaKey;

  if (modifier) {
    const k = input.key.toLowerCase();
    if (k === "z") return input.shiftKey ? { type: "redo" } : { type: "undo" };
    if (k === "y") return { type: "redo" };
    return null;
  }

  switch (input.key) {
    case " ":
      return { type: "toggle-play" };
    case "ArrowLeft":
      return { type: "step", direction: -1 };
    case "ArrowRight":
      return { type: "step", direction: 1 };
    case "Home":
      return { type: "seek-start" };
    case "End":
      return { type: "seek-end" };
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui` then `npx tsc --noEmit`
Expected: PASS (all three test files); no type errors.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/timeline-ui/interactions.ts src/lib/timeline-ui/interactions.test.ts
git commit -m "feat: add timeline selection rules and key bindings" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The timeline component and its mount

**Files:**
- Create: `src/lib/timeline-ui/index.ts`, `src/components/clip-timeline/clip-chip.tsx`, `src/components/clip-timeline/track-header.tsx`, `src/components/clip-timeline/timeline-ruler.tsx`, `src/components/clip-timeline/timeline-view.tsx`
- Modify: `src/components/playback/playback-harness.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1 to 3; `useClipProjectStore`, `selectProject`, `selectCanUndo`/`selectCanRedo` (not needed), `useTransportStore`; `projectDuration`; `updateTrack`; `Button` is not needed.
- Produces:
  - `TimelineView` (`export function TimelineView(props: { fps: number; onSeek(time: number): void; onToggle(): void; onStep(direction: 1 | -1): void })`). It reads the project, selection and transport time from the stores, so it takes no project props.

No unit tests here (browser components); this task is type-checked and linted, then verified in Chrome in Task 5.

- [ ] **Step 1: Barrel**

`src/lib/timeline-ui/index.ts`:

```ts
export * from "@/lib/timeline-ui/geometry";
export * from "@/lib/timeline-ui/interactions";
export * from "@/lib/timeline-ui/layout";
```

- [ ] **Step 2: Clip chip**

`src/components/clip-timeline/clip-chip.tsx`:

```tsx
"use client";

import * as React from "react";

import { clipLabel, type ClipRect } from "@/lib/timeline-ui/layout";
import type { Clip } from "@/types/timeline";

const TONE: Record<Clip["kind"], string> = {
  video: "bg-sky-500/70 border-sky-300",
  image: "bg-emerald-500/70 border-emerald-300",
  text: "bg-amber-500/70 border-amber-300",
  sticker: "bg-pink-500/70 border-pink-300",
  audio: "bg-violet-500/70 border-violet-300",
};

interface ClipChipProps {
  clip: Clip;
  rect: ClipRect;
  selected: boolean;
  dimmed: boolean;
}

/**
 * One clip. Selection is handled once by the lane (it finds the chip through
 * `data-clip-id`), so the chip itself has no handlers and stays memoised.
 */
export const ClipChip = React.memo(function ClipChip({ clip, rect, selected, dimmed }: ClipChipProps) {
  return (
    <button
      type="button"
      data-clip-id={clip.id}
      aria-pressed={selected}
      title={`${clipLabel(clip)} (${clip.kind})`}
      // Do not take keyboard focus on click, so Space keeps meaning play/pause.
      onMouseDown={(event) => event.preventDefault()}
      className={`absolute overflow-hidden rounded-md border px-1.5 text-left text-xs text-white shadow-sm ${
        TONE[clip.kind]
      } ${selected ? "ring-2 ring-white" : ""} ${dimmed ? "opacity-40" : ""}`}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <span className="block truncate leading-tight">{clipLabel(clip)}</span>
    </button>
  );
}, areChipsEqual);

function areChipsEqual(a: ClipChipProps, b: ClipChipProps): boolean {
  return (
    a.clip === b.clip &&
    a.selected === b.selected &&
    a.dimmed === b.dimmed &&
    a.rect.x === b.rect.x &&
    a.rect.y === b.rect.y &&
    a.rect.width === b.rect.width &&
    a.rect.height === b.rect.height
  );
}
```

- [ ] **Step 3: Track header**

`src/components/clip-timeline/track-header.tsx`:

```tsx
"use client";

import * as React from "react";

import { updateTrack, type TrackPatch } from "@/lib/timeline/tracks";
import { useClipProjectStore } from "@/store/use-clip-project-store";
import type { Track } from "@/types/timeline";

const NAME: Record<Track["type"], string> = { overlay: "Overlay", video: "Video", audio: "Audio" };

const TOGGLES = [
  { key: "muted", short: "M", title: "Mute" },
  { key: "hidden", short: "H", title: "Hide" },
  { key: "locked", short: "L", title: "Lock" },
  { key: "solo", short: "S", title: "Solo" },
] as const;

export const TrackHeader = React.memo(function TrackHeader({ track }: { track: Track }) {
  return (
    <div className="flex h-full flex-col justify-center gap-1 px-2 text-xs">
      <span className="font-medium">{NAME[track.type]}</span>
      <div className="flex gap-1">
        {TOGGLES.map(({ key, short, title }) => (
          <button
            key={key}
            type="button"
            title={title}
            aria-label={`${title} ${NAME[track.type]} track`}
            aria-pressed={track[key]}
            // Keep keyboard focus off the header so Space stays play/pause.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const patch: TrackPatch = { [key]: !track[key] };
              useClipProjectStore.getState().apply((p) => updateTrack(p, track.id, patch));
            }}
            className={`h-5 w-5 rounded border text-[10px] leading-none ${
              track[key] ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            {short}
          </button>
        ))}
      </div>
    </div>
  );
});
```

- [ ] **Step 4: Ruler**

`src/components/clip-timeline/timeline-ruler.tsx`:

```tsx
"use client";

import * as React from "react";

import { rulerTicks, timeToX } from "@/lib/timeline-ui/geometry";

interface TimelineRulerProps {
  pps: number;
  width: number;
  startTime: number;
  endTime: number;
  onPointerDown: React.PointerEventHandler<HTMLDivElement>;
  onPointerMove: React.PointerEventHandler<HTMLDivElement>;
  onPointerEnd: React.PointerEventHandler<HTMLDivElement>;
}

export const TimelineRuler = React.forwardRef<HTMLDivElement, TimelineRulerProps>(
  function TimelineRuler(
    { pps, width, startTime, endTime, onPointerDown, onPointerMove, onPointerEnd },
    ref,
  ) {
    const ticks = React.useMemo(() => rulerTicks(pps, startTime, endTime), [pps, startTime, endTime]);
    return (
      <div
        ref={ref}
        role="slider"
        aria-label="Timeline ruler"
        aria-valuemin={0}
        className="relative cursor-pointer select-none border-b bg-card"
        style={{ width, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
      >
        {ticks.map((tick) => (
          <div
            key={tick.time}
            className="absolute bottom-0 border-l border-muted-foreground/50"
            style={{ left: timeToX(tick.time, pps), height: tick.major ? 14 : 7 }}
          >
            {tick.label && (
              <span className="absolute -top-3.5 left-1 whitespace-nowrap text-[10px] text-muted-foreground">
                {tick.label}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  },
);
```

- [ ] **Step 5: The view**

`src/components/clip-timeline/timeline-view.tsx`:

```tsx
"use client";

import * as React from "react";

import { ClipChip } from "@/components/clip-timeline/clip-chip";
import { TimelineRuler } from "@/components/clip-timeline/timeline-ruler";
import { TrackHeader } from "@/components/clip-timeline/track-header";
import {
  timelineWidth,
  timeToX,
  ZOOM_DEFAULT,
  zoomAround,
} from "@/lib/timeline-ui/geometry";
import { commandForKey, nextSelection } from "@/lib/timeline-ui/interactions";
import {
  clipRect,
  HEADER_WIDTH,
  keepPlayheadVisible,
  pointerToTime,
  RULER_HEIGHT,
  trackLayout,
} from "@/lib/timeline-ui/layout";
import { projectDuration } from "@/lib/timeline/clip-math";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";

interface TimelineViewProps {
  fps: number;
  onSeek(time: number): void;
  onToggle(): void;
  onStep(direction: 1 | -1): void;
}

function isEditable(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return true;
  // A focused button handles Space itself; do not also toggle playback.
  return target.tagName === "BUTTON" && key === " ";
}

export function TimelineView({ onSeek, onToggle, onStep }: TimelineViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rulerRef = React.useRef<HTMLDivElement>(null);
  const scrubbing = React.useRef(false);
  const pendingScroll = React.useRef<number | null>(null);

  const [pps, setPps] = React.useState(ZOOM_DEFAULT);
  const [scrollLeft, setScrollLeft] = React.useState(0);
  const [viewportWidth, setViewportWidth] = React.useState(800);

  const project = useClipProjectStore(selectProject);
  const selectedIds = useClipProjectStore((s) => s.selectedClipIds);
  const time = useTransportStore((s) => s.time);

  const duration = projectDuration(project);
  const layout = React.useMemo(() => trackLayout(project), [project]);
  const laneWidth = timelineWidth(duration, pps, viewportWidth - HEADER_WIDTH);
  const rowByTrack = React.useMemo(
    () => new Map(layout.rows.map((row) => [row.trackId, row])),
    [layout],
  );
  const trackById = React.useMemo(
    () => new Map(project.tracks.map((track) => [track.id, track])),
    [project.tracks],
  );
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);

  // The latest values for listeners that are registered once.
  const latest = React.useRef({ pps, duration, onSeek, onToggle, onStep });
  React.useEffect(() => {
    latest.current = { pps, duration, onSeek, onToggle, onStep };
  });

  // Track the visible width.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setViewportWidth(container.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Ctrl/Cmd + wheel zooms around the pointer. Registered by hand because a
  // React wheel handler is passive and cannot stop the browser's page zoom.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const anchorX = Math.max(0, event.clientX - rect.left - HEADER_WIDTH);
      const factor = Math.exp(-event.deltaY * 0.01);
      const next = zoomAround(
        { pps: latest.current.pps, scrollLeft: container.scrollLeft },
        factor,
        anchorX,
      );
      pendingScroll.current = next.scrollLeft;
      setPps(next.pps);
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  // Apply the scroll position that keeps the zoom anchor fixed, after the new width exists.
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (container && pendingScroll.current !== null) {
      container.scrollLeft = pendingScroll.current;
      pendingScroll.current = null;
    }
  }, [pps]);

  // Keep the playhead in view.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const next = keepPlayheadVisible({
      scrollLeft: container.scrollLeft,
      viewportWidth: container.clientWidth - HEADER_WIDTH,
      playheadX: timeToX(time, pps),
    });
    if (next !== container.scrollLeft) container.scrollLeft = next;
  }, [time, pps]);

  // Transport and undo keys.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = commandForKey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        editable: isEditable(event.target, event.key),
      });
      if (!command) return;
      event.preventDefault();
      const { duration: total, onSeek: seek, onToggle: toggle, onStep: step } = latest.current;
      switch (command.type) {
        case "toggle-play":
          toggle();
          break;
        case "step":
          step(command.direction);
          break;
        case "seek-start":
          seek(0);
          break;
        case "seek-end":
          seek(total);
          break;
        case "undo":
          useClipProjectStore.getState().undo();
          break;
        case "redo":
          useClipProjectStore.getState().redo();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const seekFromPointer = (clientX: number) => {
    const ruler = rulerRef.current;
    if (!ruler) return;
    const t = pointerToTime(clientX, ruler.getBoundingClientRect().left, latest.current.pps);
    latest.current.onSeek(Math.min(t, latest.current.duration));
  };

  const onRulerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubbing.current = true;
    seekFromPointer(event.clientX);
  };
  const onRulerMove: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (scrubbing.current) seekFromPointer(event.clientX);
  };
  const onRulerEnd: React.PointerEventHandler<HTMLDivElement> = (event) => {
    scrubbing.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // One handler for all lanes: a click on a chip selects it, a click on empty space clears.
  const onLaneClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const chip = (event.target as HTMLElement).closest<HTMLElement>("[data-clip-id]");
    const store = useClipProjectStore.getState();
    if (!chip?.dataset.clipId) {
      store.setSelectedClipIds([]);
      return;
    }
    store.setSelectedClipIds(
      nextSelection(store.selectedClipIds, chip.dataset.clipId, {
        shift: event.shiftKey,
        ctrl: event.ctrlKey || event.metaKey,
      }),
    );
  };

  const startTime = scrollLeft / pps;
  const endTime = (scrollLeft + viewportWidth) / pps;
  const totalHeight = RULER_HEIGHT + layout.height;

  return (
    <div
      ref={containerRef}
      data-testid="clip-timeline"
      className="relative max-h-80 overflow-auto rounded-md border bg-card"
      onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
    >
      <div className="relative" style={{ width: HEADER_WIDTH + laneWidth, height: totalHeight }}>
        <div className="sticky top-0 z-30 flex" style={{ height: RULER_HEIGHT }}>
          <div
            className="sticky left-0 z-40 shrink-0 border-b border-r bg-card"
            style={{ width: HEADER_WIDTH }}
          />
          <TimelineRuler
            ref={rulerRef}
            pps={pps}
            width={laneWidth}
            startTime={startTime}
            endTime={endTime}
            onPointerDown={onRulerDown}
            onPointerMove={onRulerMove}
            onPointerEnd={onRulerEnd}
          />
        </div>

        <div className="relative" style={{ height: layout.height }}>
          {project.tracks.map((track) => {
            const row = rowByTrack.get(track.id);
            if (!row) return null;
            return (
              <div
                key={track.id}
                className="absolute left-0 right-0 flex"
                style={{ top: row.y, height: row.height }}
              >
                <div
                  className="sticky left-0 z-40 shrink-0 border-b border-r bg-card"
                  style={{ width: HEADER_WIDTH }}
                >
                  <TrackHeader track={track} />
                </div>
                <div
                  data-track-id={track.id}
                  className="relative border-b bg-muted/30"
                  style={{ width: laneWidth }}
                  onClick={onLaneClick}
                >
                  {project.clips
                    .filter((clip) => clip.trackId === track.id)
                    .map((clip) => {
                      const rect = clipRect(clip, { ...row, y: 0 }, pps);
                      return (
                        <ClipChip
                          key={clip.id}
                          clip={clip}
                          rect={rect}
                          selected={selectedSet.has(clip.id)}
                          dimmed={trackById.get(clip.trackId)?.hidden ?? false}
                        />
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>

        <div
          data-testid="playhead"
          className="pointer-events-none absolute top-0 z-30 w-px bg-red-500"
          style={{ left: HEADER_WIDTH + timeToX(time, pps), height: totalHeight }}
        >
          <div className="absolute -left-1 top-0 size-0 border-x-[5px] border-t-[8px] border-x-transparent border-t-red-500" />
        </div>
      </div>
    </div>
  );
}
```

Note the chips are laid out relative to their lane, so `clipRect` is called with the row's `y` set to 0 (each lane is its own positioned box).

- [ ] **Step 6: Mount it on the test page**

In `src/components/playback/playback-harness.tsx` add the import `import { TimelineView } from "@/components/clip-timeline/timeline-view";` and, inside `<main>` just before its closing tag (after the two-column grid `</div>`), add:

```tsx
      <TimelineView
        fps={FPS}
        onSeek={(t) => sessionRef.current?.seek(t)}
        onToggle={() => sessionRef.current?.toggle()}
        onStep={(direction) => sessionRef.current?.step(direction, FPS)}
      />
```

- [ ] **Step 7: Type-check and lint**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx tsc --noEmit` then `npx eslint src/lib/timeline-ui src/components/clip-timeline src/components/playback`
Expected: no errors. If a `react-hooks` rule objects (for example about refs), restructure without changing behaviour; do not disable the rule. If `track[key]` does not index (key union), type `TOGGLES` with `satisfies` or cast the key to `"muted" | "hidden" | "locked" | "solo"`.

- [ ] **Step 8: Check the page compiles**

Start the dev server with `mcp__Claude_Browser__preview_start` (name `scrapbook-dev`) and request `/dev/playback` until it returns 200 (first compile can take about a minute); check `preview_logs` for compile errors. Leave it running for Task 5.

- [ ] **Step 9: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/timeline-ui/index.ts src/components/clip-timeline src/components/playback/playback-harness.tsx
git commit -m "feat: add the timeline view with ruler, tracks, selection, scrub and zoom" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Verify in a real Chrome

No new code unless a check fails; a failure is a finding (diagnose with `superpowers:systematic-debugging`, fix test-first where the fault is in the pure modules). Follow the Chrome rules in Global Constraints (new tab, window in front, `requestAnimationFrame` near 60/s before trusting results).

- [ ] **Step 1: Prepare.** Read the `anthropic-skills:chrome-browser` skill, load the tools in one ToolSearch call, `list_connected_browsers` (empty means stop and ask), open `http://localhost:3000/dev/playback`, check the console is clean, then measure `requestAnimationFrame` per second and confirm it is about 60. Click "Generate sample clips" (two 6-second clips).

- [ ] **Step 2: Layout matches the maths.** With JavaScript, for each `[data-clip-id]` chip read its `getBoundingClientRect()` and the lane's; confirm `chip.left - lane.left` equals `start * pps` and `chip.width` equals `duration * pps` within 1 px at the default zoom (60). The ruler's labelled ticks read `0:00`, `0:01`, ... at 60 px/s spacing (every second at 60 px/s needs a step with at least 80 px, so labels should be every 2 s: confirm labels are `0:00`, `0:02`, ...). Expected: positions exact, ruler labels consistent with the zoom.

- [ ] **Step 3: Scrub.** Click the ruler at the x of 3 s: the time readout shows `3.000` within 0.02 s and the playhead line's x equals `HEADER_WIDTH + 3*pps` relative to the lane. Drag (`left_click_drag`) across the ruler to the x of 8 s and release outside the ruler: the readout follows and no scrub continues after release (move the pointer afterwards; the time must not change). Expected: playhead tracks the pointer, no stuck drag.

- [ ] **Step 4: Zoom keeps the anchor.** Dispatch a `WheelEvent` with `ctrlKey: true` on the container at the x of 4 s (negative `deltaY`, e.g. -200, several times), then confirm the time under that same screen x is still 4 s within 0.05 s and the page itself did not zoom (`visualViewport.scale` unchanged). Zoom back out with positive `deltaY` and confirm the zoom clamps (chip widths stop changing at the limits). Expected: anchor fixed, no page zoom.

- [ ] **Step 5: Selection.** Click the first chip: `aria-pressed="true"` on it only. Shift-click the second: both pressed. Shift-click the first again: only the second. Click empty lane space: none pressed. Click the first chip and confirm the playhead did not move (a chip click is not a scrub). Select a chip then use the page's "Delete" button: the chip disappears and nothing stays selected.

- [ ] **Step 6: Track controls.** Click the Mute (`M`) button on the video track header: `aria-pressed` true and the project's `tracks[].muted` true (read from `window.__playbackHarness.getProject()`); click again to restore. Click Hide (`H`): chips on that track dim and the preview canvas goes black; restore. Expected: store and UI agree.

- [ ] **Step 7: Keys.** Click the page background (not an input). Press Space: playback starts; press Space again: it stops. Press ArrowRight: time advances by 1/30 s; ArrowLeft goes back. Press End then Home: time becomes the project length, then 0. Make an edit with the page's Speed select, then press Ctrl+Z: the speed returns. Then click into the "Add from URL" text box and press Space, ArrowLeft and Ctrl+Z: playback must not toggle, time must not change, and the project must not undo. Expected: shortcuts work on the body and never inside inputs; the page does not scroll on Space.

- [ ] **Step 8: Following the playhead.** Zoom in until the project is wider than the view, seek to 0, play for about 6 s: the view pages forward and the playhead stays visible; pause. Expected: playhead never leaves the visible lane area while playing.

- [ ] **Step 9: Many clips.** Split repeatedly (select a chip, seek, click "Split at playhead") until at least 100 chips exist, then scroll and zoom: no console errors, `requestAnimationFrame` stays above 30 per second while scrolling, and chip counts in the DOM equal the clip count in the project. Expected: smooth enough at 100 clips.

- [ ] **Step 10: Lifecycle.** Reload the page twice: exactly one `window.__playbackHarness`, no console errors or warnings, and pressing Space once toggles playback once (a duplicate window listener would toggle twice and appear to do nothing). Expected: single listener.

- [ ] **Step 11: Record and clean up.** Save one or two screenshots (timeline with several chips and the playhead) and send them to the user with `SendUserFile`. Close the Chrome tab and stop the dev server. Write the results of Steps 2 to 10 into the final report as a table of check, expected, observed, pass/fail. Fix any failure test-first, then run the full test suite, `npx tsc --noEmit`, and `npx eslint src/lib/timeline-ui src/components/clip-timeline src/components/playback`, and commit each fix with a message naming it.

---

### Task 6: Whole-branch checks

- [ ] **Step 1: Everything green.** Run `npm test`, `npx tsc --noEmit`, and `npx eslint src/lib/timeline-ui src/components/clip-timeline src/components/playback`. Expected: all pass, no errors.

- [ ] **Step 2: Pure modules stayed pure.** Run `grep -rnE "document\.|window\.|requestAnimationFrame|setTimeout|setInterval|performance\.|Date\.now" src/lib/timeline-ui --include=*.ts --exclude=*.test.ts`. Expected: no output.

- [ ] **Step 3: Nothing outside the plan changed.** Run `git diff --stat main -- src ':!src/lib/timeline-ui' ':!src/components/clip-timeline'`. Expected: only `src/components/playback/playback-harness.tsx`.

- [ ] **Step 4: Production build.** Stop the dev server, delete `.next/dev` if a stale types file breaks the type check (it is generated), run `npm run build`. Expected: exit 0.

---

## Self-Review

**Spec coverage (section 6, the part this plan owns):**

| Requirement | Task |
|---|---|
| Overlay above main, audio below; track headers with mute, lock, hide, solo | 2 (layout), 4 (headers) |
| Clips as labelled chips (text and sticker show a label) | 2 (`clipLabel`), 4 |
| Draggable playhead; clicking the ruler seeks | 2 (`pointerToTime`), 4, 5 Step 3 |
| Ctrl + wheel zoom | 1 (`zoomAround`), 4, 5 Step 4 |
| Space plays and pauses; arrow keys step one frame | 3, 4, 5 Step 7 |
| Click and shift-click selection | 3, 4, 5 Step 5 |
| Playhead stays in view during playback | 2, 4, 5 Step 8 |
| Undo/redo keys (not in the spec list, but cheap and expected) | 3, 4, 5 Step 7 |

**Left for later plans:** dragging to move and trim, snapping, magnetic reorder with an insertion marker, drag-to-create track, marquee and the split/delete/duplicate keys, drag from the Media panel (4b); thumbnail strips and waveforms (4c). Mounting in the real editor page happens when scrapbook features are ported (spec step 5).

**Gaps accepted:** the React components have no unit tests (no component test setup in the repo); Task 5 is their test, and the logic that decides behaviour lives in the tested pure modules.

**Placeholder scan:** none; every code step shows code.

**Type consistency:** `TimelineView` props match the harness mount; `clipRect` takes a `TrackRow` and the view passes `{ ...row, y: 0 }`; `nextSelection` and `commandForKey` signatures match their use; `ClipChip` takes `rect: ClipRect`.

**Review Focus coverage:** scrub and zoom (Task 5 Steps 3 and 4), alignment (Step 2), keyboard (Step 7), listener lifecycle (Step 10), selection consistency (Step 5), many clips (Step 9).

## Execution Handoff

Before Task 5, enable the Claude in Chrome extension and bring that Chrome window to the front and keep it uncovered while checks run.

