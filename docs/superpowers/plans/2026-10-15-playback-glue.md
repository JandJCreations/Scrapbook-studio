# Playback Glue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the testable glue between the pure playback plans and the browser: a media pool that carries out a sync plan on elements, a Web Audio gain graph, an engine runner loop, a pure draw-state function, and a transport store, with every browser dependency injected so it is all unit-tested with fakes.

**Architecture:** `createMediaPool(deps)` applies a `MediaSyncPlan` to elements created through an injected factory, reports their real state back as `SlotState[]`, and surfaces problems. `createAudioGraph(ctx)` routes each element through its own smoothed gain node into one master. `createPlaybackEngine(deps)` runs the frame loop (tick, plan, apply, notify) on an injected scheduler. `clipDrawState` turns a clip and time into drawing numbers. A final end-to-end simulation drives the real engine, pool and plans with fake elements that advance at their playback rate.

**Tech Stack:** TypeScript (strict), Vitest, zustand (existing). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-clip-timeline-design.md`, sections 5, 5.1 and 5.2. Builds on the merged core, persistence and `src/lib/engine`.

## Global Constraints

- Work on branch `feature/playback-glue`; never commit to `main`.
- Nothing under `src/lib/playback/` may touch the browser directly: no `document`, `window`, `AudioContext` constructor, `requestAnimationFrame`, `setTimeout`, `performance` or `Date`. Elements, the audio context, the scheduler and URLs are all passed in. (The real wiring is plan 3c.)
- The only existing file modified is `src/lib/timeline/active-clips.ts` (and its test): extracting `fadeFactor` from `clipGainAt`, with no change in behaviour.
- Glue contract from spec 5.2, exactly: released elements are paused, silenced and unassigned (and kept for reuse); `slot.clipId` is set for created and reused elements; slot state is built from `element.currentTime`; the plan is applied before anything asks which element serves a clip; the audio context is resumed by an explicit `resume()` call, so nothing assumes sound before the first Play click.
- Gain changes are smoothed with `setTargetAtTime` (time constant `0.002` s); gains above 1 are allowed; negative or non-finite gains become 0.
- A media element is connected to the audio graph exactly once (`createMediaElementSource` throws on a second call).
- Problems (missing media, blocked playback) are reported once per clip until they resolve, never once per frame.
- Run tests with `npx vitest run <file>`; type-check with `npx tsc --noEmit`.
- If `node` is not found in a spawned PowerShell, run `$env:Path += ";C:\Program Files\nodejs"` first.
- End every commit message with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).

## Review Focus

Failure modes the spec implies but a reasonable implementation could miss. Each has a test in the task named on the right.

- A released, dropped or missing-media clip must never leave sound playing or an element still assigned to it: released elements are paused and silent, and `elementForClip` returns nothing for them. (Task 3, Task 7)
- Blocked playback and missing media must be reported once and recover, not spam every frame or wedge: after the URL appears or playback is allowed, the clip plays. (Task 3)
- Across a split, the real engine plus pool must create one element, load once and seek once (the initial position), at any frame rate; a frame step while paused must move the element. (Task 7)
- The engine loop must run only while playing, always run one last frame to pause elements (on pause, on the end, after a seek), and stop completely on `dispose`. (Task 5)
- `clipDrawState` must never produce NaN or infinity: keyframes before the first, after the last, between, unsorted, with equal times, combined with fades. (Task 2)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/timeline/active-clips.ts` | Modified: export `fadeFactor` |
| `src/lib/playback/draw-state.ts` | `clipDrawState` |
| `src/lib/playback/media-pool.ts` | `createMediaPool` and its interfaces |
| `src/lib/playback/audio-graph.ts` | `createAudioGraph` and the audio interfaces |
| `src/lib/playback/engine.ts` | `createPlaybackEngine` |
| `src/lib/playback/test-utils.ts` | `FakeElement`, `FakeGain`, `makeFakePoolDeps` (tests only) |
| `src/lib/playback/index.ts` | Barrel |
| `src/store/use-transport-store.ts` | zustand mirror of time and playing |

Each `*.test.ts` sits beside the file it tests.

---

### Task 1: Share the fade ramp

**Files:**
- Modify: `src/lib/timeline/active-clips.ts`
- Test: `src/lib/timeline/active-clips.test.ts`

**Interfaces:**
- Consumes: `clipDuration`.
- Produces: `fadeFactor(clip: Clip, localTime: number): number`, the fade-in and fade-out ramps multiplied together (1 outside the fades, never below 0, independent of volume). `clipGainAt` becomes `max(0, volume / 100 * fadeFactor)`, unchanged in behaviour.

- [ ] **Step 1: Write the failing test**

In `src/lib/timeline/active-clips.test.ts`, change the first import to `import { activeClipsAt, clipGainAt, fadeFactor, isAudible } from "@/lib/timeline/active-clips";` and append:

```ts
describe("fadeFactor", () => {
  const clip = (overrides = {}) => makeClip({ start: 0, sourceIn: 0, sourceOut: 10, ...overrides });

  it("is 1 without fades, whatever the volume", () => {
    expect(fadeFactor(clip({ volume: 30 }), 5)).toBe(1);
  });

  it("ramps up over the fade-in", () => {
    const c = clip({ fadeIn: 2 });
    expect(fadeFactor(c, 0)).toBe(0);
    expect(fadeFactor(c, 1)).toBe(0.5);
    expect(fadeFactor(c, 2)).toBe(1);
  });

  it("ramps down over the fade-out", () => {
    const c = clip({ fadeOut: 2 });
    expect(fadeFactor(c, 8)).toBe(1);
    expect(fadeFactor(c, 9)).toBe(0.5);
    expect(fadeFactor(c, 10)).toBe(0);
  });

  it("multiplies overlapping fades and never goes negative", () => {
    expect(fadeFactor(clip({ fadeIn: 10, fadeOut: 10 }), 5)).toBe(0.25);
    expect(fadeFactor(clip({ fadeIn: 2 }), -1)).toBe(0);
    expect(fadeFactor(clip({ fadeOut: 2 }), 11)).toBe(0);
  });

  it("does not depend on volume, while clipGainAt does", () => {
    const c = clip({ fadeIn: 2, volume: 50 });
    expect(fadeFactor(c, 1)).toBe(0.5);
    expect(clipGainAt(c, 1)).toBe(0.25);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/timeline/active-clips.test.ts`
Expected: FAIL; `fadeFactor` is not exported (the new tests throw "is not a function").

- [ ] **Step 3: Extract the function**

In `src/lib/timeline/active-clips.ts`, replace the whole `clipGainAt` function (and its doc comment) with:

