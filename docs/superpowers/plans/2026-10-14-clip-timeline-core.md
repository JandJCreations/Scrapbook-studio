# Clip Timeline Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure-TypeScript core of the unified clip/track editor: the data model, every editing operation, snapping, `activeClipsAt`, undo/redo history, and the store that holds them, all unit-tested with Vitest.

**Architecture:** A project is `{ id, tracks, clips }`. Every edit is a pure function `(project, ...args) => project` in `src/lib/timeline/`; a no-op returns the *same* project reference. A framework-free history module (with "gesture" support so a drag is one undo step) is wrapped by a zustand store. Nothing in this plan touches the existing canvas, audio or timeline UI code.

**Tech Stack:** TypeScript (strict), Vitest (new), zustand (existing), Next.js 16 app (untouched by this plan).

**Spec:** `docs/superpowers/specs/2026-10-14-clip-timeline-design.md` (sections 3, 4 and 9, plus the pure `activeClipsAt` function from section 5).

**Scope of this plan.** Spec build-order step 1 (model, operations, history store, tests) and the pure part of step 3. Persistence/schema, the playback engine and compositor, the timeline UI, porting scrapbook features, export, and cleanup each get their own plan, written after this one lands, because they depend on the interfaces produced here and on Supabase schema decisions.

## Global Constraints

- Work on branch `feature/clip-timeline`; never commit to `main`.
- Duration is derived, never stored: `duration = (sourceOut - sourceIn) / speed`, `end = start + duration`.
- Tracks of `type: "video"` are **magnetic**: clips sit end to end from time 0 with no gaps (ripple). `overlay` and `audio` tracks allow free placement and overlap.
- All editing operations are pure functions in `src/lib/timeline/`, with no store, DOM or network access. A no-op returns the identical `project` reference.
- Vitest is the test runner (spec section 9); tests live next to the code as `*.test.ts`.
- Decision made in this plan (the spec is silent): `Keyframe.time` on a clip is **relative to the clip's start**, not absolute timeline time. The existing editor uses absolute times; converting them is the job of the later "port scrapbook features" plan.
- This plan does not modify existing files except `package.json` and `package-lock.json`.
- `AGENTS.md` says this Next.js version has breaking changes; nothing here uses Next APIs, but read `node_modules/next/dist/docs/` before any later plan writes Next code.
- If `node` is not found in a spawned PowerShell, run `$env:Path += ";C:\Program Files\nodejs"` first.
- End every commit message with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).

## Review Focus

Failure modes the spec implies but a reasonable implementation could miss. Each has a test in the task named on the right.

- Contiguous clips with fractional durations (0.1, 0.2, 0.3 s) must have exactly one active clip at every cut, with no float sliver where zero or two clips play. (Task 2, Task 10)
- Splitting at or near a clip edge, or on a locked clip or track, must not create zero-length or sliver clips. (Task 3)
- Trimming reversed and sped-up clips, or dragging past the source ends, must clamp so that `0 <= sourceIn < sourceOut <= sourceDuration` and `start >= 0` always hold. (Task 4)
- Dropping or moving a clip onto an incompatible track (an audio clip onto the video track, or a video clip onto an audio track), or onto a locked track, must be rejected without changing the project. (Task 6)
- Pressing undo in the middle of a drag must cancel the drag cleanly, leaving no half-applied state and no extra history entry. (Task 11, Task 12)

---

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` | Vitest config with the `@` alias |
| `src/types/timeline.ts` | `Track`, `Clip`, `TimelineProject` and related types |
| `src/lib/timeline/ids.ts` | `IdFn`, `createId` |
| `src/lib/timeline/clip-math.ts` | Constants, `clamp`, `clipDuration`, `clipEnd`, `projectDuration` |
| `src/lib/timeline/test-utils.ts` | Fixtures used by tests only |
| `src/lib/timeline/lookup.ts` | `findClip`, `findTrack`, `isClipLocked`, `canHostClip`, `clipsOnTrack` |
| `src/lib/timeline/pack.ts` | Magnetic-track packing |
| `src/lib/timeline/split.ts` | `splitClip` |
| `src/lib/timeline/trim.ts` | `trimClip` |
| `src/lib/timeline/delete.ts` | `deleteClips`, `rippleDeleteClips` |
| `src/lib/timeline/place.ts` | `placeClip`, `moveClip`, `insertClip` |
| `src/lib/timeline/clip-edits.ts` | `duplicateClip`, `setSpeed`, `updateClip` |
| `src/lib/timeline/tracks.ts` | `addTrack`, `updateTrack` |
| `src/lib/timeline/snap.ts` | Snap targets and snapping |
| `src/lib/timeline/active-clips.ts` | `activeClipsAt`, `clipGainAt` |
| `src/lib/timeline/history.ts` | Pure undo/redo history with gestures |
| `src/lib/timeline/index.ts` | Barrel export |
| `src/store/use-clip-project-store.ts` | zustand store wrapping the history |

Every `*.test.ts` sits beside the file it tests.

---

### Task 1: Vitest, types and clip math

**Files:**
- Modify: `package.json` (scripts, devDependency), `package-lock.json`
- Create: `vitest.config.ts`
- Create: `src/types/timeline.ts`
- Create: `src/lib/timeline/ids.ts`
- Create: `src/lib/timeline/clip-math.ts`
- Create: `src/lib/timeline/test-utils.ts`
- Test: `src/lib/timeline/clip-math.test.ts`

**Interfaces:**
- Consumes: existing types `Keyframe`, `PhotoAdjustments`, `TextAdjustments`, `VideoAdjustments`.
- Produces (used by every later task):
  - Types `TrackType`, `ClipKind`, `Track`, `ClipTransform`, `ClipAdjustments`, `Clip`, `TimelineProject`.
  - `IdFn = () => string`; `createId(): string`.
  - Constants `EPS = 1e-6`, `MIN_CLIP_DURATION = 0.1`, `MIN_SPEED = 0.1`, `MAX_SPEED = 8`.
  - `clamp(value, min, max)` (min wins if the range is inverted); `clipDuration(clip)`; `clipEnd(clip)`; `projectDuration(project)`.
  - Test-only: `makeTrack`, `makeClip`, `makeProject`, `makeStandardTracks`, `getClip`, `seqIds`.

- [ ] **Step 1: Record the type-check baseline**

Run: `npx tsc --noEmit`
Expected: note whether it is clean. If it already reports errors, save them; later tasks only need to add none.

- [ ] **Step 2: Install Vitest**

Run: `npm install -D vitest`
Expected: `vitest` appears under `devDependencies` in `package.json`.

- [ ] **Step 3: Add test scripts**

In `package.json`, change the `scripts` block so it reads:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 4: Create the Vitest config**

`vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Create the model types**

`src/types/timeline.ts`:

```ts
import type { Keyframe } from "@/types/keyframe";
import type { PhotoAdjustments } from "@/types/photo-adjustments";
import type { TextAdjustments } from "@/types/text-adjustments";
import type { VideoAdjustments } from "@/types/video-adjustments";

export type TrackType = "video" | "overlay" | "audio";
export type ClipKind = "video" | "image" | "text" | "audio" | "sticker";

export interface Track {
  id: string;
  type: TrackType;
  /** Top-to-bottom position in the timeline UI: 0 is the top row. */
  order: number;
  muted: boolean;
  locked: boolean;
  hidden: boolean;
  solo: boolean;
}

export interface ClipTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export interface ClipAdjustments {
  photo: PhotoAdjustments | null;
  video: VideoAdjustments | null;
  text: TextAdjustments | null;
}

export interface Clip {
  id: string;
  trackId: string;
  kind: ClipKind;
  name: string;
  /** Stable media reference; signed URLs are resolved at load time. */
  mediaId: string;
  /** Full length of the source file in seconds; null for stills and text (unbounded). */
  sourceDuration: number | null;

  /** Position on the timeline, in seconds. */
  start: number;
  /** Trim points in the source media, in source seconds. */
  sourceIn: number;
  sourceOut: number;
  speed: number;
  reversed: boolean;
  /** Carried over from the old editor so the setting round-trips; no timeline effect yet. */
  loop: boolean;

  /** 0-100, as in the existing audio and video panels. */
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;

  transform: ClipTransform;
  adjustments: ClipAdjustments;
  /** `time` is relative to the clip's start, in timeline seconds. */
  keyframes: Keyframe[];

  groupId: string | null;
  locked: boolean;
  isPlaceholder: boolean;
}

export interface TimelineProject {
  id: string;
  tracks: Track[];
  clips: Clip[];
}
```

- [ ] **Step 6: Create the id helper**

`src/lib/timeline/ids.ts`:

```ts
export type IdFn = () => string;

export function createId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 7: Create the test fixtures**

`src/lib/timeline/test-utils.ts` (imported only by tests):

```ts
import type { Clip, TimelineProject, Track } from "@/types/timeline";

export function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: "t1",
    type: "video",
    order: 0,
    muted: false,
    locked: false,
    hidden: false,
    solo: false,
    ...overrides,
  };
}

export function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: "c1",
    trackId: "t1",
    kind: "video",
    name: "clip",
    mediaId: "m1",
    sourceDuration: 20,
    start: 0,
    sourceIn: 0,
    sourceOut: 10,
    speed: 1,
    reversed: false,
    loop: false,
    volume: 100,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transform: { x: 0, y: 0, width: 1920, height: 1080, rotation: 0, opacity: 1 },
    adjustments: { photo: null, video: null, text: null },
    keyframes: [],
    groupId: null,
    locked: false,
    isPlaceholder: false,
    ...overrides,
  };
}

export function makeProject(tracks: Track[], clips: Clip[]): TimelineProject {
  return { id: "p1", tracks, clips };
}

/** Overlay `t2` (top), video `t1` (main), audio `t3` (bottom). */
export function makeStandardTracks(): Track[] {
  return [
    makeTrack({ id: "t2", type: "overlay", order: 0 }),
    makeTrack({ id: "t1", type: "video", order: 1 }),
    makeTrack({ id: "t3", type: "audio", order: 2 }),
  ];
}

export function getClip(project: TimelineProject, id: string): Clip {
  const clip = project.clips.find((c) => c.id === id);
  if (!clip) throw new Error(`No clip with id ${id}`);
  return clip;
}

/** Deterministic id generator: id-1, id-2, ... */
export function seqIds(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
```

- [ ] **Step 8: Write the failing test**

`src/lib/timeline/clip-math.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { clamp, clipDuration, clipEnd, projectDuration } from "@/lib/timeline/clip-math";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";

describe("clipDuration", () => {
  it("is the source span divided by speed", () => {
    expect(clipDuration(makeClip({ sourceIn: 2, sourceOut: 12, speed: 2 }))).toBe(5);
  });

  it("is longer at slow speeds", () => {
    expect(clipDuration(makeClip({ sourceIn: 0, sourceOut: 4, speed: 0.5 }))).toBe(8);
  });
});

describe("clipEnd", () => {
  it("is start plus duration", () => {
    expect(clipEnd(makeClip({ start: 3, sourceIn: 0, sourceOut: 4 }))).toBe(7);
  });
});

describe("projectDuration", () => {
  it("is 0 for an empty project", () => {
    expect(projectDuration(makeProject(makeStandardTracks(), []))).toBe(0);
  });

  it("is the latest clip end across all tracks", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", trackId: "t1", start: 0, sourceOut: 5 }),
      makeClip({ id: "b", trackId: "t2", start: 8, sourceOut: 4 }),
      makeClip({ id: "c", trackId: "t3", start: 1, sourceOut: 2 }),
    ]);
    expect(projectDuration(project)).toBe(12);
  });
});

