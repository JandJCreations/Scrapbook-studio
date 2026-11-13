# Playback Engine Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, fully unit-tested logic of the playback engine: a transport clock, a media-sync planner (which elements exist, what time each is at, when to seek, with per-clip gain), and a mixdown planner for export, so the browser glue in plan 3b only has to carry out the plans.

**Architecture:** Everything is a pure function or a small closure with injected time. `planWanted` turns `(project, t, playing)` into the media each clip needs; `assignSlots` maps those onto a pool of reusable element slots (reusing one element across a split); `planMediaSync` turns the assignment into per-slot commands (load, seek, play, rate, gain). `planMixdown` produces the offline-render schedule. No DOM, no Web Audio, no timers.

**Tech Stack:** TypeScript (strict), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-clip-timeline-design.md`, sections 5 and 5.1. Builds on the merged core (`src/lib/timeline/*`).

## Global Constraints

- Work on branch `feature/playback-engine-core`; never commit to `main`.
- The engine modules in `src/lib/engine/` are pure: no DOM, no `AudioContext`, no `setTimeout`, no `Date`/`performance`. Time is always injected.
- The only existing file modified is `src/lib/timeline/active-clips.ts` (extracting `isAudible`); its existing tests must keep passing.
- Constants come from spec 5.1, exactly: lookahead `1.0` s; at most `6` video elements; seek threshold `0.25` s while playing and `0.02` s while paused or scrubbing; reversed clips step with `0.04` s.
- Reversed clips are silent in the live plan (`gain: 0`, `shouldPlay: false`); the mixdown includes them with `reversed: true`.
- Image, text and sticker clips never get a media element and never appear in the mixdown.
- Playing past the end stops at the project end; `play()` at the end restarts from 0.
- Run tests with `npx vitest run <file>`; type-check with `npx tsc --noEmit`.
- If `node` is not found in a spawned PowerShell, run `$env:Path += ";C:\Program Files\nodejs"` first.
- End every commit message with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).

## Review Focus

Failure modes the spec implies but a reasonable implementation could miss. Each has a test in the task named on the right.

- Splitting a video into many clips must not multiply decoders or cause a seek or reload at the cut: contiguous same-file clips share one element, including a chain of three or more inside the lookahead window, using the real `splitClip` output with fractional times. (Task 3, Task 5)
- At the 6-element cap, an active clip must never be dropped in favour of a preload, and no more than 6 video elements may ever be requested. (Task 4)
- A clip must not be given an element it cannot use: hidden-and-muted video, muted audio, and image/text/sticker clips get none; a hidden but audible video still gets one. (Task 3)
- The transport must behave at its edges: play at the end, seek while playing, duration shrinking mid-playback, an empty project, and frame stepping off the frame grid. (Task 2)
- The mixdown must match the live gain: speed, overlapping fades (including a fade longer than the clip), solo and mute, and video clips' own sound. (Task 6)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/timeline/active-clips.ts` | Modified: export `isAudible` |
| `src/lib/engine/transport.ts` | `createTransport` clock |
| `src/lib/engine/wanted.ts` | `planWanted`, `isContinuation`, `WantedMedia` |
| `src/lib/engine/slots.ts` | `assignSlots`, `SlotState` |
| `src/lib/engine/media-sync.ts` | `needsSeek`, `planMediaSync`, `SlotCommand` |
| `src/lib/engine/mixdown.ts` | `gainEnvelope`, `planMixdown` |
| `src/lib/engine/index.ts` | Barrel |

Each `*.test.ts` sits beside the file it tests.

---

### Task 1: Share the audibility rule

**Files:**
- Modify: `src/lib/timeline/active-clips.ts`
- Test: `src/lib/timeline/active-clips.test.ts`

**Interfaces:**
- Consumes: types `Clip`, `Track`.
- Produces: `isAudible(clip: Clip, track: Track, anySolo: boolean): boolean`. True only for `video` and `audio` clips that are not muted, on a track that is not muted, and (when any track is soloed) on a soloed track. `activeClipsAt` uses it, so the live plan and the mixdown can never disagree.

- [ ] **Step 1: Write the failing test**

In `src/lib/timeline/active-clips.test.ts`, change the first import to `import { activeClipsAt, clipGainAt, isAudible } from "@/lib/timeline/active-clips";` and append:

```ts
describe("isAudible", () => {
  const track = makeTrack({ id: "t1" });

  it("is true for an unmuted video clip on an unmuted track", () => {
    expect(isAudible(makeClip({ kind: "video" }), track, false)).toBe(true);
  });

  it("is true for an audio clip", () => {
    expect(isAudible(makeClip({ kind: "audio" }), track, false)).toBe(true);
  });

  it.each(["image", "text", "sticker"] as const)("is false for %s clips", (kind) => {
    expect(isAudible(makeClip({ kind }), track, false)).toBe(false);
  });

  it("is false for a muted clip or a muted track", () => {
    expect(isAudible(makeClip({ muted: true }), track, false)).toBe(false);
    expect(isAudible(makeClip(), makeTrack({ muted: true }), false)).toBe(false);
  });

  it("when any track is soloed, only soloed tracks are audible", () => {
    expect(isAudible(makeClip(), makeTrack({ solo: false }), true)).toBe(false);
    expect(isAudible(makeClip(), makeTrack({ solo: true }), true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/timeline/active-clips.test.ts`
Expected: FAIL; `isAudible` is not exported (the new tests throw "is not a function").

- [ ] **Step 3: Extract the function**

In `src/lib/timeline/active-clips.ts`, add above `activeClipsAt`:

```ts
/**
 * Whether a clip contributes sound: only video and audio clips, not muted, on
 * a track that is not muted and, if any track is soloed, is itself soloed.
 */
export function isAudible(clip: Clip, track: Track, anySolo: boolean): boolean {
  const hasSound = clip.kind === "video" || clip.kind === "audio";
  return hasSound && !clip.muted && !track.muted && (!anySolo || track.solo);
}
```

Inside `activeClipsAt`, delete the line `const hasSound = clip.kind === "video" || clip.kind === "audio";` and replace the `audible:` property with:

```ts
      audible: isAudible(clip, track, anySolo),
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: everything passes, including the existing `activeClipsAt` audibility tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/active-clips.ts src/lib/timeline/active-clips.test.ts
git commit -m "refactor: share the audibility rule between live playback and mixdown" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Transport clock

**Files:**
- Create: `src/lib/engine/transport.ts`
- Test: `src/lib/engine/transport.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface TransportOptions { now: () => number; duration: () => number }` (`now` is any monotonic seconds clock; the glue can pass the Web Audio clock)
  - `interface Transport { time(): number; isPlaying(): boolean; play(): void; pause(): void; toggle(): void; seek(t: number): void; stepFrame(direction: 1 | -1, fps: number): void; tick(): { time: number; ended: boolean } }`
  - `createTransport(options): Transport`. `time()` is clamped to `[0, duration()]`. `play()` does nothing when `duration() <= 0`, and restarts from 0 when at the end. `tick()` stops playback at the end and reports `ended: true` exactly once.

- [ ] **Step 1: Write the failing test**