```ts
/** The fade-in and fade-out ramps multiplied together: 1 outside the fades, never below 0. */
export function fadeFactor(clip: Clip, localTime: number): number {
  let factor = 1;
  if (clip.fadeIn > 0 && localTime < clip.fadeIn) {
    factor *= Math.max(0, localTime) / clip.fadeIn;
  }
  const remaining = clipDuration(clip) - localTime;
  if (clip.fadeOut > 0 && remaining < clip.fadeOut) {
    factor *= Math.max(0, remaining) / clip.fadeOut;
  }
  return factor;
}

/** Linear gain for a clip at `localTime`: volume times the fade ramps, never below 0. */
export function clipGainAt(clip: Clip, localTime: number): number {
  return Math.max(0, (clip.volume / 100) * fadeFactor(clip, localTime));
}
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: everything passes, including the existing `clipGainAt` and mixdown tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/active-clips.ts src/lib/timeline/active-clips.test.ts
git commit -m "refactor: share the fade ramp between gain and picture opacity" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Draw state

**Files:**
- Create: `src/lib/playback/draw-state.ts`
- Test: `src/lib/playback/draw-state.test.ts`

**Interfaces:**
- Consumes: `fadeFactor` (Task 1); types `Clip`, `Keyframe`.
- Produces:
  - `interface DrawState { x: number; y: number; width: number; height: number; rotation: number; opacity: number }`
  - `clipDrawState(clip: Clip, localTime: number): DrawState`. `localTime` is seconds since the clip started. With no keyframes the clip's `transform` applies. With keyframes (times relative to the clip start), x, y, rotation and opacity come from them: the first keyframe before it, the last after it, a linear blend between. `width` and `height` always come from the transform. The final opacity is multiplied by `fadeFactor`.

- [ ] **Step 1: Write the failing test**

`src/lib/playback/draw-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { clipDrawState } from "@/lib/playback/draw-state";
import { makeClip } from "@/lib/timeline/test-utils";
import type { Keyframe } from "@/types/keyframe";

const kf = (time: number, x: number, overrides: Partial<Keyframe> = {}): Keyframe => ({
  id: `k${time}-${x}`,
  time,
  x,
  y: 0,
  rotation: 0,
  opacity: 1,
  ...overrides,
});

const transform = { x: 10, y: 20, width: 300, height: 200, rotation: 15, opacity: 0.8 };

describe("clipDrawState: without keyframes", () => {
  it("uses the clip's transform", () => {
    const clip = makeClip({ transform });
    expect(clipDrawState(clip, 1)).toEqual(transform);
  });
});

describe("clipDrawState: keyframes", () => {
  const clip = (keyframes: Keyframe[]) => makeClip({ transform, keyframes });

  it("holds the first keyframe before it and the last after it", () => {
    const c = clip([kf(1, 0), kf(3, 100)]);
    expect(clipDrawState(c, 0).x).toBe(0);
    expect(clipDrawState(c, 1).x).toBe(0);
    expect(clipDrawState(c, 3).x).toBe(100);
    expect(clipDrawState(c, 5).x).toBe(100);
  });

  it("blends linearly between keyframes", () => {
    const c = clip([kf(1, 0), kf(3, 100)]);
    expect(clipDrawState(c, 2).x).toBe(50);
  });

  it("blends x, y, rotation and opacity together", () => {
    const c = clip([
      kf(1, 0, { y: 0, rotation: 0, opacity: 0 }),
      kf(3, 100, { y: 200, rotation: 90, opacity: 1 }),
    ]);
    expect(clipDrawState(c, 2)).toMatchObject({ x: 50, y: 100, rotation: 45, opacity: 0.5 });
  });

  it("keeps the transform's width and height", () => {
    const state = clipDrawState(clip([kf(1, 0), kf(3, 100)]), 2);
    expect(state.width).toBe(300);
    expect(state.height).toBe(200);
  });

  it("handles keyframes given out of order", () => {
    expect(clipDrawState(clip([kf(3, 100), kf(1, 0)]), 2).x).toBe(50);
  });

  it("applies a single keyframe at every time", () => {
    const c = clip([kf(2, 42)]);
    expect(clipDrawState(c, 0).x).toBe(42);
    expect(clipDrawState(c, 9).x).toBe(42);
  });

  it("never produces NaN when keyframes share a time", () => {
    const c = clip([kf(2, 0), kf(2, 100), kf(4, 200)]);
    for (const t of [0, 2, 3, 4, 6]) {
      const state = clipDrawState(c, t);
      for (const value of Object.values(state)) expect(Number.isFinite(value)).toBe(true);
    }
    expect(clipDrawState(c, 3).x).toBe(150);
  });
});