describe("clamp", () => {
  it("limits a value to the range", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it("lets the minimum win when the range is inverted", () => {
    expect(clamp(5, 10, 1)).toBe(10);
  });
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `npx vitest run src/lib/timeline/clip-math.test.ts`
Expected: FAIL with an error that `@/lib/timeline/clip-math` cannot be resolved.

- [ ] **Step 10: Implement clip math**

`src/lib/timeline/clip-math.ts`:

```ts
import type { Clip, TimelineProject } from "@/types/timeline";

/** Tolerance for comparing timeline seconds. */
export const EPS = 1e-6;
/** No clip may be shorter than this, in timeline seconds. */
export const MIN_CLIP_DURATION = 0.1;
export const MIN_SPEED = 0.1;
export const MAX_SPEED = 8;

/** Limits `value` to [min, max]; if the range is inverted, `min` wins. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clipDuration(clip: Clip): number {
  return (clip.sourceOut - clip.sourceIn) / clip.speed;
}

export function clipEnd(clip: Clip): number {
  return clip.start + clipDuration(clip);
}

export function projectDuration(project: TimelineProject): number {
  return project.clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0);
}
```

- [ ] **Step 11: Run tests and the type check**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: all tests PASS; type check shows no new errors versus Step 1.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/types/timeline.ts src/lib/timeline
git commit -m "feat: add Vitest, timeline model types and clip math" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lookups and magnetic packing

**Files:**
- Create: `src/lib/timeline/lookup.ts`
- Create: `src/lib/timeline/pack.ts`
- Test: `src/lib/timeline/lookup.test.ts`, `src/lib/timeline/pack.test.ts`

**Interfaces:**
- Consumes: `clipDuration`, `EPS` from `clip-math`; types from `src/types/timeline.ts`.
- Produces:
  - `findClip(project, id): Clip | undefined`; `findTrack(project, id): Track | undefined`
  - `isClipLocked(project, clip): boolean` (true if the clip or its track is locked)
  - `canHostClip(track, clip): boolean` (audio clips only on audio tracks; every other kind only on non-audio tracks)
  - `clipsOnTrack(project, trackId): Clip[]` (a copy, sorted by `start`)
  - `isMagnetic(track): boolean` (true for `type: "video"`)
  - `packClips(ordered: Clip[]): Clip[]` (assigns sequential starts from 0, returns the same object when a start already equals the cursor exactly)
  - `replaceTrackClips(project, trackId, clips): TimelineProject`
  - `packMagneticTracks(project): TimelineProject` (returns the same project when it has no magnetic tracks)

- [ ] **Step 1: Write the failing lookup tests**

`src/lib/timeline/lookup.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  canHostClip,
  clipsOnTrack,
  findClip,
  findTrack,
  isClipLocked,
} from "@/lib/timeline/lookup";
import { makeClip, makeProject, makeStandardTracks, makeTrack } from "@/lib/timeline/test-utils";

describe("findClip / findTrack", () => {
  const project = makeProject(makeStandardTracks(), [makeClip({ id: "a" })]);

  it("finds by id", () => {
    expect(findClip(project, "a")?.id).toBe("a");
    expect(findTrack(project, "t2")?.type).toBe("overlay");
  });

  it("returns undefined for unknown ids", () => {
    expect(findClip(project, "nope")).toBeUndefined();
    expect(findTrack(project, "nope")).toBeUndefined();
  });
});

describe("isClipLocked", () => {
  it("is true when the clip is locked", () => {
    const clip = makeClip({ locked: true });
    expect(isClipLocked(makeProject(makeStandardTracks(), [clip]), clip)).toBe(true);
  });

  it("is true when the clip's track is locked", () => {
    const clip = makeClip({ trackId: "t1" });
    const tracks = [makeTrack({ id: "t1", locked: true })];
    expect(isClipLocked(makeProject(tracks, [clip]), clip)).toBe(true);
  });

  it("is false otherwise", () => {
    const clip = makeClip();
    expect(isClipLocked(makeProject(makeStandardTracks(), [clip]), clip)).toBe(false);
  });
});

describe("canHostClip", () => {
  const video = makeTrack({ type: "video" });
  const overlay = makeTrack({ type: "overlay" });
  const audio = makeTrack({ type: "audio" });

  it("puts audio clips only on audio tracks", () => {
    const clip = makeClip({ kind: "audio" });
    expect(canHostClip(audio, clip)).toBe(true);
    expect(canHostClip(video, clip)).toBe(false);
    expect(canHostClip(overlay, clip)).toBe(false);
  });

  it.each(["video", "image", "text", "sticker"] as const)(
    "keeps %s clips off audio tracks",
    (kind) => {
      const clip = makeClip({ kind });
      expect(canHostClip(video, clip)).toBe(true);
      expect(canHostClip(overlay, clip)).toBe(true);
      expect(canHostClip(audio, clip)).toBe(false);
    },
  );
});

describe("clipsOnTrack", () => {
  it("returns only that track's clips, sorted by start, without mutating the project", () => {
    const clips = [
      makeClip({ id: "late", trackId: "t2", start: 9 }),
      makeClip({ id: "other", trackId: "t1", start: 0 }),
      makeClip({ id: "early", trackId: "t2", start: 1 }),
    ];
    const project = makeProject(makeStandardTracks(), clips);
    expect(clipsOnTrack(project, "t2").map((c) => c.id)).toEqual(["early", "late"]);
    expect(project.clips.map((c) => c.id)).toEqual(["late", "other", "early"]);
  });
});
```

- [ ] **Step 2: Write the failing pack tests**

`src/lib/timeline/pack.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { clipEnd } from "@/lib/timeline/clip-math";
import { clipsOnTrack } from "@/lib/timeline/lookup";
import {
  isMagnetic,
  packClips,
  packMagneticTracks,
  replaceTrackClips,
} from "@/lib/timeline/pack";
import { getClip, makeClip, makeProject, makeStandardTracks, makeTrack } from "@/lib/timeline/test-utils";

describe("isMagnetic", () => {
  it("is true only for video tracks", () => {
    expect(isMagnetic(makeTrack({ type: "video" }))).toBe(true);
    expect(isMagnetic(makeTrack({ type: "overlay" }))).toBe(false);
    expect(isMagnetic(makeTrack({ type: "audio" }))).toBe(false);
  });
});

describe("packClips", () => {
  it("assigns sequential starts from 0 in the given order", () => {
    const packed = packClips([
      makeClip({ id: "a", start: 5, sourceOut: 4 }),
      makeClip({ id: "b", start: 1, sourceOut: 3 }),
    ]);
    expect(packed.map((c) => [c.id, c.start])).toEqual([
      ["a", 0],
      ["b", 4],
    ]);
  });

  it("returns the same object when the start is already exact", () => {
    const a = makeClip({ id: "a", start: 0, sourceOut: 4 });
    const b = makeClip({ id: "b", start: 4, sourceOut: 3 });
    const packed = packClips([a, b]);
    expect(packed[0]).toBe(a);
    expect(packed[1]).toBe(b);
  });
});

describe("replaceTrackClips", () => {
  it("swaps one track's clips and leaves the rest", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "keep", trackId: "t2" }),
      makeClip({ id: "old", trackId: "t1" }),
    ]);
    const result = replaceTrackClips(project, "t1", [makeClip({ id: "new", trackId: "t1" })]);
    expect(result.clips.map((c) => c.id).sort()).toEqual(["keep", "new"]);
  });
});

describe("packMagneticTracks", () => {
  it("closes gaps on the main track", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceOut: 4 }),
      makeClip({ id: "b", start: 6, sourceOut: 3 }),
      makeClip({ id: "c", start: 20, sourceOut: 2 }),
    ]);
    const result = packMagneticTracks(project);
    expect(getClip(result, "a").start).toBe(0);
    expect(getClip(result, "b").start).toBe(4);
    expect(getClip(result, "c").start).toBe(7);
  });

  it("resolves overlaps by pushing later clips right", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceOut: 4 }),
      makeClip({ id: "b", start: 2, sourceOut: 3 }),
    ]);
    expect(getClip(packMagneticTracks(project), "b").start).toBe(4);
  });

  it("orders by start, not by array position", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "b", start: 5, sourceOut: 3 }),
      makeClip({ id: "a", start: 0, sourceOut: 4 }),
    ]);
    const result = packMagneticTracks(project);
    expect(getClip(result, "a").start).toBe(0);
    expect(getClip(result, "b").start).toBe(4);
  });

  it("leaves overlay and audio tracks alone", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "o", trackId: "t2", kind: "image", start: 9, sourceOut: 2 }),
      makeClip({ id: "s", trackId: "t3", kind: "audio", start: 7, sourceOut: 2 }),
    ]);
    expect(packMagneticTracks(project)).toBe(project);
  });

  it("keeps clips exactly contiguous with fractional durations", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceIn: 0, sourceOut: 0.1 }),
      makeClip({ id: "b", start: 9, sourceIn: 0, sourceOut: 0.2 }),
      makeClip({ id: "c", start: 9, sourceIn: 0, sourceOut: 0.3 }),
    ]);
    const ordered = clipsOnTrack(packMagneticTracks(project), "t1");
    expect(clipEnd(ordered[0])).toBe(ordered[1].start);
    expect(clipEnd(ordered[1])).toBe(ordered[2].start);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/timeline/lookup.test.ts src/lib/timeline/pack.test.ts`
Expected: FAIL; the `lookup` and `pack` modules cannot be resolved.

- [ ] **Step 4: Implement lookup**

`src/lib/timeline/lookup.ts`:

```ts
import type { Clip, TimelineProject, Track } from "@/types/timeline";

export function findClip(project: TimelineProject, id: string): Clip | undefined {
  return project.clips.find((clip) => clip.id === id);
}

export function findTrack(project: TimelineProject, id: string): Track | undefined {
  return project.tracks.find((track) => track.id === id);
}

export function isClipLocked(project: TimelineProject, clip: Clip): boolean {
  return clip.locked || (findTrack(project, clip.trackId)?.locked ?? false);
}

/** Audio clips live only on audio tracks; every other kind lives only on non-audio tracks. */
export function canHostClip(track: Track, clip: Clip): boolean {
  return clip.kind === "audio" ? track.type === "audio" : track.type !== "audio";
}

export function clipsOnTrack(project: TimelineProject, trackId: string): Clip[] {
  return project.clips
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => a.start - b.start);
}
```

- [ ] **Step 5: Implement packing**

`src/lib/timeline/pack.ts`:

```ts
import { clipDuration } from "@/lib/timeline/clip-math";
import { clipsOnTrack } from "@/lib/timeline/lookup";
import type { Clip, TimelineProject, Track } from "@/types/timeline";

/** Video tracks are magnetic: their clips always sit end to end from time 0. */
export function isMagnetic(track: Track): boolean {
  return track.type === "video";
}

/**
 * Assigns sequential starts beginning at 0, in the given order. The start is
 * set to the exact running sum, so `clipEnd(prev) === next.start` with no
 * floating-point sliver between clips.
 */
export function packClips(ordered: Clip[]): Clip[] {
  let cursor = 0;
  return ordered.map((clip) => {
    const packed = clip.start === cursor ? clip : { ...clip, start: cursor };
    cursor += clipDuration(clip);
    return packed;
  });
}

export function replaceTrackClips(
  project: TimelineProject,
  trackId: string,
  clips: Clip[],
): TimelineProject {
  return {
    ...project,
    clips: [...project.clips.filter((clip) => clip.trackId !== trackId), ...clips],
  };
}

/** Re-packs every magnetic track by current start order. */
export function packMagneticTracks(project: TimelineProject): TimelineProject {
  const magnetic = project.tracks.filter(isMagnetic);
  if (magnetic.length === 0) return project;

  const packedById = new Map<string, Clip>();
  for (const track of magnetic) {
    for (const clip of packClips(clipsOnTrack(project, track.id))) {
      packedById.set(clip.id, clip);
    }
  }
  return { ...project, clips: project.clips.map((clip) => packedById.get(clip.id) ?? clip) };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/timeline`
Expected: PASS for `clip-math`, `lookup` and `pack`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/timeline
git commit -m "feat: add track lookups and magnetic packing" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: splitClip

**Files:**
- Create: `src/lib/timeline/split.ts`
- Test: `src/lib/timeline/split.test.ts`

**Interfaces:**
- Consumes: `clipDuration`, `MIN_CLIP_DURATION` (clip-math); `findClip`, `isClipLocked` (lookup); `IdFn`, `createId` (ids).
- Produces: `splitClip(project, clipId, at, newId?: IdFn): TimelineProject`. `at` is timeline seconds. The new right-hand clip gets `newId()`, is inserted immediately after the left clip in `project.clips`, and keeps the left clip's id on the left half. Returns the same `project` if the clip is unknown or locked, or if either half would be shorter than `MIN_CLIP_DURATION`.

- [ ] **Step 1: Write the failing test**

`src/lib/timeline/split.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { clipEnd } from "@/lib/timeline/clip-math";
import { splitClip } from "@/lib/timeline/split";
import {
  getClip,
  makeClip,
  makeProject,
  makeStandardTracks,
  makeTrack,
  seqIds,
} from "@/lib/timeline/test-utils";
import type { Keyframe } from "@/types/keyframe";

const kf = (time: number): Keyframe => ({
  id: `k${time}`,
  time,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 1,
});

describe("splitClip", () => {
  it("splits a clip at the playhead into two contiguous clips", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceIn: 0, sourceOut: 10 }),
    ]);
    const result = splitClip(project, "a", 4, seqIds());
    expect(getClip(result, "a")).toMatchObject({ start: 0, sourceIn: 0, sourceOut: 4 });
    expect(getClip(result, "id-1")).toMatchObject({
      start: 4,
      sourceIn: 4,
      sourceOut: 10,
      trackId: "t1",
    });
  });

  it("accounts for speed when computing the source cut point", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 5, sourceIn: 0, sourceOut: 10, speed: 2 }),
    ]);
    const result = splitClip(project, "a", 7, seqIds());
    expect(getClip(result, "a")).toMatchObject({ start: 5, sourceIn: 0, sourceOut: 4 });
    expect(getClip(result, "id-1")).toMatchObject({ start: 7, sourceIn: 4, sourceOut: 10 });
  });

  it("splits a reversed clip so the earlier half plays the later source", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceIn: 0, sourceOut: 10, reversed: true }),
    ]);
    const result = splitClip(project, "a", 4, seqIds());
    expect(getClip(result, "a")).toMatchObject({ sourceIn: 6, sourceOut: 10 });
    expect(getClip(result, "id-1")).toMatchObject({ start: 4, sourceIn: 0, sourceOut: 6 });
  });

  it("keeps fade-in on the left half and fade-out on the right half", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", fadeIn: 1, fadeOut: 2 }),
    ]);
    const result = splitClip(project, "a", 5, seqIds());
    expect(getClip(result, "a")).toMatchObject({ fadeIn: 1, fadeOut: 0 });
    expect(getClip(result, "id-1")).toMatchObject({ fadeIn: 0, fadeOut: 2 });
  });

  it("partitions keyframes and rebases the right half to its own start", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", keyframes: [kf(1), kf(4), kf(6)] }),
    ]);
    const result = splitClip(project, "a", 4, seqIds());
    expect(getClip(result, "a").keyframes.map((k) => k.time)).toEqual([1]);
    expect(getClip(result, "id-1").keyframes.map((k) => k.time)).toEqual([0, 2]);
  });

  it("inserts the new clip right after the original in the clip list", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceOut: 10 }),
      makeClip({ id: "b", start: 10, sourceOut: 5 }),
    ]);
    const result = splitClip(project, "a", 4, seqIds());
    expect(result.clips.map((c) => c.id)).toEqual(["a", "id-1", "b"]);
  });

  it("keeps the main track contiguous so following clips do not move", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceOut: 10 }),
      makeClip({ id: "b", start: 10, sourceOut: 5 }),
    ]);
    const result = splitClip(project, "a", 4, seqIds());
    expect(clipEnd(getClip(result, "a"))).toBeCloseTo(getClip(result, "id-1").start, 9);
    expect(clipEnd(getClip(result, "id-1"))).toBeCloseTo(getClip(result, "b").start, 9);
  });

  it("allows a split exactly the minimum duration from the start edge", () => {
    const project = makeProject(makeStandardTracks(), [makeClip({ id: "a" })]);
    const result = splitClip(project, "a", 0.1, seqIds());
    expect(result.clips).toHaveLength(2);
  });

  it("allows a split well inside the clip near the end edge", () => {
    const project = makeProject(makeStandardTracks(), [makeClip({ id: "a" })]);
    expect(splitClip(project, "a", 9.8, seqIds()).clips).toHaveLength(2);
  });

  describe("no-ops", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceOut: 10 }),
    ]);

    it.each([[0], [0.05], [9.95], [10], [-3], [99]])(
      "returns the same project when splitting at %s",
      (at) => {
        expect(splitClip(project, "a", at, seqIds())).toBe(project);
      },
    );

    it("returns the same project for an unknown clip", () => {
      expect(splitClip(project, "nope", 5, seqIds())).toBe(project);
    });

    it("returns the same project for a locked clip", () => {
      const locked = makeProject(makeStandardTracks(), [makeClip({ id: "a", locked: true })]);
      expect(splitClip(locked, "a", 5, seqIds())).toBe(locked);
    });

    it("returns the same project for a clip on a locked track", () => {
      const lockedTrack = makeProject([makeTrack({ id: "t1", locked: true })], [
        makeClip({ id: "a" }),
      ]);
      expect(splitClip(lockedTrack, "a", 5, seqIds())).toBe(lockedTrack);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/timeline/split.test.ts`
Expected: FAIL; `@/lib/timeline/split` cannot be resolved.

- [ ] **Step 3: Implement splitClip**

`src/lib/timeline/split.ts`:

```ts
import { clipDuration, MIN_CLIP_DURATION } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { findClip, isClipLocked } from "@/lib/timeline/lookup";
import type { Clip, TimelineProject } from "@/types/timeline";

/**
 * Splits a clip at timeline time `at`. The left half keeps the original id and
 * fade-in; the right half gets `newId()` and the fade-out. Returns the same
 * project when nothing can be split (unknown or locked clip, or either half
 * would be shorter than MIN_CLIP_DURATION).
 */
export function splitClip(
  project: TimelineProject,
  clipId: string,
  at: number,
  newId: IdFn = createId,
): TimelineProject {
  const clip = findClip(project, clipId);
  if (!clip || isClipLocked(project, clip)) return project;

  const offset = at - clip.start;
  if (offset < MIN_CLIP_DURATION || clipDuration(clip) - offset < MIN_CLIP_DURATION) {
    return project;
  }

  const sourceOffset = offset * clip.speed;
  // A reversed clip plays its source from sourceOut down to sourceIn, so the
  // earlier (left) half owns the later part of the source range.
  const left: Clip = {
    ...clip,
    fadeOut: 0,
    keyframes: clip.keyframes.filter((k) => k.time < offset),
    ...(clip.reversed
      ? { sourceIn: clip.sourceOut - sourceOffset }
      : { sourceOut: clip.sourceIn + sourceOffset }),
  };
  const right: Clip = {
    ...clip,
    id: newId(),
    start: at,
    fadeIn: 0,
    keyframes: clip.keyframes
      .filter((k) => k.time >= offset)
      .map((k) => ({ ...k, time: k.time - offset })),
    ...(clip.reversed
      ? { sourceOut: clip.sourceOut - sourceOffset }
      : { sourceIn: clip.sourceIn + sourceOffset }),
  };

  const clips = [...project.clips];
  clips.splice(clips.indexOf(clip), 1, left, right);
  return { ...project, clips };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/timeline/split.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/split.ts src/lib/timeline/split.test.ts
git commit -m "feat: add splitClip" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: trimClip

**Files:**
- Create: `src/lib/timeline/trim.ts`
- Test: `src/lib/timeline/trim.test.ts`

**Interfaces:**
- Consumes: `clamp`, `clipDuration`, `clipEnd`, `EPS`, `MIN_CLIP_DURATION` (clip-math); `findClip`, `findTrack`, `isClipLocked` (lookup); `isMagnetic`, `packMagneticTracks` (pack).
- Produces: `type TrimEdge = "start" | "end"` and `trimClip(project, clipId, edge, to): TimelineProject`. `to` is the new timeline time of the dragged edge. On a magnetic track, trimming the start edge keeps the clip's `start` unchanged and lets packing close the gap. Known v1 limit: a still with `sourceDuration: null` can be extended without limit at its end edge, but its start edge can only extend back as far as its current `sourceOut`.

- [ ] **Step 1: Write the failing test**

`src/lib/timeline/trim.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { clipsOnTrack } from "@/lib/timeline/lookup";
import { trimClip } from "@/lib/timeline/trim";
import { getClip, makeClip, makeProject, makeTrack } from "@/lib/timeline/test-utils";
import type { Keyframe } from "@/types/keyframe";
import type { Clip } from "@/types/timeline";

const overlay = makeTrack({ id: "t2", type: "overlay", order: 0 });
const main = makeTrack({ id: "t1", type: "video", order: 1 });

function freeProject(overrides: Partial<Clip>) {
  return makeProject([overlay], [makeClip({ id: "a", trackId: "t2", ...overrides })]);
}

const kf = (time: number): Keyframe => ({
  id: `k${time}`,
  time,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 1,
});

describe("trimClip: end edge", () => {
  it("shortens the clip", () => {
    const result = trimClip(freeProject({ start: 0, sourceOut: 10 }), "a", "end", 6);
    expect(getClip(result, "a")).toMatchObject({ start: 0, sourceIn: 0, sourceOut: 6 });
  });

  it("extends only as far as the source file allows", () => {
    const result = trimClip(
      freeProject({ sourceIn: 0, sourceOut: 10, sourceDuration: 20 }),
      "a",
      "end",
      100,
    );
    expect(getClip(result, "a").sourceOut).toBe(20);
  });

  it("never goes below the minimum duration", () => {
    const result = trimClip(freeProject({ start: 0, sourceOut: 10 }), "a", "end", 0.01);
    expect(getClip(result, "a").sourceOut).toBeCloseTo(0.1, 9);
  });

  it("accounts for speed", () => {
    const base = freeProject({ sourceIn: 0, sourceOut: 10, speed: 2, sourceDuration: 20 });
    expect(getClip(trimClip(base, "a", "end", 3), "a").sourceOut).toBe(6);
    expect(getClip(trimClip(base, "a", "end", 100), "a").sourceOut).toBe(20);
  });

  it("lets a still with unbounded source extend freely", () => {
    const result = trimClip(
      freeProject({ kind: "image", sourceDuration: null, sourceIn: 0, sourceOut: 5 }),
      "a",
      "end",
      30,
    );
    expect(getClip(result, "a").sourceOut).toBe(30);
  });

  it("trims a reversed clip from the source start", () => {
    const result = trimClip(freeProject({ sourceIn: 0, sourceOut: 10, reversed: true }), "a", "end", 4);
    expect(getClip(result, "a")).toMatchObject({ sourceIn: 6, sourceOut: 10 });
  });

  it("returns the same project when extending a reversed clip past its source", () => {
    const project = freeProject({ sourceIn: 0, sourceOut: 10, reversed: true });
    expect(trimClip(project, "a", "end", 100)).toBe(project);
  });
});

describe("trimClip: start edge", () => {
  it("shortens from the front and advances the source in-point", () => {
    const result = trimClip(freeProject({ start: 5, sourceIn: 0, sourceOut: 10 }), "a", "start", 7);
    expect(getClip(result, "a")).toMatchObject({ start: 7, sourceIn: 2, sourceOut: 10 });
  });

  it("cannot extend before the start of the source file", () => {
    const result = trimClip(
      freeProject({ start: 5, sourceIn: 2, sourceOut: 12, sourceDuration: 20 }),
      "a",
      "start",
      0,
    );
    expect(getClip(result, "a")).toMatchObject({ start: 3, sourceIn: 0, sourceOut: 12 });
  });

  it("cannot move before timeline time 0", () => {
    const result = trimClip(
      freeProject({ start: 1, sourceIn: 5, sourceOut: 15 }),
      "a",
      "start",
      -5,
    );
    expect(getClip(result, "a")).toMatchObject({ start: 0, sourceIn: 4, sourceOut: 15 });
  });

  it("trims a reversed clip from the source end", () => {
    const result = trimClip(
      freeProject({ start: 5, sourceIn: 0, sourceOut: 10, reversed: true, sourceDuration: 20 }),
      "a",
      "start",
      7,
    );
    expect(getClip(result, "a")).toMatchObject({ start: 7, sourceIn: 0, sourceOut: 8 });
  });

  it("rebases keyframes so they stay attached to the same moment, and restores them on re-extend", () => {
    const base = freeProject({ start: 5, sourceIn: 0, sourceOut: 10, keyframes: [kf(1), kf(3)] });
    const trimmed = trimClip(base, "a", "start", 7);
    expect(getClip(trimmed, "a").keyframes.map((k) => k.time)).toEqual([-1, 1]);
    const restored = trimClip(trimmed, "a", "start", 5);
    expect(getClip(restored, "a").keyframes.map((k) => k.time)).toEqual([1, 3]);
  });
});

describe("trimClip: magnetic main track", () => {
  const twoClips = () =>
    makeProject(
      [main],
      [
        makeClip({ id: "a", start: 0, sourceIn: 0, sourceOut: 5 }),
        makeClip({ id: "b", start: 5, sourceIn: 0, sourceOut: 5 }),
      ],
    );

  it("ripples later clips left when the end edge shortens a clip", () => {
    const result = trimClip(twoClips(), "a", "end", 3);
    expect(getClip(result, "a").sourceOut).toBe(3);
    expect(getClip(result, "b").start).toBe(3);
  });

  it("keeps the clip in place when the start edge shortens it", () => {
    const result = trimClip(twoClips(), "b", "start", 7);
    expect(getClip(result, "b")).toMatchObject({ start: 5, sourceIn: 2, sourceOut: 5 });
    expect(clipsOnTrack(result, "t1").map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("trimClip: no-ops", () => {
  it("returns the same project for an unknown clip", () => {
    const project = freeProject({});
    expect(trimClip(project, "nope", "end", 3)).toBe(project);
  });

  it("returns the same project for a locked clip", () => {
    const project = freeProject({ locked: true });
    expect(trimClip(project, "a", "end", 3)).toBe(project);
  });

  it("returns the same project when the edge does not move", () => {
    const project = freeProject({ start: 0, sourceOut: 10 });
    expect(trimClip(project, "a", "end", 10)).toBe(project);
  });
});

describe("trimClip: invariants", () => {
  const targets = [-10, 0, 1, 4, 5, 7, 10, 13, 20, 100];

  it.each([false, true])("keeps source bounds valid for reversed=%s", (reversed) => {
    for (const speed of [0.5, 1, 2]) {
      for (const edge of ["start", "end"] as const) {
        for (const to of targets) {
          const project = freeProject({
            start: 4,
            sourceIn: 3,
            sourceOut: 9,
            sourceDuration: 12,
            speed,
            reversed,
          });
          const clip = getClip(trimClip(project, "a", edge, to), "a");
          const label = `speed=${speed} edge=${edge} to=${to}`;
          expect(clip.sourceIn, label).toBeGreaterThanOrEqual(-1e-9);
          expect(clip.sourceOut, label).toBeLessThanOrEqual(12 + 1e-9);
          expect(clip.sourceIn, label).toBeLessThan(clip.sourceOut);
          expect(clip.start, label).toBeGreaterThanOrEqual(-1e-9);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/timeline/trim.test.ts`
Expected: FAIL; `@/lib/timeline/trim` cannot be resolved.

- [ ] **Step 3: Implement trimClip**

`src/lib/timeline/trim.ts`:

```ts
import {
  clamp,
  clipDuration,
  clipEnd,
  EPS,
  MIN_CLIP_DURATION,
} from "@/lib/timeline/clip-math";
import { findClip, findTrack, isClipLocked } from "@/lib/timeline/lookup";
import { isMagnetic, packMagneticTracks } from "@/lib/timeline/pack";
import type { Clip, TimelineProject } from "@/types/timeline";

export type TrimEdge = "start" | "end";

/**
 * Moves one edge of a clip to timeline time `to`, clamped to the source file
 * and to MIN_CLIP_DURATION. On a magnetic track the clip keeps its `start`
 * when its start edge moves, and packing closes the resulting gap.
 */
export function trimClip(
  project: TimelineProject,
  clipId: string,
  edge: TrimEdge,
  to: number,
): TimelineProject {
  const clip = findClip(project, clipId);
  if (!clip || isClipLocked(project, clip)) return project;
  const track = findTrack(project, clip.trackId);
  if (!track) return project;

  const duration = clipDuration(clip);
  const end = clipEnd(clip);

  // Dragging the end of a forward clip, or the start of a reversed clip,
  // moves sourceOut; the other two combinations move sourceIn.
  const movesSourceOut = (edge === "end") !== clip.reversed;
  const sourceAvailable = movesSourceOut
    ? (clip.sourceDuration ?? Infinity) - clip.sourceIn
    : clip.sourceOut;
  let maxDuration = sourceAvailable / clip.speed;
  // The start edge cannot move before timeline time 0.
  if (edge === "start") maxDuration = Math.min(maxDuration, end);

  const requested = edge === "end" ? to - clip.start : end - to;
  const newDuration = clamp(requested, MIN_CLIP_DURATION, maxDuration);
  if (Math.abs(newDuration - duration) < EPS) return project;

  const span = newDuration * clip.speed;
  const updated: Clip = {
    ...clip,
    ...(movesSourceOut
      ? { sourceOut: clip.sourceIn + span }
      : { sourceIn: clip.sourceOut - span }),
  };

  if (edge === "start") {
    if (!isMagnetic(track)) updated.start = end - newDuration;
    // Keyframe times are relative to the clip start; removing `headTrim`
    // seconds from the front shifts every keyframe earlier by that amount.
    const headTrim = duration - newDuration;
    updated.keyframes = clip.keyframes.map((k) => ({ ...k, time: k.time - headTrim }));
  }

  return packMagneticTracks({
    ...project,
    clips: project.clips.map((c) => (c.id === clipId ? updated : c)),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/timeline/trim.test.ts`
Expected: PASS (including the invariants loop).

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/trim.ts src/lib/timeline/trim.test.ts
git commit -m "feat: add trimClip with source-bound clamping" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: deleteClips and rippleDeleteClips

**Files:**
- Create: `src/lib/timeline/delete.ts`
- Test: `src/lib/timeline/delete.test.ts`

**Interfaces:**
- Consumes: `clipDuration`, `clipEnd`, `EPS` (clip-math); `isClipLocked` (lookup); `packMagneticTracks` (pack).
- Produces:
  - `deleteClips(project, clipIds: string[]): TimelineProject`: removes unlocked clips and re-packs magnetic tracks. Other tracks keep their gaps.
  - `rippleDeleteClips(project, clipIds: string[]): TimelineProject`: also shifts later clips left on non-magnetic tracks. A clip shifts by the total duration of removed clips on its track that end at or before its start. Clips that overlap a removed clip, and locked clips, do not move.
  - Both return the same project when nothing is removable.

- [ ] **Step 1: Write the failing test**

`src/lib/timeline/delete.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { deleteClips, rippleDeleteClips } from "@/lib/timeline/delete";
import {
  getClip,
  makeClip,
  makeProject,
  makeStandardTracks,
  makeTrack,
} from "@/lib/timeline/test-utils";

const mainProject = () =>
  makeProject(makeStandardTracks(), [
    makeClip({ id: "a", start: 0, sourceOut: 4 }),
    makeClip({ id: "b", start: 4, sourceOut: 3 }),
    makeClip({ id: "c", start: 7, sourceOut: 2 }),
  ]);

const overlayProject = () =>
  makeProject(makeStandardTracks(), [
    makeClip({ id: "x", trackId: "t2", kind: "image", start: 0, sourceOut: 2, sourceDuration: null }),
    makeClip({ id: "y", trackId: "t2", kind: "image", start: 3, sourceOut: 2, sourceDuration: null }),
    makeClip({ id: "z", trackId: "t2", kind: "image", start: 6, sourceOut: 2, sourceDuration: null }),
  ]);

describe("deleteClips", () => {
  it("closes the gap on the main track", () => {
    const result = deleteClips(mainProject(), ["b"]);
    expect(result.clips.map((c) => c.id)).toEqual(["a", "c"]);
    expect(getClip(result, "c").start).toBe(4);
  });

  it("leaves a gap on an overlay track", () => {
    const result = deleteClips(overlayProject(), ["x"]);
    expect(getClip(result, "y").start).toBe(3);
  });

  it("deletes several clips at once", () => {
    const result = deleteClips(mainProject(), ["a", "c"]);
    expect(result.clips.map((c) => [c.id, c.start])).toEqual([["b", 0]]);
  });

  it("skips locked clips but deletes the rest", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceOut: 4, locked: true }),
      makeClip({ id: "b", start: 4, sourceOut: 3 }),
    ]);
    expect(deleteClips(project, ["a", "b"]).clips.map((c) => c.id)).toEqual(["a"]);
  });

  it("returns the same project when nothing is removable", () => {
    const project = mainProject();
    expect(deleteClips(project, ["nope"])).toBe(project);
    expect(deleteClips(project, [])).toBe(project);
    const lockedTrack = makeProject([makeTrack({ id: "t1", locked: true })], [
      makeClip({ id: "a" }),
    ]);
    expect(deleteClips(lockedTrack, ["a"])).toBe(lockedTrack);
  });
});

describe("rippleDeleteClips", () => {
  it("shifts later clips left on an overlay track", () => {
    const result = rippleDeleteClips(overlayProject(), ["x"]);
    expect(getClip(result, "y").start).toBe(1);
    expect(getClip(result, "z").start).toBe(4);
  });

  it("shifts by the combined duration of several removed clips", () => {
    const result = rippleDeleteClips(overlayProject(), ["x", "y"]);
    expect(getClip(result, "z").start).toBe(2);
  });

  it("matches a plain delete on the main track", () => {
    expect(rippleDeleteClips(mainProject(), ["b"])).toEqual(deleteClips(mainProject(), ["b"]));
  });

  it("does not shift a clip that overlaps the removed clip", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "x", trackId: "t2", kind: "image", start: 0, sourceOut: 4, sourceDuration: null }),
      makeClip({ id: "y", trackId: "t2", kind: "image", start: 2, sourceOut: 4, sourceDuration: null }),
      makeClip({ id: "z", trackId: "t2", kind: "image", start: 4, sourceOut: 2, sourceDuration: null }),
    ]);
    const result = rippleDeleteClips(project, ["x"]);
    expect(getClip(result, "y").start).toBe(2);
    expect(getClip(result, "z").start).toBe(0);
  });

  it("does not shift locked clips", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "x", trackId: "t2", kind: "image", start: 0, sourceOut: 2, sourceDuration: null }),
      makeClip({ id: "y", trackId: "t2", kind: "image", start: 3, sourceOut: 2, sourceDuration: null, locked: true }),
    ]);
    expect(getClip(rippleDeleteClips(project, ["x"]), "y").start).toBe(3);
  });

  it("returns the same project when nothing is removable", () => {
    const project = overlayProject();
    expect(rippleDeleteClips(project, ["nope"])).toBe(project);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/timeline/delete.test.ts`
Expected: FAIL; `@/lib/timeline/delete` cannot be resolved.

- [ ] **Step 3: Implement delete**

`src/lib/timeline/delete.ts`:

```ts
import { clipDuration, clipEnd, EPS } from "@/lib/timeline/clip-math";
import { isClipLocked } from "@/lib/timeline/lookup";
import { packMagneticTracks } from "@/lib/timeline/pack";
import type { Clip, TimelineProject } from "@/types/timeline";

function removableClips(project: TimelineProject, clipIds: string[]): Clip[] {
  const ids = new Set(clipIds);
  return project.clips.filter((clip) => ids.has(clip.id) && !isClipLocked(project, clip));
}

/** Removes unlocked clips. Magnetic tracks close the gap; other tracks keep it. */
export function deleteClips(project: TimelineProject, clipIds: string[]): TimelineProject {
  const removed = removableClips(project, clipIds);
  if (removed.length === 0) return project;
  const removedIds = new Set(removed.map((clip) => clip.id));
  return packMagneticTracks({
    ...project,
    clips: project.clips.filter((clip) => !removedIds.has(clip.id)),
  });
}

/**
 * Like deleteClips, but clips on non-magnetic tracks that start at or after a
 * removed clip's end shift left by its duration. Overlapping and locked clips
 * stay put.
 */
export function rippleDeleteClips(project: TimelineProject, clipIds: string[]): TimelineProject {
  const removed = removableClips(project, clipIds);
  if (removed.length === 0) return project;
  const removedIds = new Set(removed.map((clip) => clip.id));

  const clips = project.clips
    .filter((clip) => !removedIds.has(clip.id))
    .map((clip) => {
      if (clip.locked) return clip;
      const shift = removed
        .filter((r) => r.trackId === clip.trackId && clip.start >= clipEnd(r) - EPS)
        .reduce((sum, r) => sum + clipDuration(r), 0);
      return shift > 0 ? { ...clip, start: Math.max(0, clip.start - shift) } : clip;
    });

  return packMagneticTracks({ ...project, clips });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/timeline/delete.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/delete.ts src/lib/timeline/delete.test.ts
git commit -m "feat: add deleteClips and rippleDeleteClips" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: placeClip, moveClip and insertClip

**Files:**
- Create: `src/lib/timeline/place.ts`
- Test: `src/lib/timeline/place.test.ts`

**Interfaces:**
- Consumes: `clipDuration` (clip-math); `canHostClip`, `clipsOnTrack`, `findClip`, `findTrack`, `isClipLocked` (lookup); `isMagnetic`, `packClips`, `packMagneticTracks`, `replaceTrackClips` (pack).
- Produces:
  - `placeClip(project, clip): TimelineProject`: internal helper, exported for reuse. `clip` must not already be in `project.clips`. On a free track it appends with `start` clamped to ≥ 0. On a magnetic track it inserts at the index found by comparing midpoints, then packs that track.
  - `moveClip(project, clipId, to: { start: number; trackId?: string }): TimelineProject`: also serves as the main-track *reorder*. Rejects (same project) for unknown or locked clips, an unknown or locked target track, or an incompatible track.
  - `insertClip(project, clip): TimelineProject`: adds a new clip (for example from a Media-panel drop). Rejects a duplicate id, an unknown or locked track, or an incompatible track.

- [ ] **Step 1: Write the failing test**

`src/lib/timeline/place.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { insertClip, moveClip } from "@/lib/timeline/place";
import {
  getClip,
  makeClip,
  makeProject,
  makeStandardTracks,
  makeTrack,
} from "@/lib/timeline/test-utils";

// Main track t1: A[0,4] B[4,10] C[10,12]. Overlay t2 and audio t3 are empty.
const mainProject = () =>
  makeProject(makeStandardTracks(), [
    makeClip({ id: "A", start: 0, sourceOut: 4 }),
    makeClip({ id: "B", start: 4, sourceOut: 6 }),
    makeClip({ id: "C", start: 10, sourceOut: 2 }),
  ]);

const still = (overrides = {}) =>
  makeClip({ kind: "image", sourceDuration: null, sourceIn: 0, sourceOut: 5, ...overrides });

describe("moveClip on free tracks", () => {
  const project = makeProject(makeStandardTracks(), [
    still({ id: "o", trackId: "t2", start: 2 }),
  ]);

  it("moves a clip to a new start", () => {
    expect(getClip(moveClip(project, "o", { start: 12 }), "o").start).toBe(12);
  });

  it("clamps a negative start to 0", () => {
    expect(getClip(moveClip(project, "o", { start: -4 }), "o").start).toBe(0);
  });

  it("allows overlapping another clip", () => {
    const two = makeProject(makeStandardTracks(), [
      still({ id: "o", trackId: "t2", start: 0 }),
      still({ id: "p", trackId: "t2", start: 20 }),
    ]);
    const result = moveClip(two, "p", { start: 1 });
    expect(getClip(result, "p").start).toBe(1);
    expect(getClip(result, "o").start).toBe(0);
  });
});

describe("moveClip on the main track (reorder)", () => {
  it("reorders by midpoint and re-packs", () => {
    const result = moveClip(mainProject(), "A", { start: 7 });
    expect(getClip(result, "B").start).toBe(0);
    expect(getClip(result, "A").start).toBe(6);
    expect(getClip(result, "C").start).toBe(10);
  });

  it("moves a clip to the end when dropped far right", () => {
    const result = moveClip(mainProject(), "A", { start: 100 });
    expect(getClip(result, "B").start).toBe(0);
    expect(getClip(result, "C").start).toBe(6);
    expect(getClip(result, "A").start).toBe(8);
  });

  it("moves a clip to the front when dropped at 0", () => {
    const result = moveClip(mainProject(), "C", { start: 0 });
    expect(getClip(result, "C").start).toBe(0);
    expect(getClip(result, "A").start).toBe(2);
    expect(getClip(result, "B").start).toBe(6);
  });

  it("inserts an overlay clip into the main track and ripples the rest", () => {
    const project = makeProject(makeStandardTracks(), [
      ...mainProject().clips,
      still({ id: "O", trackId: "t2", start: 3 }),
    ]);
    const result = moveClip(project, "O", { start: 1, trackId: "t1" });
    expect(getClip(result, "O").trackId).toBe("t1");
    expect(getClip(result, "A").start).toBe(0);
    expect(getClip(result, "O").start).toBe(4);
    expect(getClip(result, "B").start).toBe(9);
    expect(getClip(result, "C").start).toBe(15);
  });

  it("closes the gap when a main-track clip moves to an overlay track", () => {
    const result = moveClip(mainProject(), "B", { start: 20, trackId: "t2" });
    expect(getClip(result, "B")).toMatchObject({ trackId: "t2", start: 20 });
    expect(getClip(result, "C").start).toBe(4);
  });
});

describe("moveClip rejections", () => {
  it("rejects an audio clip on the video track", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "s", trackId: "t3", kind: "audio", start: 0, sourceOut: 3 }),
    ]);
    expect(moveClip(project, "s", { start: 0, trackId: "t1" })).toBe(project);
  });

  it("rejects a video clip on an audio track", () => {
    const project = mainProject();
    expect(moveClip(project, "A", { start: 0, trackId: "t3" })).toBe(project);
  });

  it("rejects a locked clip, a locked target track and unknown ids", () => {
    const lockedClip = makeProject(makeStandardTracks(), [
      still({ id: "o", trackId: "t2", locked: true }),
    ]);
    expect(moveClip(lockedClip, "o", { start: 3 })).toBe(lockedClip);

    const tracks = [...makeStandardTracks().filter((t) => t.id !== "t2"), makeTrack({ id: "t2", type: "overlay", order: 0, locked: true })];
    const lockedTarget = makeProject(tracks, [still({ id: "o", trackId: "t1" })]);
    expect(moveClip(lockedTarget, "o", { start: 3, trackId: "t2" })).toBe(lockedTarget);

    const project = mainProject();
    expect(moveClip(project, "nope", { start: 1 })).toBe(project);
    expect(moveClip(project, "A", { start: 1, trackId: "nope" })).toBe(project);
  });
});

describe("insertClip", () => {
  it("adds a clip to an overlay track at its start", () => {
    const project = makeProject(makeStandardTracks(), []);
    const result = insertClip(project, still({ id: "n", trackId: "t2", start: 8 }));
    expect(getClip(result, "n").start).toBe(8);
  });

  it("inserts into the main track at the midpoint position and packs", () => {
    const result = insertClip(
      mainProject(),
      makeClip({ id: "D", start: 5, sourceIn: 0, sourceOut: 2 }),
    );
    expect(getClip(result, "A").start).toBe(0);
    expect(getClip(result, "D").start).toBe(4);
    expect(getClip(result, "B").start).toBe(6);
    expect(getClip(result, "C").start).toBe(12);
  });

  it("rejects duplicate ids, unknown tracks, incompatible tracks and locked tracks", () => {
    const project = mainProject();
    expect(insertClip(project, makeClip({ id: "A" }))).toBe(project);
    expect(insertClip(project, makeClip({ id: "n", trackId: "nope" }))).toBe(project);
    expect(insertClip(project, makeClip({ id: "n", trackId: "t1", kind: "audio" }))).toBe(project);

    const locked = makeProject([makeTrack({ id: "t1", locked: true })], []);
    expect(insertClip(locked, makeClip({ id: "n" }))).toBe(locked);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/timeline/place.test.ts`
Expected: FAIL; `@/lib/timeline/place` cannot be resolved.

- [ ] **Step 3: Implement place**

`src/lib/timeline/place.ts`:

```ts
import { clipDuration } from "@/lib/timeline/clip-math";
import {
  canHostClip,
  clipsOnTrack,
  findClip,
  findTrack,
  isClipLocked,
} from "@/lib/timeline/lookup";
import {
  isMagnetic,
  packClips,
  packMagneticTracks,
  replaceTrackClips,
} from "@/lib/timeline/pack";
import type { Clip, TimelineProject } from "@/types/timeline";

/**
 * Puts `clip` (which must not already be in the project) on its track. Free
 * tracks take it at `start`. Magnetic tracks insert it before the first clip
 * whose midpoint is later than the new clip's midpoint, then pack.
 */
export function placeClip(project: TimelineProject, clip: Clip): TimelineProject {
  const track = findTrack(project, clip.trackId);
  if (!track) return project;

  const placed = { ...clip, start: Math.max(0, clip.start) };
  if (!isMagnetic(track)) return { ...project, clips: [...project.clips, placed] };

  const others = clipsOnTrack(project, track.id);
  const midpoint = placed.start + clipDuration(placed) / 2;
  const index = others.filter((o) => o.start + clipDuration(o) / 2 < midpoint).length;
  const ordered = [...others.slice(0, index), placed, ...others.slice(index)];
  return replaceTrackClips(project, track.id, packClips(ordered));
}

/**
 * Moves a clip to `to.start`, optionally onto another track. On a magnetic
 * target track this reorders the clips. Returns the same project when the
 * clip or target track is missing or locked, or the track cannot host the clip.
 */
export function moveClip(
  project: TimelineProject,
  clipId: string,
  to: { start: number; trackId?: string },
): TimelineProject {
  const clip = findClip(project, clipId);
  if (!clip || isClipLocked(project, clip)) return project;

  const target = findTrack(project, to.trackId ?? clip.trackId);
  if (!target || target.locked || !canHostClip(target, clip)) return project;

  const without = { ...project, clips: project.clips.filter((c) => c.id !== clipId) };
  return packMagneticTracks(placeClip(without, { ...clip, trackId: target.id, start: to.start }));
}

/** Adds a new clip. Same rejection rules as moveClip, plus duplicate ids. */
export function insertClip(project: TimelineProject, clip: Clip): TimelineProject {
  if (findClip(project, clip.id)) return project;
  const track = findTrack(project, clip.trackId);
  if (!track || track.locked || !canHostClip(track, clip)) return project;
  return packMagneticTracks(placeClip(project, clip));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/timeline/place.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/place.ts src/lib/timeline/place.test.ts
git commit -m "feat: add placeClip, moveClip and insertClip" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: duplicateClip, setSpeed and updateClip

**Files:**
- Create: `src/lib/timeline/clip-edits.ts`
- Test: `src/lib/timeline/clip-edits.test.ts`

**Interfaces:**
- Consumes: `clamp`, `clipDuration`, `clipEnd`, `EPS`, `MAX_SPEED`, `MIN_CLIP_DURATION`, `MIN_SPEED` (clip-math); `findClip`, `findTrack`, `isClipLocked`, `clipsOnTrack` (lookup); `isMagnetic`, `packClips`, `packMagneticTracks`, `replaceTrackClips` (pack); `IdFn`, `createId` (ids).
- Produces:
  - `duplicateClip(project, clipId, newId?: IdFn): TimelineProject`: the copy sits immediately after the original (right after it on a magnetic track, at the original's end on a free track), with `groupId: null`. Rejects locked clips.
  - `setSpeed(project, clipId, speed): TimelineProject`: clamps to `[MIN_SPEED, min(MAX_SPEED, sourceSpan / MIN_CLIP_DURATION)]`, clamps fades to the new duration, and re-packs magnetic tracks. Returns the same project when the speed is unchanged.
  - `type ClipPatch = Partial<Pick<Clip, "name" | "volume" | "muted" | "fadeIn" | "fadeOut" | "transform" | "adjustments" | "keyframes" | "locked" | "reversed" | "loop" | "groupId" | "isPlaceholder">>`
  - `updateClip(project, clipId, patch: ClipPatch): TimelineProject`: when the clip or its track is locked, only a patch containing nothing but `locked` is allowed. Fades are clamped to `[0, duration]`.

- [ ] **Step 1: Write the failing test**

`src/lib/timeline/clip-edits.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { duplicateClip, setSpeed, updateClip } from "@/lib/timeline/clip-edits";
import { clipDuration } from "@/lib/timeline/clip-math";
import {
  getClip,
  makeClip,
  makeProject,
  makeStandardTracks,
  makeTrack,
  seqIds,
} from "@/lib/timeline/test-utils";

const mainProject = () =>
  makeProject(makeStandardTracks(), [
    makeClip({ id: "A", start: 0, sourceOut: 4 }),
    makeClip({ id: "B", start: 4, sourceOut: 6 }),
    makeClip({ id: "C", start: 10, sourceOut: 2 }),
  ]);

describe("duplicateClip", () => {
  it("places the copy right after the original on a free track", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "x", trackId: "t2", kind: "image", sourceDuration: null, start: 2, sourceOut: 3 }),
    ]);
    const result = duplicateClip(project, "x", seqIds());
    expect(getClip(result, "id-1")).toMatchObject({ trackId: "t2", start: 5, name: "clip" });
  });

  it("inserts directly after the original on the main track and ripples", () => {
    const result = duplicateClip(mainProject(), "B", seqIds());
    expect(getClip(result, "B").start).toBe(4);
    expect(getClip(result, "id-1").start).toBe(10);
    expect(getClip(result, "C").start).toBe(16);
  });

  it("drops the copy's group membership", () => {
    const project = makeProject(makeStandardTracks(), [makeClip({ id: "A", groupId: "g1" })]);
    expect(getClip(duplicateClip(project, "A", seqIds()), "id-1").groupId).toBeNull();
  });

  it("returns the same project for locked or unknown clips", () => {
    const locked = makeProject(makeStandardTracks(), [makeClip({ id: "A", locked: true })]);
    expect(duplicateClip(locked, "A", seqIds())).toBe(locked);
    const project = mainProject();
    expect(duplicateClip(project, "nope", seqIds())).toBe(project);
  });
});

describe("setSpeed", () => {
  it("halves the duration at double speed and ripples the main track", () => {
    const result = setSpeed(mainProject(), "A", 2);
    expect(clipDuration(getClip(result, "A"))).toBe(2);
    expect(getClip(result, "B").start).toBe(2);
  });

  it("leaves later clips on free tracks where they are", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "x", trackId: "t2", start: 0, sourceOut: 4 }),
      makeClip({ id: "y", trackId: "t2", start: 6, sourceOut: 4 }),
    ]);
    expect(getClip(setSpeed(project, "x", 2), "y").start).toBe(6);
  });

  it("clamps to the speed range", () => {
    const project = makeProject(makeStandardTracks(), [makeClip({ id: "A", sourceOut: 100, sourceDuration: 100 })]);
    expect(getClip(setSpeed(project, "A", 50), "A").speed).toBe(8);
    expect(getClip(setSpeed(project, "A", 0.01), "A").speed).toBe(0.1);
  });

  it("never lets the clip drop below the minimum duration", () => {
    const project = makeProject(makeStandardTracks(), [makeClip({ id: "A", sourceOut: 0.5 })]);
    const result = getClip(setSpeed(project, "A", 20), "A");
    expect(result.speed).toBe(5);
    expect(clipDuration(result)).toBeCloseTo(0.1, 9);
  });

  it("clamps fades to the new duration", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "A", sourceOut: 10, fadeIn: 4, fadeOut: 4 }),
    ]);
    expect(getClip(setSpeed(project, "A", 4), "A")).toMatchObject({ fadeIn: 2.5, fadeOut: 2.5 });
  });

  it("returns the same project for an unchanged speed, locked or unknown clip", () => {
    const project = mainProject();
    expect(setSpeed(project, "A", 1)).toBe(project);
    expect(setSpeed(project, "nope", 2)).toBe(project);
    const locked = makeProject(makeStandardTracks(), [makeClip({ id: "A", locked: true })]);
    expect(setSpeed(locked, "A", 2)).toBe(locked);
  });
});

