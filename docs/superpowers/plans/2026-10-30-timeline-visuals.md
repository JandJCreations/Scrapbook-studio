# Timeline UI, Part 3: Thumbnails and Waveforms (plan 4c)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make clips on the timeline look like what they contain. Video clips show a strip of small frames taken from the part of the file the clip actually plays, picture clips show the picture, and audio clips show their waveform. The frames and waveforms load in the background, never block dragging or playback, and only the part of a long clip that is on screen is drawn.

**Architecture:** All decisions are pure, unit-tested functions in `src/lib/timeline-ui/` (`visuals.ts`: which source time each tile shows, which tiles are visible, the waveform bars for a clip's trimmed range). Two small, dependency-injected services own the slow work: a thumbnail service (serial queue, cache with a size limit, dedupe, failure handling) and a waveform service (decode once per file, dedupe, failure handling). Their browser parts (a reusable hidden video element that seeks and draws frames; audio decoding) live in one file, `browser-media.ts`, the only file in `src/lib/timeline-ui/` allowed to touch browser APIs. A new `ClipVisuals` component renders tiles and an SVG waveform inside each chip and re-renders itself when a service has something new, so chips stay memoised. The test page gets a "Add sample tone" button (a tone generated in plain code, no FFmpeg) so audio clips can be seen and checked.

**Tech Stack:** TypeScript (strict), Vitest with the jsdom component-test setup from plan 4b, React 19, Tailwind. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-clip-timeline-design.md`, section 6: "Video clips show a thumbnail strip; audio clips show waveforms (existing `waveform.ts`); text and sticker clips show a labelled chip."

**Not in this plan (and why):**
- Keeping thumbnails between sessions (IndexedDB) or generating lower-resolution proxy files: later, only if loading proves slow on real projects.
- Waveforms for the sound inside video clips: the spec puts waveforms on audio clips.
- Hover previews and thumbnails while a drag is in progress beyond what already shows: not needed for the goal.
- Mounting the visuals in the real editor page: the real editor still runs on the old model; this happens in the "port scrapbook features" step. The component takes an optional `visuals` prop so it works with or without them.

**Decisions made here (the builder's calls):**
- Frames are 160 pixels wide JPEGs (a few KB each), kept in memory only, at most 400 at a time (oldest dropped first).
- A frame is taken at the nearest half second of the source, so zooming in and out reuses the same frames instead of re-extracting.
- One tile per 16:9 of chip height; a clip never gets more than 60 tiles (they stretch beyond that).
- Newest request first: after a fast scroll, what is on screen loads before what scrolled past.
- A file that fails twice with no success is given up on and its clips show as plain coloured chips (no retry loop).
- The waveform is an SVG path, not a canvas, so it scales with the chip and can be tested in jsdom.

## Global Constraints

- Work on branch `feature/timeline-visuals` (already created from `main`; the plan is its first commit). Never commit to `main`.
- AGENTS.md says this is not the Next.js you know. This plan adds no routes; it changes client components and plain TypeScript. If a task needs a Next API, read `node_modules/next/dist/docs/` first.
- Files in `src/lib/timeline-ui/` other than `browser-media.ts` and `*.test.ts` must pass: `grep -rnE "document\.|window\.|requestAnimationFrame|setTimeout|setInterval|performance\.|Date\.now|new Audio|new Image" src/lib/timeline-ui --include=*.ts --exclude=*.test.ts --exclude=browser-media.ts` with no output.
- Existing files this plan may change: `src/components/clip-timeline/clip-chip.tsx`, `timeline-view.tsx`, `src/components/playback/playback-harness.tsx`, `src/lib/timeline-ui/index.ts`. Existing helpers are only imported, never edited: `src/lib/audio/waveform.ts` (`computeWaveformPeaks`) and `src/lib/audio/decode-audio.ts` (`decodeAudioFile`).
- Elements that load remote media set `crossOrigin = "anonymous"` before `src`, or drawing them taints the canvas and `toDataURL` throws.
- Nothing in this plan may make a drag or playback wait for a thumbnail or waveform.
- Run tests with `npx vitest run <file>`; type-check with `npx tsc --noEmit`; lint with `npx eslint <paths>`. If `node` is not found, run `export PATH="$PATH:/c/Program Files/nodejs"` (bash) or `$env:Path += ";C:\Program Files\nodejs"` (PowerShell). Start shell commands with an absolute `cd` into the repo.
- Write files with the Write/Edit tools; Python is not installed. Avoid large shell heredocs (an earlier one failed to parse); use the Write tool for multi-line files.
- Component test files start with `// @vitest-environment jsdom` and `import "@/test/dom-setup";`.
- End every commit message with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (second `-m`).
- Chrome work (Task 5): read the `anthropic-skills:chrome-browser` skill first; use a new tab; if `list_connected_browsers` is empty, stop and ask the user to enable Claude in Chrome and bring that window to the front. A covered window throttles `requestAnimationFrame` to about 2 fps; thumbnails and waveforms do not depend on it, but measure it before trusting any playback result.

## Review Focus

- **Right frame in the right place:** each tile shows the source frame at the time its centre represents, including on trimmed, reversed and sped-up clips. The test clips have a running number burned into the picture, so this can be read straight off the screen.
- **Bounded work and memory:** the cache never grows past its limit; scrolling quickly never queues unbounded work or extracts frames for tiles long gone; a 60-clip project does not start 60 extractions at once.
- **Never blocks the editor:** a slow or failing file never delays dragging, scrubbing or playback; failures show a plain chip once and are not retried in a loop.
- **Lifecycle:** unmounting while extractions or decodes are running leaves no video element, timer, listener or pending update (check with the timeline unmounted mid-extraction and with React StrictMode's double mount).
- **Cross-origin media:** a remote clip without CORS fails cleanly (no thrown error escaping, no tainted-canvas exception) and shows a plain chip.
- **Long files:** a long audio file does not freeze the page while decoding, and its waveform is computed once per file however many clips use it.
- **Memoisation:** scrolling a long timeline does not re-render every chip on every scroll event.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/timeline-ui/visuals.ts` | Tile layout, visible-range windows, waveform bars and path (pure) |
| `src/lib/timeline-ui/thumbnail-service.ts` | Frame cache, queue and dedupe over an injected extractor (pure of the browser) |
| `src/lib/timeline-ui/waveform-service.ts` | Peaks cache and dedupe over an injected loader |
| `src/lib/timeline-ui/tone-wav.ts` | A generated sample tone as WAV bytes |
| `src/lib/timeline-ui/browser-media.ts` | The real frame extractor and peaks loader (browser only) |
| `src/components/clip-timeline/clip-visuals.tsx` | Tiles, picture and waveform inside a chip |
| `src/components/clip-timeline/clip-visuals.test.tsx` | Component tests |
| `src/components/clip-timeline/clip-chip.tsx`, `timeline-view.tsx` | Modified: pass visuals and the visible window |
| `src/components/playback/playback-harness.tsx` | Modified: create the services, add the tone button |

Each `*.test.ts` sits beside the file it tests.

---

### Task 1: Visuals maths (pure)

**Files:**
- Create: `src/lib/timeline-ui/visuals.ts`
- Test: `src/lib/timeline-ui/visuals.test.ts`

**Interfaces:**
- Consumes: `clipDuration` (`@/lib/timeline/clip-math`); `Clip` (`@/types/timeline`).
- Produces:
  - `THUMB_ASPECT = 16 / 9`, `MAX_TILES_PER_CLIP = 60`, `THUMB_TIME_STEP = 0.5`, `VISIBLE_PAGE_PX = 256`
  - `tileWidth(chipHeight: number): number` = `max(24, round(chipHeight * THUMB_ASPECT))`
  - `sourceTimeAt(clip, local: number): number`: the source time shown `local` seconds after the clip starts: `sourceIn + local * speed`, or `sourceOut - local * speed` when reversed, clamped to `[sourceIn, sourceOut]`.
  - `quantizeTime(time: number, step = THUMB_TIME_STEP): number` (nearest multiple of `step`, rounded to 6 decimals)
  - `interface ThumbTile { index: number; x: number; width: number; sourceTime: number }` (`x` and `width` in pixels from the clip's left edge)
  - `thumbnailTiles(clip, pps, chipHeight): ThumbTile[]`: `count = min(MAX_TILES_PER_CLIP, max(1, ceil(clipWidth / tileWidth)))` tiles of equal width covering the clip; tile `i`'s `sourceTime` is `sourceTimeAt(clip, ((i + 0.5) * tileW) / pps)`.
  - `visibleTiles(tiles, from, to): ThumbTile[]`: tiles that overlap `[from, to)` (both measured from the clip's left edge).
  - `viewWindow(scrollLeft, viewportWidth): { from: number; to: number }`: the visible lane range widened by one page and rounded outward to multiples of `VISIBLE_PAGE_PX` (`from = floor(max(0, scrollLeft - PAGE) / PAGE) * PAGE`, `to = ceil((scrollLeft + viewportWidth + PAGE) / PAGE) * PAGE`), so scrolling changes it only once per page.
  - `waveformBars(peaks: number[], clip: Clip, barCount: number): number[]`: bar heights from 0 to 1 for the clip's source range. `peaks` cover the whole file (`clip.sourceDuration` seconds); the slice is `[sourceIn, sourceOut]`; a reversed clip is mirrored; the slice is reduced to `barCount` bars by taking the maximum of each bucket (if the slice has fewer peaks than bars, each bar takes the peak under it). Returns `[]` when `peaks` is empty, `clip.sourceDuration` is `null` or not positive, or `barCount < 1`. Values are clamped to 0..1.
  - `waveformPath(bars: number[], height = 100): string`: one vertical stroke per bar centred on `height / 2`, with half-length `max(1, bar * height / 2)`, written `M{i + 0.5} {top}V{bottom}` for bar `i` (numbers rounded to 2 decimals); `""` for no bars.

- [ ] **Step 1: Write the failing test**

`src/lib/timeline-ui/visuals.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  MAX_TILES_PER_CLIP,
  quantizeTime,
  sourceTimeAt,
  thumbnailTiles,
  tileWidth,
  viewWindow,
  visibleTiles,
  waveformBars,
  waveformPath,
} from "@/lib/timeline-ui/visuals";
import { makeClip } from "@/lib/timeline/test-utils";

const clip = (extra = {}) =>
  makeClip({ start: 0, sourceIn: 2, sourceOut: 8, sourceDuration: 10, speed: 1, ...extra });

describe("tileWidth", () => {
  it("is a 16:9 frame at chip height, never narrower than 24 px", () => {
    expect(tileWidth(60)).toBe(107);
    expect(tileWidth(10)).toBe(24);
  });
});

describe("sourceTimeAt", () => {
  it("moves forward through the source at the clip's speed", () => {
    expect(sourceTimeAt(clip(), 0)).toBe(2);
    expect(sourceTimeAt(clip(), 3)).toBe(5);
    expect(sourceTimeAt(clip({ speed: 2, sourceOut: 8 }), 1)).toBe(4);
  });

  it("moves backward from the end when reversed", () => {
    expect(sourceTimeAt(clip({ reversed: true }), 0)).toBe(8);
    expect(sourceTimeAt(clip({ reversed: true }), 3)).toBe(5);
  });

  it("stays inside the trimmed range", () => {
    expect(sourceTimeAt(clip(), 99)).toBe(8);
    expect(sourceTimeAt(clip({ reversed: true }), 99)).toBe(2);
    expect(sourceTimeAt(clip(), -5)).toBe(2);
  });
});

describe("quantizeTime", () => {
  it("snaps to the nearest half second without float noise", () => {
    expect(quantizeTime(2.24)).toBe(2);
    expect(quantizeTime(2.26)).toBe(2.5);
    expect(quantizeTime(0.1 + 0.2)).toBe(0.5);
    expect(quantizeTime(7.3, 1)).toBe(7);
  });
});

describe("thumbnailTiles", () => {
  it("covers the clip with equal tiles, each showing the source time at its centre", () => {
    // 6 s at 60 px/s = 360 px; tiles are 107 px, so 4 tiles of 90 px.
    const tiles = thumbnailTiles(clip(), 60, 60);
    expect(tiles).toHaveLength(4);
    expect(tiles.map((t) => t.x)).toEqual([0, 90, 180, 270]);
    expect(tiles.every((t) => t.width === 90)).toBe(true);
    expect(tiles.map((t) => t.sourceTime)).toEqual([2.75, 4.25, 5.75, 7.25]);
  });

  it("shows later source first when reversed, and skips ahead when sped up", () => {
    const reversed = thumbnailTiles(clip({ reversed: true }), 60, 60).map((t) => t.sourceTime);
    expect(reversed).toEqual([7.25, 5.75, 4.25, 2.75]);
    // Speed 2: the same 6 s of source plays in 3 s, so 180 px and 2 tiles.
    const fast = thumbnailTiles(clip({ speed: 2 }), 60, 60);
    expect(fast).toHaveLength(2);
    expect(fast[0].sourceTime).toBeCloseTo(2 + 0.75 * 2, 9);
  });

  it("makes one tile for a very short clip and caps the count for a very long one", () => {
    expect(thumbnailTiles(clip({ sourceIn: 0, sourceOut: 0.2 }), 60, 60)).toHaveLength(1);
    const long = thumbnailTiles(clip({ sourceIn: 0, sourceOut: 600, sourceDuration: 600 }), 100, 60);
    expect(long).toHaveLength(MAX_TILES_PER_CLIP);
    expect(long[long.length - 1].x + long[long.length - 1].width).toBeCloseTo(600 * 100, 6);
  });
});

describe("visibleTiles", () => {
  const tiles = thumbnailTiles(clip(), 60, 60); // x 0, 90, 180, 270 (width 90)

  it("keeps the tiles that overlap the range", () => {
    expect(visibleTiles(tiles, 100, 200).map((t) => t.index)).toEqual([1, 2]);
    expect(visibleTiles(tiles, 0, 1).map((t) => t.index)).toEqual([0]);
  });

  it("drops tiles that only touch the range or lie outside it", () => {
    expect(visibleTiles(tiles, 90, 180).map((t) => t.index)).toEqual([1]);
    expect(visibleTiles(tiles, 400, 900)).toEqual([]);
    expect(visibleTiles(tiles, -500, -1)).toEqual([]);
  });
});

describe("viewWindow", () => {
  it("widens by a page and rounds outward to whole pages", () => {
    expect(viewWindow(0, 800)).toEqual({ from: 0, to: 1280 });
    expect(viewWindow(1000, 800)).toEqual({ from: 512, to: 2304 });
  });

  it("changes only once per page of scrolling", () => {
    expect(viewWindow(1000, 800)).toEqual(viewWindow(1010, 800));
    expect(viewWindow(1000, 800)).not.toEqual(viewWindow(1300, 800));
  });
});

describe("waveformBars", () => {
  // 10 peaks for a 10 s file: peak i covers second i.
  const peaks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

  it("takes the clip's trimmed slice of the file", () => {
    // sourceIn 2 .. sourceOut 8 = peaks 2..7
    expect(waveformBars(peaks, clip(), 6)).toEqual([0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
  });

  it("reduces many peaks to fewer bars by taking each bucket's maximum", () => {
    expect(waveformBars(peaks, clip(), 3)).toEqual([0.3, 0.5, 0.7]);
  });

  it("mirrors a reversed clip", () => {
    expect(waveformBars(peaks, clip({ reversed: true }), 6)).toEqual([0.7, 0.6, 0.5, 0.4, 0.3, 0.2]);
  });

  it("gives every bar a value when there are fewer peaks than bars", () => {
    const bars = waveformBars([0.5, 1], clip({ sourceIn: 0, sourceOut: 10 }), 4);
    expect(bars).toEqual([0.5, 0.5, 1, 1]);
  });

  it("returns nothing it cannot draw and clamps values to 0..1", () => {
    expect(waveformBars([], clip(), 4)).toEqual([]);
    expect(waveformBars(peaks, clip({ sourceDuration: null }), 4)).toEqual([]);
    expect(waveformBars(peaks, clip(), 0)).toEqual([]);
    expect(waveformBars([3, -1, 0.5], clip({ sourceIn: 0, sourceOut: 3, sourceDuration: 3 }), 3)).toEqual([
      1, 0, 0.5,
    ]);
  });
});

describe("waveformPath", () => {
  it("draws one centred vertical stroke per bar", () => {
    expect(waveformPath([1, 0.5], 100)).toBe("M0.5 0V100M1.5 25V75");
  });

  it("keeps silence visible as a thin line and is empty for no bars", () => {
    expect(waveformPath([0], 100)).toBe("M0.5 49V51");
    expect(waveformPath([])).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui/visuals.test.ts`
Expected: FAIL; `@/lib/timeline-ui/visuals` cannot be resolved.

- [ ] **Step 3: Implement**

`src/lib/timeline-ui/visuals.ts`:

```ts
import { clipDuration } from "@/lib/timeline/clip-math";
import type { Clip } from "@/types/timeline";

export const THUMB_ASPECT = 16 / 9;
export const MAX_TILES_PER_CLIP = 60;
/** Frames are taken at multiples of this many seconds, so zooming reuses them. */
export const THUMB_TIME_STEP = 0.5;
export const VISIBLE_PAGE_PX = 256;

const MIN_TILE_WIDTH = 24;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round6 = (n: number) => Number(n.toFixed(6));

export function tileWidth(chipHeight: number): number {
  return Math.max(MIN_TILE_WIDTH, Math.round(chipHeight * THUMB_ASPECT));
}

/** The source time on screen `local` seconds after the clip starts, kept inside the trim. */
export function sourceTimeAt(clip: Clip, local: number): number {
  const raw = clip.reversed
    ? clip.sourceOut - local * clip.speed
    : clip.sourceIn + local * clip.speed;
  return Math.min(Math.max(raw, clip.sourceIn), clip.sourceOut);
}

export function quantizeTime(time: number, step: number = THUMB_TIME_STEP): number {
  return round6(Math.round(time / step) * step);
}

export interface ThumbTile {
  index: number;
  /** Pixels from the clip's left edge. */
  x: number;
  width: number;
  sourceTime: number;
}

export function thumbnailTiles(clip: Clip, pps: number, chipHeight: number): ThumbTile[] {
  const clipWidth = clipDuration(clip) * pps;
  const count = Math.min(MAX_TILES_PER_CLIP, Math.max(1, Math.ceil(clipWidth / tileWidth(chipHeight))));
  const width = clipWidth / count;
  return Array.from({ length: count }, (_, index) => ({
    index,
    x: index * width,
    width,
    sourceTime: sourceTimeAt(clip, ((index + 0.5) * width) / pps),
  }));
}

/** Tiles overlapping `[from, to)`, both measured from the clip's left edge. */
export function visibleTiles(tiles: ThumbTile[], from: number, to: number): ThumbTile[] {
  return tiles.filter((tile) => tile.x + tile.width > from && tile.x < to);
}

/**
 * The lane range worth drawing: the visible range plus one page each side,
 * rounded outward, so it only changes once per page of scrolling.
 */
export function viewWindow(scrollLeft: number, viewportWidth: number): { from: number; to: number } {
  const page = VISIBLE_PAGE_PX;
  return {
    from: Math.floor(Math.max(0, scrollLeft - page) / page) * page,
    to: Math.ceil((scrollLeft + viewportWidth + page) / page) * page,
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Bar heights (0 to 1) for the part of the file this clip plays. */
export function waveformBars(peaks: number[], clip: Clip, barCount: number): number[] {
  const total = clip.sourceDuration;
  if (peaks.length === 0 || total === null || !(total > 0) || barCount < 1) return [];

  const first = Math.min(peaks.length - 1, Math.floor((clip.sourceIn / total) * peaks.length));
  const last = Math.max(first + 1, Math.min(peaks.length, Math.ceil((clip.sourceOut / total) * peaks.length)));
  const slice = peaks.slice(first, last);

  const bars: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const from = Math.floor((i * slice.length) / barCount);
    const to = Math.max(from + 1, Math.floor(((i + 1) * slice.length) / barCount));
    let max = 0;
    for (let j = from; j < Math.min(to, slice.length); j++) max = Math.max(max, slice[j]);
    bars.push(clamp01(max));
  }
  return clip.reversed ? bars.reverse() : bars;
}

/** One vertical stroke per bar, centred; silence stays a thin visible line. */
export function waveformPath(bars: number[], height = 100): string {
  const mid = height / 2;
  return bars
    .map((bar, i) => {
      const half = Math.max(1, (bar * height) / 2);
      return `M${round2(i + 0.5)} ${round2(mid - half)}V${round2(mid + half)}`;
    })
    .join("");
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui/visuals.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors. If a numeric expectation is off by a rounding detail (for example in `waveformBars` bucket boundaries), work the arithmetic by hand, decide whether the test or the implementation is wrong, fix it, and ledger a Ruling. The 10-peak, 6-bar and 3-bar cases above were worked out by hand: slice = peaks 2..7 (6 values), 3 bars take pairs `[0.2,0.3] [0.4,0.5] [0.6,0.7]`, maxima `0.3, 0.5, 0.7`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/timeline-ui/visuals.ts src/lib/timeline-ui/visuals.test.ts
git commit -m "feat: add pure thumbnail tile and waveform maths for the timeline" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Thumbnail service

**Files:**
- Create: `src/lib/timeline-ui/thumbnail-service.ts`
- Test: `src/lib/timeline-ui/thumbnail-service.test.ts`

**Interfaces:**
- Consumes: `quantizeTime`, `THUMB_TIME_STEP` (Task 1).
- Produces:
  - `interface FrameExtractor { frame(url: string, time: number): Promise<string>; dispose(): void }` (resolves with an image URL, normally a data URL)
  - `interface ThumbnailService { get(mediaId: string, time: number): string | null; failed(mediaId: string): boolean; subscribe(listener: () => void): () => void; getVersion(): number; invalidate(mediaId: string): void; dispose(): void }`
  - `createThumbnailService(options: { urlFor(mediaId: string): string | null; extractor: FrameExtractor; maxEntries?: number })` (default 400).
  - Behaviour:
    - `get` quantizes `time`. A cached frame is returned (and marked recently used). A missing one returns `null` and is queued; the same frame is never queued twice, and asking again for a queued frame moves it to the front. Without a URL for the media, nothing is queued.
    - One extraction runs at a time, **newest request first**.
    - On success the frame is stored, the version increments and subscribers are notified (once per frame); the oldest entry is dropped when the cache exceeds `maxEntries`.
    - On failure that frame is remembered as failed and never retried. A media with **two failures and no success** is given up on: `failed(mediaId)` is true and `get` queues nothing more for it (frames already cached are still returned). `invalidate(mediaId)` forgets that media's frames, failures and queue entries.
    - `dispose` empties the queue, ignores any extraction still running, stops notifying, disposes the extractor, and makes later calls return `null`.
    - `subscribe` returns an unsubscribe function. `getVersion` is the snapshot for `useSyncExternalStore`.

- [ ] **Step 1: Write the failing test**

`src/lib/timeline-ui/thumbnail-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  createThumbnailService,
  type FrameExtractor,
} from "@/lib/timeline-ui/thumbnail-service";

/** An extractor the test finishes by hand, one request at a time. */
function fakeExtractor() {
  const calls: Array<{
    url: string;
    time: number;
    resolve: (frame: string) => void;
    reject: (error: Error) => void;
  }> = [];
  const state = { disposed: false };
  const extractor: FrameExtractor = {
    frame: (url, time) =>
      new Promise((resolve, reject) => {
        calls.push({ url, time, resolve, reject });
      }),
    dispose: () => {
      state.disposed = true;
    },
  };
  return { extractor, calls, state };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(options: { maxEntries?: number; urls?: Record<string, string | null> } = {}) {
  const fake = fakeExtractor();
  const urls = options.urls ?? { m: "blob:m", n: "blob:n" };
  const service = createThumbnailService({
    urlFor: (id) => urls[id] ?? null,
    extractor: fake.extractor,
    maxEntries: options.maxEntries,
  });
  const notified = { count: 0 };
  service.subscribe(() => {
    notified.count += 1;
  });
  return { service, ...fake, notified };
}

describe("createThumbnailService", () => {
  it("returns null, queues one extraction at the nearest half second, then serves the frame", async () => {
    const { service, calls, notified } = setup();
    expect(service.get("m", 2.2)).toBeNull();
    expect(service.get("m", 2.1)).toBeNull(); // same frame: not queued twice
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "blob:m", time: 2 });

    calls[0].resolve("data:frame-2");
    await flush();
    expect(service.get("m", 2.2)).toBe("data:frame-2");
    expect(service.getVersion()).toBe(1);
    expect(notified.count).toBe(1);
  });

  it("runs one extraction at a time, newest request first", async () => {
    const { service, calls } = setup();
    service.get("m", 1);
    service.get("m", 2);
    service.get("m", 3);
    expect(calls.map((c) => c.time)).toEqual([1]); // the first started immediately
    calls[0].resolve("a");
    await flush();
    expect(calls.map((c) => c.time)).toEqual([1, 3]); // then the newest, not the oldest
    calls[1].resolve("b");
    await flush();
    expect(calls.map((c) => c.time)).toEqual([1, 3, 2]);
  });

  it("moves a frame that is asked for again to the front of the queue", async () => {
    const { service, calls } = setup();
    service.get("m", 1);
    service.get("m", 2);
    service.get("m", 3);
    service.get("m", 2); // asked for again after the user scrolled back
    calls[0].resolve("a");
    await flush();
    expect(calls.map((c) => c.time)).toEqual([1, 2]);
  });

  it("queues nothing for a media that has no URL", () => {
    const { service, calls } = setup({ urls: { m: null } });
    expect(service.get("m", 1)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("drops the oldest frame past its limit", async () => {
    const { service, calls } = setup({ maxEntries: 2 });
    for (const t of [1, 2, 3]) {
      service.get("m", t);
      calls[calls.length - 1].resolve(`frame-${t}`);
      await flush();
    }
    expect(service.get("m", 2)).toBe("frame-2");
    expect(service.get("m", 3)).toBe("frame-3");
    expect(service.get("m", 1)).toBeNull(); // evicted, queued again
  });

  it("remembers a failed frame and does not retry it", async () => {
    const { service, calls, notified } = setup();
    service.get("m", 1);
    calls[0].reject(new Error("seek failed"));
    await flush();
    service.get("m", 1);
    expect(calls).toHaveLength(1);
    expect(service.failed("m")).toBe(false); // one failure is not enough to give up
    expect(notified.count).toBe(0);
  });

  it("gives up on a media after two failures with no success", async () => {
    const { service, calls } = setup();
    service.get("m", 1);
    calls[0].reject(new Error("bad"));
    await flush();
    service.get("m", 2);
    calls[1].reject(new Error("bad"));
    await flush();
    expect(service.failed("m")).toBe(true);
    service.get("m", 3);
    expect(calls).toHaveLength(2);
  });

  it("keeps trying a media that has produced a frame", async () => {
    const { service, calls } = setup();
    service.get("m", 1);
    calls[0].resolve("ok");
    await flush();
    service.get("m", 2);
    calls[1].reject(new Error("one bad seek"));
    await flush();
    service.get("m", 3);
    calls[2].reject(new Error("another"));
    await flush();
    expect(service.failed("m")).toBe(false);
  });

  it("forgets everything about a media on invalidate", async () => {
    const { service, calls } = setup();
    service.get("m", 1);
    calls[0].resolve("old");
    await flush();
    service.invalidate("m");
    expect(service.get("m", 1)).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("stops everything on dispose, even for an extraction still running", async () => {
    const { service, calls, state, notified } = setup();
    service.get("m", 1);
    service.get("m", 2);
    service.dispose();
    expect(state.disposed).toBe(true);
    calls[0].resolve("late");
    await flush();
    expect(calls).toHaveLength(1); // nothing new started
    expect(notified.count).toBe(0);
    expect(service.get("m", 1)).toBeNull();
  });

  it("stops notifying an unsubscribed listener", async () => {
    const fake = fakeExtractor();
    const service = createThumbnailService({ urlFor: () => "blob:x", extractor: fake.extractor });
    let heard = 0;
    const off = service.subscribe(() => {
      heard += 1;
    });
    service.get("m", 1);
    off();
    fake.calls[0].resolve("a");
    await flush();
    expect(heard).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui/thumbnail-service.test.ts`
Expected: FAIL; module cannot be resolved.

- [ ] **Step 3: Implement**

`src/lib/timeline-ui/thumbnail-service.ts`:

```ts
import { quantizeTime } from "@/lib/timeline-ui/visuals";

export interface FrameExtractor {
  /** Resolves with an image URL (normally a data URL) for the frame at `time`. */
  frame(url: string, time: number): Promise<string>;
  dispose(): void;
}

export interface ThumbnailService {
  /** The cached frame, or null (and a request is queued) when it is not there yet. */
  get(mediaId: string, time: number): string | null;
  failed(mediaId: string): boolean;
  subscribe(listener: () => void): () => void;
  /** Changes whenever a new frame arrives; the snapshot for useSyncExternalStore. */
  getVersion(): number;
  invalidate(mediaId: string): void;
  dispose(): void;
}

const DEFAULT_MAX_ENTRIES = 400;
const GIVE_UP_AFTER_FAILURES = 2;

interface Job {
  key: string;
  mediaId: string;
  time: number;
}

export function createThumbnailService(options: {
  urlFor(mediaId: string): string | null;
  extractor: FrameExtractor;
  maxEntries?: number;
}): ThumbnailService {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const frames = new Map<string, string>(); // insertion order = least recently used first
  const failedKeys = new Set<string>();
  const failureCount = new Map<string, number>();
  const hasSucceeded = new Set<string>();
  const listeners = new Set<() => void>();
  let queue: Job[] = []; // the end is the newest request
  let running: Job | null = null;
  let version = 0;
  let disposed = false;

  const keyOf = (mediaId: string, time: number) => `${mediaId}@${time}`;
  const givenUp = (mediaId: string) =>
    !hasSucceeded.has(mediaId) && (failureCount.get(mediaId) ?? 0) >= GIVE_UP_AFTER_FAILURES;

  function notify() {
    for (const listener of Array.from(listeners)) listener();
  }

  function pump() {
    if (disposed || running || queue.length === 0) return;
    const job = queue.pop()!;
    const url = options.urlFor(job.mediaId);
    if (url === null || givenUp(job.mediaId)) {
      pump();
      return;
    }
    running = job;
    options.extractor.frame(url, job.time).then(
      (frame) => {
        if (disposed || running !== job) return;
        running = null;
        failedKeys.delete(job.key);
        hasSucceeded.add(job.mediaId);
        frames.set(job.key, frame);
        while (frames.size > maxEntries) frames.delete(frames.keys().next().value as string);
        version += 1;
        notify();
        pump();
      },
      () => {
        if (disposed || running !== job) return;
        running = null;
        failedKeys.add(job.key);
        failureCount.set(job.mediaId, (failureCount.get(job.mediaId) ?? 0) + 1);
        pump();
      },
    );
  }

  return {
    get(mediaId, time) {
      if (disposed) return null;
      const q = quantizeTime(time);
      const key = keyOf(mediaId, q);
      const cached = frames.get(key);
      if (cached !== undefined) {
        frames.delete(key); // touch: now the most recently used
        frames.set(key, cached);
        return cached;
      }
      if (failedKeys.has(key) || givenUp(mediaId) || options.urlFor(mediaId) === null) return null;
      if (running?.key === key) return null;
      queue = queue.filter((job) => job.key !== key); // asked again: move to the front
      queue.push({ key, mediaId, time: q });
      pump();
      return null;
    },

    failed: (mediaId) => givenUp(mediaId),

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getVersion: () => version,

    invalidate(mediaId) {
      const prefix = `${mediaId}@`;
      for (const key of Array.from(frames.keys())) if (key.startsWith(prefix)) frames.delete(key);
      for (const key of Array.from(failedKeys)) if (key.startsWith(prefix)) failedKeys.delete(key);
      queue = queue.filter((job) => job.mediaId !== mediaId);
      failureCount.delete(mediaId);
      hasSucceeded.delete(mediaId);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      queue = [];
      running = null;
      listeners.clear();
      frames.clear();
      options.extractor.dispose();
    },
  };
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui/thumbnail-service.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors. One expectation to check by hand if it fails: in "runs one extraction at a time", the first `get` starts immediately (`pump` runs inside `get`), so after three `get` calls `calls` holds only time 1; after it resolves, `queue.pop()` takes the newest (3), then 2.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/timeline-ui/thumbnail-service.ts src/lib/timeline-ui/thumbnail-service.test.ts
git commit -m "feat: add the timeline thumbnail service (queue, cache, dedupe, give-up)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Waveform service, sample tone, and the browser adapters

**Files:**
- Create: `src/lib/timeline-ui/waveform-service.ts`, `src/lib/timeline-ui/tone-wav.ts`, `src/lib/timeline-ui/browser-media.ts`
- Test: `src/lib/timeline-ui/waveform-service.test.ts`, `src/lib/timeline-ui/tone-wav.test.ts`

**Interfaces:**
- Produces:
  - `interface WaveformService { get(mediaId: string): number[] | null; failed(mediaId: string): boolean; subscribe(listener: () => void): () => void; getVersion(): number; invalidate(mediaId: string): void; dispose(): void }`
  - `createWaveformService(options: { urlFor(mediaId: string): string | null; loadPeaks(url: string): Promise<number[]> })`. `get` returns the cached peaks, or `null` and starts **one** load per media (never two at once; no retry after a failure until `invalidate`). Success stores the peaks, increments the version and notifies. A media without a URL starts nothing. `dispose` ignores loads still running and stops notifying.
  - `makeToneWav(options: { seconds: number; hz: number; sampleRate?: number }): Uint8Array` (default 8000 Hz): a 16-bit mono PCM WAV (44-byte header then samples) of a sine whose volume rises from 10% at the start to 100% in the middle and falls back to 10% at the end, so its waveform has a visible shape.
  - In `browser-media.ts`: `createVideoFrameExtractor(): FrameExtractor` and `loadPeaksFromUrl(url: string): Promise<number[]>` (decode with `decodeAudioFile`, then `computeWaveformPeaks(buffer, 2000)`).

- [ ] **Step 1: Write the failing tests**

`src/lib/timeline-ui/waveform-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createWaveformService } from "@/lib/timeline-ui/waveform-service";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(urls: Record<string, string | null> = { m: "blob:m" }) {
  const loads: Array<{ url: string; resolve: (p: number[]) => void; reject: (e: Error) => void }> = [];
  const service = createWaveformService({
    urlFor: (id) => urls[id] ?? null,
    loadPeaks: (url) =>
      new Promise((resolve, reject) => {
        loads.push({ url, resolve, reject });
      }),
  });
  const notified = { count: 0 };
  service.subscribe(() => {
    notified.count += 1;
  });
  return { service, loads, notified };
}

describe("createWaveformService", () => {
  it("starts one load per media and serves the peaks once they arrive", async () => {
    const { service, loads, notified } = setup();
    expect(service.get("m")).toBeNull();
    expect(service.get("m")).toBeNull();
    expect(loads).toHaveLength(1);
    expect(loads[0].url).toBe("blob:m");

    loads[0].resolve([0.1, 0.9]);
    await flush();
    expect(service.get("m")).toEqual([0.1, 0.9]);
    expect(service.getVersion()).toBe(1);
    expect(notified.count).toBe(1);
    expect(loads).toHaveLength(1);
  });

  it("does not retry a failed media until it is invalidated", async () => {
    const { service, loads } = setup();
    service.get("m");
    loads[0].reject(new Error("cannot decode"));
    await flush();
    expect(service.failed("m")).toBe(true);
    service.get("m");
    expect(loads).toHaveLength(1);
    service.invalidate("m");
    expect(service.failed("m")).toBe(false);
    service.get("m");
    expect(loads).toHaveLength(2);
  });

  it("starts nothing for a media without a URL", () => {
    const { service, loads } = setup({ m: null });
    expect(service.get("m")).toBeNull();
    expect(loads).toHaveLength(0);
  });

  it("ignores a load that finishes after dispose", async () => {
    const { service, loads, notified } = setup();
    service.get("m");
    service.dispose();
    loads[0].resolve([1]);
    await flush();
    expect(notified.count).toBe(0);
    expect(service.get("m")).toBeNull();
  });
});
```

`src/lib/timeline-ui/tone-wav.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui/waveform-service.test.ts src/lib/timeline-ui/tone-wav.test.ts`
Expected: FAIL; both modules cannot be resolved.

- [ ] **Step 3: Implement the waveform service and the tone**

`src/lib/timeline-ui/waveform-service.ts`:

```ts
export interface WaveformService {
  /** The cached peaks, or null (and one load starts) when they are not there yet. */
  get(mediaId: string): number[] | null;
  failed(mediaId: string): boolean;
  subscribe(listener: () => void): () => void;
  getVersion(): number;
  invalidate(mediaId: string): void;
  dispose(): void;
}

export function createWaveformService(options: {
  urlFor(mediaId: string): string | null;
  loadPeaks(url: string): Promise<number[]>;
}): WaveformService {
  const peaks = new Map<string, number[]>();
  const loading = new Set<string>();
  const failedIds = new Set<string>();
  const listeners = new Set<() => void>();
  let version = 0;
  let disposed = false;

  return {
    get(mediaId) {
      if (disposed) return null;
      const cached = peaks.get(mediaId);
      if (cached) return cached;
      if (loading.has(mediaId) || failedIds.has(mediaId)) return null;
      const url = options.urlFor(mediaId);
      if (url === null) return null;

      loading.add(mediaId);
      options.loadPeaks(url).then(
        (result) => {
          if (disposed || !loading.delete(mediaId)) return;
          peaks.set(mediaId, result);
          version += 1;
          for (const listener of Array.from(listeners)) listener();
        },
        () => {
          if (disposed || !loading.delete(mediaId)) return;
          failedIds.add(mediaId);
        },
      );
      return null;
    },

    failed: (mediaId) => failedIds.has(mediaId),

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getVersion: () => version,

    invalidate(mediaId) {
      peaks.delete(mediaId);
      loading.delete(mediaId);
      failedIds.delete(mediaId);
    },

    dispose() {
      disposed = true;
      peaks.clear();
      loading.clear();
      listeners.clear();
    },
  };
}
```

`src/lib/timeline-ui/tone-wav.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui/waveform-service.test.ts src/lib/timeline-ui/tone-wav.test.ts`
Expected: PASS.

- [ ] **Step 5: The browser adapters (no unit tests; checked in Chrome in Task 5)**

`src/lib/timeline-ui/browser-media.ts`:

```ts
import { decodeAudioFile } from "@/lib/audio/decode-audio";
import { computeWaveformPeaks } from "@/lib/audio/waveform";
import type { FrameExtractor } from "@/lib/timeline-ui/thumbnail-service";

// The only file under src/lib/timeline-ui allowed to call browser APIs. It has
// no unit tests; it is type-checked and exercised in a real browser.

const FRAME_WIDTH = 160;
const JPEG_QUALITY = 0.7;
const SEEK_TIMEOUT_MS = 8000;
const IDLE_CLOSE_MS = 3000;
const WAVEFORM_BUCKETS = 2000;

interface Entry {
  video: HTMLVideoElement;
  ready: Promise<void>;
  idle: number | null;
}

function waitFor(video: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${event}`));
    }, SEEK_TIMEOUT_MS);
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The video could not be read"));
    };
    function cleanup() {
      window.clearTimeout(timer);
      video.removeEventListener(event, onDone);
      video.removeEventListener("error", onError);
    }
    video.addEventListener(event, onDone);
    video.addEventListener("error", onError);
  });
}

/**
 * Takes frames from video files with one reused, hidden element per file. The
 * element closes itself a few seconds after its last frame.
 */
export function createVideoFrameExtractor(): FrameExtractor {
  const entries = new Map<string, Entry>();

  function close(url: string) {
    const entry = entries.get(url);
    if (!entry) return;
    if (entry.idle !== null) window.clearTimeout(entry.idle);
    entry.video.removeAttribute("src");
    entry.video.load();
    entries.delete(url);
  }

  function open(url: string): Entry {
    const existing = entries.get(url);
    if (existing) return existing;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    // Before src, or drawing a remote file taints the canvas.
    video.crossOrigin = "anonymous";
    const ready = waitFor(video, "loadeddata");
    video.src = url;
    const entry: Entry = { video, ready, idle: null };
    entries.set(url, entry);
    ready.catch(() => close(url));
    return entry;
  }

  return {
    async frame(url, time) {
      const entry = open(url);
      await entry.ready;
      const { video } = entry;
      if (entry.idle !== null) window.clearTimeout(entry.idle);

      const target = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.05)));
      if (Math.abs(video.currentTime - target) > 0.001) {
        const seeked = waitFor(video, "seeked");
        video.currentTime = target;
        await seeked;
      }

      const canvas = document.createElement("canvas");
      canvas.width = FRAME_WIDTH;
      canvas.height = Math.max(1, Math.round((FRAME_WIDTH * video.videoHeight) / video.videoWidth));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No 2D canvas available");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = canvas.toDataURL("image/jpeg", JPEG_QUALITY);

      entry.idle = window.setTimeout(() => close(url), IDLE_CLOSE_MS);
      return frame;
    },

    dispose() {
      for (const url of Array.from(entries.keys())) close(url);
    },
  };
}

export async function loadPeaksFromUrl(url: string): Promise<number[]> {
  const buffer = await decodeAudioFile(url);
  return computeWaveformPeaks(buffer, WAVEFORM_BUCKETS);
}
```

- [ ] **Step 6: Type-check, lint, purity grep**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx tsc --noEmit` then `npx eslint src/lib/timeline-ui` then the purity grep from Global Constraints.
Expected: no type or lint errors; the grep prints nothing. If `decodeAudioFile` rejects a non-OK response poorly (it does not check `response.ok`), leave it: a failed decode rejects, which the service treats as a failure.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/timeline-ui
git commit -m "feat: add the waveform service, sample tone and browser frame extractor" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Show the visuals inside chips

**Files:**
- Create: `src/components/clip-timeline/clip-visuals.tsx`, `src/components/clip-timeline/clip-visuals.test.tsx`
- Modify: `src/components/clip-timeline/clip-chip.tsx`, `src/components/clip-timeline/timeline-view.tsx`, `src/lib/timeline-ui/index.ts`

**Interfaces:**
- Consumes: Tasks 1 to 3; `ThumbnailService`, `WaveformService`.
- Produces:
  - `interface MediaVisuals { thumbnails: ThumbnailService; waveforms: WaveformService; urlFor(mediaId: string): string | null }` (exported from `clip-visuals.tsx`)
  - `ClipVisuals` (`React.memo`), props `{ clip: Clip; width: number; height: number; pps: number; visuals: MediaVisuals; viewFrom: number; viewTo: number }`, where `viewFrom`/`viewTo` are the clip's own visible range measured from its left edge.
    - `video` clips: one absolutely positioned tile per **visible** tile, each with `data-testid="thumb-tile"` and `background-image` set to the frame returned by `visuals.thumbnails.get(clip.mediaId, tile.sourceTime)`. A tile without a frame yet draws nothing (the chip colour shows through).
    - `image` clips: one element with `data-testid="clip-picture"` whose `background-image` is `visuals.urlFor(clip.mediaId)`, repeated horizontally at chip height; nothing if there is no URL.
    - `audio` clips: an `<svg data-testid="clip-waveform">` with `viewBox="0 0 {n} 100"`, `preserveAspectRatio="none"`, containing one `<path d={waveformPath(bars)}>` where `n = min(1500, max(8, floor(width / 2)))` bars come from `waveformBars(visuals.waveforms.get(clip.mediaId) ?? [], clip, n)`; nothing until peaks exist.
    - `text` and `sticker` clips render nothing.
    - It re-renders itself when the matching service notifies (`useSyncExternalStore` on `subscribe` and `getVersion`), so the chip around it need not re-render.
  - `ClipChip` gains optional props `visuals?: MediaVisuals`, `pps: number`, `viewFrom: number`, `viewTo: number` (the lane range from `viewWindow`); it renders `<ClipVisuals>` behind the label (the label gets `relative z-10`) when `visuals` is present, and its memo comparison also covers `visuals`, `pps`, `viewFrom` and `viewTo`.
  - `TimelineView` gains an optional `visuals?: MediaVisuals` prop and passes each chip `viewWindow(scrollLeft, viewportWidth)`.

- [ ] **Step 1: Write the failing component tests**

`src/components/clip-timeline/clip-visuals.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@/test/dom-setup";

import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ClipVisuals, type MediaVisuals } from "@/components/clip-timeline/clip-visuals";
import type { ThumbnailService } from "@/lib/timeline-ui/thumbnail-service";
import type { WaveformService } from "@/lib/timeline-ui/waveform-service";
import { makeClip } from "@/lib/timeline/test-utils";

function fakeVisuals(options: { frames?: Record<string, string>; peaks?: number[] | null } = {}) {
  const asked: Array<[string, number]> = [];
  const listeners = new Set<() => void>();
  const version = { n: 0 };
  const thumbnails: ThumbnailService = {
    get: (mediaId, time) => {
      asked.push([mediaId, time]);
      return options.frames?.[String(time)] ?? null;
    },
    failed: () => false,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getVersion: () => version.n,
    invalidate: () => {},
    dispose: () => {},
  };
  const waveforms: WaveformService = {
    get: () => options.peaks ?? null,
    failed: () => false,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getVersion: () => version.n,
    invalidate: () => {},
    dispose: () => {},
  };
  const visuals: MediaVisuals = {
    thumbnails,
    waveforms,
    urlFor: (id) => (id === "pic" ? "blob:picture" : null),
  };
  const arrive = (frames: Record<string, string>) => {
    Object.assign((options.frames ??= {}), frames);
    version.n += 1;
    for (const l of Array.from(listeners)) l();
  };
  return { visuals, asked, arrive };
}

const videoClip = makeClip({
  id: "v",
  kind: "video",
  mediaId: "vid",
  start: 0,
  sourceIn: 2,
  sourceOut: 8,
  sourceDuration: 10,
});

describe("ClipVisuals: video", () => {
  it("shows a tile per visible slot using the frame for its source time", () => {
    // 6 s at 60 px/s = 360 px; tiles x 0, 90, 180, 270 with source times 2.75, 4.25, 5.75, 7.25.
    const { visuals } = fakeVisuals({
      frames: { "2.75": "data:a", "4.25": "data:b", "5.75": "data:c", "7.25": "data:d" },
    });
    render(
      <ClipVisuals clip={videoClip} width={360} height={60} pps={60} visuals={visuals} viewFrom={0} viewTo={5000} />,
    );
    const tiles = screen.getAllByTestId("thumb-tile");
    expect(tiles).toHaveLength(4);
    // jsdom may or may not keep the quotes inside url(...), so match on the content.
    ["data:a", "data:b", "data:c", "data:d"].forEach((frame, i) => {
      expect(tiles[i].style.backgroundImage).toContain(frame);
    });
  });

  it("asks only for tiles inside the visible range", () => {
    const { visuals, asked } = fakeVisuals();
    render(
      <ClipVisuals clip={videoClip} width={360} height={60} pps={60} visuals={visuals} viewFrom={100} viewTo={200} />,
    );
    expect(asked.map(([, t]) => t)).toEqual([4.25, 5.75]);
  });

  it("draws nothing for a frame that has not arrived and fills it in when it does", () => {
    const { visuals, arrive } = fakeVisuals();
    render(
      <ClipVisuals clip={videoClip} width={360} height={60} pps={60} visuals={visuals} viewFrom={0} viewTo={5000} />,
    );
    expect(screen.queryAllByTestId("thumb-tile").filter((t) => t.style.backgroundImage)).toHaveLength(0);
    act(() => arrive({ "2.75": "data:late" }));
    expect(screen.getAllByTestId("thumb-tile")[0].style.backgroundImage).toContain("data:late");
  });
});

describe("ClipVisuals: picture and audio", () => {
  it("shows a picture clip's image", () => {
    const { visuals } = fakeVisuals();
    const picture = makeClip({ id: "p", kind: "image", mediaId: "pic", sourceDuration: null, sourceIn: 0, sourceOut: 5 });
    render(<ClipVisuals clip={picture} width={300} height={40} pps={60} visuals={visuals} viewFrom={0} viewTo={5000} />);
    expect(screen.getByTestId("clip-picture").style.backgroundImage).toContain("blob:picture");
  });

  it("shows nothing for a picture without a URL", () => {
    const { visuals } = fakeVisuals();
    const picture = makeClip({ id: "p", kind: "image", mediaId: "missing", sourceDuration: null, sourceOut: 5 });
    render(<ClipVisuals clip={picture} width={300} height={40} pps={60} visuals={visuals} viewFrom={0} viewTo={5000} />);
    expect(screen.queryByTestId("clip-picture")).toBeNull();
  });

  it("draws a waveform once peaks exist, none before", () => {
    const sound = makeClip({ id: "a", kind: "audio", mediaId: "snd", sourceIn: 0, sourceOut: 10, sourceDuration: 10 });
    const empty = fakeVisuals({ peaks: null });
    const { unmount } = render(
      <ClipVisuals clip={sound} width={200} height={40} pps={20} visuals={empty.visuals} viewFrom={0} viewTo={5000} />,
    );
    expect(screen.queryByTestId("clip-waveform")).toBeNull();
    unmount();

    const loaded = fakeVisuals({ peaks: [0.2, 0.9, 0.5, 0.1] });
    render(
      <ClipVisuals clip={sound} width={200} height={40} pps={20} visuals={loaded.visuals} viewFrom={0} viewTo={5000} />,
    );
    const svg = screen.getByTestId("clip-waveform");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("none");
    expect(svg.querySelector("path")?.getAttribute("d")).toMatch(/^M0\.5 /);
  });

  it("draws nothing for text clips", () => {
    const { visuals } = fakeVisuals();
    const title = makeClip({ id: "t", kind: "text", sourceDuration: null, sourceOut: 3 });
    const { container } = render(
      <ClipVisuals clip={title} width={180} height={40} pps={60} visuals={visuals} viewFrom={0} viewTo={5000} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
```

In `src/components/clip-timeline/timeline-view.test.tsx`, add a test inside the `describe("TimelineView (jsdom)")` block (and import `render`'s companions already present) that proves chips get visuals through the view:

```tsx
  it("passes the media visuals to video chips", () => {
    const asked: number[] = [];
    const visuals = {
      thumbnails: {
        get: (_id: string, time: number) => {
          asked.push(time);
          return null;
        },
        failed: () => false,
        subscribe: () => () => {},
        getVersion: () => 0,
        invalidate: () => {},
        dispose: () => {},
      },
      waveforms: {
        get: () => null,
        failed: () => false,
        subscribe: () => () => {},
        getVersion: () => 0,
        invalidate: () => {},
        dispose: () => {},
      },
      urlFor: () => null,
    };
    act(() => {
      useClipProjectStore.getState().load(
        makeProject(makeStandardTracks(), [makeClip({ id: "a", name: "First", sourceOut: 4 })]),
      );
    });
    render(<TimelineView fps={30} onSeek={vi.fn()} onToggle={vi.fn()} onStep={vi.fn()} visuals={visuals} />);
    expect(asked.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/components/clip-timeline`
Expected: FAIL; `clip-visuals` cannot be resolved and the `visuals` prop does not exist yet.

- [ ] **Step 3: The component**

`src/components/clip-timeline/clip-visuals.tsx`:

```tsx
"use client";

import * as React from "react";

import type { ThumbnailService } from "@/lib/timeline-ui/thumbnail-service";
import {
  thumbnailTiles,
  visibleTiles,
  waveformBars,
  waveformPath,
} from "@/lib/timeline-ui/visuals";
import type { WaveformService } from "@/lib/timeline-ui/waveform-service";
import type { Clip } from "@/types/timeline";

export interface MediaVisuals {
  thumbnails: ThumbnailService;
  waveforms: WaveformService;
  urlFor(mediaId: string): string | null;
}

interface ClipVisualsProps {
  clip: Clip;
  width: number;
  height: number;
  pps: number;
  visuals: MediaVisuals;
  /** The visible range of the lane, measured from this clip's left edge. */
  viewFrom: number;
  viewTo: number;
}

const MAX_BARS = 1500;

function VideoStrip({ clip, height, pps, visuals, viewFrom, viewTo }: ClipVisualsProps) {
  // Re-render when a frame arrives; the chip around this need not.
  React.useSyncExternalStore(
    visuals.thumbnails.subscribe,
    visuals.thumbnails.getVersion,
    visuals.thumbnails.getVersion,
  );
  const tiles = React.useMemo(() => thumbnailTiles(clip, pps, height), [clip, pps, height]);
  return (
    <>
      {visibleTiles(tiles, viewFrom, viewTo).map((tile) => {
        const frame = visuals.thumbnails.get(clip.mediaId, tile.sourceTime);
        return (
          <div
            key={tile.index}
            data-testid="thumb-tile"
            className="absolute top-0 h-full bg-cover bg-center"
            style={{
              left: tile.x,
              width: tile.width,
              backgroundImage: frame ? `url("${frame}")` : undefined,
            }}
          />
        );
      })}
    </>
  );
}

function PictureFill({ clip, visuals }: ClipVisualsProps) {
  const url = visuals.urlFor(clip.mediaId);
  if (!url) return null;
  return (
    <div
      data-testid="clip-picture"
      className="absolute inset-0"
      style={{
        backgroundImage: `url("${url}")`,
        backgroundRepeat: "repeat-x",
        backgroundSize: "auto 100%",
      }}
    />
  );
}

function Waveform({ clip, width, visuals }: ClipVisualsProps) {
  React.useSyncExternalStore(
    visuals.waveforms.subscribe,
    visuals.waveforms.getVersion,
    visuals.waveforms.getVersion,
  );
  const peaks = visuals.waveforms.get(clip.mediaId);
  const barCount = Math.min(MAX_BARS, Math.max(8, Math.floor(width / 2)));
  const path = React.useMemo(
    () => (peaks ? waveformPath(waveformBars(peaks, clip, barCount)) : ""),
    [peaks, clip, barCount],
  );
  if (!peaks || path === "") return null;
  return (
    <svg
      data-testid="clip-waveform"
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${barCount} 100`}
      preserveAspectRatio="none"
    >
      <path d={path} stroke="rgba(255,255,255,0.8)" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
    </svg>
  );
}

export const ClipVisuals = React.memo(function ClipVisuals(props: ClipVisualsProps) {
  switch (props.clip.kind) {
    case "video":
      return <VideoStrip {...props} />;
    case "image":
      return <PictureFill {...props} />;
    case "audio":
      return <Waveform {...props} />;
    default:
      return null;
  }
});
```

- [ ] **Step 4: The chip and the view**

In `src/components/clip-timeline/clip-chip.tsx`:
- import `ClipVisuals` and `type MediaVisuals` from `@/components/clip-timeline/clip-visuals`;
- add to `ClipChipProps`: `visuals?: MediaVisuals; pps: number; viewFrom: number; viewTo: number;`;
- extend `areChipsEqual` with `a.visuals === b.visuals && a.pps === b.pps && a.viewFrom === b.viewFrom && a.viewTo === b.viewTo`;
- destructure the new props in the component, and inside the `<button>` render, **before** the trim handles and label:

```tsx
      {visuals && (
        <ClipVisuals
          clip={clip}
          width={rect.width}
          height={rect.height}
          pps={pps}
          visuals={visuals}
          viewFrom={viewFrom - rect.x}
          viewTo={viewTo - rect.x}
        />
      )}
```

- give the label span `relative z-10` and a legible shadow: `className="relative z-10 block truncate leading-tight [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]"`; the trim handles also need `z-20` so they stay grabbable.

In `src/components/clip-timeline/timeline-view.tsx`:
- import `type MediaVisuals` from `@/components/clip-timeline/clip-visuals` and `viewWindow` from `@/lib/timeline-ui/visuals`;
- add `visuals?: MediaVisuals;` to `TimelineViewProps` and destructure it in the component signature;
- compute `const window_ = viewWindow(scrollLeft, viewportWidth);` next to `startTime`/`endTime` (name it `visibleRange` to avoid shadowing the global `window`);
- pass `visuals={visuals} pps={pps} viewFrom={visibleRange.from} viewTo={visibleRange.to}` to each `<ClipChip>`.

Append to `src/lib/timeline-ui/index.ts`:

```ts
export * from "@/lib/timeline-ui/thumbnail-service";
export * from "@/lib/timeline-ui/tone-wav";
export * from "@/lib/timeline-ui/visuals";
export * from "@/lib/timeline-ui/waveform-service";
```

(`browser-media.ts` is deliberately not in the barrel: it is imported by name where needed.)

- [ ] **Step 5: Run the tests, type-check, lint**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/components/clip-timeline` then `npx tsc --noEmit` then `npx eslint src/lib/timeline-ui src/components/clip-timeline`
Expected: PASS for the new and existing component tests; no type or lint errors. If a `react-hooks` rule objects to the unused `useSyncExternalStore` result, keep the call (it is what subscribes) and add a short comment; do not disable the rule.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/components/clip-timeline src/lib/timeline-ui/index.ts
git commit -m "feat: show thumbnail strips, pictures and waveforms inside timeline chips" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wire into the test page and verify in a real Chrome

**Files:**
- Modify: `src/components/playback/playback-harness.tsx`

**Interfaces:**
- Consumes: `createThumbnailService`, `createWaveformService`, `makeToneWav`, `createVideoFrameExtractor`, `loadPeaksFromUrl`, `TimelineView`'s new `visuals` prop.
- Produces: the test page shows thumbnails and waveforms; a new "Add sample tone" button adds a 6 second generated tone as an audio clip. `window.__playbackHarness` gains `visuals` (the services) for inspection.

- [ ] **Step 1: Wire the services**

In `src/components/playback/playback-harness.tsx`:
- import `createThumbnailService`, `createWaveformService`, `makeToneWav` from `@/lib/timeline-ui` (barrel), `createVideoFrameExtractor` and `loadPeaksFromUrl` from `@/lib/timeline-ui/browser-media`, and `type MediaVisuals` from `@/components/clip-timeline/clip-visuals`;
- add `const [visuals, setVisuals] = React.useState<MediaVisuals | null>(null);`;
- inside the main `useEffect`, after the registry is created, build the services against it:

```tsx
    const thumbnails = createThumbnailService({
      urlFor: (mediaId) => registry.urlFor(mediaId),
      extractor: createVideoFrameExtractor(),
    });
    const waveforms = createWaveformService({
      urlFor: (mediaId) => registry.urlFor(mediaId),
      loadPeaks: loadPeaksFromUrl,
    });
    setVisuals({ thumbnails, waveforms, urlFor: (mediaId) => registry.urlFor(mediaId) });
```

  and in the effect's cleanup: `thumbnails.dispose(); waveforms.dispose(); setVisuals(null);` (before `painter.destroy()`);
- pass `visuals={visuals ?? undefined}` to `<TimelineView>`;
- add the button next to "Generate sample clips":

```tsx
            <Button
              variant="secondary"
              onClick={async () => {
                const bytes = makeToneWav({ seconds: 6, hz: 330 });
                const result = await add({ blob: new Blob([bytes], { type: "audio/wav" }) }, "Sample tone", "audio");
                say(summarizeErrors([result]));
              }}
            >
              Add sample tone
            </Button>
```

- [ ] **Step 2: Type-check, lint, whole suite**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx tsc --noEmit` then `npx eslint src/lib/timeline-ui src/components/clip-timeline src/components/playback` then `npm test`
Expected: no errors; all tests pass. Fix real problems; do not disable rules.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/components/playback/playback-harness.tsx
git commit -m "feat: show timeline thumbnails and waveforms on the test page, with a sample tone" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Prepare Chrome.** Start the dev server with `mcp__Claude_Browser__preview_start` (`scrapbook-dev`) and wait for `/dev/playback` to return 200. Read the `anthropic-skills:chrome-browser` skill, load the Chrome tools in one ToolSearch call, `list_connected_browsers` (empty means stop and ask), open a new tab at `http://localhost:3000/dev/playback`, confirm the console is clean. Click "Generate sample clips" and "Add sample tone".

- [ ] **Step 5: The right frame in the right place.** Scroll the timeline into view and zoom a screenshot on the video clips. Each tile of Sample A shows the large number burned into the test picture. At 60 px per second a 6 s clip has 4 tiles whose centres are at source 0.75, 2.25, 3.75 and 5.25 s, so the digits read `0`, `2`, `3`, `5` (the burned-in number is the whole second; the frame at 0.75 s is rounded to the nearest half second, 1.0, so it may read `0` or `1`: check against the quantized time 1.0, 2.5, 4.0, 5.5, i.e. digits `1`, `2`, `4`, `5`). Record what you see and compare to the quantized times, and that Sample B's tiles are the inverted-colour picture. Expected: digits match the quantized source times.

- [ ] **Step 6: Reversed, sped up, trimmed.** Select Sample A and tick Reverse: the digits now run in the opposite order. Untick, set Speed to 2x: the clip is half as wide and its tiles skip ahead (digits step by about two). Drag the clip's left edge to trim: the first tile's digit moves later. Expected: tiles follow the clip's real source range every time.

- [ ] **Step 7: Waveform.** The sample tone clip shows a waveform that is small at both ends and tall in the middle. Trim its right half away: the waveform now shows only the rising part. Reverse it: the shape mirrors. Expected: matches the clip's range and direction.

- [ ] **Step 8: Zoom, scroll, and visible-only work.** Zoom in (Ctrl+wheel) until the project is far wider than the view. Read `window.__playbackHarness.visuals` is not needed; instead count `[data-testid="thumb-tile"]` elements: it is a bounded number (not hundreds) and stays bounded while you scroll; frames fill in for newly visible tiles within a second or two. Expected: bounded tile count, frames arrive after scrolling.

- [ ] **Step 9: Responsiveness.** Press Space to play while thumbnails are loading, drag a clip, and scrub the ruler: playback, drag and scrub stay smooth, with no console errors. Expected: no stall attributable to thumbnails.

- [ ] **Step 10: Failure and cross-origin.** Add a remote video by URL that has no CORS headers (or a URL that returns 404 through a throwaway local server outside the repo, as in earlier plans) via the "Add from URL" box: the add is rejected with the existing message, and a clip whose file later fails to give frames shows as a plain coloured chip with no console error flood and no repeating network requests (check the network panel count stays small). Stop and delete any throwaway server. Expected: plain chip, no retry loop.

- [ ] **Step 11: Lifecycle.** Reload the page twice; leave the page while thumbnails are loading (navigate to another URL); return. In the console, `document.querySelectorAll("video").length` is 0 on the test page after the 3 second idle close (the extractor's hidden elements are not attached to the page, so also confirm no growth of memory-hungry elements by checking the Network tab shows the media file fetched once per file, not once per tile). Expected: no leftover elements, one fetch per file.

- [ ] **Step 12: Record and clean up.** Save one or two screenshots (thumbnail strip with digits visible, and the waveform) and send them with `SendUserFile`. Try to close the Chrome tab you opened, stop the dev server, and stop any throwaway server. Write the results of Steps 5 to 11 into the final report as a table of check, expected, observed, pass/fail. Fix any failure test-first, then run `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/timeline-ui src/components/clip-timeline src/components/playback`, and commit each fix with a message naming it.

---

### Task 6: Whole-branch checks

- [ ] **Step 1: Everything green.** Run `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/timeline-ui src/components/clip-timeline src/components/playback`. Expected: all pass, no errors.

- [ ] **Step 2: Pure files stayed pure.** Run the purity grep from Global Constraints. Expected: no output.

- [ ] **Step 3: Nothing outside the plan changed.** Run `git diff --stat main -- src ':!src/lib/timeline-ui' ':!src/components/clip-timeline'`. Expected: only `src/components/playback/playback-harness.tsx`.

- [ ] **Step 4: Production build.** Stop the dev server, delete `.next/dev` if a stale generated types file breaks the type check, run `npm run build`. Expected: exit 0.

---

## Self-Review

**Spec coverage (section 6):**

| Requirement | Task |
|---|---|
| Video clips show a thumbnail strip | 1 (tiles), 2 (frames), 3 (extractor), 4 (strip) |
| Audio clips show waveforms (existing `waveform.ts`) | 1 (bars), 3 (service reuses `computeWaveformPeaks`), 4 (SVG) |
| Text and sticker clips show a labelled chip | unchanged from 4a (label), Task 4 draws nothing extra |
| Picture clips show the picture | 4 |
| Does not slow the editor | 2 (serial, newest-first queue), 4 (visible tiles only), 5 Step 9 |

**Left for later:** persisting thumbnails across sessions, proxy files, waveforms for video audio, mounting in the real editor.

**Placeholder scan:** none; every step has code or a command. Step 5 of Task 5 spells out the expected digits and why rounding to the half second can change them.

**Type consistency:** `FrameExtractor` and `ThumbnailService` (Task 2) are used by `browser-media.ts` (Task 3) and `MediaVisuals` (Task 4); `WaveformService` likewise; `ThumbTile`, `thumbnailTiles`, `visibleTiles`, `viewWindow`, `waveformBars`, `waveformPath` (Task 1) match their uses in Task 4; `ClipChip`'s new props match what `TimelineView` passes.

**Review Focus coverage:** right frame (Task 1 tests, Task 5 Steps 5 and 6), bounded work (Task 2 tests, Task 5 Step 8), never blocks (Task 5 Step 9), lifecycle (Task 2 and 3 dispose tests, Task 5 Step 11), cross-origin and failure (Task 2 give-up tests, Task 5 Step 10), long files (single decode per file in Task 3 tests; page-freeze risk checked by the reviewer), memoisation (Task 1 `viewWindow`, Task 4 chip comparator).

## Execution Handoff

Before Task 5, enable the Claude in Chrome extension and bring that Chrome window to the front and keep it uncovered while checks run.