describe("clipDrawState: fades", () => {
  it("multiplies the fade ramp into opacity", () => {
    const c = makeClip({ transform, fadeIn: 2, sourceIn: 0, sourceOut: 10 });
    expect(clipDrawState(c, 0).opacity).toBe(0);
    expect(clipDrawState(c, 1).opacity).toBeCloseTo(0.4, 9);
    expect(clipDrawState(c, 2).opacity).toBeCloseTo(0.8, 9);
  });

  it("fades out toward the end of the clip", () => {
    const c = makeClip({ transform, fadeOut: 2, sourceIn: 0, sourceOut: 10 });
    expect(clipDrawState(c, 9).opacity).toBeCloseTo(0.4, 9);
  });

  it("multiplies fades into keyframed opacity too", () => {
    const c = makeClip({ transform, fadeIn: 2, keyframes: [kf(0, 0, { opacity: 0.5 })] });
    expect(clipDrawState(c, 1).opacity).toBeCloseTo(0.25, 9);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/playback/draw-state.test.ts`
Expected: FAIL; `@/lib/playback/draw-state` cannot be resolved.

- [ ] **Step 3: Implement draw state**

`src/lib/playback/draw-state.ts`:

```ts
import { fadeFactor } from "@/lib/timeline/active-clips";
import type { Keyframe } from "@/types/keyframe";
import type { Clip } from "@/types/timeline";

export interface DrawState {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** x, y, rotation and opacity from the keyframes at `localTime` (clip-relative). */
function keyframed(keyframes: Keyframe[], localTime: number) {
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (localTime <= first.time) return first;
  if (localTime >= last.time) return last;

  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    const span = to.time - from.time;
    if (localTime >= from.time && localTime <= to.time && span > 0) {
      const t = (localTime - from.time) / span;
      return {
        x: lerp(from.x, to.x, t),
        y: lerp(from.y, to.y, t),
        rotation: lerp(from.rotation, to.rotation, t),
        opacity: lerp(from.opacity, to.opacity, t),
      };
    }
  }
  return last;
}

/**
 * What to draw for a clip `localTime` seconds after it starts. Keyframe times
 * are relative to the clip start; when present they replace x, y, rotation
 * and opacity. Fades multiply into opacity.
 */
export function clipDrawState(clip: Clip, localTime: number): DrawState {
  const { transform } = clip;
  const base =
    clip.keyframes.length > 0
      ? keyframed(clip.keyframes, localTime)
      : {
          x: transform.x,
          y: transform.y,
          rotation: transform.rotation,
          opacity: transform.opacity,
        };

  return {
    x: base.x,
    y: base.y,
    width: transform.width,
    height: transform.height,
    rotation: base.rotation,
    opacity: base.opacity * fadeFactor(clip, localTime),
  };
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `npx vitest run src/lib/playback/draw-state.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/playback/draw-state.ts src/lib/playback/draw-state.test.ts
git commit -m "feat: add pure clip draw state with relative keyframes and fades" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Media pool

**Files:**
- Create: `src/lib/playback/test-utils.ts`
- Create: `src/lib/playback/media-pool.ts`
- Test: `src/lib/playback/media-pool.test.ts`

**Interfaces:**
- Consumes: `MediaSyncPlan`, `SlotCommand` (`@/lib/engine/media-sync`); `SlotState` (`@/lib/engine/slots`); `MediaElementKind` (`@/lib/engine/wanted`).
- Produces:
  - `interface PoolElement { currentTime: number; playbackRate: number; readonly paused: boolean; src: string; play(): Promise<void> | void; pause(): void }` (a real `HTMLMediaElement` satisfies it)
  - `interface GainControl { set(gain: number): void }`
  - `type PoolProblem = { clipId: string; kind: "missing-media" | "play-blocked" }`
  - `interface MediaPoolDeps { createElement(kind): PoolElement; urlFor(mediaId): string | null; attachGain(element): GainControl; onProblem?(problem): void }`
  - `interface MediaPool { slots(): SlotState[]; apply(plan): void; elementForClip(clipId): PoolElement | undefined; dispose(): void }`
  - `createMediaPool(deps): MediaPool`. Slot ids are `slot-1`, `slot-2`, and so on. `apply` first pauses, silences and unassigns released slots (they keep their element and file for reuse), then performs each command: create the element if the command has no (known) slot; set `slot.clipId`; set `src` only when `load`; seek only when `seekTo` is set; set the playback rate only when it differs; set the gain; play when `play` and the element is paused; pause when not `play` and the element is playing. A `load` whose URL is `null` silences the slot, clears its file and reports `missing-media` once. A rejected `play()` reports `play-blocked` once, until a later `play()` succeeds. `elementForClip` returns nothing for a slot without a loaded file.

- [ ] **Step 1: Create the test fakes**

`src/lib/playback/test-utils.ts` (imported only by tests):

```ts
import type { MediaElementKind } from "@/lib/engine/wanted";
import type {
  GainControl,
  MediaPoolDeps,
  PoolElement,
  PoolProblem,
} from "@/lib/playback/media-pool";

/** A media element that records what was done to it and can simulate playing. */
export class FakeElement implements PoolElement {
  playbackRate = 1;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  /** How many times `src` was assigned (loads). */
  srcSets = 0;
  /** Every value assigned to `currentTime` (seeks), in order. */
  seeks: number[] = [];
  /** When set, play() rejects the way a browser blocking autoplay does. */
  playError: Error | null = null;

  private time = 0;
  private source = "";

  get currentTime(): number {
    return this.time;
  }
  set currentTime(value: number) {
    this.seeks.push(value);
    this.time = value;
  }

  get src(): string {
    return this.source;
  }
  set src(value: string) {
    this.srcSets += 1;
    this.source = value;
  }

  play(): Promise<void> {
    this.playCalls += 1;
    if (this.playError) return Promise.reject(this.playError);
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls += 1;
    this.paused = true;
  }

  /** Simulates the browser playing for `seconds` of wall-clock time (not a seek). */
  advance(seconds: number): void {
    if (!this.paused) this.time += seconds * this.playbackRate;
  }
}

export class FakeGain implements GainControl {
  values: number[] = [];

  set(gain: number): void {
    this.values.push(gain);
  }

  get last(): number | undefined {
    return this.values[this.values.length - 1];
  }
}

/**
 * Pool dependencies backed by fakes. `urls` maps a media id to a URL, or to
 * null for "missing"; ids not listed get `blob:<id>`.
 */
export function makeFakePoolDeps(options: { urls?: Record<string, string | null>; playError?: Error } = {}) {
  const urls = options.urls ?? {};
  const created: Array<{ kind: MediaElementKind; element: FakeElement }> = [];
  const gains = new Map<PoolElement, FakeGain>();
  const problems: PoolProblem[] = [];

  const deps: MediaPoolDeps = {
    createElement(kind) {
      const element = new FakeElement();
      element.playError = options.playError ?? null;
      created.push({ kind, element });
      return element;
    },
    urlFor: (mediaId) => (mediaId in urls ? urls[mediaId] : `blob:${mediaId}`),
    attachGain(element) {
      const gain = new FakeGain();
      gains.set(element, gain);
      return gain;
    },
    onProblem: (problem) => {
      problems.push(problem);
    },
  };

  return { deps, urls, created, gains, problems };
}
```

- [ ] **Step 2: Write the failing test**

`src/lib/playback/media-pool.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { MediaSyncPlan, SlotCommand } from "@/lib/engine/media-sync";
import { createMediaPool, type PoolElement } from "@/lib/playback/media-pool";
import { makeFakePoolDeps } from "@/lib/playback/test-utils";

// Compile-time check: a real media element satisfies PoolElement.
const realElementFits = (element: HTMLMediaElement): PoolElement => element;
void realElementFits;

const command = (overrides: Partial<SlotCommand> = {}): SlotCommand => ({
  slotId: null,
  clipId: "c1",
  mediaId: "m",
  kind: "video",
  active: true,
  load: true,
  seekTo: 2,
  play: true,
  playbackRate: 1,
  gain: 1,
  ...overrides,
});

const plan = (commands: SlotCommand[], releasedSlotIds: string[] = []): MediaSyncPlan => ({
  commands,
  releasedSlotIds,
  droppedClipIds: [],
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("createMediaPool: carrying out commands", () => {
  it("creates an element, loads it, positions it, sets rate and gain, and plays", () => {
    const { deps, created, gains } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command({ seekTo: 2, playbackRate: 2, gain: 0.5 })]));

    expect(created).toHaveLength(1);
    const { element } = created[0];
    expect(element.src).toBe("blob:m");
    expect(element.seeks).toEqual([2]);
    expect(element.playbackRate).toBe(2);
    expect(gains.get(element)?.last).toBe(0.5);
    expect(element.paused).toBe(false);
    expect(pool.slots()).toEqual([
      { id: "slot-1", kind: "video", mediaId: "m", clipId: "c1", currentTime: 2 },
    ]);
  });

  it("creates an audio element when the command is for audio", () => {
    const { deps, created } = makeFakePoolDeps();
    createMediaPool(deps).apply(plan([command({ kind: "audio" })]));
    expect(created[0].kind).toBe("audio");
  });

  it("reuses a slot without reloading or seeking when the command says not to", () => {
    const { deps, created, gains } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command()]));
    pool.apply(plan([command({ slotId: "slot-1", load: false, seekTo: null, gain: 0.25 })]));

    const { element } = created[0];
    expect(created).toHaveLength(1);
    expect(element.srcSets).toBe(1);
    expect(element.seeks).toEqual([2]);
    expect(gains.get(element)?.last).toBe(0.25);
  });

  it("points a reused slot at a different file when told to load", () => {
    const { deps, created } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command()]));
    pool.apply(plan([command({ slotId: "slot-1", clipId: "c2", mediaId: "other", seekTo: 0 })]));

    expect(created[0].element.src).toBe("blob:other");
    expect(pool.slots()[0]).toMatchObject({ mediaId: "other", clipId: "c2" });
  });

  it("creates a new element rather than failing when the slot id is unknown", () => {
    const { deps, created } = makeFakePoolDeps();
    createMediaPool(deps).apply(plan([command({ slotId: "ghost", load: false })]));
    expect(created).toHaveLength(1);
  });

  it("only plays a paused element and only pauses a playing one", () => {
    const { deps, created } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command({ play: true })]));
    pool.apply(plan([command({ slotId: "slot-1", load: false, seekTo: null, play: true })]));
    expect(created[0].element.playCalls).toBe(1);

    pool.apply(plan([command({ slotId: "slot-1", load: false, seekTo: null, play: false })]));
    pool.apply(plan([command({ slotId: "slot-1", load: false, seekTo: null, play: false })]));
    expect(created[0].element.pauseCalls).toBe(1);
    expect(created[0].element.paused).toBe(true);
  });

  it("reports each element's live position for the next plan", () => {
    const { deps, created } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command({ seekTo: 2 })]));
    created[0].element.advance(1.5);
    expect(pool.slots()[0].currentTime).toBe(3.5);
  });
});