describe("updateClip", () => {
  const project = makeProject(makeStandardTracks(), [makeClip({ id: "A", sourceOut: 10 })]);

  it("applies a patch", () => {
    const result = updateClip(project, "A", { volume: 40, muted: true, name: "Intro" });
    expect(getClip(result, "A")).toMatchObject({ volume: 40, muted: true, name: "Intro" });
  });

  it("clamps fades to [0, duration]", () => {
    expect(getClip(updateClip(project, "A", { fadeIn: 50 }), "A").fadeIn).toBe(10);
    expect(getClip(updateClip(project, "A", { fadeOut: -3 }), "A").fadeOut).toBe(0);
  });

  it("blocks edits on a locked clip but allows unlocking it", () => {
    const locked = makeProject(makeStandardTracks(), [makeClip({ id: "A", locked: true })]);
    expect(updateClip(locked, "A", { volume: 10 })).toBe(locked);
    expect(updateClip(locked, "A", { volume: 10, locked: false })).toBe(locked);
    expect(getClip(updateClip(locked, "A", { locked: false }), "A").locked).toBe(false);
  });

  it("blocks edits on a locked track", () => {
    const lockedTrack = makeProject([makeTrack({ id: "t1", locked: true })], [makeClip({ id: "A" })]);
    expect(updateClip(lockedTrack, "A", { volume: 10 })).toBe(lockedTrack);
  });

  it("returns the same project for an unknown clip", () => {
    expect(updateClip(project, "nope", { volume: 1 })).toBe(project);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/timeline/clip-edits.test.ts`
Expected: FAIL; `@/lib/timeline/clip-edits` cannot be resolved.

- [ ] **Step 3: Implement clip-edits**

`src/lib/timeline/clip-edits.ts`:

```ts
import {
  clamp,
  clipDuration,
  clipEnd,
  MAX_SPEED,
  MIN_CLIP_DURATION,
  MIN_SPEED,
} from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { clipsOnTrack, findClip, findTrack, isClipLocked } from "@/lib/timeline/lookup";
import {
  isMagnetic,
  packClips,
  packMagneticTracks,
  replaceTrackClips,
} from "@/lib/timeline/pack";
import type { Clip, TimelineProject } from "@/types/timeline";

function replaceClip(project: TimelineProject, updated: Clip): TimelineProject {
  return {
    ...project,
    clips: project.clips.map((clip) => (clip.id === updated.id ? updated : clip)),
  };
}

/** Copies a clip to sit immediately after the original. */
export function duplicateClip(
  project: TimelineProject,
  clipId: string,
  newId: IdFn = createId,
): TimelineProject {
  const clip = findClip(project, clipId);
  if (!clip || isClipLocked(project, clip)) return project;
  const track = findTrack(project, clip.trackId);
  if (!track) return project;

  const copy: Clip = { ...clip, id: newId(), start: clipEnd(clip), groupId: null };
  if (!isMagnetic(track)) return { ...project, clips: [...project.clips, copy] };

  const ordered = clipsOnTrack(project, track.id);
  ordered.splice(ordered.findIndex((c) => c.id === clipId) + 1, 0, copy);
  return replaceTrackClips(project, track.id, packClips(ordered));
}

/** Changes playback speed, keeping the trimmed source range. */
export function setSpeed(project: TimelineProject, clipId: string, speed: number): TimelineProject {
  const clip = findClip(project, clipId);
  if (!clip || isClipLocked(project, clip)) return project;

  const maxForMinDuration = (clip.sourceOut - clip.sourceIn) / MIN_CLIP_DURATION;
  const next = clamp(speed, MIN_SPEED, Math.min(MAX_SPEED, maxForMinDuration));
  if (next === clip.speed) return project;

  const resized: Clip = { ...clip, speed: next };
  const duration = clipDuration(resized);
  resized.fadeIn = Math.min(resized.fadeIn, duration);
  resized.fadeOut = Math.min(resized.fadeOut, duration);
  return packMagneticTracks(replaceClip(project, resized));
}

export type ClipPatch = Partial<
  Pick<
    Clip,
    | "name"
    | "volume"
    | "muted"
    | "fadeIn"
    | "fadeOut"
    | "transform"
    | "adjustments"
    | "keyframes"
    | "locked"
    | "reversed"
    | "loop"
    | "groupId"
    | "isPlaceholder"
  >
>;

/**
 * Applies non-timing property changes. When the clip or its track is locked,
 * only a patch that contains nothing but `locked` is accepted.
 */
export function updateClip(
  project: TimelineProject,
  clipId: string,
  patch: ClipPatch,
): TimelineProject {
  const clip = findClip(project, clipId);
  if (!clip) return project;

  const onlyLocked = Object.keys(patch).every((key) => key === "locked");
  if (isClipLocked(project, clip) && !onlyLocked) return project;

  const duration = clipDuration(clip);
  const updated: Clip = { ...clip, ...patch };
  if (patch.fadeIn !== undefined) updated.fadeIn = clamp(patch.fadeIn, 0, duration);
  if (patch.fadeOut !== undefined) updated.fadeOut = clamp(patch.fadeOut, 0, duration);
  return replaceClip(project, updated);
}
```

Note: a patch containing anything besides `locked` is rejected on a locked clip. A lone `{ locked: false }` succeeds only when the clip's *track* is unlocked, because `isClipLocked` is also true for a locked track and the clip's own unlocking never overrides it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/timeline/clip-edits.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/clip-edits.ts src/lib/timeline/clip-edits.test.ts
git commit -m "feat: add duplicateClip, setSpeed and updateClip" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Track operations

**Files:**
- Create: `src/lib/timeline/tracks.ts`
- Test: `src/lib/timeline/tracks.test.ts`

**Interfaces:**
- Consumes: `IdFn`, `createId` (ids); types.
- Produces:
  - `addTrack(project, type: TrackType, newId?: IdFn): TimelineProject`: a new `overlay` goes on top, a new `video` goes just below the overlays, a new `audio` goes at the bottom; `order` is renumbered to 0..n-1 top to bottom.
  - `type TrackPatch = Partial<Pick<Track, "muted" | "locked" | "hidden" | "solo">>`
  - `updateTrack(project, trackId, patch: TrackPatch): TimelineProject` (always allowed, so a locked track can be unlocked; same project for an unknown id).

- [ ] **Step 1: Write the failing test**

`src/lib/timeline/tracks.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { addTrack, updateTrack } from "@/lib/timeline/tracks";
import { makeProject, makeStandardTracks, seqIds } from "@/lib/timeline/test-utils";

const ids = (project: ReturnType<typeof makeProject>) =>
  [...project.tracks].sort((a, b) => a.order - b.order).map((t) => t.id);

describe("addTrack", () => {
  it("puts a new overlay track on top", () => {
    const result = addTrack(makeProject(makeStandardTracks(), []), "overlay", seqIds());
    expect(ids(result)).toEqual(["id-1", "t2", "t1", "t3"]);
  });

  it("puts a new audio track at the bottom", () => {
    const result = addTrack(makeProject(makeStandardTracks(), []), "audio", seqIds());
    expect(ids(result)).toEqual(["t2", "t1", "t3", "id-1"]);
  });

  it("puts a new video track just below the overlays", () => {
    const result = addTrack(makeProject(makeStandardTracks(), []), "video", seqIds());
    expect(ids(result)).toEqual(["t2", "id-1", "t1", "t3"]);
  });

  it("renumbers order to 0..n-1 and keeps existing flags", () => {
    const tracks = makeStandardTracks().map((t) => (t.id === "t3" ? { ...t, muted: true } : t));
    const result = addTrack(makeProject(tracks, []), "overlay", seqIds());
    expect(result.tracks.map((t) => t.order).sort()).toEqual([0, 1, 2, 3]);
    expect(result.tracks.find((t) => t.id === "t3")?.muted).toBe(true);
  });

  it("creates a track with default flags", () => {
    const result = addTrack(makeProject([], []), "video", seqIds());
    expect(result.tracks).toEqual([
      { id: "id-1", type: "video", order: 0, muted: false, locked: false, hidden: false, solo: false },
    ]);
  });
});

describe("updateTrack", () => {
  const project = makeProject(makeStandardTracks(), []);

  it("applies a patch to one track", () => {
    const result = updateTrack(project, "t2", { muted: true, solo: true });
    expect(result.tracks.find((t) => t.id === "t2")).toMatchObject({ muted: true, solo: true });
    expect(result.tracks.find((t) => t.id === "t1")?.muted).toBe(false);
  });

  it("lets a locked track be unlocked", () => {
    const locked = updateTrack(project, "t1", { locked: true });
    expect(updateTrack(locked, "t1", { locked: false }).tracks.find((t) => t.id === "t1")?.locked).toBe(false);
  });

  it("returns the same project for an unknown track", () => {
    expect(updateTrack(project, "nope", { muted: true })).toBe(project);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/timeline/tracks.test.ts`
Expected: FAIL; `@/lib/timeline/tracks` cannot be resolved.

- [ ] **Step 3: Implement tracks**

`src/lib/timeline/tracks.ts`:

```ts
import { createId, type IdFn } from "@/lib/timeline/ids";
import type { TimelineProject, Track, TrackType } from "@/types/timeline";

/**
 * Adds a track and renumbers `order` top to bottom. Overlays stack on top,
 * video goes just below the overlays, audio goes at the bottom.
 */
export function addTrack(
  project: TimelineProject,
  type: TrackType,
  newId: IdFn = createId,
): TimelineProject {
  const track: Track = {
    id: newId(),
    type,
    order: 0,
    muted: false,
    locked: false,
    hidden: false,
    solo: false,
  };

  const sorted = [...project.tracks].sort((a, b) => a.order - b.order);
  const index =
    type === "overlay"
      ? 0
      : type === "video"
        ? sorted.filter((t) => t.type === "overlay").length
        : sorted.length;
  sorted.splice(index, 0, track);

  return {
    ...project,
    tracks: sorted.map((t, i) => (t.order === i ? t : { ...t, order: i })),
  };
}

export type TrackPatch = Partial<Pick<Track, "muted" | "locked" | "hidden" | "solo">>;

/** Always allowed, so a locked track can be unlocked. */
export function updateTrack(
  project: TimelineProject,
  trackId: string,
  patch: TrackPatch,
): TimelineProject {
  if (!project.tracks.some((t) => t.id === trackId)) return project;
  return {
    ...project,
    tracks: project.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/timeline/tracks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/tracks.ts src/lib/timeline/tracks.test.ts
git commit -m "feat: add addTrack and updateTrack" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Snapping

**Files:**
- Create: `src/lib/timeline/snap.ts`
- Test: `src/lib/timeline/snap.test.ts`

**Interfaces:**
- Consumes: `clipEnd` (clip-math); types.
- Produces:
  - `snapThresholdSeconds(thresholdPx: number, pixelsPerSecond: number): number`
  - `collectSnapTargets(project, excludeClipIds: string[], playhead: number): number[]`: `0`, the playhead, and every other clip's start and end.
  - `interface SnapResult { start: number; snappedTo: number | null }`
  - `snapTime(time, targets, thresholdSeconds): { time: number; snappedTo: number | null }`: for a single edge (a trim or a playhead drag); the nearest target within the threshold wins.
  - `snapClipStart(start, duration, targets, thresholdSeconds): SnapResult`: snaps either the clip's start edge or its end edge to a target, whichever is closest, and returns the adjusted `start`.

- [ ] **Step 1: Write the failing test**

`src/lib/timeline/snap.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  collectSnapTargets,
  snapClipStart,
  snapThresholdSeconds,
  snapTime,
} from "@/lib/timeline/snap";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";

describe("snapThresholdSeconds", () => {
  it("converts a pixel threshold using the zoom level", () => {
    expect(snapThresholdSeconds(8, 40)).toBeCloseTo(0.2, 9);
    expect(snapThresholdSeconds(8, 200)).toBeCloseTo(0.04, 9);
  });
});

describe("collectSnapTargets", () => {
  const project = makeProject(makeStandardTracks(), [
    makeClip({ id: "a", start: 2, sourceOut: 3 }),
    makeClip({ id: "b", trackId: "t2", start: 10, sourceOut: 4 }),
  ]);

  it("includes 0, the playhead and every clip edge", () => {
    expect(collectSnapTargets(project, [], 7).sort((x, y) => x - y)).toEqual([0, 2, 5, 7, 10, 14]);
  });

  it("excludes the edges of clips being moved", () => {
    expect(collectSnapTargets(project, ["a"], 7).sort((x, y) => x - y)).toEqual([0, 7, 10, 14]);
  });
});

describe("snapTime", () => {
  it("snaps to the nearest target within the threshold", () => {
    expect(snapTime(4.9, [0, 5, 5.05], 0.2)).toEqual({ time: 5, snappedTo: 5 });
  });

  it("does not snap outside the threshold", () => {
    expect(snapTime(4, [5], 0.2)).toEqual({ time: 4, snappedTo: null });
  });
});

describe("snapClipStart", () => {
  it("snaps the clip's start edge to a target", () => {
    expect(snapClipStart(4.9, 3, [5], 0.2)).toEqual({ start: 5, snappedTo: 5 });
  });

  it("snaps the clip's end edge to a target and adjusts the start", () => {
    // start 4.9 + duration 3 -> end 7.9; target 8 pulls the end to 8, so start = 5
    expect(snapClipStart(4.9, 3, [8], 0.2)).toEqual({ start: 5, snappedTo: 8 });
  });

  it("prefers the closest edge when both could snap", () => {
    const result = snapClipStart(4.95, 3, [5, 8.1], 0.2);
    expect(result.snappedTo).toBe(5);
    expect(result.start).toBe(5);
  });

  it("returns the original start when nothing is in range", () => {
    expect(snapClipStart(4, 3, [20], 0.2)).toEqual({ start: 4, snappedTo: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/timeline/snap.test.ts`
Expected: FAIL; `@/lib/timeline/snap` cannot be resolved.

- [ ] **Step 3: Implement snap**

`src/lib/timeline/snap.ts`:

```ts
import { clipEnd } from "@/lib/timeline/clip-math";
import type { TimelineProject } from "@/types/timeline";

export interface SnapResult {
  start: number;
  snappedTo: number | null;
}

export function snapThresholdSeconds(thresholdPx: number, pixelsPerSecond: number): number {
  return thresholdPx / pixelsPerSecond;
}

/** Times a dragged edge can snap to: 0, the playhead, and other clips' edges. */
export function collectSnapTargets(
  project: TimelineProject,
  excludeClipIds: string[],
  playhead: number,
): number[] {
  const excluded = new Set(excludeClipIds);
  const targets = [0, playhead];
  for (const clip of project.clips) {
    if (excluded.has(clip.id)) continue;
    targets.push(clip.start, clipEnd(clip));
  }
  return targets;
}

/** Snaps one edge (trim handle or playhead) to the nearest target in range. */
export function snapTime(
  time: number,
  targets: number[],
  thresholdSeconds: number,
): { time: number; snappedTo: number | null } {
  let best: number | null = null;
  for (const target of targets) {
    const distance = Math.abs(target - time);
    if (distance <= thresholdSeconds && (best === null || distance < Math.abs(best - time))) {
      best = target;
    }
  }
  return best === null ? { time, snappedTo: null } : { time: best, snappedTo: best };
}

/**
 * Snaps a moving clip: either its start edge or its end edge may land on a
 * target, whichever is closest. Returns the adjusted start.
 */
export function snapClipStart(
  start: number,
  duration: number,
  targets: number[],
  thresholdSeconds: number,
): SnapResult {
  let best: SnapResult | null = null;
  // Candidate starts that put the clip's start edge, or its end edge, exactly
  // on the target (computed directly so the result has no float drift).
  for (const target of targets) {
    for (const candidate of [target, target - duration]) {
      const distance = Math.abs(candidate - start);
      if (
        distance <= thresholdSeconds &&
        (best === null || distance < Math.abs(best.start - start))
      ) {
        best = { start: candidate, snappedTo: target };
      }
    }
  }
  return best ?? { start, snappedTo: null };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/timeline/snap.test.ts`
Expected: PASS. The snapped start is computed as `target` or `target - duration` directly, so the exact-equality assertions are safe.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/snap.ts src/lib/timeline/snap.test.ts
git commit -m "feat: add timeline snapping" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: activeClipsAt and clipGainAt

**Files:**
- Create: `src/lib/timeline/active-clips.ts`
- Test: `src/lib/timeline/active-clips.test.ts`

**Interfaces:**
- Consumes: `clamp`, `clipDuration`, `clipEnd` (clip-math); `packMagneticTracks` (pack, tests only); types.
- Produces:
  - `interface ActiveClip { clip: Clip; track: Track; localTime: number; sourceTime: number; visible: boolean; audible: boolean }`
  - `activeClipsAt(project, t): ActiveClip[]`: every clip with `start <= t < end` on an existing track, in **paint order** (highest track `order` first, so the top overlay is painted last; ties by clip start). `localTime = t - clip.start`. `sourceTime = sourceIn + localTime * speed`, or `sourceOut - localTime * speed` when reversed. `visible = !track.hidden`. `audible` is true only for `video` and `audio` clips that are not muted, on a track that is not muted, and (when any track is soloed) on a soloed track.
  - `clipGainAt(clip, localTime): number`: `volume / 100`, times the fade-in ramp, times the fade-out ramp, never below 0 and not capped above.

- [ ] **Step 1: Write the failing test**

`src/lib/timeline/active-clips.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { activeClipsAt, clipGainAt } from "@/lib/timeline/active-clips";
import { clipsOnTrack } from "@/lib/timeline/lookup";
import { packMagneticTracks } from "@/lib/timeline/pack";
import {
  makeClip,
  makeProject,
  makeStandardTracks,
  makeTrack,
} from "@/lib/timeline/test-utils";

const ids = (project: ReturnType<typeof makeProject>, t: number) =>
  activeClipsAt(project, t).map((a) => a.clip.id);

describe("activeClipsAt: which clips play", () => {
  const project = makeProject(makeStandardTracks(), [
    makeClip({ id: "a", start: 0, sourceOut: 4 }),
    makeClip({ id: "b", start: 4, sourceOut: 3 }),
  ]);

  it("returns nothing before the first clip and after the last", () => {
    expect(ids(project, -1)).toEqual([]);
    expect(ids(project, 7)).toEqual([]);
    expect(ids(project, 99)).toEqual([]);
  });

  it("treats a clip as [start, end): the next clip owns the exact cut time", () => {
    expect(ids(project, 0)).toEqual(["a"]);
    expect(ids(project, 3.999)).toEqual(["a"]);
    expect(ids(project, 4)).toEqual(["b"]);
    expect(ids(project, 6.999)).toEqual(["b"]);
  });

  it("ignores clips whose track does not exist", () => {
    const orphan = makeProject(makeStandardTracks(), [makeClip({ id: "x", trackId: "gone" })]);
    expect(ids(orphan, 1)).toEqual([]);
  });

  it("returns every overlapping clip on a free track", () => {
    const overlap = makeProject(makeStandardTracks(), [
      makeClip({ id: "o1", trackId: "t2", kind: "image", sourceDuration: null, start: 0, sourceOut: 6 }),
      makeClip({ id: "o2", trackId: "t2", kind: "image", sourceDuration: null, start: 2, sourceOut: 6 }),
    ]);
    expect(ids(overlap, 3).sort()).toEqual(["o1", "o2"]);
  });

  it("has exactly one active clip at every cut of a packed track with fractional durations", () => {
    const packed = packMagneticTracks(
      makeProject(makeStandardTracks(), [
        makeClip({ id: "a", start: 0, sourceIn: 0, sourceOut: 0.1 }),
        makeClip({ id: "b", start: 9, sourceIn: 0, sourceOut: 0.2 }),
        makeClip({ id: "c", start: 9, sourceIn: 0, sourceOut: 0.3 }),
        makeClip({ id: "d", start: 9, sourceIn: 0, sourceOut: 0.7 }),
      ]),
    );
    for (const clip of clipsOnTrack(packed, "t1")) {
      expect(ids(packed, clip.start)).toEqual([clip.id]);
    }
  });
});

describe("activeClipsAt: source position", () => {
  it("offsets from sourceIn", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 10, sourceIn: 2, sourceOut: 12 }),
    ]);
    const [active] = activeClipsAt(project, 13);
    expect(active.localTime).toBe(3);
    expect(active.sourceTime).toBe(5);
  });

  it("scales by speed", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceIn: 0, sourceOut: 10, speed: 2 }),
    ]);
    expect(activeClipsAt(project, 3)[0].sourceTime).toBe(6);
  });

  it("counts backward for reversed clips", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", start: 0, sourceIn: 0, sourceOut: 10, reversed: true }),
    ]);
    expect(activeClipsAt(project, 0)[0].sourceTime).toBe(10);
    expect(activeClipsAt(project, 4)[0].sourceTime).toBe(6);
  });
});

describe("activeClipsAt: paint order", () => {
  it("lists bottom tracks first so the top overlay is painted last", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "over", trackId: "t2", kind: "image", sourceDuration: null }),
      makeClip({ id: "main", trackId: "t1" }),
      makeClip({ id: "sound", trackId: "t3", kind: "audio" }),
    ]);
    expect(ids(project, 1)).toEqual(["sound", "main", "over"]);
  });
});

describe("activeClipsAt: visible and audible", () => {
  it("marks clips on hidden tracks as not visible but still returns them", () => {
    const project = makeProject(
      [makeTrack({ id: "t1", hidden: true })],
      [makeClip({ id: "a" })],
    );
    expect(activeClipsAt(project, 1)[0]).toMatchObject({ visible: false, audible: true });
  });

  it("silences muted clips and muted tracks", () => {
    const mutedClip = makeProject(makeStandardTracks(), [makeClip({ id: "a", muted: true })]);
    expect(activeClipsAt(mutedClip, 1)[0].audible).toBe(false);
    const mutedTrack = makeProject([makeTrack({ id: "t1", muted: true })], [makeClip({ id: "a" })]);
    expect(activeClipsAt(mutedTrack, 1)[0].audible).toBe(false);
  });

  it("silences non-soloed tracks when any track is soloed", () => {
    const tracks = [
      makeTrack({ id: "t1", type: "video", order: 0 }),
      makeTrack({ id: "t3", type: "audio", order: 1, solo: true }),
    ];
    const project = makeProject(tracks, [
      makeClip({ id: "v", trackId: "t1" }),
      makeClip({ id: "s", trackId: "t3", kind: "audio" }),
    ]);
    const byId = Object.fromEntries(activeClipsAt(project, 1).map((a) => [a.clip.id, a.audible]));
    expect(byId).toEqual({ v: false, s: true });
  });

  it("never marks images, text or stickers audible", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "i", trackId: "t2", kind: "image", sourceDuration: null }),
    ]);
    expect(activeClipsAt(project, 1)[0].audible).toBe(false);
  });
});

describe("clipGainAt", () => {
  const clip = (overrides = {}) => makeClip({ start: 0, sourceIn: 0, sourceOut: 10, ...overrides });

  it("is the volume as a fraction", () => {
    expect(clipGainAt(clip({ volume: 50 }), 5)).toBe(0.5);
    expect(clipGainAt(clip({ volume: 0 }), 5)).toBe(0);
  });

  it("ramps up over the fade-in", () => {
    const c = clip({ fadeIn: 2 });
    expect(clipGainAt(c, 0)).toBe(0);
    expect(clipGainAt(c, 1)).toBe(0.5);
    expect(clipGainAt(c, 2)).toBe(1);
  });

  it("ramps down over the fade-out", () => {
    const c = clip({ fadeOut: 2 });
    expect(clipGainAt(c, 8)).toBe(1);
    expect(clipGainAt(c, 9)).toBe(0.5);
    expect(clipGainAt(c, 10)).toBe(0);
  });

  it("multiplies overlapping fades", () => {
    expect(clipGainAt(clip({ fadeIn: 10, fadeOut: 10 }), 5)).toBe(0.25);
  });

  it("never goes negative", () => {
    expect(clipGainAt(clip({ fadeIn: 2 }), -1)).toBe(0);
    expect(clipGainAt(clip({ fadeOut: 2 }), 11)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/timeline/active-clips.test.ts`
Expected: FAIL; `@/lib/timeline/active-clips` cannot be resolved.

- [ ] **Step 3: Implement active-clips**

`src/lib/timeline/active-clips.ts`:

```ts
import { clipDuration, clipEnd } from "@/lib/timeline/clip-math";
import type { Clip, TimelineProject, Track } from "@/types/timeline";

export interface ActiveClip {
  clip: Clip;
  track: Track;
  /** Seconds since the clip started, in timeline time. */
  localTime: number;
  /** Position to read from the source media, in source seconds. */
  sourceTime: number;
  visible: boolean;
  audible: boolean;
}

/**
 * Every clip playing at timeline time `t`, in paint order: highest track
 * `order` first, so the top overlay is painted last. A clip covers
 * [start, end), so at an exact cut the next clip owns the instant.
 */
export function activeClipsAt(project: TimelineProject, t: number): ActiveClip[] {
  const trackById = new Map(project.tracks.map((track) => [track.id, track]));
  const anySolo = project.tracks.some((track) => track.solo);

  const active: ActiveClip[] = [];
  for (const clip of project.clips) {
    const track = trackById.get(clip.trackId);
    if (!track) continue;
    if (t < clip.start || t >= clipEnd(clip)) continue;

    const localTime = t - clip.start;
    const sourceTime = clip.reversed
      ? clip.sourceOut - localTime * clip.speed
      : clip.sourceIn + localTime * clip.speed;
    const hasSound = clip.kind === "video" || clip.kind === "audio";

    active.push({
      clip,
      track,
      localTime,
      sourceTime,
      visible: !track.hidden,
      audible: hasSound && !clip.muted && !track.muted && (!anySolo || track.solo),
    });
  }

  return active.sort(
    (a, b) => b.track.order - a.track.order || a.clip.start - b.clip.start,
  );
}

/** Linear gain for a clip at `localTime`: volume times the fade ramps, never below 0. */
export function clipGainAt(clip: Clip, localTime: number): number {
  let gain = clip.volume / 100;
  if (clip.fadeIn > 0 && localTime < clip.fadeIn) {
    gain *= Math.max(0, localTime) / clip.fadeIn;
  }
  const remaining = clipDuration(clip) - localTime;
  if (clip.fadeOut > 0 && remaining < clip.fadeOut) {
    gain *= Math.max(0, remaining) / clip.fadeOut;
  }
  return Math.max(0, gain);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/timeline/active-clips.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/active-clips.ts src/lib/timeline/active-clips.test.ts
git commit -m "feat: add activeClipsAt and clipGainAt" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Undo/redo history

**Files:**
- Create: `src/lib/timeline/history.ts`
- Test: `src/lib/timeline/history.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (generic over the state type `T`; named `HistoryState` to avoid the DOM `History` type):
  - `interface HistoryState<T> { past: T[]; present: T; future: T[]; gestureBase: T | null }`
  - `MAX_HISTORY = 100`
  - `createHistory<T>(present: T): HistoryState<T>`
  - `commit(h, next): HistoryState<T>`: ends any open gesture, then pushes `present` to `past` and clears `future`. A `next` identical (by `Object.is`) to `present` changes nothing.
  - `preview(h, next)`: sets `present` without adding a history entry, remembering the pre-gesture state in `gestureBase`. A `next` identical to `present` changes nothing.
  - `endGesture(h)`: turns an open gesture into one undo step, or into none if nothing changed.
  - `undo(h)` and `redo(h)`: both end any open gesture first, so undo during a drag cancels the drag.

- [ ] **Step 1: Write the failing test**

`src/lib/timeline/history.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  commit,
  createHistory,
  endGesture,
  MAX_HISTORY,
  preview,
  redo,
  undo,
} from "@/lib/timeline/history";

describe("commit / undo / redo", () => {
  it("records each commit as an undo step", () => {
    let h = createHistory(0);
    h = commit(h, 1);
    h = commit(h, 2);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = undo(h);
    expect(h.present).toBe(0);
    expect(undo(h)).toBe(h);
  });

  it("redoes undone steps", () => {
    let h = commit(commit(createHistory(0), 1), 2);
    h = undo(undo(h));
    h = redo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
    expect(redo(h)).toBe(h);
  });

  it("clears the redo stack on a new commit", () => {
    let h = commit(commit(createHistory(0), 1), 2);
    h = commit(undo(h), 9);
    expect(h.future).toEqual([]);
    expect(redo(h)).toBe(h);
  });

  it("ignores a commit that does not change the state", () => {
    const h = createHistory({ a: 1 });
    expect(commit(h, h.present)).toBe(h);
  });

  it("caps the history at MAX_HISTORY entries, dropping the oldest", () => {
    let h = createHistory(0);
    for (let i = 1; i <= MAX_HISTORY + 50; i++) h = commit(h, i);
    expect(h.past).toHaveLength(MAX_HISTORY);
    expect(h.past[0]).toBe(50);
  });
});

describe("gestures", () => {
  it("collapses many previews into one undo step", () => {
    let h = createHistory(0);
    h = preview(h, 1);
    h = preview(h, 2);
    h = preview(h, 3);
    expect(h.present).toBe(3);
    expect(h.past).toEqual([]);
    h = endGesture(h);
    expect(h.past).toEqual([0]);
    expect(h.gestureBase).toBeNull();
    expect(undo(h).present).toBe(0);
  });

  it("adds no history entry when the gesture ends where it began", () => {
    let h = createHistory(0);
    h = preview(h, 5);
    h = preview(h, 0);
    h = endGesture(h);
    expect(h.past).toEqual([]);
    expect(h.gestureBase).toBeNull();
  });

  it("ignores a preview that does not change the state", () => {
    const h = createHistory(0);
    expect(preview(h, 0)).toBe(h);
  });

  it("returns the same history when ending a gesture that is not open", () => {
    const h = createHistory(0);
    expect(endGesture(h)).toBe(h);
  });

  it("cancels the drag when undo is pressed mid-gesture", () => {
    let h = createHistory(0);
    h = preview(h, 1);
    h = preview(h, 2);
    h = undo(h);
    expect(h.present).toBe(0);
    expect(h.gestureBase).toBeNull();
    expect(h.past).toEqual([]);
    expect(redo(h).present).toBe(2);
  });

  it("closes an open gesture before committing", () => {
    let h = createHistory(0);
    h = preview(h, 1);
    h = commit(h, 2);
    expect(h.past).toEqual([0, 1]);
    expect(h.gestureBase).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/timeline/history.test.ts`
Expected: FAIL; `@/lib/timeline/history` cannot be resolved.

- [ ] **Step 3: Implement history**

`src/lib/timeline/history.ts`:

```ts
export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  /** State before an in-progress drag began, or null when no drag is open. */
  gestureBase: T | null;
}

export const MAX_HISTORY = 100;

export function createHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [], gestureBase: null };
}

function pushPast<T>(past: T[], value: T): T[] {
  const next = [...past, value];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

/** Turns an open gesture into a single undo step (or none if nothing changed). */
export function endGesture<T>(h: HistoryState<T>): HistoryState<T> {
  if (h.gestureBase === null) return h;
  if (Object.is(h.gestureBase, h.present)) return { ...h, gestureBase: null };
  return {
    past: pushPast(h.past, h.gestureBase),
    present: h.present,
    future: [],
    gestureBase: null,
  };
}

export function commit<T>(h: HistoryState<T>, next: T): HistoryState<T> {
  const base = endGesture(h);
  if (Object.is(next, base.present)) return base;
  return {
    past: pushPast(base.past, base.present),
    present: next,
    future: [],
    gestureBase: null,
  };
}

/** Updates the present for live feedback during a drag, without an undo step. */
export function preview<T>(h: HistoryState<T>, next: T): HistoryState<T> {
  if (Object.is(next, h.present)) return h;
  return { ...h, present: next, gestureBase: h.gestureBase ?? h.present };
}

export function undo<T>(h: HistoryState<T>): HistoryState<T> {
  const base = endGesture(h);
  if (base.past.length === 0) return base;
  return {
    past: base.past.slice(0, -1),
    present: base.past[base.past.length - 1],
    future: [base.present, ...base.future],
    gestureBase: null,
  };
}

export function redo<T>(h: HistoryState<T>): HistoryState<T> {
  const base = endGesture(h);
  if (base.future.length === 0) return base;
  return {
    past: pushPast(base.past, base.present),
    present: base.future[0],
    future: base.future.slice(1),
    gestureBase: null,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/timeline/history.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/history.ts src/lib/timeline/history.test.ts
git commit -m "feat: add undo/redo history with gesture support" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Clip project store

**Files:**
- Create: `src/store/use-clip-project-store.ts`
- Test: `src/store/use-clip-project-store.test.ts`

**Interfaces:**
- Consumes: `commit`, `createHistory`, `endGesture`, `preview`, `redo`, `undo`, `HistoryState` (history); `TimelineProject`.
- Produces:
  - `EMPTY_PROJECT: TimelineProject`
  - `type ProjectOp = (project: TimelineProject) => TimelineProject` (for example `(p) => splitClip(p, id, t)`)
  - `useClipProjectStore` (zustand) with state `history`, `selectedClipIds` and actions:
    - `load(project)`: resets history and selection.
    - `apply(op)`: one undo step.
    - `previewApply(op)`: live drag; `op` runs against the **gesture base** each time, so a drag recomputes from where it started.
    - `endGesture()`
    - `undo()` and `redo()`
    - `setSelectedClipIds(ids)`
  - After every action that can change the project, `selectedClipIds` is pruned to clips that still exist.
  - Selectors: `selectProject(s)`, `selectCanUndo(s)` (true when `past` is non-empty or a gesture is open), `selectCanRedo(s)`.

- [ ] **Step 1: Write the failing test**

`src/store/use-clip-project-store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";

import { deleteClips } from "@/lib/timeline/delete";
import { moveClip } from "@/lib/timeline/place";
import { splitClip } from "@/lib/timeline/split";
import {
  getClip,
  makeClip,
  makeProject,
  makeStandardTracks,
  seqIds,
} from "@/lib/timeline/test-utils";
import {
  selectCanRedo,
  selectCanUndo,
  selectProject,
  useClipProjectStore,
} from "@/store/use-clip-project-store";

const initial = () =>
  makeProject(makeStandardTracks(), [
    makeClip({ id: "main", start: 0, sourceOut: 10 }),
    makeClip({ id: "o", trackId: "t2", kind: "image", sourceDuration: null, start: 2, sourceOut: 3 }),
  ]);

const state = () => useClipProjectStore.getState();

beforeEach(() => {
  state().load(initial());
});

describe("apply / undo / redo", () => {
  it("applies an operation as one undoable step", () => {
    const before = selectProject(state());
    state().apply((p) => splitClip(p, "main", 4, seqIds()));
    expect(selectProject(state()).clips).toHaveLength(3);

    state().undo();
    expect(selectProject(state())).toBe(before);

    state().redo();
    expect(selectProject(state()).clips).toHaveLength(3);
  });

  it("records no history entry for a no-op operation", () => {
    state().apply((p) => splitClip(p, "main", 0, seqIds()));
    expect(selectCanUndo(state())).toBe(false);
  });

  it("reports canUndo and canRedo", () => {
    expect(selectCanUndo(state())).toBe(false);
    expect(selectCanRedo(state())).toBe(false);
    state().apply((p) => moveClip(p, "o", { start: 8 }));
    expect(selectCanUndo(state())).toBe(true);
    state().undo();
    expect(selectCanRedo(state())).toBe(true);
  });

  it("load resets history and selection", () => {
    state().setSelectedClipIds(["o"]);
    state().apply((p) => moveClip(p, "o", { start: 8 }));
    state().load(initial());
    expect(selectCanUndo(state())).toBe(false);
    expect(state().selectedClipIds).toEqual([]);
  });
});

describe("gestures", () => {
  it("collapses a whole drag into one undo step", () => {
    state().previewApply((p) => moveClip(p, "o", { start: 5 }));
    state().previewApply((p) => moveClip(p, "o", { start: 9 }));
    state().endGesture();

    expect(getClip(selectProject(state()), "o").start).toBe(9);
    state().undo();
    expect(getClip(selectProject(state()), "o").start).toBe(2);
    expect(selectCanUndo(state())).toBe(false);
  });

  it("computes each preview from where the drag began, not cumulatively", () => {
    state().previewApply((p) => moveClip(p, "o", { start: 5 }));
    state().previewApply((p) => moveClip(p, "o", { start: 5 }));
    expect(getClip(selectProject(state()), "o").start).toBe(5);
    state().endGesture();
    state().undo();
    expect(getClip(selectProject(state()), "o").start).toBe(2);
  });

  it("cancels the drag cleanly when undo is pressed mid-drag", () => {
    state().previewApply((p) => moveClip(p, "o", { start: 5 }));
    state().undo();
    expect(getClip(selectProject(state()), "o").start).toBe(2);
    expect(state().history.gestureBase).toBeNull();
    expect(selectCanUndo(state())).toBe(false);

    state().redo();
    expect(getClip(selectProject(state()), "o").start).toBe(5);
  });
});

describe("selection", () => {
  it("drops selected ids that no longer exist after an edit", () => {
    state().setSelectedClipIds(["main", "o"]);
    state().apply((p) => deleteClips(p, ["o"]));
    expect(state().selectedClipIds).toEqual(["main"]);
  });

  it("drops selected ids that disappear on undo", () => {
    state().apply((p) => splitClip(p, "main", 4, seqIds()));
    state().setSelectedClipIds(["id-1"]);
    state().undo();
    expect(state().selectedClipIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/store/use-clip-project-store.test.ts`
Expected: FAIL; `@/store/use-clip-project-store` cannot be resolved.

- [ ] **Step 3: Implement the store**

`src/store/use-clip-project-store.ts`:

```ts
import { create } from "zustand";

import {
  commit,
  createHistory,
  endGesture,
  preview,
  redo,
  undo,
  type HistoryState,
} from "@/lib/timeline/history";
import type { TimelineProject } from "@/types/timeline";

export const EMPTY_PROJECT: TimelineProject = { id: "", tracks: [], clips: [] };

export type ProjectOp = (project: TimelineProject) => TimelineProject;

interface ClipProjectStore {
  history: HistoryState<TimelineProject>;
  selectedClipIds: string[];

  load: (project: TimelineProject) => void;
  apply: (op: ProjectOp) => void;
  /** Live drag feedback; `op` always runs against the pre-drag project. */
  previewApply: (op: ProjectOp) => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  setSelectedClipIds: (ids: string[]) => void;
}

function pruneSelection(ids: string[], project: TimelineProject): string[] {
  const live = new Set(project.clips.map((clip) => clip.id));
  const kept = ids.filter((id) => live.has(id));
  return kept.length === ids.length ? ids : kept;
}

function withHistory(state: ClipProjectStore, history: HistoryState<TimelineProject>) {
  return { history, selectedClipIds: pruneSelection(state.selectedClipIds, history.present) };
}

export const useClipProjectStore = create<ClipProjectStore>((set) => ({
  history: createHistory(EMPTY_PROJECT),
  selectedClipIds: [],

  load: (project) => set({ history: createHistory(project), selectedClipIds: [] }),
  apply: (op) =>
    set((s) => withHistory(s, commit(s.history, op(s.history.present)))),
  previewApply: (op) =>
    set((s) => {
      const base = s.history.gestureBase ?? s.history.present;
      return withHistory(s, preview(s.history, op(base)));
    }),
  endGesture: () => set((s) => ({ history: endGesture(s.history) })),
  undo: () => set((s) => withHistory(s, undo(s.history))),
  redo: () => set((s) => withHistory(s, redo(s.history))),
  setSelectedClipIds: (ids) => set({ selectedClipIds: ids }),
}));

export const selectProject = (s: ClipProjectStore) => s.history.present;
export const selectCanUndo = (s: ClipProjectStore) =>
  s.history.past.length > 0 || s.history.gestureBase !== null;
export const selectCanRedo = (s: ClipProjectStore) => s.history.future.length > 0;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/store/use-clip-project-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/use-clip-project-store.ts src/store/use-clip-project-store.test.ts
git commit -m "feat: add clip project store with undo/redo and gestures" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Barrel export and full verification

**Files:**
- Create: `src/lib/timeline/index.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: a single import point, `@/lib/timeline`, for the later plans (engine, UI, persistence).

- [ ] **Step 1: Create the barrel**

`src/lib/timeline/index.ts`:

```ts
export * from "@/lib/timeline/active-clips";
export * from "@/lib/timeline/clip-edits";
export * from "@/lib/timeline/clip-math";
export * from "@/lib/timeline/delete";
export * from "@/lib/timeline/history";
export * from "@/lib/timeline/ids";
export * from "@/lib/timeline/lookup";
export * from "@/lib/timeline/pack";
export * from "@/lib/timeline/place";
export * from "@/lib/timeline/snap";
export * from "@/lib/timeline/split";
export * from "@/lib/timeline/tracks";
export * from "@/lib/timeline/trim";
```

`test-utils` is deliberately not exported.

- [ ] **Step 2: Run the whole test suite**

Run: `npm test`
Expected: every test file passes; no skipped tests.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors beyond those recorded in Task 1, Step 1. If `export *` reports a duplicate-name conflict, rename the colliding export in its own file and update its tests; do not use selective re-exports.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors in `src/lib/timeline`, `src/store/use-clip-project-store*`, `src/types/timeline.ts` or `vitest.config.ts`.

- [ ] **Step 5: Confirm the app is untouched**

Run: `git diff --stat main -- src ':!src/lib/timeline' ':!src/types/timeline.ts' ':!src/store/use-clip-project-store.ts' ':!src/store/use-clip-project-store.test.ts'`
Expected: no output (no existing source file changed).

- [ ] **Step 6: Commit**

```bash
git add src/lib/timeline/index.ts
git commit -m "feat: add timeline barrel export" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage** (spec sections against tasks)

| Spec requirement | Where |
|---|---|
| §3 Track and Clip model; derived duration; magnetic video track | Tasks 1, 2 |
| §3 `Track.projectId` | Deferred to the persistence plan (it is a database column; `TimelineProject.id` carries it in memory) |
| §4 split, trim, move, ripple delete, delete, duplicate, speed, add track, insert | Tasks 3–8 |
| §4 reorder main track | Covered by `moveClip` onto a magnetic track (Task 6); no separate function |
| §4 snapping (playhead, edges, 0; pixel threshold) | Task 9 |
| §4 history, one undo step per drag, `Ctrl+Z`/`Ctrl+Shift+Z` | Tasks 11, 12 (the key bindings belong to the UI plan) |
| §5 `activeClipsAt`, source position, reversed, paint order | Task 10 |
| §5 clock, video pool, Web Audio graph, compositor | Later plans |
| §9 Vitest and tests for every operation and `activeClipsAt` | Tasks 1–12 |
| §3 `loop` field | Carried on `Clip`; no timeline semantics, noted in the type |

Sections 6 (UI), 7 (persistence), 8 (export) and the engine half of 5 are intentionally outside this plan.

**2. Placeholder scan:** no TBD/TODO; every step has code or an exact command.

**3. Type consistency:** `TimelineProject`, `Clip`, `Track`, `IdFn`, `HistoryState`, `ProjectOp`, `ClipPatch`, `TrackPatch`, `TrimEdge` and `ActiveClip` are each defined once and used with the same names and signatures downstream.

**4. Review Focus:** all five failure modes have a named test (the `trim` invariants loop; the split no-op table; the cut-time test in Task 10; the audio/video/locked rejections in Task 6; the mid-drag undo tests in Tasks 11 and 12).

## Execution Handoff

Plan complete. Three things the plan assumes are worth checking before execution:
- **Keyframe times are relative to the clip's start.** The existing editor uses absolute times, so the later port plan must convert them.
- **Still images can't extend their start edge past their current length.** A still can extend its end edge without limit, but its start edge only goes back as far as it already reaches.
- **`loop` is stored but not acted on.** It exists on the clip only so the setting survives the move.