`src/lib/engine/transport.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createTransport } from "@/lib/engine/transport";

function setup(duration = 20) {
  const clock = { now: 0, duration };
  const transport = createTransport({ now: () => clock.now, duration: () => clock.duration });
  return { clock, transport };
}

describe("play / pause", () => {
  it("starts paused at 0", () => {
    const { transport } = setup();
    expect(transport.time()).toBe(0);
    expect(transport.isPlaying()).toBe(false);
  });

  it("advances with the clock while playing and freezes when paused", () => {
    const { clock, transport } = setup();
    transport.play();
    clock.now = 2;
    expect(transport.time()).toBe(2);
    clock.now = 3;
    transport.pause();
    clock.now = 10;
    expect(transport.time()).toBe(3);
    expect(transport.isPlaying()).toBe(false);
  });

  it("resumes from where it paused", () => {
    const { clock, transport } = setup();
    transport.play();
    clock.now = 3;
    transport.pause();
    clock.now = 10;
    transport.play();
    clock.now = 12;
    expect(transport.time()).toBe(5);
  });

  it("toggle flips between playing and paused", () => {
    const { transport } = setup();
    transport.toggle();
    expect(transport.isPlaying()).toBe(true);
    transport.toggle();
    expect(transport.isPlaying()).toBe(false);
  });

  it("does nothing on an empty project", () => {
    const { transport } = setup(0);
    transport.play();
    expect(transport.isPlaying()).toBe(false);
    expect(transport.time()).toBe(0);
  });
});

describe("the end", () => {
  it("clamps at the duration and tick stops playback once", () => {
    const { clock, transport } = setup(5);
    transport.play();
    clock.now = 9;
    expect(transport.time()).toBe(5);
    expect(transport.tick()).toEqual({ time: 5, ended: true });
    expect(transport.isPlaying()).toBe(false);
    expect(transport.tick()).toEqual({ time: 5, ended: false });
  });

  it("play at the end restarts from 0", () => {
    const { clock, transport } = setup(5);
    transport.play();
    clock.now = 9;
    transport.tick();
    clock.now = 20;
    transport.play();
    expect(transport.time()).toBe(0);
    clock.now = 21;
    expect(transport.time()).toBe(1);
  });

  it("tick reports the time without ending while time remains", () => {
    const { clock, transport } = setup(5);
    transport.play();
    clock.now = 2;
    expect(transport.tick()).toEqual({ time: 2, ended: false });
  });

  it("follows a duration that shrinks mid-playback", () => {
    const { clock, transport } = setup(20);
    transport.play();
    clock.now = 8;
    clock.duration = 6; // the user deleted a clip
    expect(transport.time()).toBe(6);
    expect(transport.tick().ended).toBe(true);
  });

  it("clamps a paused position when the duration shrinks", () => {
    const { clock, transport } = setup(20);
    transport.seek(15);
    clock.duration = 10;
    expect(transport.time()).toBe(10);
  });
});

describe("seek", () => {
  it("clamps to [0, duration]", () => {
    const { transport } = setup(20);
    transport.seek(-5);
    expect(transport.time()).toBe(0);
    transport.seek(99);
    expect(transport.time()).toBe(20);
  });

  it("keeps playing from the new position", () => {
    const { clock, transport } = setup(20);
    transport.play();
    clock.now = 2;
    transport.seek(10);
    expect(transport.time()).toBe(10);
    clock.now = 3;
    expect(transport.time()).toBe(11);
    expect(transport.isPlaying()).toBe(true);
  });
});

describe("stepFrame", () => {
  const fps = 30;

  it("steps forward and backward on the frame grid", () => {
    const { transport } = setup();
    transport.stepFrame(1, fps);
    expect(transport.time()).toBeCloseTo(1 / 30, 9);
    transport.stepFrame(1, fps);
    expect(transport.time()).toBeCloseTo(2 / 30, 9);
    transport.stepFrame(-1, fps);
    expect(transport.time()).toBeCloseTo(1 / 30, 9);
  });

  it("snaps to the grid when starting between frames", () => {
    const { transport } = setup();
    transport.seek(0.04); // between frame 1 (0.0333) and frame 2 (0.0667)
    transport.stepFrame(1, fps);
    expect(transport.time()).toBeCloseTo(2 / 30, 9);
    transport.seek(0.04);
    transport.stepFrame(-1, fps);
    expect(transport.time()).toBeCloseTo(1 / 30, 9);
  });

  it("clamps at 0 and at the duration", () => {
    const { transport } = setup(1);
    transport.stepFrame(-1, fps);
    expect(transport.time()).toBe(0);
    transport.seek(1);
    transport.stepFrame(1, fps);
    expect(transport.time()).toBe(1);
  });

  it("pauses playback", () => {
    const { clock, transport } = setup();
    transport.play();
    clock.now = 1;
    transport.stepFrame(1, fps);
    expect(transport.isPlaying()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/engine/transport.test.ts`
Expected: FAIL; `@/lib/engine/transport` cannot be resolved.

- [ ] **Step 3: Implement the transport**

`src/lib/engine/transport.ts`:

```ts
export interface TransportOptions {
  /** Any monotonic clock in seconds (the glue can pass the Web Audio clock). */
  now: () => number;
  /** The project length; read every call so edits during playback are seen. */
  duration: () => number;
}

export interface Transport {
  time(): number;
  isPlaying(): boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(t: number): void;
  /** Pauses, then moves to the next (1) or previous (-1) frame boundary. */
  stepFrame(direction: 1 | -1, fps: number): void;
  /** Advances; stops playback at the end and reports `ended` exactly once. */
  tick(): { time: number; ended: boolean };
}

export function createTransport({ now, duration }: TransportOptions): Transport {
  let playing = false;
  let baseTime = 0; // timeline seconds at the moment of `anchor`
  let anchor = 0; // clock reading when baseTime was set

  function clampTime(t: number): number {
    return Math.min(Math.max(t, 0), Math.max(duration(), 0));
  }

  function time(): number {
    return playing ? clampTime(baseTime + (now() - anchor)) : clampTime(baseTime);
  }

  function pause() {
    baseTime = time();
    playing = false;
  }

  function play() {
    const length = duration();
    if (length <= 0) return;
    const current = time();
    baseTime = current >= length ? 0 : current;
    anchor = now();
    playing = true;
  }

  return {
    time,
    isPlaying: () => playing,
    play,
    pause,
    toggle() {
      if (playing) pause();
      else play();
    },
    seek(t) {
      baseTime = clampTime(t);
      anchor = now();
    },
    stepFrame(direction, fps) {
      pause();
      const frames = time() * fps;
      const next =
        direction > 0 ? Math.floor(frames + 1e-9) + 1 : Math.ceil(frames - 1e-9) - 1;
      baseTime = clampTime(next / fps);
    },
    tick() {
      const current = time();
      if (playing && current >= duration()) {
        baseTime = current;
        playing = false;
        return { time: current, ended: true };
      }
      return { time: current, ended: false };
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/engine/transport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/transport.ts src/lib/engine/transport.test.ts
git commit -m "feat: add transport clock" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: What media each clip needs

**Files:**
- Create: `src/lib/engine/wanted.ts`
- Test: `src/lib/engine/wanted.test.ts`

**Interfaces:**
- Consumes: `activeClipsAt`, `clipGainAt`, `isAudible` (Task 1); `clipEnd`; types.
- Produces:
  - `LOOKAHEAD_SECONDS = 1.0`; `type MediaElementKind = "video" | "audio"`
  - `interface WantedMedia { clipId: string; mediaId: string; kind: MediaElementKind; active: boolean; targetTime: number; playbackRate: number; reversed: boolean; shouldPlay: boolean; gain: number }`. `targetTime` is a position in the source file in seconds. `active: false` means "prepare early".
  - `isContinuation(prev: Clip, next: Clip): boolean`: true when `next` picks up exactly where `prev` ends, in the same file, at the same speed and direction (tolerance `1e-6`).
  - `planWanted(project, t, playing): WantedMedia[]`. Active clips come first. Upcoming clips (starting within `LOOKAHEAD_SECONDS` after `t`, only while `playing`) are included unless they continue an active or already-wanted clip, because that clip's element will carry on by itself.

- [ ] **Step 1: Write the failing test**

`src/lib/engine/wanted.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isContinuation, planWanted } from "@/lib/engine/wanted";
import { splitClip } from "@/lib/timeline/split";
import {
  makeClip,
  makeProject,
  makeStandardTracks,
  makeTrack,
  seqIds,
} from "@/lib/timeline/test-utils";
import type { Clip } from "@/types/timeline";

const clip = (id: string, overrides: Partial<Clip> = {}) =>
  makeClip({ id, mediaId: "m", sourceDuration: 100, ...overrides });