describe("createMediaPool: releasing", () => {
  it("pauses, silences and unassigns a released slot but keeps its file", () => {
    const { deps, created, gains } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command()]));
    pool.apply(plan([], ["slot-1"]));

    const { element } = created[0];
    expect(element.paused).toBe(true);
    expect(gains.get(element)?.last).toBe(0);
    expect(pool.slots()[0]).toMatchObject({ clipId: null, mediaId: "m" });
    expect(pool.elementForClip("c1")).toBeUndefined();
  });

  it("lets a released slot be reused for the same file without a reload", () => {
    const { deps, created } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command()]));
    pool.apply(plan([], ["slot-1"]));
    pool.apply(plan([command({ slotId: "slot-1", clipId: "c2", load: false, seekTo: null })]));

    expect(created[0].element.srcSets).toBe(1);
    expect(pool.slots()[0].clipId).toBe("c2");
  });
});

describe("createMediaPool: which element serves a clip", () => {
  it("returns the element for an assigned clip and nothing for others", () => {
    const { deps, created } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command()]));
    expect(pool.elementForClip("c1")).toBe(created[0].element);
    expect(pool.elementForClip("nope")).toBeUndefined();
  });
});

describe("createMediaPool: problems", () => {
  it("shows nothing and reports missing media once, then recovers when the URL appears", () => {
    const { deps, created, gains, problems, urls } = makeFakePoolDeps({ urls: { m: null } });
    const pool = createMediaPool(deps);

    for (let i = 0; i < 3; i++) pool.apply(plan([command({ slotId: i === 0 ? null : "slot-1" })]));

    const { element } = created[0];
    expect(element.srcSets).toBe(0);
    expect(element.paused).toBe(true);
    expect(gains.get(element)?.last).toBe(0);
    expect(pool.elementForClip("c1")).toBeUndefined();
    expect(pool.slots()[0].mediaId).toBeNull();
    expect(problems).toEqual([{ clipId: "c1", kind: "missing-media" }]);

    urls.m = "blob:found";
    pool.apply(plan([command({ slotId: "slot-1" })]));
    expect(element.src).toBe("blob:found");
    expect(pool.elementForClip("c1")).toBe(element);
  });

  it("reports blocked playback once and plays after it is allowed", async () => {
    const { deps, created, problems } = makeFakePoolDeps({ playError: new Error("NotAllowedError") });
    const pool = createMediaPool(deps);

    pool.apply(plan([command()]));
    await flush();
    pool.apply(plan([command({ slotId: "slot-1", load: false, seekTo: null })]));
    await flush();

    expect(problems).toEqual([{ clipId: "c1", kind: "play-blocked" }]);
    expect(created[0].element.paused).toBe(true);

    created[0].element.playError = null;
    pool.apply(plan([command({ slotId: "slot-1", load: false, seekTo: null })]));
    await flush();
    expect(created[0].element.paused).toBe(false);
    expect(problems).toHaveLength(1);
  });
});

describe("createMediaPool: dispose", () => {
  it("stops every element, empties it and forgets the slots", () => {
    const { deps, created, gains } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command()]));
    pool.dispose();

    const { element } = created[0];
    expect(element.paused).toBe(true);
    expect(element.src).toBe("");
    expect(gains.get(element)?.last).toBe(0);
    expect(pool.slots()).toEqual([]);
    expect(pool.elementForClip("c1")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/playback/media-pool.test.ts`
Expected: FAIL; `@/lib/playback/media-pool` cannot be resolved.

- [ ] **Step 4: Implement the pool**

`src/lib/playback/media-pool.ts`:

```ts
import type { MediaSyncPlan, SlotCommand } from "@/lib/engine/media-sync";
import type { SlotState } from "@/lib/engine/slots";
import type { MediaElementKind } from "@/lib/engine/wanted";

/** The part of a media element the pool uses; a real HTMLMediaElement fits. */
export interface PoolElement {
  currentTime: number;
  playbackRate: number;
  readonly paused: boolean;
  src: string;
  play(): Promise<void> | void;
  pause(): void;
}

export interface GainControl {
  set(gain: number): void;
}

export type PoolProblem = { clipId: string; kind: "missing-media" | "play-blocked" };

export interface MediaPoolDeps {
  createElement(kind: MediaElementKind): PoolElement;
  /** The playable URL for a media file, or null if it cannot be found. */
  urlFor(mediaId: string): string | null;
  /** Routes the element's sound through the audio graph; returns its volume control. */
  attachGain(element: PoolElement): GainControl;
  onProblem?(problem: PoolProblem): void;
}

export interface MediaPool {
  /** The real state of every element, for the next sync plan. */
  slots(): SlotState[];
  apply(plan: MediaSyncPlan): void;
  /** The element serving a clip, or undefined if it has none or no loaded file. */
  elementForClip(clipId: string): PoolElement | undefined;
  dispose(): void;
}

interface Slot {
  id: string;
  kind: MediaElementKind;
  element: PoolElement;
  gain: GainControl;
  mediaId: string | null;
  clipId: string | null;
}

export function createMediaPool(deps: MediaPoolDeps): MediaPool {
  const slots = new Map<string, Slot>();
  const missing = new Set<string>(); // clips already reported as missing media
  const blocked = new Set<string>(); // clips already reported as blocked
  let counter = 0;

  function report(problem: PoolProblem, seen: Set<string>) {
    if (seen.has(problem.clipId)) return;
    seen.add(problem.clipId);
    deps.onProblem?.(problem);
  }

  function silence(slot: Slot) {
    slot.element.pause();
    slot.gain.set(0);
  }

  function create(kind: MediaElementKind): Slot {
    counter += 1;
    const element = deps.createElement(kind);
    const slot: Slot = {
      id: `slot-${counter}`,
      kind,
      element,
      gain: deps.attachGain(element),
      mediaId: null,
      clipId: null,
    };
    slots.set(slot.id, slot);
    return slot;
  }

  function applyCommand(command: SlotCommand) {
    const known = command.slotId === null ? undefined : slots.get(command.slotId);
    const slot = known ?? create(command.kind);
    slot.clipId = command.clipId;

    if (command.load) {
      const url = deps.urlFor(command.mediaId);
      if (url === null) {
        silence(slot);
        slot.mediaId = null;
        report({ clipId: command.clipId, kind: "missing-media" }, missing);
        return;
      }
      slot.element.src = url;
      slot.mediaId = command.mediaId;
      missing.delete(command.clipId);
    }

    if (command.seekTo !== null) slot.element.currentTime = command.seekTo;
    if (slot.element.playbackRate !== command.playbackRate) {
      slot.element.playbackRate = command.playbackRate;
    }
    slot.gain.set(command.gain);

    if (command.play) {
      if (slot.element.paused) {
        Promise.resolve(slot.element.play()).then(
          () => {
            blocked.delete(command.clipId);
          },
          () => report({ clipId: command.clipId, kind: "play-blocked" }, blocked),
        );
      }
    } else if (!slot.element.paused) {
      slot.element.pause();
    }
  }

  return {
    slots() {
      return Array.from(slots.values(), (slot) => ({
        id: slot.id,
        kind: slot.kind,
        mediaId: slot.mediaId,
        clipId: slot.clipId,
        currentTime: slot.element.currentTime,
      }));
    },

    apply(plan) {
      // Released elements are silenced before anything else, so a clip that
      // ended can never keep making sound.
      for (const id of plan.releasedSlotIds) {
        const slot = slots.get(id);
        if (!slot) continue;
        silence(slot);
        if (slot.clipId !== null) {
          missing.delete(slot.clipId);
          blocked.delete(slot.clipId);
        }
        slot.clipId = null;
      }
      for (const command of plan.commands) applyCommand(command);
    },

    elementForClip(clipId) {
      for (const slot of slots.values()) {
        if (slot.clipId === clipId && slot.mediaId !== null) return slot.element;
      }
      return undefined;
    },

    dispose() {
      for (const slot of slots.values()) {
        silence(slot);
        slot.element.src = "";
      }
      slots.clear();
      missing.clear();
      blocked.clear();
    },
  };
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/lib/playback/media-pool.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors. The `realElementFits` line is the compile-time check that a real `HTMLMediaElement` satisfies `PoolElement`; if it errors, adjust the interface, not the check.

- [ ] **Step 6: Commit**

```bash
git add src/lib/playback/test-utils.ts src/lib/playback/media-pool.ts src/lib/playback/media-pool.test.ts
git commit -m "feat: add media pool that carries out sync plans on elements" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Audio graph

**Files:**
- Create: `src/lib/playback/audio-graph.ts`
- Test: `src/lib/playback/audio-graph.test.ts`

**Interfaces:**
- Consumes: `GainControl`, `PoolElement` (Task 3).
- Produces:
  - `GAIN_TIME_CONSTANT = 0.002`
  - `interface AudioParamLike { value: number; setTargetAtTime(value: number, startTime: number, timeConstant: number): unknown }`
  - `interface AudioNodeLike { connect(destination: unknown): unknown }`
  - `interface GainNodeLike extends AudioNodeLike { readonly gain: AudioParamLike }`
  - `interface AudioContextLike { readonly currentTime: number; readonly state: string; readonly destination: unknown; createGain(): GainNodeLike; createMediaElementSource(element: PoolElement): AudioNodeLike; resume(): Promise<void>; close(): Promise<void> }` (a real `AudioContext` satisfies it)
  - `interface AudioGraph { attach(element: PoolElement): GainControl; resume(): Promise<void>; isRunning(): boolean; close(): Promise<void> }`
  - `createAudioGraph(ctx): AudioGraph`. A master gain connects to the destination. `attach` builds `source -> gain -> master` once per element (a second call returns the same control), starting silent. `GainControl.set` clamps to `>= 0` (non-finite becomes 0) and schedules `setTargetAtTime(value, ctx.currentTime, GAIN_TIME_CONSTANT)`. `resume` calls `ctx.resume()` only when the context is suspended.

- [ ] **Step 1: Write the failing test**

`src/lib/playback/audio-graph.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  createAudioGraph,
  GAIN_TIME_CONSTANT,
  type AudioContextLike,
} from "@/lib/playback/audio-graph";
import { FakeElement } from "@/lib/playback/test-utils";

// Compile-time check: a real AudioContext satisfies AudioContextLike.
const realContextFits = (ctx: AudioContext): AudioContextLike => ctx;
void realContextFits;

class FakeParam {
  value = 1;
  calls: Array<[number, number, number]> = [];
  setTargetAtTime(value: number, startTime: number, timeConstant: number) {
    this.calls.push([value, startTime, timeConstant]);
    return this;
  }
}

class FakeNode {
  connections: unknown[] = [];
  connect(destination: unknown) {
    this.connections.push(destination);
    return destination;
  }
}

class FakeGainNode extends FakeNode {
  gain = new FakeParam();
}

class FakeContext implements AudioContextLike {
  currentTime = 0;
  state = "running";
  destination = { name: "destination" };
  gains: FakeGainNode[] = [];
  sources: Array<{ element: unknown; node: FakeNode }> = [];
  resumed = 0;
  closed = 0;

  createGain() {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }
  createMediaElementSource(element: unknown) {
    const node = new FakeNode();
    this.sources.push({ element, node });
    return node;
  }
  async resume() {
    this.resumed += 1;
    this.state = "running";
  }
  async close() {
    this.closed += 1;
  }
}

describe("createAudioGraph", () => {
  it("connects a master gain to the destination", () => {
    const ctx = new FakeContext();
    createAudioGraph(ctx);
    expect(ctx.gains).toHaveLength(1);
    expect(ctx.gains[0].connections).toEqual([ctx.destination]);
  });

  it("routes an attached element through its own silent gain into the master", () => {
    const ctx = new FakeContext();
    const graph = createAudioGraph(ctx);
    const element = new FakeElement();
    graph.attach(element);

    const [master, gain] = ctx.gains;
    expect(ctx.sources[0].element).toBe(element);
    expect(ctx.sources[0].node.connections).toEqual([gain]);
    expect(gain.connections).toEqual([master]);
    expect(gain.gain.value).toBe(0);
  });

  it("connects an element only once", () => {
    const ctx = new FakeContext();
    const graph = createAudioGraph(ctx);
    const element = new FakeElement();
    const first = graph.attach(element);
    const second = graph.attach(element);
    expect(second).toBe(first);
    expect(ctx.sources).toHaveLength(1);
  });

  it("gives each element its own gain node", () => {
    const ctx = new FakeContext();
    const graph = createAudioGraph(ctx);
    graph.attach(new FakeElement());
    graph.attach(new FakeElement());
    expect(ctx.gains).toHaveLength(3); // master + two
  });

  it("smooths gain changes from the current time", () => {
    const ctx = new FakeContext();
    const graph = createAudioGraph(ctx);
    const control = graph.attach(new FakeElement());
    ctx.currentTime = 5;
    control.set(0.5);
    expect(ctx.gains[1].gain.calls).toEqual([[0.5, 5, GAIN_TIME_CONSTANT]]);
  });

  it("allows gains above 1 and clamps negative and non-finite gains to 0", () => {
    const ctx = new FakeContext();
    const graph = createAudioGraph(ctx);
    const control = graph.attach(new FakeElement());
    for (const value of [1.5, -1, NaN, Infinity]) control.set(value);
    expect(ctx.gains[1].gain.calls.map((c) => c[0])).toEqual([1.5, 0, 0, 0]);
  });

  it("resumes only a suspended context and reports whether it is running", async () => {
    const ctx = new FakeContext();
    const graph = createAudioGraph(ctx);
    await graph.resume();
    expect(ctx.resumed).toBe(0);

    ctx.state = "suspended";
    expect(graph.isRunning()).toBe(false);
    await graph.resume();
    expect(ctx.resumed).toBe(1);
    expect(graph.isRunning()).toBe(true);
  });

  it("closes the context", async () => {
    const ctx = new FakeContext();
    await createAudioGraph(ctx).close();
    expect(ctx.closed).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/playback/audio-graph.test.ts`
Expected: FAIL; `@/lib/playback/audio-graph` cannot be resolved.

- [ ] **Step 3: Implement the graph**

`src/lib/playback/audio-graph.ts`:

```ts
import type { GainControl, PoolElement } from "@/lib/playback/media-pool";

/** Smoothing for gain changes: about 99% of the way there after 10 ms. */
export const GAIN_TIME_CONSTANT = 0.002;

/** The parts of the Web Audio API the graph uses; the real classes fit. */
export interface AudioParamLike {
  value: number;
  setTargetAtTime(value: number, startTime: number, timeConstant: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: unknown): unknown;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  createGain(): GainNodeLike;
  createMediaElementSource(element: PoolElement): AudioNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface AudioGraph {
  /** Routes an element's sound through its own gain; the same control on repeat calls. */
  attach(element: PoolElement): GainControl;
  /** Call from a user gesture (the first Play click): browsers start the context suspended. */
  resume(): Promise<void>;
  isRunning(): boolean;
  close(): Promise<void>;
}

export function createAudioGraph(ctx: AudioContextLike): AudioGraph {
  const master = ctx.createGain();
  master.connect(ctx.destination);

  // createMediaElementSource throws if called twice for one element.
  const controls = new WeakMap<PoolElement, GainControl>();

  return {
    attach(element) {
      const existing = controls.get(element);
      if (existing) return existing;

      const source = ctx.createMediaElementSource(element);
      const gain = ctx.createGain();
      gain.gain.value = 0; // silent until the pool sets a real gain
      source.connect(gain);
      gain.connect(master);

      const control: GainControl = {
        set(value) {
          const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
          gain.gain.setTargetAtTime(safe, ctx.currentTime, GAIN_TIME_CONSTANT);
        },
      };
      controls.set(element, control);
      return control;
    },

    async resume() {
      if (ctx.state === "suspended") await ctx.resume();
    },

    isRunning: () => ctx.state === "running",

    close: () => ctx.close(),
  };
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `npx vitest run src/lib/playback/audio-graph.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors. If the `realContextFits` line errors, loosen the interface member it points at, not the check.

- [ ] **Step 5: Commit**

```bash
git add src/lib/playback/audio-graph.ts src/lib/playback/audio-graph.test.ts
git commit -m "feat: add Web Audio gain graph with smoothed per-element volume" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Engine runner

**Files:**
- Create: `src/lib/playback/engine.ts`
- Test: `src/lib/playback/engine.test.ts`

**Interfaces:**
- Consumes: `Transport` (`@/lib/engine/transport`); `planMediaSync` (`@/lib/engine/media-sync`); `MediaPool` (Task 3); type `TimelineProject`.
- Produces:
  - `interface FrameInfo { time: number; playing: boolean; ended: boolean }`
  - `interface PlaybackEngineDeps { transport: Transport; getProject(): TimelineProject; pool: MediaPool; schedule(callback: () => void): () => void; onFrame(frame: FrameInfo): void }` (`schedule` runs the callback on the next frame and returns a cancel function)
  - `interface PlaybackEngine { wake(): void; dispose(): void }`
  - `createPlaybackEngine(deps)`. A frame is: `transport.tick()`, `planMediaSync(project, time, playing, pool.slots())`, `pool.apply(plan)`, `onFrame(...)`, then reschedule only if the transport is playing. `wake()` cancels any pending frame and runs one immediately (so a seek, step, pause or edit is handled at once, and playback continues if playing). `dispose()` cancels the pending frame, disposes the pool, and makes later `wake()` calls do nothing.

- [ ] **Step 1: Write the failing test**

`src/lib/playback/engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { MediaSyncPlan } from "@/lib/engine/media-sync";
import type { SlotState } from "@/lib/engine/slots";
import { createTransport } from "@/lib/engine/transport";
import { createPlaybackEngine, type FrameInfo } from "@/lib/playback/engine";
import type { MediaPool } from "@/lib/playback/media-pool";
import { projectDuration } from "@/lib/timeline/clip-math";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import type { TimelineProject } from "@/types/timeline";

const projectWith = (id = "a") =>
  makeProject(makeStandardTracks(), [
    makeClip({ id, mediaId: "m", sourceIn: 0, sourceOut: 10, sourceDuration: 100 }),
  ]);

function setup(initial: TimelineProject = projectWith()) {
  let project = initial;
  const clock = { now: 0 };
  const transport = createTransport({ now: () => clock.now, duration: () => projectDuration(project) });

  const applied: MediaSyncPlan[] = [];
  const poolState = { slots: [] as SlotState[], disposed: 0 };
  const pool: MediaPool = {
    slots: () => poolState.slots,
    apply: (plan) => {
      applied.push(plan);
    },
    elementForClip: () => undefined,
    dispose: () => {
      poolState.disposed += 1;
    },
  };

  const queue: Array<() => void> = [];
  const scheduler = { cancelled: 0 };
  const schedule = (callback: () => void) => {
    queue.push(callback);
    return () => {
      scheduler.cancelled += 1;
      const index = queue.indexOf(callback);
      if (index >= 0) queue.splice(index, 1);
    };
  };

  const frames: FrameInfo[] = [];
  const engine = createPlaybackEngine({
    transport,
    getProject: () => project,
    pool,
    schedule,
    onFrame: (frame) => frames.push(frame),
  });

  return {
    clock,
    transport,
    engine,
    applied,
    poolState,
    frames,
    scheduler,
    pending: () => queue.length,
    runNext: () => queue.shift()?.(),
    setProject: (next: TimelineProject) => {
      project = next;
    },
  };
}

describe("createPlaybackEngine", () => {
  it("runs exactly one frame when woken while paused, and schedules nothing", () => {
    const s = setup();
    s.engine.wake();
    expect(s.applied).toHaveLength(1);
    expect(s.frames).toEqual([{ time: 0, playing: false, ended: false }]);
    expect(s.pending()).toBe(0);
    expect(s.applied[0].commands[0]).toMatchObject({ clipId: "a", play: false });
  });

  it("keeps running frames while playing, reflecting the clock", () => {
    const s = setup();
    s.transport.play();
    s.engine.wake();
    expect(s.pending()).toBe(1);

    s.clock.now = 0.5;
    s.runNext();
    expect(s.frames[s.frames.length - 1]).toEqual({ time: 0.5, playing: true, ended: false });
    expect(s.pending()).toBe(1);
    expect(s.applied[1].commands[0]).toMatchObject({ clipId: "a", play: true });
  });

  it("runs a final frame when paused, so elements are told to pause, then stops", () => {
    const s = setup();
    s.transport.play();
    s.engine.wake();
    s.transport.pause();
    s.engine.wake();

    expect(s.frames[s.frames.length - 1].playing).toBe(false);
    expect(s.applied[s.applied.length - 1].commands[0]).toMatchObject({ play: false });
    expect(s.pending()).toBe(0);
  });

  it("reports the end once and stops scheduling", () => {
    const s = setup();
    s.transport.play();
    s.engine.wake();
    s.clock.now = 12;
    s.runNext();

    expect(s.frames[s.frames.length - 1]).toEqual({ time: 10, playing: false, ended: true });
    expect(s.pending()).toBe(0);
  });

  it("cancels the pending frame and runs one now when woken while playing", () => {
    const s = setup();
    s.transport.play();
    s.engine.wake();
    s.engine.wake();

    expect(s.scheduler.cancelled).toBe(1);
    expect(s.frames).toHaveLength(2);
    expect(s.pending()).toBe(1);
  });

  it("plans from the pool's real slot state", () => {
    const s = setup();
    s.poolState.slots = [{ id: "s1", kind: "video", mediaId: "m", clipId: "a", currentTime: 0 }];
    s.engine.wake();
    expect(s.applied[0].commands[0]).toMatchObject({ slotId: "s1", load: false });
  });

  it("reads the project fresh every frame", () => {
    const s = setup(projectWith("a"));
    s.engine.wake();
    s.setProject(projectWith("b"));
    s.engine.wake();
    expect(s.applied[1].commands[0].clipId).toBe("b");
  });

  it("stops everything on dispose", () => {
    const s = setup();
    s.transport.play();
    s.engine.wake();
    s.engine.dispose();

    expect(s.scheduler.cancelled).toBe(1);
    expect(s.poolState.disposed).toBe(1);
    expect(s.pending()).toBe(0);

    const framesBefore = s.frames.length;
    s.engine.wake();
    expect(s.frames).toHaveLength(framesBefore);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/playback/engine.test.ts`
Expected: FAIL; `@/lib/playback/engine` cannot be resolved.

- [ ] **Step 3: Implement the engine**

`src/lib/playback/engine.ts`:

```ts
import { planMediaSync } from "@/lib/engine/media-sync";
import type { Transport } from "@/lib/engine/transport";
import type { MediaPool } from "@/lib/playback/media-pool";
import type { TimelineProject } from "@/types/timeline";

export interface FrameInfo {
  time: number;
  playing: boolean;
  ended: boolean;
}

export interface PlaybackEngineDeps {
  transport: Transport;
  getProject: () => TimelineProject;
  pool: MediaPool;
  /** Runs the callback on the next frame; returns a function that cancels it. */
  schedule: (callback: () => void) => () => void;
  /** Called after the media plan is applied; the picture redraws here. */
  onFrame: (frame: FrameInfo) => void;
}

export interface PlaybackEngine {
  /**
   * Runs one frame now (cancelling any pending one). Call after play, pause,
   * seek, frame-step or an edit. Frames then repeat while the transport plays.
   */
  wake(): void;
  dispose(): void;
}

export function createPlaybackEngine(deps: PlaybackEngineDeps): PlaybackEngine {
  const { transport, getProject, pool, schedule, onFrame } = deps;
  let cancel: (() => void) | null = null;
  let disposed = false;

  function frame() {
    cancel = null;
    if (disposed) return;

    const { time, ended } = transport.tick();
    const playing = transport.isPlaying();

    // Apply the plan before notifying, so the picture only ever asks for an
    // element that has already been assigned to its clip.
    pool.apply(planMediaSync(getProject(), time, playing, pool.slots()));
    onFrame({ time, playing, ended });

    if (playing) cancel = schedule(frame);
  }

  return {
    wake() {
      if (disposed) return;
      cancel?.();
      cancel = null;
      frame();
    },

    dispose() {
      disposed = true;
      cancel?.();
      cancel = null;
      pool.dispose();
    },
  };
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `npx vitest run src/lib/playback/engine.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/playback/engine.ts src/lib/playback/engine.test.ts
git commit -m "feat: add playback engine frame loop" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Transport store

**Files:**
- Create: `src/store/use-transport-store.ts`
- Test: `src/store/use-transport-store.test.ts`

**Interfaces:**
- Consumes: zustand.
- Produces: `useTransportStore` with state `time: number` and `playing: boolean`, and actions `setFrame(time, playing)` (a call that changes nothing does not notify subscribers) and `reset()`.

- [ ] **Step 1: Write the failing test**

`src/store/use-transport-store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";

import { useTransportStore } from "@/store/use-transport-store";

const state = () => useTransportStore.getState();

beforeEach(() => {
  state().reset();
});

describe("useTransportStore", () => {
  it("starts paused at 0", () => {
    expect(state().time).toBe(0);
    expect(state().playing).toBe(false);
  });

  it("records the latest frame", () => {
    state().setFrame(2.5, true);
    expect(state().time).toBe(2.5);
    expect(state().playing).toBe(true);
  });

  it("does not notify subscribers when nothing changed", () => {
    let notifications = 0;
    const unsubscribe = useTransportStore.subscribe(() => {
      notifications += 1;
    });
    state().setFrame(1, true);
    state().setFrame(1, true);
    state().setFrame(1, false);
    unsubscribe();
    expect(notifications).toBe(2);
  });

  it("resets to the start", () => {
    state().setFrame(9, true);
    state().reset();
    expect(state().time).toBe(0);
    expect(state().playing).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/store/use-transport-store.test.ts`
Expected: FAIL; `@/store/use-transport-store` cannot be resolved.

- [ ] **Step 3: Implement the store**

`src/store/use-transport-store.ts`:

```ts
import { create } from "zustand";

interface TransportStore {
  time: number;
  playing: boolean;
  setFrame: (time: number, playing: boolean) => void;
  reset: () => void;
}

/** A read-only mirror of the transport for the UI; the engine writes it each frame. */
export const useTransportStore = create<TransportStore>((set) => ({
  time: 0,
  playing: false,
  setFrame: (time, playing) =>
    set((state) => (state.time === time && state.playing === playing ? state : { time, playing })),
  reset: () => set({ time: 0, playing: false }),
}));
```

- [ ] **Step 4: Run the test and the type check**

Run: `npx vitest run src/store/use-transport-store.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/store/use-transport-store.ts src/store/use-transport-store.test.ts
git commit -m "feat: add transport store" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end simulation, barrel and verification

**Files:**
- Create: `src/lib/playback/engine.sim.test.ts`
- Create: `src/lib/playback/index.ts`

**Interfaces:**
- Consumes: everything above; `splitClip`, `projectDuration`, `makeClip`, `makeProject`, `makeStandardTracks`, `seqIds`.
- Produces: the end-to-end proof that the real engine, pool and plans together behave, plus a single import point `@/lib/playback` for plan 3c.

- [ ] **Step 1: Write the simulation test**

`src/lib/playback/engine.sim.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createTransport } from "@/lib/engine/transport";
import { createPlaybackEngine, type FrameInfo } from "@/lib/playback/engine";
import { createMediaPool } from "@/lib/playback/media-pool";
import { makeFakePoolDeps } from "@/lib/playback/test-utils";
import { projectDuration } from "@/lib/timeline/clip-math";
import { splitClip } from "@/lib/timeline/split";
import { makeClip, makeProject, makeStandardTracks, seqIds } from "@/lib/timeline/test-utils";
import type { Clip, TimelineProject } from "@/types/timeline";

const clip = (id: string, overrides: Partial<Clip> = {}) =>
  makeClip({ id, mediaId: "m", sourceDuration: 100, ...overrides });

const DT = 1 / 60;

/** The real engine and pool over fake elements that advance like a browser's. */
function simulate(project: TimelineProject) {
  const clock = { now: 0 };
  const transport = createTransport({ now: () => clock.now, duration: () => projectDuration(project) });
  const fake = makeFakePoolDeps();
  const pool = createMediaPool(fake.deps);

  const queue: Array<() => void> = [];
  const frames: FrameInfo[] = [];
  const engine = createPlaybackEngine({
    transport,
    getProject: () => project,
    pool,
    schedule: (callback) => {
      queue.push(callback);
      return () => {
        const index = queue.indexOf(callback);
        if (index >= 0) queue.splice(index, 1);
      };
    },
    onFrame: (frame) => frames.push(frame),
  });

  /** One browser frame: time passes, playing elements advance, then the frame callback runs. */
  function step(seconds = DT) {
    clock.now += seconds;
    for (const { element } of fake.created) element.advance(seconds);
    queue.shift()?.();
  }

  function playToEnd(limit = 3000) {
    transport.play();
    engine.wake();
    for (let i = 0; i < limit && transport.isPlaying(); i++) step();
  }

  return { clock, transport, fake, pool, engine, frames, step, playToEnd };
}

describe("end-to-end: a clip split into pieces plays on one element", () => {
  it("creates one element, loads once and seeks only to the start, across two real splits", () => {
    const base = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0.1, sourceOut: 3.1 }),
    ]);
    let project = splitClip(base, "a", 0.3, seqIds("s"));
    project = splitClip(project, "s-1", 1.0, seqIds("t"));
    expect(project.clips).toHaveLength(3);

    const sim = simulate(project);
    sim.playToEnd();

    expect(sim.fake.created).toHaveLength(1);
    const { element } = sim.fake.created[0];
    expect(element.srcSets).toBe(1);
    expect(element.seeks).toHaveLength(1);
    expect(element.seeks[0]).toBeCloseTo(0.1, 6);
    expect(sim.frames[sim.frames.length - 1].ended).toBe(true);
  });

  it("holds at other frame rates and at a non-unit speed", () => {
    const base = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 6, speed: 2 }),
    ]);
    let project = splitClip(base, "a", 0.7, seqIds("s"));
    project = splitClip(project, "s-1", 1.9, seqIds("t"));

    for (const dt of [1 / 24, 1 / 30, 1 / 60, 1 / 120]) {
      const sim = simulate(project);
      sim.transport.play();
      sim.engine.wake();
      for (let i = 0; i < 5000 && sim.transport.isPlaying(); i++) sim.step(dt);

      expect(sim.fake.created).toHaveLength(1);
      expect(sim.fake.created[0].element.srcSets).toBe(1);
      expect(sim.fake.created[0].element.seeks).toHaveLength(1);
      expect(sim.fake.created[0].element.playbackRate).toBe(2);
    }
  });
});