describe("planWanted: active clips", () => {
  it("wants nothing for an empty project", () => {
    expect(planWanted(makeProject(makeStandardTracks(), []), 1, true)).toEqual([]);
  });

  it("wants a playing video clip at its source position, rate and gain", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("c1", { start: 2, sourceIn: 1, sourceOut: 7, speed: 2 }),
    ]);
    expect(planWanted(project, 3, true)).toEqual([
      {
        clipId: "c1",
        mediaId: "m",
        kind: "video",
        active: true,
        targetTime: 3,
        playbackRate: 2,
        reversed: false,
        shouldPlay: true,
        gain: 1,
      },
    ]);
  });

  it("does not ask a paused clip to play", () => {
    const project = makeProject(makeStandardTracks(), [clip("c1")]);
    const [wanted] = planWanted(project, 3, false);
    expect(wanted.shouldPlay).toBe(false);
    expect(wanted.active).toBe(true);
    expect(wanted.targetTime).toBe(3);
  });

  it("makes a reversed clip silent and non-playing, targeting the reversed position", () => {
    const project = makeProject(makeStandardTracks(), [clip("c1", { reversed: true })]);
    const [wanted] = planWanted(project, 4, true);
    expect(wanted).toMatchObject({ targetTime: 6, reversed: true, shouldPlay: false, gain: 0 });
  });

  it("includes an audio clip with its volume as gain", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("s", { kind: "audio", trackId: "t3", mediaId: "snd", volume: 50 }),
    ]);
    const [wanted] = planWanted(project, 5, true);
    expect(wanted).toMatchObject({ kind: "audio", mediaId: "snd", gain: 0.5 });
  });

  it("ignores image, text and sticker clips", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("i", { kind: "image", trackId: "t2", sourceDuration: null }),
      clip("t", { kind: "text", trackId: "t2", sourceDuration: null }),
      clip("k", { kind: "sticker", trackId: "t2", sourceDuration: null }),
    ]);
    expect(planWanted(project, 1, true)).toEqual([]);
  });

  it("still wants a hidden video that is audible, but not a hidden muted one", () => {
    const hidden = [makeTrack({ id: "t1", type: "video", hidden: true })];
    expect(planWanted(makeProject(hidden, [clip("v")]), 1, true)).toHaveLength(1);
    expect(planWanted(makeProject(hidden, [clip("v", { muted: true })]), 1, true)).toEqual([]);
  });

  it("does not want a muted audio clip", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("s", { kind: "audio", trackId: "t3", muted: true }),
    ]);
    expect(planWanted(project, 1, true)).toEqual([]);
  });

  it("gives a visible but muted video a zero gain", () => {
    const project = makeProject(makeStandardTracks(), [clip("v", { muted: true })]);
    expect(planWanted(project, 1, true)[0]).toMatchObject({ active: true, gain: 0 });
  });
});

describe("planWanted: preloading", () => {
  // Main track: a [0,4] of file m1, then b [4,10] of file m2.
  const project = () =>
    makeProject(makeStandardTracks(), [
      clip("a", { mediaId: "m1", start: 0, sourceIn: 0, sourceOut: 4 }),
      clip("b", { mediaId: "m2", start: 4, sourceIn: 0, sourceOut: 6 }),
    ]);

  it("prepares a clip starting within the lookahead, positioned at its start", () => {
    const wanted = planWanted(project(), 3.5, true);
    expect(wanted.map((w) => [w.clipId, w.active])).toEqual([
      ["a", true],
      ["b", false],
    ]);
    expect(wanted[1]).toEqual({
      clipId: "b",
      mediaId: "m2",
      kind: "video",
      active: false,
      targetTime: 0,
      playbackRate: 1,
      reversed: false,
      shouldPlay: false,
      gain: 0,
    });
  });

  it("does not prepare clips beyond the lookahead", () => {
    expect(planWanted(project(), 2, true).map((w) => w.clipId)).toEqual(["a"]);
  });

  it("does not prepare anything while paused", () => {
    expect(planWanted(project(), 3.5, false).map((w) => w.clipId)).toEqual(["a"]);
  });

  it("positions a reversed upcoming clip at the end of its source range", () => {
    const reversed = makeProject(makeStandardTracks(), [
      clip("a", { mediaId: "m1", start: 0, sourceIn: 0, sourceOut: 4 }),
      clip("b", { mediaId: "m2", start: 4, sourceIn: 0, sourceOut: 6, reversed: true }),
    ]);
    expect(planWanted(reversed, 3.5, true)[1].targetTime).toBe(6);
  });

  it("does not prepare an upcoming clip that no one can hear or see", () => {
    const hidden = makeProject(
      [makeTrack({ id: "t1", type: "video", hidden: true })],
      [
        clip("a", { mediaId: "m1", start: 0, sourceIn: 0, sourceOut: 4 }),
        clip("b", { mediaId: "m2", start: 4, sourceIn: 0, sourceOut: 6, muted: true }),
      ],
    );
    expect(planWanted(hidden, 3.5, true).map((w) => w.clipId)).toEqual(["a"]);
  });
});

describe("planWanted: continuations share one element", () => {
  it("does not prepare the second half of a split", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 4 }),
      clip("b", { start: 4, sourceIn: 4, sourceOut: 10 }),
    ]);
    expect(planWanted(project, 3.5, true).map((w) => w.clipId)).toEqual(["a"]);
  });

  it("prepares a same-file clip that jumps elsewhere in the source", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 4 }),
      clip("b", { start: 4, sourceIn: 20, sourceOut: 26 }),
    ]);
    expect(planWanted(project, 3.5, true).map((w) => w.clipId)).toEqual(["a", "b"]);
  });

  it("prepares a same-file clip at a different speed", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 4 }),
      clip("b", { start: 4, sourceIn: 4, sourceOut: 10, speed: 2 }),
    ]);
    expect(planWanted(project, 3.5, true).map((w) => w.clipId)).toEqual(["a", "b"]);
  });

  it("needs one element for a chain of contiguous clips inside the window", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 2 }),
      clip("b", { start: 2, sourceIn: 2, sourceOut: 2.5 }),
      clip("c", { start: 2.5, sourceIn: 2.5, sourceOut: 3 }),
    ]);
    expect(planWanted(project, 1.8, true).map((w) => w.clipId)).toEqual(["a"]);
  });

  it("prepares a clip that continues a different file's chain", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 2 }),
      clip("b", { start: 2, sourceIn: 2, sourceOut: 2.5 }),
      clip("c", { mediaId: "other", start: 2.5, sourceIn: 2.5, sourceOut: 3 }),
    ]);
    expect(planWanted(project, 1.8, true).map((w) => w.clipId)).toEqual(["a", "c"]);
  });

  it("recognises the halves of real splits, with fractional times, as one chain", () => {
    const base = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0.1, sourceOut: 3.1 }),
    ]);
    let project = splitClip(base, "a", 0.3, seqIds("s"));
    project = splitClip(project, "s-1", 1.0, seqIds("t"));
    expect(project.clips).toHaveLength(3);
    expect(planWanted(project, 0.25, true).map((w) => w.clipId)).toEqual(["a"]);
  });
});