describe("end-to-end: a cut between two files", () => {
  it("prepares the next file ahead of the cut and is already playing at it", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { mediaId: "m1", start: 0, sourceIn: 0, sourceOut: 2 }),
      clip("b", { mediaId: "m2", start: 2, sourceIn: 0, sourceOut: 2 }),
    ]);
    const sim = simulate(project);
    sim.transport.play();
    sim.engine.wake();

    let secondCreatedAt: number | null = null;
    let atCut: { paused: boolean; position: number } | null = null;
    for (let i = 0; i < 1000 && sim.transport.isPlaying(); i++) {
      sim.step();
      if (sim.fake.created.length === 2 && secondCreatedAt === null) secondCreatedAt = sim.clock.now;
      if (atCut === null && sim.clock.now >= 2 && sim.fake.created.length === 2) {
        const second = sim.fake.created[1].element;
        atCut = { paused: second.paused, position: second.currentTime - (sim.clock.now - 2) };
      }
    }

    expect(sim.fake.created).toHaveLength(2);
    expect(secondCreatedAt).toBeGreaterThanOrEqual(0.99);
    expect(secondCreatedAt).toBeLessThan(1.1);
    expect(sim.fake.created[1].element.srcSets).toBe(1);
    expect(sim.fake.created[1].element.seeks).toHaveLength(1);
    expect(atCut?.paused).toBe(false);
    expect(Math.abs(atCut?.position ?? 99)).toBeLessThan(0.05);
  });
});

describe("end-to-end: pausing, scrubbing and stepping", () => {
  const single = () =>
    makeProject(makeStandardTracks(), [clip("a", { start: 0, sourceIn: 0, sourceOut: 10 })]);

  it("pauses the element, follows a seek, and follows a single-frame step", () => {
    const sim = simulate(single());
    sim.transport.play();
    sim.engine.wake();
    for (let i = 0; i < 60; i++) sim.step();

    const { element } = sim.fake.created[0];
    sim.transport.pause();
    sim.engine.wake();
    expect(element.paused).toBe(true);

    sim.transport.seek(5);
    sim.engine.wake();
    expect(element.currentTime).toBeCloseTo(5, 9);

    sim.transport.stepFrame(1, 60);
    sim.engine.wake();
    expect(element.currentTime).toBeCloseTo(301 / 60, 9);
  });

  it("leaves every element paused and silent once playback ends", () => {
    const sim = simulate(single());
    sim.playToEnd();

    const { element } = sim.fake.created[0];
    expect(element.paused).toBe(true);
    expect(sim.fake.gains.get(element)?.last).toBe(0);
  });
});
```

- [ ] **Step 2: Run the simulation to verify it passes**

Run: `npx vitest run src/lib/playback/engine.sim.test.ts`
Expected: PASS. (These tests exercise modules that already exist and pass, so there is no failing step; they are an integration check. If one fails, find out which module is wrong with `superpowers:systematic-debugging`; do not weaken the assertion.)

- [ ] **Step 3: Create the barrel**

`src/lib/playback/index.ts`:

```ts
export * from "@/lib/playback/audio-graph";
export * from "@/lib/playback/draw-state";
export * from "@/lib/playback/engine";
export * from "@/lib/playback/media-pool";
```

`test-utils` is deliberately not exported.

- [ ] **Step 4: Run the whole suite, type-check and lint**

Run: `npm test` then `npx tsc --noEmit` then `npx eslint src/lib/playback src/store/use-transport-store.ts src/store/use-transport-store.test.ts src/lib/timeline/active-clips.ts src/lib/timeline/active-clips.test.ts`
Expected: all tests pass; no type or lint errors. If `export *` reports a duplicate name, rename the colliding export in its own file and update its tests.

- [ ] **Step 5: Confirm nothing else changed**

Run: `git diff --stat main -- src ':!src/lib/playback' ':!src/store/use-transport-store.ts' ':!src/store/use-transport-store.test.ts'`
Expected: only `src/lib/timeline/active-clips.ts` and `src/lib/timeline/active-clips.test.ts` appear.

- [ ] **Step 6: Confirm the glue touches no browser API directly**

Run: `grep -rnE "document\.|window\.|new AudioContext|requestAnimationFrame|setTimeout|setInterval|performance\.|Date\.now" src/lib/playback --include=*.ts --exclude=*.test.ts --exclude=test-utils.ts`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/playback/engine.sim.test.ts src/lib/playback/index.ts
git commit -m "feat: add end-to-end playback simulation and barrel export" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage** (section 5.2, plan 3b)

| Requirement | Task |
|---|---|
| Media pool applies a sync plan; creates, loads only on `load`, seeks only on `seekTo`, rate, gain, play/pause | 3 |
| `slot.clipId` set for created and reused elements; `SlotState` from `element.currentTime` | 3 |
| Released elements paused, silenced, unassigned, kept for reuse | 3 |
| Missing URL shows nothing and is reported; blocked playback reported | 3 |
| `elementForClip` for the picture | 3 |
| Audio graph: element -> gain -> master, smoothed, once per element, gains above 1, resume on first click | 4 |
| Engine runner: tick, plan, apply, notify; frames only while playing; wake after pause/seek/step/edit; injected scheduler | 5 |
| Plan applied before the picture asks for an element | 5 (apply then `onFrame`) |
| Draw state: relative keyframes, fades multiply opacity, shared fade ramp | 1, 2 |
| Transport store | 6 |
| End-to-end: one element, one load, no seek across cuts | 7 |
| Clock is `performance.now()`, not the audio clock | Plan 3c supplies it (the engine takes any `now`) |
| Konva picture, test page `/dev/playback`, real-browser checks | Plan 3c |

Gap accepted: this plan has no visible or audible output. It is verified by unit tests and an end-to-end simulation with fake elements; real browsers first appear in plan 3c.

**2. Placeholder scan:** no TBD/TODO; every step has code or an exact command.

**3. Type consistency:** `PoolElement`, `GainControl`, `PoolProblem`, `MediaPoolDeps`, `MediaPool`, `AudioContextLike`, `AudioGraph`, `FrameInfo`, `PlaybackEngineDeps`, `PlaybackEngine` and `DrawState` are each defined once and used with the same names downstream. `AudioGraph.attach` returns `GainControl`, matching `MediaPoolDeps.attachGain`.

**4. Review Focus:** all five failure modes have named tests: released/missing clips (Task 3 release and problems tests, Task 7 end-of-playback test); once-only reporting and recovery (Task 3); the split chain at several frame rates plus frame stepping (Task 7); the loop's lifecycle (Task 5); draw-state finiteness (Task 2).

## Execution Handoff

Nothing for you to do outside the plan: no SQL, no Supabase changes, no new dependencies. Before plan 3c is executed, enable the Claude in Chrome extension in your real Chrome.