describe("isContinuation", () => {
  const a = clip("a", { start: 0, sourceIn: 0, sourceOut: 4 });

  it("is true when the next clip picks up at the same place in the same file", () => {
    expect(isContinuation(a, clip("b", { start: 4, sourceIn: 4, sourceOut: 8 }))).toBe(true);
  });

  it("is true for reversed clips that continue backwards", () => {
    const prev = clip("p", { start: 0, sourceIn: 6, sourceOut: 10, reversed: true });
    const next = clip("n", { start: 4, sourceIn: 0, sourceOut: 6, reversed: true });
    expect(isContinuation(prev, next)).toBe(true);
  });

  it("is false for a different file, a time gap, a source jump, or a different speed or direction", () => {
    expect(isContinuation(a, clip("b", { mediaId: "x", start: 4, sourceIn: 4, sourceOut: 8 }))).toBe(false);
    expect(isContinuation(a, clip("b", { start: 5, sourceIn: 4, sourceOut: 8 }))).toBe(false);
    expect(isContinuation(a, clip("b", { start: 4, sourceIn: 9, sourceOut: 12 }))).toBe(false);
    expect(isContinuation(a, clip("b", { start: 4, sourceIn: 4, sourceOut: 8, speed: 2 }))).toBe(false);
    expect(isContinuation(a, clip("b", { start: 4, sourceIn: 4, sourceOut: 8, reversed: true }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/engine/wanted.test.ts`
Expected: FAIL; `@/lib/engine/wanted` cannot be resolved.

- [ ] **Step 3: Implement the planner**

`src/lib/engine/wanted.ts`:

```ts
import { activeClipsAt, clipGainAt, isAudible } from "@/lib/timeline/active-clips";
import { clipEnd } from "@/lib/timeline/clip-math";
import type { Clip, TimelineProject } from "@/types/timeline";

export const LOOKAHEAD_SECONDS = 1.0;
const CONTINUATION_TOLERANCE = 1e-6;

export type MediaElementKind = "video" | "audio";

export interface WantedMedia {
  clipId: string;
  mediaId: string;
  kind: MediaElementKind;
  /** false = prepare early (assigned and positioned, not yet playing). */
  active: boolean;
  /** Position to be at in the source file, in seconds. */
  targetTime: number;
  playbackRate: number;
  reversed: boolean;
  shouldPlay: boolean;
  gain: number;
}

/** Only video and audio clips use media elements; a video needs one to be seen or heard. */
function needsElement(clip: Clip, visible: boolean, audible: boolean): boolean {
  if (clip.kind === "video") return visible || audible;
  if (clip.kind === "audio") return audible;
  return false;
}

/**
 * True when `next` picks up exactly where `prev` ends: same file, speed and
 * direction, starting where `prev` stops on the timeline and in the source.
 * `prev`'s element can then simply keep going; no second element, seek or
 * reload is needed at the cut (the halves of a split are the typical case).
 */
export function isContinuation(prev: Clip, next: Clip): boolean {
  if (prev.mediaId !== next.mediaId || prev.kind !== next.kind) return false;
  if (prev.speed !== next.speed || prev.reversed !== next.reversed) return false;
  if (Math.abs(clipEnd(prev) - next.start) > CONTINUATION_TOLERANCE) return false;
  const sourceGap = prev.reversed
    ? prev.sourceIn - next.sourceOut
    : next.sourceIn - prev.sourceOut;
  return Math.abs(sourceGap) <= CONTINUATION_TOLERANCE;
}

/**
 * The media each clip needs at time `t`. Active clips come first, then (only
 * while playing) clips starting within LOOKAHEAD_SECONDS, unless they
 * continue a clip that is already wanted.
 */
export function planWanted(
  project: TimelineProject,
  t: number,
  playing: boolean,
): WantedMedia[] {
  const wanted: WantedMedia[] = [];
  const chain: Clip[] = [];

  for (const a of activeClipsAt(project, t)) {
    if (!needsElement(a.clip, a.visible, a.audible)) continue;
    chain.push(a.clip);
    wanted.push({
      clipId: a.clip.id,
      mediaId: a.clip.mediaId,
      kind: a.clip.kind as MediaElementKind,
      active: true,
      targetTime: a.sourceTime,
      playbackRate: a.clip.speed,
      reversed: a.clip.reversed,
      shouldPlay: playing && !a.clip.reversed,
      // Browsers cannot play video backwards, so reversed clips are silent live.
      gain: a.audible && !a.clip.reversed ? clipGainAt(a.clip, a.localTime) : 0,
    });
  }

  if (!playing) return wanted;

  const trackById = new Map(project.tracks.map((track) => [track.id, track]));
  const anySolo = project.tracks.some((track) => track.solo);
  const upcoming = project.clips
    .filter((clip) => clip.start > t && clip.start <= t + LOOKAHEAD_SECONDS)
    .sort((a, b) => a.start - b.start);

  for (const clip of upcoming) {
    const track = trackById.get(clip.trackId);
    if (!track) continue;
    if (!needsElement(clip, !track.hidden, isAudible(clip, track, anySolo))) continue;

    const continues = chain.some((earlier) => isContinuation(earlier, clip));
    chain.push(clip);
    if (continues) continue;

    wanted.push({
      clipId: clip.id,
      mediaId: clip.mediaId,
      kind: clip.kind as MediaElementKind,
      active: false,
      targetTime: clip.reversed ? clip.sourceOut : clip.sourceIn,
      playbackRate: clip.speed,
      reversed: clip.reversed,
      shouldPlay: false,
      gain: 0,
    });
  }

  return wanted;
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `npx vitest run src/lib/engine/wanted.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/wanted.ts src/lib/engine/wanted.test.ts
git commit -m "feat: add planner for the media each clip needs" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Slot assignment

**Files:**
- Create: `src/lib/engine/slots.ts`
- Test: `src/lib/engine/slots.test.ts`

**Interfaces:**
- Consumes: `WantedMedia`, `MediaElementKind` (Task 3).
- Produces:
  - `MAX_VIDEO_SLOTS = 6`
  - `interface SlotState { id: string; kind: MediaElementKind; mediaId: string | null; clipId: string | null; currentTime: number }` (an existing media element: what it holds, which clip uses it, where it is)
  - `interface Assignment { wanted: WantedMedia; slotId: string | null }` (`null` = create a new element)
  - `interface SlotAssignment { assignments: Assignment[]; releasedSlotIds: string[]; droppedClipIds: string[] }`
  - `assignSlots(wanted, slots, maxVideoSlots?): SlotAssignment`. Rules, in order, for each wanted clip (active ones first): keep the slot it already owns; else reuse a free slot of the same kind holding the same file (nearest `currentTime` to the target), else any free slot of that kind (an empty one first); else create a new one if under the cap (video only; audio is uncapped); else, for an *active* clip only, take the slot of the lowest-priority preload; else drop it. A slot is "free" when it is not already taken and its clip is not still wanted. Slots left unassigned are released.

- [ ] **Step 1: Write the failing test**

`src/lib/engine/slots.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { assignSlots, MAX_VIDEO_SLOTS, type SlotState } from "@/lib/engine/slots";
import type { WantedMedia } from "@/lib/engine/wanted";

const w = (clipId: string, overrides: Partial<WantedMedia> = {}): WantedMedia => ({
  clipId,
  mediaId: "m",
  kind: "video",
  active: true,
  targetTime: 0,
  playbackRate: 1,
  reversed: false,
  shouldPlay: true,
  gain: 1,
  ...overrides,
});

const slot = (id: string, overrides: Partial<SlotState> = {}): SlotState => ({
  id,
  kind: "video",
  mediaId: "m",
  clipId: null,
  currentTime: 0,
  ...overrides,
});

const slotOf = (result: ReturnType<typeof assignSlots>, clipId: string) =>
  result.assignments.find((a) => a.wanted.clipId === clipId)?.slotId;

describe("assignSlots: reuse", () => {
  it("keeps a clip on the slot it already owns", () => {
    const result = assignSlots([w("c1")], [slot("s1", { clipId: "c1", currentTime: 5 })]);
    expect(slotOf(result, "c1")).toBe("s1");
    expect(result.releasedSlotIds).toEqual([]);
  });

  it("reuses the free slot of the same file that is nearest the target", () => {
    const slots = [slot("s1", { currentTime: 1 }), slot("s2", { currentTime: 9 })];
    const result = assignSlots([w("c1", { targetTime: 8.5 })], slots);
    expect(slotOf(result, "c1")).toBe("s2");
    expect(result.releasedSlotIds).toEqual(["s1"]);
  });

  it("prefers a free slot of the same file over one holding another file", () => {
    const slots = [slot("s1", { mediaId: "other" }), slot("s2", { currentTime: 50 })];
    expect(slotOf(assignSlots([w("c1")], slots), "c1")).toBe("s2");
  });

  it("uses a free slot holding another file before creating a new one", () => {
    const result = assignSlots([w("c1")], [slot("s1", { mediaId: "other" })]);
    expect(slotOf(result, "c1")).toBe("s1");
  });

  it("prefers an empty slot over one holding another file", () => {
    const slots = [slot("s1", { mediaId: "other" }), slot("s2", { mediaId: null })];
    expect(slotOf(assignSlots([w("c1")], slots), "c1")).toBe("s2");
  });

  it("hands the slot of a clip that is no longer wanted to the clip that continues it", () => {
    const result = assignSlots(
      [w("b", { targetTime: 4 })],
      [slot("s1", { clipId: "a", currentTime: 4.02 })],
    );
    expect(slotOf(result, "b")).toBe("s1");
    expect(result.releasedSlotIds).toEqual([]);
  });
});

describe("assignSlots: creating and releasing", () => {
  it("asks for a new slot when none is free", () => {
    expect(slotOf(assignSlots([w("c1")], []), "c1")).toBeNull();
  });

  it("gives two simultaneous clips of one file two slots", () => {
    const result = assignSlots([w("a"), w("b")], [slot("s1", { clipId: "a" })]);
    expect(slotOf(result, "a")).toBe("s1");
    expect(slotOf(result, "b")).toBeNull();
  });

  it("does not let a preload take a slot owned by another wanted preload", () => {
    const result = assignSlots(
      [w("p1", { active: false }), w("p2", { active: false })],
      [slot("s1", { clipId: "p1" })],
    );
    expect(slotOf(result, "p1")).toBe("s1");
    expect(slotOf(result, "p2")).toBeNull();
  });

  it("releases slots nothing wants", () => {
    const result = assignSlots([], [slot("s1", { clipId: "gone" }), slot("s2")]);
    expect(result.releasedSlotIds).toEqual(["s1", "s2"]);
  });

  it("never mixes audio and video slots", () => {
    const result = assignSlots([w("v")], [slot("a1", { kind: "audio" })]);
    expect(slotOf(result, "v")).toBeNull();
    expect(result.releasedSlotIds).toEqual(["a1"]);
  });
});

describe("assignSlots: the video cap", () => {
  const owned = (ids: string[]) =>
    ids.map((id, i) => slot(`s${i + 1}`, { mediaId: id, clipId: id }));

  it("exports the cap from the spec", () => {
    expect(MAX_VIDEO_SLOTS).toBe(6);
  });

  it("never requests more than the cap of video slots", () => {
    const wanted = Array.from({ length: 10 }, (_, i) => w(`c${i}`, { mediaId: `m${i}` }));
    const result = assignSlots(wanted, []);
    const created = result.assignments.filter((a) => a.slotId === null);
    expect(created).toHaveLength(6);
    expect(result.droppedClipIds).toEqual(["c6", "c7", "c8", "c9"]);
  });

  it("does not cap audio slots", () => {
    const wanted = Array.from({ length: 10 }, (_, i) =>
      w(`c${i}`, { kind: "audio", mediaId: `m${i}` }),
    );
    const result = assignSlots(wanted, []);
    expect(result.assignments).toHaveLength(10);
    expect(result.droppedClipIds).toEqual([]);
  });

  it("never drops an active clip in favour of a preload", () => {
    const slots = owned(["p1", "p2", "p3", "p4", "p5", "p6"]);
    const wanted = [
      w("X", { mediaId: "x" }),
      ...["p1", "p2", "p3", "p4", "p5", "p6"].map((id) => w(id, { mediaId: id, active: false })),
    ];
    const result = assignSlots(wanted, slots);
    expect(slotOf(result, "X")).toBe("s6"); // took the lowest-priority preload's slot
    expect(result.droppedClipIds).toEqual(["p6"]);
    expect(result.releasedSlotIds).toEqual([]);
  });

  it("drops a preload when every slot belongs to an active clip", () => {
    const ids = ["a1", "a2", "a3", "a4", "a5", "a6"];
    const wanted = [...ids.map((id) => w(id, { mediaId: id })), w("p", { mediaId: "p", active: false })];
    const result = assignSlots(wanted, owned(ids));
    expect(result.droppedClipIds).toEqual(["p"]);
    for (const id of ids) expect(slotOf(result, id)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/engine/slots.test.ts`
Expected: FAIL; `@/lib/engine/slots` cannot be resolved.

- [ ] **Step 3: Implement the assignment**

`src/lib/engine/slots.ts`:

```ts
import type { MediaElementKind, WantedMedia } from "@/lib/engine/wanted";

export const MAX_VIDEO_SLOTS = 6;

/** An existing media element: what it holds, which clip uses it, and where it is. */
export interface SlotState {
  id: string;
  kind: MediaElementKind;
  mediaId: string | null;
  clipId: string | null;
  currentTime: number;
}

export interface Assignment {
  wanted: WantedMedia;
  /** null = create a new element. */
  slotId: string | null;
}

export interface SlotAssignment {
  assignments: Assignment[];
  releasedSlotIds: string[];
  droppedClipIds: string[];
}

/**
 * Maps wanted clips onto reusable media elements. Active clips are placed
 * first, so at the cap they win over preloads. A clip that continues a
 * finished clip inherits that clip's element and needs no seek.
 */
export function assignSlots(
  wanted: WantedMedia[],
  slots: SlotState[],
  maxVideoSlots: number = MAX_VIDEO_SLOTS,
): SlotAssignment {
  const wantedIds = new Set(wanted.map((item) => item.clipId));
  const ordered = [...wanted.filter((item) => item.active), ...wanted.filter((item) => !item.active)];
  const taken = new Set<string>();
  const slotFor = new Map<string, string | null>();
  const dropped: string[] = [];
  const created: Record<MediaElementKind, number> = { video: 0, audio: 0 };

  const ownSlot = (item: WantedMedia) =>
    slots.find((s) => s.clipId === item.clipId && s.kind === item.kind && !taken.has(s.id));
  const isFree = (s: SlotState) =>
    !taken.has(s.id) && (s.clipId === null || !wantedIds.has(s.clipId));
  const canCreate = (kind: MediaElementKind) =>
    kind === "audio" ||
    slots.filter((s) => s.kind === "video").length + created.video < maxVideoSlots;

  // Active clips that already own a slot keep it before anyone else looks.
  for (const item of ordered) {
    if (!item.active) continue;
    const own = ownSlot(item);
    if (own) {
      taken.add(own.id);
      slotFor.set(item.clipId, own.id);
    }
  }

  for (const item of ordered) {
    if (slotFor.has(item.clipId)) continue;

    let slot = ownSlot(item);
    if (!slot) {
      const free = slots.filter((s) => s.kind === item.kind && isFree(s));
      const sameFile = free
        .filter((s) => s.mediaId === item.mediaId)
        .sort(
          (a, b) =>
            Math.abs(a.currentTime - item.targetTime) - Math.abs(b.currentTime - item.targetTime),
        );
      slot = sameFile[0] ?? free.find((s) => s.mediaId === null) ?? free[0];
    }

    if (!slot && canCreate(item.kind)) {
      created[item.kind] += 1;
      slotFor.set(item.clipId, null);
      continue;
    }

    if (!slot && item.active) {
      // At the cap: an active clip takes the slot of the lowest-priority preload.
      for (let i = ordered.length - 1; i >= 0 && !slot; i--) {
        const candidate = ordered[i];
        if (candidate.active || candidate.kind !== item.kind) continue;
        slot = ownSlot(candidate);
      }
    }

    if (slot) {
      taken.add(slot.id);
      slotFor.set(item.clipId, slot.id);
    } else {
      dropped.push(item.clipId);
    }
  }

  return {
    assignments: ordered
      .filter((item) => slotFor.has(item.clipId))
      .map((item) => ({ wanted: item, slotId: slotFor.get(item.clipId) ?? null })),
    releasedSlotIds: slots.filter((s) => !taken.has(s.id)).map((s) => s.id),
    droppedClipIds: dropped,
  };
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `npx vitest run src/lib/engine/slots.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors. If a cap test fails, trace the rule order in the docstring before changing a test; the order (own, same file, any free, create, steal, drop) is the specification.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/slots.ts src/lib/engine/slots.test.ts
git commit -m "feat: add media slot assignment with reuse and a video cap" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Media sync plan

**Files:**
- Create: `src/lib/engine/media-sync.ts`
- Test: `src/lib/engine/media-sync.test.ts`

**Interfaces:**
- Consumes: `planWanted` (Task 3); `assignSlots`, `SlotState` (Task 4).
- Produces:
  - `PLAYING_SEEK_THRESHOLD = 0.25`, `PAUSED_SEEK_THRESHOLD = 0.02`, `REVERSE_STEP_SECONDS = 0.04`
  - `needsSeek(currentTime: number, wanted: Pick<WantedMedia, "active" | "reversed" | "shouldPlay">, target: number): boolean`
  - `interface SlotCommand { slotId: string | null; clipId: string; mediaId: string; kind: MediaElementKind; active: boolean; load: boolean; seekTo: number | null; play: boolean; playbackRate: number; gain: number }`
  - `interface MediaSyncPlan { commands: SlotCommand[]; releasedSlotIds: string[]; droppedClipIds: string[] }`
  - `planMediaSync(project, t, playing, slots): MediaSyncPlan`. `load` is true for a new slot or one holding a different file; `seekTo` is the target time, or `null` when the element is already close enough.

- [ ] **Step 1: Write the failing test**

`src/lib/engine/media-sync.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { needsSeek, planMediaSync } from "@/lib/engine/media-sync";
import type { SlotState } from "@/lib/engine/slots";
import { splitClip } from "@/lib/timeline/split";
import { makeClip, makeProject, makeStandardTracks, seqIds } from "@/lib/timeline/test-utils";
import type { Clip } from "@/types/timeline";

const clip = (id: string, overrides: Partial<Clip> = {}) =>
  makeClip({ id, mediaId: "m", sourceDuration: 100, ...overrides });

const slot = (id: string, overrides: Partial<SlotState> = {}): SlotState => ({
  id,
  kind: "video",
  mediaId: "m",
  clipId: null,
  currentTime: 0,
  ...overrides,
});

describe("needsSeek", () => {
  const playing = { active: true, reversed: false, shouldPlay: true };
  const paused = { active: true, reversed: false, shouldPlay: false };
  const reversed = { active: true, reversed: true, shouldPlay: false };
  const preload = { active: false, reversed: false, shouldPlay: false };

  it("tolerates drift up to 0.25 s while playing", () => {
    expect(needsSeek(5.2, playing, 5)).toBe(false);
    expect(needsSeek(5.3, playing, 5)).toBe(true);
  });

  it("is strict (0.02 s) while paused or scrubbing", () => {
    expect(needsSeek(5.01, paused, 5)).toBe(false);
    expect(needsSeek(5.03, paused, 5)).toBe(true);
  });

  it("steps reversed clips every 0.04 s", () => {
    expect(needsSeek(6.03, reversed, 6)).toBe(false);
    expect(needsSeek(6.05, reversed, 6)).toBe(true);
  });

  it("positions a preload precisely", () => {
    expect(needsSeek(0.01, preload, 0)).toBe(false);
    expect(needsSeek(0.5, preload, 0)).toBe(true);
  });
});

describe("planMediaSync: a split is seamless", () => {
  // Main track: a [0,4] then b [4,10], two halves of one cut of file m.
  const project = () =>
    makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 4 }),
      clip("b", { start: 4, sourceIn: 4, sourceOut: 10 }),
    ]);

  it("before the cut, only the first half's element is used and it is left alone", () => {
    const plan = planMediaSync(project(), 3.5, true, [
      slot("s1", { clipId: "a", currentTime: 3.6 }),
    ]);
    expect(plan.commands).toHaveLength(1);
    expect(plan.commands[0]).toMatchObject({
      slotId: "s1",
      clipId: "a",
      load: false,
      seekTo: null,
      play: true,
    });
  });

  it("at the cut, the second half inherits the element with no load and no seek", () => {
    const plan = planMediaSync(project(), 4, true, [
      slot("s1", { clipId: "a", currentTime: 4.02 }),
    ]);
    expect(plan.commands).toHaveLength(1);
    expect(plan.commands[0]).toMatchObject({
      slotId: "s1",
      clipId: "b",
      load: false,
      seekTo: null,
      play: true,
    });
    expect(plan.releasedSlotIds).toEqual([]);
  });

  it("uses one element for three real split pieces across both cuts", () => {
    const base = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0.1, sourceOut: 3.1 }),
    ]);
    let split = splitClip(base, "a", 0.3, seqIds("s"));
    split = splitClip(split, "s-1", 1.0, seqIds("t"));

    for (const t of [0.25, 0.3, 0.9, 1.0, 1.1]) {
      const plan = planMediaSync(split, t, true, [slot("s1", { clipId: "a", currentTime: t + 0.1 })]);
      expect(plan.commands).toHaveLength(1);
      expect(plan.commands[0].load).toBe(false);
    }
  });
});

describe("planMediaSync: seeking and loading", () => {
  const single = () =>
    makeProject(makeStandardTracks(), [clip("a", { start: 0, sourceIn: 0, sourceOut: 10 })]);

  it("seeks a paused element that is off target", () => {
    const [command] = planMediaSync(single(), 2, false, [
      slot("s1", { clipId: "a", currentTime: 1 }),
    ]).commands;
    expect(command).toMatchObject({ seekTo: 2, play: false, load: false });
  });

  it("leaves a paused element that is on target", () => {
    const [command] = planMediaSync(single(), 2, false, [
      slot("s1", { clipId: "a", currentTime: 2.01 }),
    ]).commands;
    expect(command.seekTo).toBeNull();
  });

  it("reloads a slot that holds a different file and seeks it", () => {
    const [command] = planMediaSync(single(), 2, true, [slot("s1", { mediaId: "other" })]).commands;
    expect(command).toMatchObject({ slotId: "s1", load: true, seekTo: 2 });
  });

  it("asks for a new element with a load and a seek when there is none", () => {
    const [command] = planMediaSync(single(), 2, true, []).commands;
    expect(command).toMatchObject({ slotId: null, load: true, seekTo: 2, play: true });
  });

  it("steps a reversed clip silently", () => {
    const reversed = makeProject(makeStandardTracks(), [clip("a", { reversed: true })]);
    const near = planMediaSync(reversed, 4, true, [slot("s1", { clipId: "a", currentTime: 6.03 })]);
    expect(near.commands[0]).toMatchObject({ seekTo: null, play: false, gain: 0 });
    const far = planMediaSync(reversed, 4, true, [slot("s1", { clipId: "a", currentTime: 6.1 })]);
    expect(far.commands[0].seekTo).toBe(6);
  });

  it("carries the clip's gain and playback rate", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 10, speed: 2, volume: 50 }),
    ]);
    const [command] = planMediaSync(project, 1, true, []).commands;
    expect(command).toMatchObject({ playbackRate: 2, gain: 0.5 });
  });
});

describe("planMediaSync: preloading and releasing", () => {
  it("prepares the next clip's file early, positioned and not playing", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { mediaId: "m1", start: 0, sourceIn: 0, sourceOut: 4 }),
      clip("b", { mediaId: "m2", start: 4, sourceIn: 0, sourceOut: 6 }),
    ]);
    const plan = planMediaSync(project, 3.5, true, [
      slot("s1", { mediaId: "m1", clipId: "a", currentTime: 3.5 }),
    ]);
    const preload = plan.commands.find((c) => c.clipId === "b");
    expect(preload).toMatchObject({
      slotId: null,
      active: false,
      load: true,
      seekTo: 0,
      play: false,
      gain: 0,
    });
  });

  it("releases elements nothing needs any more", () => {
    const project = makeProject(makeStandardTracks(), []);
    const plan = planMediaSync(project, 1, true, [slot("s1", { clipId: "old" })]);
    expect(plan.commands).toEqual([]);
    expect(plan.releasedSlotIds).toEqual(["s1"]);
  });

  it("reports clips it could not place", () => {
    const clips = Array.from({ length: 8 }, (_, i) =>
      clip(`c${i}`, { trackId: "t2", mediaId: `m${i}`, start: 0, sourceIn: 0, sourceOut: 10 }),
    );
    const plan = planMediaSync(makeProject(makeStandardTracks(), clips), 1, true, []);
    expect(plan.commands).toHaveLength(6);
    expect(plan.droppedClipIds).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/engine/media-sync.test.ts`
Expected: FAIL; `@/lib/engine/media-sync` cannot be resolved.

- [ ] **Step 3: Implement the plan**

`src/lib/engine/media-sync.ts`:

```ts
import { assignSlots, type SlotState } from "@/lib/engine/slots";
import { planWanted, type MediaElementKind, type WantedMedia } from "@/lib/engine/wanted";
import type { TimelineProject } from "@/types/timeline";

/** While playing, only seek when the element has drifted this far (seconds). */
export const PLAYING_SEEK_THRESHOLD = 0.25;
/** While paused or scrubbing, seek when off by more than this. */
export const PAUSED_SEEK_THRESHOLD = 0.02;
/** Reversed clips cannot play, so they step with a seek this often. */
export const REVERSE_STEP_SECONDS = 0.04;

export function needsSeek(
  currentTime: number,
  wanted: Pick<WantedMedia, "active" | "reversed" | "shouldPlay">,
  target: number,
): boolean {
  const drift = Math.abs(currentTime - target);
  if (wanted.active && wanted.reversed) return drift > REVERSE_STEP_SECONDS;
  if (wanted.active && wanted.shouldPlay) return drift > PLAYING_SEEK_THRESHOLD;
  return drift > PAUSED_SEEK_THRESHOLD;
}

/** What the glue must do to one media element. */
export interface SlotCommand {
  /** null = create a new element. */
  slotId: string | null;
  clipId: string;
  mediaId: string;
  kind: MediaElementKind;
  active: boolean;
  /** The element must be pointed at `mediaId` (new, or holding another file). */
  load: boolean;
  /** Seek to this source time, or null if already close enough. */
  seekTo: number | null;
  play: boolean;
  playbackRate: number;
  gain: number;
}

export interface MediaSyncPlan {
  commands: SlotCommand[];
  /** Elements nothing wants now; the glue may pause or recycle them. */
  releasedSlotIds: string[];
  /** Clips that could not get an element because of the video cap. */
  droppedClipIds: string[];
}

export function planMediaSync(
  project: TimelineProject,
  t: number,
  playing: boolean,
  slots: SlotState[],
): MediaSyncPlan {
  const wanted = planWanted(project, t, playing);
  const { assignments, releasedSlotIds, droppedClipIds } = assignSlots(wanted, slots);
  const slotById = new Map(slots.map((s) => [s.id, s]));

  const commands = assignments.map(({ wanted: item, slotId }): SlotCommand => {
    const slot = slotId === null ? undefined : slotById.get(slotId);
    const load = slot === undefined || slot.mediaId !== item.mediaId;
    const seek = load || (slot !== undefined && needsSeek(slot.currentTime, item, item.targetTime));
    return {
      slotId,
      clipId: item.clipId,
      mediaId: item.mediaId,
      kind: item.kind,
      active: item.active,
      load,
      seekTo: seek ? item.targetTime : null,
      play: item.shouldPlay,
      playbackRate: item.playbackRate,
      gain: item.gain,
    };
  });

  return { commands, releasedSlotIds, droppedClipIds };
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/lib/engine` then `npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/media-sync.ts src/lib/engine/media-sync.test.ts
git commit -m "feat: add media sync plan with seek thresholds and reuse across cuts" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Mixdown planner

**Files:**
- Create: `src/lib/engine/mixdown.ts`
- Test: `src/lib/engine/mixdown.test.ts`

**Interfaces:**
- Consumes: `clipGainAt`, `isAudible` (Task 1); `clipDuration`, `projectDuration`; types.
- Produces:
  - `interface GainPoint { time: number; value: number }` (absolute timeline seconds; linear between points)
  - `gainEnvelope(clip): GainPoint[]`: breakpoints at the clip's start, end and fade edges, each valued by `clipGainAt`. When the fades overlap (`fadeIn + fadeOut > duration`) the product of two ramps is curved, so it is sampled at 32 even points instead.
  - `interface MixdownItem { clipId: string; mediaId: string; startAt: number; sourceIn: number; sourceOut: number; playbackRate: number; reversed: boolean; gainPoints: GainPoint[] }` (`sourceIn`/`sourceOut` are source-file seconds; the glue plays that span at `playbackRate` starting at `startAt`, reversing the samples when `reversed`)
  - `interface MixdownPlan { duration: number; items: MixdownItem[] }`
  - `planMixdown(project): MixdownPlan`: every audible video and audio clip, sorted by `startAt` then `clipId`; `duration` is the project length.

- [ ] **Step 1: Write the failing test**

`src/lib/engine/mixdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { gainEnvelope, planMixdown, type GainPoint } from "@/lib/engine/mixdown";
import { clipGainAt } from "@/lib/timeline/active-clips";
import { makeClip, makeProject, makeStandardTracks, makeTrack } from "@/lib/timeline/test-utils";
import type { Clip } from "@/types/timeline";

const clip = (id: string, overrides: Partial<Clip> = {}) =>
  makeClip({ id, mediaId: `file-${id}`, sourceDuration: 100, ...overrides });

/** Linear interpolation of an envelope, the way an audio gain node ramps. */
function valueAt(points: GainPoint[], time: number): number {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (time >= a.time && time <= b.time) {
      const span = b.time - a.time;
      return span === 0 ? b.value : a.value + ((b.value - a.value) * (time - a.time)) / span;
    }
  }
  throw new Error(`time ${time} outside the envelope`);
}

describe("gainEnvelope", () => {
  it("is flat at the clip volume without fades", () => {
    const c = clip("a", { start: 2, sourceIn: 0, sourceOut: 10, volume: 50 });
    expect(gainEnvelope(c)).toEqual([
      { time: 2, value: 0.5 },
      { time: 12, value: 0.5 },
    ]);
  });

  it("ramps in and out at the fade edges", () => {
    const c = clip("a", { start: 0, sourceIn: 0, sourceOut: 10, fadeIn: 2, fadeOut: 2 });
    expect(gainEnvelope(c)).toEqual([
      { time: 0, value: 0 },
      { time: 2, value: 1 },
      { time: 8, value: 1 },
      { time: 10, value: 0 },
    ]);
  });

  it("uses timeline time, so speed shortens the envelope", () => {
    const c = clip("a", { start: 1, sourceIn: 0, sourceOut: 10, speed: 2 });
    const points = gainEnvelope(c);
    expect(points[0].time).toBe(1);
    expect(points[points.length - 1].time).toBe(6);
  });

  it("makes a triangle when the fades exactly meet", () => {
    const c = clip("a", { start: 0, sourceIn: 0, sourceOut: 10, fadeIn: 5, fadeOut: 5 });
    expect(gainEnvelope(c)).toEqual([
      { time: 0, value: 0 },
      { time: 5, value: 1 },
      { time: 10, value: 0 },
    ]);
  });

  it("follows the real gain when the fades overlap", () => {
    const c = clip("a", { start: 0, sourceIn: 0, sourceOut: 10, fadeIn: 10, fadeOut: 10 });
    const points = gainEnvelope(c);
    for (const t of [0, 1, 2.5, 5, 7.5, 9, 10]) {
      expect(valueAt(points, t)).toBeCloseTo(clipGainAt(c, t), 2);
    }
  });

  it("copes with a fade longer than the clip", () => {
    const c = clip("a", { start: 0, sourceIn: 0, sourceOut: 10, fadeIn: 12 });
    const points = gainEnvelope(c);
    expect(points[0]).toEqual({ time: 0, value: 0 });
    expect(points[points.length - 1].value).toBeCloseTo(10 / 12, 9);
    for (const p of points) expect(p.value).toBeGreaterThanOrEqual(0);
  });
});

describe("planMixdown", () => {
  it("is empty for an empty project", () => {
    expect(planMixdown(makeProject(makeStandardTracks(), []))).toEqual({ duration: 0, items: [] });
  });

  it("includes a video clip's own sound", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("v", { start: 0, sourceIn: 2, sourceOut: 12 }),
    ]);
    const plan = planMixdown(project);
    expect(plan.duration).toBe(10);
    expect(plan.items).toEqual([
      {
        clipId: "v",
        mediaId: "file-v",
        startAt: 0,
        sourceIn: 2,
        sourceOut: 12,
        playbackRate: 1,
        reversed: false,
        gainPoints: [
          { time: 0, value: 1 },
          { time: 10, value: 1 },
        ],
      },
    ]);
  });

  it("includes audio clips and keeps reversed and speed information", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("s", { kind: "audio", trackId: "t3", start: 2, sourceIn: 1, sourceOut: 5, speed: 2, reversed: true }),
    ]);
    expect(planMixdown(project).items[0]).toMatchObject({
      startAt: 2,
      sourceIn: 1,
      sourceOut: 5,
      playbackRate: 2,
      reversed: true,
    });
  });

  it("leaves out images, text and stickers", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("i", { kind: "image", trackId: "t2", sourceDuration: null }),
      clip("t", { kind: "text", trackId: "t2", sourceDuration: null }),
    ]);
    expect(planMixdown(project).items).toEqual([]);
  });

  it("leaves out muted clips and muted tracks", () => {
    const tracks = [makeTrack({ id: "t1", type: "video" }), makeTrack({ id: "t3", type: "audio", muted: true, order: 1 })];
    const project = makeProject(tracks, [
      clip("a", { muted: true }),
      clip("b", { kind: "audio", trackId: "t3" }),
      clip("c"),
    ]);
    expect(planMixdown(project).items.map((i) => i.clipId)).toEqual(["c"]);
  });

  it("when a track is soloed, only soloed tracks are mixed", () => {
    const tracks = [
      makeTrack({ id: "t1", type: "video" }),
      makeTrack({ id: "t3", type: "audio", solo: true, order: 1 }),
    ];
    const project = makeProject(tracks, [clip("v"), clip("s", { kind: "audio", trackId: "t3" })]);
    expect(planMixdown(project).items.map((i) => i.clipId)).toEqual(["s"]);
  });

  it("sorts by start time, then clip id", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("z", { kind: "audio", trackId: "t3", start: 5 }),
      clip("b", { kind: "audio", trackId: "t3", start: 1 }),
      clip("a", { kind: "audio", trackId: "t3", start: 1 }),
    ]);
    expect(planMixdown(project).items.map((i) => i.clipId)).toEqual(["a", "b", "z"]);
  });

  it("matches the live gain at a fade for the same clip", () => {
    const c = clip("v", { start: 0, sourceIn: 0, sourceOut: 10, fadeIn: 2, volume: 80 });
    const [item] = planMixdown(makeProject(makeStandardTracks(), [c])).items;
    expect(valueAt(item.gainPoints, 1)).toBeCloseTo(clipGainAt(c, 1), 9);
    expect(valueAt(item.gainPoints, 5)).toBeCloseTo(clipGainAt(c, 5), 9);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/engine/mixdown.test.ts`
Expected: FAIL; `@/lib/engine/mixdown` cannot be resolved.

- [ ] **Step 3: Implement the mixdown planner**

`src/lib/engine/mixdown.ts`:

```ts
import { clipGainAt, isAudible } from "@/lib/timeline/active-clips";
import { clipDuration, projectDuration } from "@/lib/timeline/clip-math";
import type { Clip, TimelineProject } from "@/types/timeline";

/** Absolute timeline seconds; linear between points. */
export interface GainPoint {
  time: number;
  value: number;
}

export interface MixdownItem {
  clipId: string;
  mediaId: string;
  /** Timeline second at which playback of this clip begins. */
  startAt: number;
  /** The span of the source file to play, in source seconds. */
  sourceIn: number;
  sourceOut: number;
  /** The glue plays the span at this rate, so it lasts (out - in) / rate. */
  playbackRate: number;
  /** The glue reverses the samples of the span. */
  reversed: boolean;
  gainPoints: GainPoint[];
}

export interface MixdownPlan {
  duration: number;
  items: MixdownItem[];
}

const OVERLAP_SAMPLES = 32;

/**
 * The clip's gain over time as breakpoints. With non-overlapping fades the
 * envelope is exactly piecewise-linear. Overlapping fades multiply into a
 * curve, so that case is sampled evenly across the clip.
 */
export function gainEnvelope(clip: Clip): GainPoint[] {
  const duration = clipDuration(clip);

  let locals: number[];
  if (clip.fadeIn + clip.fadeOut > duration) {
    locals = Array.from({ length: OVERLAP_SAMPLES }, (_, i) =>
      i === OVERLAP_SAMPLES - 1 ? duration : (duration * i) / (OVERLAP_SAMPLES - 1),
    );
  } else {
    const marks = new Set<number>([0, duration]);
    if (clip.fadeIn > 0) marks.add(clip.fadeIn);
    if (clip.fadeOut > 0) marks.add(duration - clip.fadeOut);
    locals = Array.from(marks).sort((a, b) => a - b);
  }

  return locals.map((local) => ({ time: clip.start + local, value: clipGainAt(clip, local) }));
}

/** Everything an offline renderer needs to mix the project's sound for export. */
export function planMixdown(project: TimelineProject): MixdownPlan {
  const trackById = new Map(project.tracks.map((track) => [track.id, track]));
  const anySolo = project.tracks.some((track) => track.solo);

  const items = project.clips
    .filter((clip) => {
      const track = trackById.get(clip.trackId);
      return track !== undefined && isAudible(clip, track, anySolo);
    })
    .map(
      (clip): MixdownItem => ({
        clipId: clip.id,
        mediaId: clip.mediaId,
        startAt: clip.start,
        sourceIn: clip.sourceIn,
        sourceOut: clip.sourceOut,
        playbackRate: clip.speed,
        reversed: clip.reversed,
        gainPoints: gainEnvelope(clip),
      }),
    )
    .sort((a, b) => a.startAt - b.startAt || a.clipId.localeCompare(b.clipId));

  return { duration: projectDuration(project), items };
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `npx vitest run src/lib/engine/mixdown.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/mixdown.ts src/lib/engine/mixdown.test.ts
git commit -m "feat: add mixdown planner including video audio, speed and fades" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Barrel and full verification

**Files:**
- Create: `src/lib/engine/index.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: a single import point, `@/lib/engine`, for plan 3b.

- [ ] **Step 1: Create the barrel**

`src/lib/engine/index.ts`:

```ts
export * from "@/lib/engine/media-sync";
export * from "@/lib/engine/mixdown";
export * from "@/lib/engine/slots";
export * from "@/lib/engine/transport";
export * from "@/lib/engine/wanted";
```

- [ ] **Step 2: Run the whole suite**

Run: `npm test`
Expected: every test file passes; no skipped tests.

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit` then `npx eslint src/lib/engine src/lib/timeline/active-clips.ts src/lib/timeline/active-clips.test.ts`
Expected: no errors. If `export *` reports a duplicate name, rename the colliding export in its own file and update its tests; do not use selective re-exports.

- [ ] **Step 4: Confirm nothing else changed**

Run: `git diff --stat main -- src ':!src/lib/engine'`
Expected: only `src/lib/timeline/active-clips.ts` and `src/lib/timeline/active-clips.test.ts` appear.

- [ ] **Step 5: Confirm the engine is pure**

Run: `grep -rnE "document\.|window\.|AudioContext|setTimeout|setInterval|performance\.|Date\.now|requestAnimationFrame" src/lib/engine --include=*.ts --exclude=*.test.ts`
Expected: no output (the engine uses no DOM, audio, timers or clocks).

- [ ] **Step 6: Commit**

```bash
git add src/lib/engine/index.ts
git commit -m "feat: add engine barrel export" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage** (section 5 and 5.1)

| Requirement | Task |
|---|---|
| Transport: play, pause, seek, stop at end, restart from 0, step a frame, injected clock | 2 |
| `activeClipsAt` consumed for source positions | 3 |
| Pool by file; continuation shares one element with no seek | 3, 4, 5 |
| Lookahead 1.0 s preparation unless continuation | 3 |
| At most 6 video elements; active beats upcoming | 4 |
| Seek thresholds 0.25 / 0.02 s; reversed steps every 0.04 s | 5 |
| Live audio planner: gain from volume, fades, mute, solo | 1, 3 (the `gain` on every wanted clip) |
| Reversed silent and stepped in the preview | 3, 5 |
| Mixdown includes video audio, volume, fades, mute, solo; reversed flagged | 1, 6 |
| Images, text and stickers get no element and no sound | 3, 6 |
| Real `<video>` pool, Web Audio graph, Konva compositor, test page, new transport store | Plan 3b |

Gap accepted: this plan produces no visible output. It is verified by unit tests only; the first real playback and audio check happens in plan 3b in a real browser.

**2. Placeholder scan:** no TBD/TODO; every step has code or an exact command.

**3. Type consistency:** `WantedMedia`, `MediaElementKind`, `SlotState`, `Assignment`, `SlotAssignment`, `SlotCommand`, `MediaSyncPlan`, `GainPoint`, `MixdownItem`, `MixdownPlan` and `Transport` are each defined once and used with the same names downstream. `needsSeek`'s argument order `(currentTime, wanted, target)` is the same in its tests and in `planMediaSync`.

**4. Review Focus:** all five failure modes have named tests: the real-`splitClip` chain and the three-in-the-window chain (Tasks 3 and 5); the cap tests (Task 4); the hidden/muted/image cases (Task 3); the transport edge tests (Task 2); the overlapping-fade, solo, mute and video-audio mixdown tests (Task 6).

## Execution Handoff

Nothing for you to do outside the plan: no SQL, no Supabase changes, no new dependencies.
