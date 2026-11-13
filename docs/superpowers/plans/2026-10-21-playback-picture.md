# Playback Picture and Test Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the playback engine on screen: a pure scene builder, a Konva painter, the browser wiring (frame loop, elements, audio context, object URLs, images), a session that owns it all, and a public `/dev/playback` test page that can be driven in a real Chrome to verify picture, timing and sound.

**Architecture:** `buildScene` (pure, unit-tested) turns the project and the pool's elements into a draw list. `createPlaybackSession` (dependency-injected, unit-tested with the existing fakes) owns the transport, pool, audio graph and engine and runs the play-click rules. A thin imperative Konva painter draws the scene. `browser.ts` holds the only direct browser calls. The test page wires them together with the clip store, generated sample clips and a debug panel, and is checked in Chrome through Claude in Chrome.

**Tech Stack:** TypeScript (strict), Vitest, Konva 10 (existing, imperative use), Next.js 16 app router (existing), FFmpeg WASM (existing `getFfmpeg`), zustand (existing). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-clip-timeline-design.md`, section 5.3 (also 5.1, 5.2). Builds on `src/lib/engine`, `src/lib/playback` (plan 3b, merged) and the review obligations saved in the project memory note `clip-editor-3c-obligations`.

## Global Constraints

- Work on branch `feature/playback-picture`; never commit to `main`.
- Read before writing Next code (already done for this plan): `notFound()` is called from a **server** `page.tsx`; `dynamic(..., { ssr: false })` is allowed **only in a Client Component**. The route follows the repo's existing pattern (server page, `*-client.tsx` wrapper, view loaded with `ssr: false`).
- `/dev/playback` is public and must be a 404 in production (`process.env.NODE_ENV === "production"` calls `notFound()`).
- Only `src/lib/playback/browser.ts` and files under `src/components/playback/` and `src/app/dev/` may touch the browser directly (`document`, `window`, `performance`, `requestAnimationFrame`, `new AudioContext`, `new Image`). Everything else in `src/lib/playback/` stays free of those (injected instead).
- Existing files this plan is allowed to change: `src/lib/playback/media-pool.ts`, `media-pool.test.ts`, `test-utils.ts`, `audio-graph.ts`, `audio-graph.test.ts`, `src/lib/playback/index.ts`, and `src/proxy.ts` (matcher only). Nothing else outside new files.
- Elements are created with `crossOrigin = "anonymous"` set **before** `src`, or remote media is silenced by the audio graph.
- The audio context is created suspended at page load and resumed from the first Play click; the first `play()` runs synchronously inside that click.
- No generated media or binary assets are committed. The CORS test server lives **outside the repo** (the session scratchpad) and is stopped afterwards.
- Chrome work: read the `anthropic-skills:chrome-browser` skill first; open a new tab for this work and leave the user's other tabs alone; avoid dialogs; if `list_connected_browsers` is empty, **stop and ask the user to enable the Claude in Chrome extension**; never fabricate a verification result.
- Run tests with `npx vitest run <file>`; type-check with `npx tsc --noEmit`. If `node` is not found in a spawned PowerShell, run `$env:Path += ";C:\Program Files\nodejs"` first. The shell's working directory persists between calls, so start each command with an absolute `cd` into the repo.
- End every commit message with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).

## Review Focus

Failure modes the spec implies but unit tests with fakes cannot show. Each is checked in the task named on the right.

- After a seek, scrub or frame step the picture shows the correct decoded frame (the burned-in timecode matches the playhead), never a stale frame or another clip's frame. (Task 1 unit; Task 9 in Chrome)
- Sound really flows with real media: the audio level is nonzero while playing and zero when muted or paused, and a remote clip served without CORS fails loudly instead of playing silently. (Task 9)
- Lifecycle: unmounting or React StrictMode's double mount leaves no running frame loop, no playing element, no live object URL and no open audio context. (Task 3 unit; Task 9)
- Errors are visible exactly once: load failures, missing media, blocked playback and sample-generation failures appear in the page, not just the console. (Task 2, Task 5 unit; Task 9)
- The painter keeps one node per visible clip and destroys nodes for clips that leave, with z-order equal to paint order. (Task 9)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/playback/scene.ts` | `buildScene`, `fitFrame`, `fitContain` (pure) |
| `src/lib/playback/media-pool.ts` | Modified: load-error reporting, ready wake-ups, quiet dispose |
| `src/lib/playback/audio-graph.ts` | Modified: expose `master` |
| `src/lib/playback/test-utils.ts` | Modified: event-capable `FakeElement`; shared `FakeAudioContext` |
| `src/lib/playback/session.ts` | `createPlaybackSession` |
| `src/lib/playback/object-url-registry.ts` | Object-URL ownership |
| `src/lib/playback/image-cache.ts` | Lazy image loading |
| `src/lib/playback/browser.ts` | Clock, scheduler, element factory, audio context, media info (browser only) |
| `src/lib/playback/sample-clips.ts` | FFmpeg argument builder and clip generator |
| `src/lib/playback/harness-ops.ts` | Add media to a project (pure) |
| `src/components/playback/scene-painter.ts` | Imperative Konva painter |
| `src/components/playback/playback-harness.tsx` | The test page view |
| `src/app/dev/playback/page.tsx`, `playback-client.tsx` | The route |
| `src/proxy.ts` | Modified: skip `dev/` in the matcher |

Each `*.test.ts` sits beside the file it tests.

---

### Task 1: Scene builder and fit helpers

**Files:**
- Create: `src/lib/playback/scene.ts`
- Test: `src/lib/playback/scene.test.ts`

**Interfaces:**
- Consumes: `clipDrawState`, `DrawState` (`@/lib/playback/draw-state`); `PoolElement` (`@/lib/playback/media-pool`); `activeClipsAt` (`@/lib/timeline/active-clips`); `TimelineProject`, `Clip`.
- Produces:
  - `type SceneContent = { type: "video"; element: PoolElement } | { type: "image"; mediaId: string } | { type: "placeholder"; label: string }`
  - `interface SceneItem { clipId: string; draw: DrawState; content: SceneContent | null }` (`content: null` = nothing to draw for this clip right now)
  - `buildScene(project, time, elementFor: (clipId: string) => PoolElement | undefined): SceneItem[]`. One item per clip active at `time` on a visible track, in paint order (bottom first). Audio clips are omitted. A video clip with no element yields `content: null`, never another clip's element. Text clips use `adjustments.text?.content`, falling back to the clip name, as the placeholder label; stickers use the clip name.
  - `fitFrame(containerWidth, containerHeight, frameWidth, frameHeight): { scale: number; x: number; y: number }` (uniform scale, centred; `{ scale: 1, x: 0, y: 0 }` for any non-positive input)
  - `fitContain(naturalWidth, naturalHeight, frameWidth, frameHeight): { x: number; y: number; width: number; height: number }` (media scaled to fit inside the frame, centred; the whole frame for a non-positive natural size)

- [ ] **Step 1: Write the failing test**

`src/lib/playback/scene.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildScene, fitContain, fitFrame } from "@/lib/playback/scene";
import { FakeElement } from "@/lib/playback/test-utils";
import { makeClip, makeProject, makeStandardTracks, makeTrack } from "@/lib/timeline/test-utils";
import type { TextAdjustments } from "@/types/text-adjustments";

const none = () => undefined;

describe("buildScene", () => {
  it("is empty when nothing is active", () => {
    expect(buildScene(makeProject(makeStandardTracks(), []), 1, none)).toEqual([]);
  });

  it("lists active clips in paint order, bottom track first", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "over", trackId: "t2", kind: "image", sourceDuration: null }),
      makeClip({ id: "main", trackId: "t1" }),
    ]);
    expect(buildScene(project, 1, none).map((item) => item.clipId)).toEqual(["main", "over"]);
  });

  it("omits audio clips and clips on hidden tracks", () => {
    const tracks = [
      makeTrack({ id: "t1", type: "video", order: 0, hidden: true }),
      makeTrack({ id: "t2", type: "overlay", order: 1 }),
      makeTrack({ id: "t3", type: "audio", order: 2 }),
    ];
    const project = makeProject(tracks, [
      makeClip({ id: "hidden", trackId: "t1" }),
      makeClip({ id: "shown", trackId: "t2", kind: "image", sourceDuration: null }),
      makeClip({ id: "sound", trackId: "t3", kind: "audio" }),
    ]);
    expect(buildScene(project, 1, none).map((item) => item.clipId)).toEqual(["shown"]);
  });

  it("gives a video clip its own element and never another clip's", () => {
    const a = new FakeElement();
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", trackId: "t1" }),
      makeClip({ id: "b", trackId: "t2" }),
    ]);
    const scene = buildScene(project, 1, (clipId) => (clipId === "a" ? a : undefined));
    expect(scene.find((item) => item.clipId === "a")?.content).toEqual({ type: "video", element: a });
    expect(scene.find((item) => item.clipId === "b")?.content).toBeNull();
  });

  it("describes image, text and sticker clips", () => {
    const text = { content: "Hello" } as unknown as TextAdjustments;
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "img", trackId: "t2", kind: "image", mediaId: "m9", sourceDuration: null }),
      makeClip({
        id: "txt",
        trackId: "t2",
        kind: "text",
        name: "Title",
        sourceDuration: null,
        adjustments: { photo: null, video: null, text },
      }),
      makeClip({ id: "txt2", trackId: "t2", kind: "text", name: "Fallback", sourceDuration: null }),
      makeClip({ id: "stk", trackId: "t2", kind: "sticker", name: "Star", sourceDuration: null }),
    ]);
    const byId = Object.fromEntries(buildScene(project, 1, none).map((i) => [i.clipId, i.content]));
    expect(byId.img).toEqual({ type: "image", mediaId: "m9" });
    expect(byId.txt).toEqual({ type: "placeholder", label: "Hello" });
    expect(byId.txt2).toEqual({ type: "placeholder", label: "Fallback" });
    expect(byId.stk).toEqual({ type: "placeholder", label: "Star" });
  });

  it("uses the clip's local time for keyframes and fades", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({
        id: "a",
        start: 10,
        sourceOut: 10,
        fadeIn: 2,
        transform: { x: 0, y: 0, width: 100, height: 50, rotation: 0, opacity: 1 },
      }),
    ]);
    const [item] = buildScene(project, 11, none); // one second into the clip
    expect(item.draw.opacity).toBeCloseTo(0.5, 9);
    expect(item.draw.width).toBe(100);
  });

  it("includes a visible but muted video", () => {
    const project = makeProject(makeStandardTracks(), [makeClip({ id: "a", muted: true })]);
    expect(buildScene(project, 1, none)).toHaveLength(1);
  });
});

describe("fitFrame", () => {
  it("scales uniformly and centres the frame in the container", () => {
    expect(fitFrame(800, 600, 1600, 900)).toEqual({ scale: 0.5, x: 0, y: 75 });
    expect(fitFrame(2000, 450, 1600, 900)).toEqual({ scale: 0.5, x: 600, y: 0 });
  });

  it("falls back to identity for non-positive sizes", () => {
    expect(fitFrame(0, 600, 1600, 900)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(fitFrame(800, 600, 0, 900)).toEqual({ scale: 1, x: 0, y: 0 });
  });
});

describe("fitContain", () => {
  it("fills the frame when the aspect ratio matches", () => {
    expect(fitContain(640, 360, 1280, 720)).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  });

  it("letterboxes a square into a wide frame", () => {
    expect(fitContain(1000, 1000, 1280, 720)).toEqual({ x: 280, y: 0, width: 720, height: 720 });
  });

  it("scales small media up to fit", () => {
    expect(fitContain(160, 90, 1280, 720)).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  });

  it("uses the whole frame when the natural size is unknown", () => {
    expect(fitContain(0, 0, 1280, 720)).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/playback/scene.test.ts`
Expected: FAIL; `@/lib/playback/scene` cannot be resolved.

- [ ] **Step 3: Implement the scene builder**

`src/lib/playback/scene.ts`:

```ts
import { clipDrawState, type DrawState } from "@/lib/playback/draw-state";
import type { PoolElement } from "@/lib/playback/media-pool";
import { activeClipsAt } from "@/lib/timeline/active-clips";
import type { Clip, TimelineProject } from "@/types/timeline";

export type SceneContent =
  | { type: "video"; element: PoolElement }
  | { type: "image"; mediaId: string }
  | { type: "placeholder"; label: string };

export interface SceneItem {
  clipId: string;
  draw: DrawState;
  /** null = nothing to draw for this clip right now (e.g. its video element is not ready). */
  content: SceneContent | null;
}

function contentFor(
  clip: Clip,
  elementFor: (clipId: string) => PoolElement | undefined,
): SceneContent | null {
  switch (clip.kind) {
    case "video": {
      const element = elementFor(clip.id);
      return element ? { type: "video", element } : null;
    }
    case "image":
      return { type: "image", mediaId: clip.mediaId };
    case "text":
      return { type: "placeholder", label: clip.adjustments.text?.content || clip.name };
    case "sticker":
      return { type: "placeholder", label: clip.name };
    case "audio":
      return null;
  }
}

/**
 * What to draw at `time`: one item per active clip on a visible track, in
 * paint order (bottom first). Audio clips draw nothing and are left out. A
 * video clip never borrows another clip's element: without its own it is empty.
 */
export function buildScene(
  project: TimelineProject,
  time: number,
  elementFor: (clipId: string) => PoolElement | undefined,
): SceneItem[] {
  const items: SceneItem[] = [];
  for (const active of activeClipsAt(project, time)) {
    if (!active.visible || active.clip.kind === "audio") continue;
    items.push({
      clipId: active.clip.id,
      draw: clipDrawState(active.clip, active.localTime),
      content: contentFor(active.clip, elementFor),
    });
  }
  return items;
}

/** Uniform scale and offset that centre a frame inside a container. */
export function fitFrame(
  containerWidth: number,
  containerHeight: number,
  frameWidth: number,
  frameHeight: number,
): { scale: number; x: number; y: number } {
  if (containerWidth <= 0 || containerHeight <= 0 || frameWidth <= 0 || frameHeight <= 0) {
    return { scale: 1, x: 0, y: 0 };
  }
  const scale = Math.min(containerWidth / frameWidth, containerHeight / frameHeight);
  return {
    scale,
    x: (containerWidth - frameWidth * scale) / 2,
    y: (containerHeight - frameHeight * scale) / 2,
  };
}

/** Media scaled to sit inside a frame (letterboxed), centred. */
export function fitContain(
  naturalWidth: number,
  naturalHeight: number,
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number; width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { x: 0, y: 0, width: frameWidth, height: frameHeight };
  }
  const scale = Math.min(frameWidth / naturalWidth, frameHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return { x: (frameWidth - width) / 2, y: (frameHeight - height) / 2, width, height };
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/playback/scene.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors. If `contentFor` reports "not all code paths return a value", every `ClipKind` case must return; do not add a default.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/playback/scene.ts src/lib/playback/scene.test.ts
git commit -m "feat: add pure scene builder and fit helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pool events (load errors, ready wake-ups, quiet dispose)

**Files:**
- Modify: `src/lib/playback/media-pool.ts`, `src/lib/playback/test-utils.ts`
- Test: `src/lib/playback/media-pool.test.ts`

**Interfaces:**
- Consumes: the existing 3b pool.
- Produces (changes to existing exports):
  - `PoolElement` gains an optional `addEventListener?(type: "error" | "seeked" | "loadeddata", listener: () => void): void` (a real `HTMLMediaElement` satisfies it; elements without it still work).
  - `PoolProblem.kind` gains `"load-error"`.
  - `MediaPoolDeps` gains an optional `onElementReady?(): void`.
  - Behaviour: an element `error` reports `{ clipId, kind: "load-error" }` once for the clip the slot currently serves (ignored when the slot has no clip, no loaded file, or the pool has been disposed); `loadeddata` clears that clip's load-error flag and calls `onElementReady`; `seeked` calls `onElementReady`; after `dispose()` no event does anything. A new load for a clip, and releasing it, also clear its load-error flag.

- [ ] **Step 1: Teach the test fake about events**

In `src/lib/playback/test-utils.ts`, in `FakeElement`, add these members after `restarts = 0;`:

```ts
  private listeners = new Map<string, Array<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...existing, listener]);
  }

  /** Fires the listeners registered for an event, the way the browser would. */
  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
```

In `makeFakePoolDeps`, add `const ready = { count: 0 };` next to `const problems`, add `onElementReady: () => { ready.count += 1; },` to `deps`, and return `ready` alongside the other fields (`return { deps, urls, created, gains, problems, ready };`).

- [ ] **Step 2: Write the failing tests**

Append to `src/lib/playback/media-pool.test.ts`:

```ts
describe("createMediaPool: element events", () => {
  it("reports an element load error once for the clip it serves", () => {
    const { deps, created, problems } = makeFakePoolDeps();
    createMediaPool(deps).apply(plan([command()]));
    created[0].element.emit("error");
    created[0].element.emit("error");
    expect(problems).toEqual([{ clipId: "c1", kind: "load-error" }]);
  });

  it("reports again after the file loads successfully and then fails", () => {
    const { deps, created, problems } = makeFakePoolDeps();
    createMediaPool(deps).apply(plan([command()]));
    created[0].element.emit("error");
    created[0].element.emit("loadeddata");
    created[0].element.emit("error");
    expect(problems).toHaveLength(2);
  });

  it("ignores errors from a slot that serves no clip or has no loaded file", () => {
    const released = makeFakePoolDeps();
    const releasedPool = createMediaPool(released.deps);
    releasedPool.apply(plan([command()]));
    releasedPool.apply(plan([], ["slot-1"]));
    released.created[0].element.emit("error");
    expect(released.problems).toEqual([]);

    const missing = makeFakePoolDeps({ urls: { m: null } });
    createMediaPool(missing.deps).apply(plan([command()]));
    missing.created[0].element.emit("error");
    expect(missing.problems).toEqual([{ clipId: "c1", kind: "missing-media" }]);
  });

  it("ignores every event once the pool is disposed", () => {
    const { deps, created, problems, ready } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command()]));
    pool.dispose();
    created[0].element.emit("error"); // Chrome fires this when src is emptied
    created[0].element.emit("loadeddata");
    created[0].element.emit("seeked");
    expect(problems).toEqual([]);
    expect(ready.count).toBe(0);
  });

  it("tells the owner when a frame becomes available", () => {
    const { deps, created, ready } = makeFakePoolDeps();
    createMediaPool(deps).apply(plan([command()]));
    created[0].element.emit("seeked");
    created[0].element.emit("loadeddata");
    expect(ready.count).toBe(2);
  });

  it("works with elements that cannot report events", () => {
    const { deps } = makeFakePoolDeps();
    const bare = {
      currentTime: 0,
      playbackRate: 1,
      paused: true,
      ended: false,
      src: "",
      play: () => {},
      pause: () => {},
    };
    const pool = createMediaPool({ ...deps, createElement: () => bare });
    expect(() => pool.apply(plan([command()]))).not.toThrow();
    expect(bare.src).toBe("blob:m");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/playback/media-pool.test.ts`
Expected: the five tests that use `emit` or `ready` FAIL (nothing listens yet); the "bare element" test already passes; all earlier tests still pass.

- [ ] **Step 4: Implement the events**

In `src/lib/playback/media-pool.ts`:

1. In `PoolElement`, add after `pause(): void;`:

```ts
  /** Optional: when present the pool listens for load errors and decoded frames. */
  addEventListener?(type: "error" | "seeked" | "loadeddata", listener: () => void): void;
```

2. Change `PoolProblem` to `export type PoolProblem = { clipId: string; kind: "missing-media" | "play-blocked" | "load-error" };`

3. In `MediaPoolDeps`, add after `onProblem?`:

```ts
  /** A frame became available (an element finished seeking or loading); the owner should redraw. */
  onElementReady?(): void;
```

4. Inside `createMediaPool`, add next to `const blocked`: `const failed = new Set<string>(); // clips already reported as load errors` and `let disposed = false;`.

5. Replace `create` with:

```ts
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

    element.addEventListener?.("error", () => {
      // Ignore errors caused by emptying the element on dispose, and errors from a
      // slot that serves no clip or holds no loaded file.
      if (disposed || slot.clipId === null || slot.mediaId === null) return;
      report({ clipId: slot.clipId, kind: "load-error" }, failed);
    });
    element.addEventListener?.("loadeddata", () => {
      if (disposed) return;
      if (slot.clipId !== null) failed.delete(slot.clipId);
      deps.onElementReady?.();
    });
    element.addEventListener?.("seeked", () => {
      if (!disposed) deps.onElementReady?.();
    });
    return slot;
  }
```

6. In `applyCommand`, in the `if (command.load)` branch after `missing.delete(command.clipId);` add `failed.delete(command.clipId);`.

7. In `apply`, in the released-slot loop, next to `blocked.delete(slot.clipId);` add `failed.delete(slot.clipId);`.

8. In `dispose`, make the first line `disposed = true;` and add `failed.clear();` beside the other `clear()` calls.

- [ ] **Step 5: Run the tests and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/playback` then `npx tsc --noEmit`
Expected: PASS; no type errors. The existing `realElementFits` compile-time check proves a real `HTMLMediaElement` still satisfies `PoolElement`; if it now errors on `addEventListener`, relax the listener parameter type in the interface (not the check).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/playback/media-pool.ts src/lib/playback/media-pool.test.ts src/lib/playback/test-utils.ts
git commit -m "feat: report element load errors and wake the owner when a frame is ready" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Playback session

**Files:**
- Modify: `src/lib/playback/test-utils.ts`, `src/lib/playback/audio-graph.ts`, `src/lib/playback/audio-graph.test.ts`
- Create: `src/lib/playback/session.ts`
- Test: `src/lib/playback/session.test.ts`

**Interfaces:**
- Consumes: `createTransport`, `Transport`; `createAudioGraph`, `AudioContextLike`, `AudioGraph`; `createPlaybackEngine`, `FrameInfo`; `createMediaPool`, `MediaPool`, `PoolElement`, `PoolProblem`; `projectDuration`; `MediaElementKind`; `TimelineProject`.
- Produces:
  - `AudioGraph` gains `readonly master: AudioNodeLike` (the node connected to the destination, so a meter can tap it).
  - `FakeParam`, `FakeNode`, `FakeGainNode`, `FakeAudioContext` exported from `test-utils.ts` (moved out of `audio-graph.test.ts`).
  - `interface PlaybackSessionDeps { getProject(): TimelineProject; audioContext: AudioContextLike; createElement(kind: MediaElementKind): PoolElement; urlFor(mediaId: string): string | null; now(): number; schedule(callback: () => void): () => void; onFrame(frame: FrameInfo, pool: MediaPool): void; onProblem?(problem: PoolProblem): void; onDispose?(): void }`
  - `interface PlaybackSession { transport: Transport; pool: MediaPool; graph: AudioGraph; play(): void; pause(): void; toggle(): void; seek(time: number): void; step(direction: 1 | -1, fps: number): void; wake(): void; problems(): PoolProblem[]; dispose(): Promise<void> }`
  - `createPlaybackSession(deps)`. `play()` resumes the audio context without awaiting it, starts the transport and runs a frame synchronously, all before returning (so the first `play()` happens inside the click). `pause`, `seek` and `step` each run one frame. An element `seeked` or `loadeddata` event runs one frame (through the pool's `onElementReady`). `dispose()` disposes the engine (and so the pool), closes the audio graph, then calls `onDispose`; a second call does nothing.

- [ ] **Step 1: Move the audio fakes into the shared test utilities**

In `src/lib/playback/test-utils.ts`, add this import at the top: `import type { AudioContextLike } from "@/lib/playback/audio-graph";` and append at the end of the file:

```ts
export class FakeParam {
  value = 1;
  calls: Array<[number, number, number]> = [];
  setTargetAtTime(value: number, startTime: number, timeConstant: number) {
    this.calls.push([value, startTime, timeConstant]);
    return this;
  }
}

export class FakeNode {
  connections: unknown[] = [];
  connect(destination: unknown) {
    this.connections.push(destination);
    return destination;
  }
}

export class FakeGainNode extends FakeNode {
  gain = new FakeParam();
}

export class FakeAudioContext implements AudioContextLike {
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
```

In `src/lib/playback/audio-graph.test.ts`: delete the local classes `FakeParam`, `FakeNode`, `FakeGainNode` and `FakeContext`; change the test-utils import to `import { FakeAudioContext, FakeElement } from "@/lib/playback/test-utils";`; replace every `new FakeContext()` with `new FakeAudioContext()`.

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/playback/audio-graph.test.ts`
Expected: PASS (same 8 tests, now using the shared fake).

- [ ] **Step 2: Write the failing tests**

First append to `src/lib/playback/audio-graph.test.ts`, inside the existing `describe("createAudioGraph", ...)`:

```ts
  it("exposes the master node so a meter can tap it", () => {
    const ctx = new FakeAudioContext();
    const graph = createAudioGraph(ctx);
    expect(graph.master).toBe(ctx.gains[0]);
  });
```

Then create `src/lib/playback/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { FrameInfo } from "@/lib/playback/engine";
import type { PoolElement, PoolProblem } from "@/lib/playback/media-pool";
import { createPlaybackSession } from "@/lib/playback/session";
import { FakeAudioContext, FakeElement } from "@/lib/playback/test-utils";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import type { TimelineProject } from "@/types/timeline";

const oneClip = () =>
  makeProject(makeStandardTracks(), [
    makeClip({ id: "a", mediaId: "m", sourceIn: 0, sourceOut: 4, sourceDuration: 100 }),
  ]);

function setup(options: { project?: TimelineProject; urlFor?: (id: string) => string | null } = {}) {
  const project = options.project ?? oneClip();
  const clock = { now: 0 };
  const ctx = new FakeAudioContext();
  ctx.state = "suspended";

  const elements: FakeElement[] = [];
  const queue: Array<() => void> = [];
  const frames: FrameInfo[] = [];
  const problems: PoolProblem[] = [];
  const counters = { disposed: 0, cancelled: 0 };

  const session = createPlaybackSession({
    getProject: () => project,
    audioContext: ctx,
    createElement: () => {
      const element = new FakeElement();
      elements.push(element);
      return element;
    },
    urlFor: options.urlFor ?? ((id) => `blob:${id}`),
    now: () => clock.now,
    schedule: (callback) => {
      queue.push(callback);
      return () => {
        counters.cancelled += 1;
        const index = queue.indexOf(callback);
        if (index >= 0) queue.splice(index, 1);
      };
    },
    onFrame: (frame) => frames.push(frame),
    onProblem: (problem) => problems.push(problem),
    onDispose: () => {
      counters.disposed += 1;
    },
  });

  return {
    session,
    clock,
    ctx,
    elements,
    frames,
    problems,
    counters,
    pending: () => queue.length,
    runNext: () => queue.shift()?.(),
  };
}

describe("createPlaybackSession: play", () => {
  it("resumes the audio, starts the transport and runs a frame before play() returns", () => {
    const s = setup();
    s.session.play();

    // All of this happened synchronously, i.e. inside the user's click.
    expect(s.ctx.resumed).toBe(1);
    expect(s.session.transport.isPlaying()).toBe(true);
    expect(s.frames).toHaveLength(1);
    expect(s.frames[0].playing).toBe(true);
    expect(s.elements).toHaveLength(1);
    expect(s.elements[0].playCalls).toBe(1);
    expect(s.pending()).toBe(1);
  });

  it("keeps running frames and stops at the end, leaving elements paused", () => {
    const s = setup();
    s.session.play();
    s.clock.now = 2;
    s.runNext();
    expect(s.frames[s.frames.length - 1]).toMatchObject({ time: 2, playing: true });

    s.clock.now = 9;
    s.runNext();
    expect(s.frames[s.frames.length - 1]).toMatchObject({ time: 4, playing: false, ended: true });
    expect(s.elements[0].paused).toBe(true);
    expect(s.pending()).toBe(0);
  });

  it("toggle plays and pauses", () => {
    const s = setup();
    s.session.toggle();
    expect(s.session.transport.isPlaying()).toBe(true);
    s.session.toggle();
    expect(s.session.transport.isPlaying()).toBe(false);
  });
});

describe("createPlaybackSession: one frame per action", () => {
  it("pause, seek, step and wake each run exactly one frame", () => {
    const s = setup();
    s.session.play();
    const before = s.frames.length;

    s.session.pause();
    expect(s.frames).toHaveLength(before + 1);
    s.session.seek(2);
    expect(s.frames).toHaveLength(before + 2);
    s.session.step(1, 30);
    expect(s.frames).toHaveLength(before + 3);
    s.session.wake();
    expect(s.frames).toHaveLength(before + 4);
  });

  it("moves the element when a paused seek or frame step happens", () => {
    const s = setup();
    s.session.wake();
    s.session.seek(2);
    expect(s.elements[0].currentTime).toBeCloseTo(2, 9);
    s.session.step(1, 30);
    expect(s.elements[0].currentTime).toBeCloseTo(2 + 1 / 30, 9);
  });

  it("redraws when an element reports that a frame is ready", () => {
    const s = setup();
    s.session.wake();
    const before = s.frames.length;
    s.elements[0].emit("seeked");
    expect(s.frames).toHaveLength(before + 1);
    s.elements[0].emit("loadeddata");
    expect(s.frames).toHaveLength(before + 2);
  });
});

describe("createPlaybackSession: sound and problems", () => {
  it("connects every element to the audio graph exactly once", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", mediaId: "m1", start: 0, sourceIn: 0, sourceOut: 2, sourceDuration: 100 }),
      makeClip({ id: "b", mediaId: "m2", start: 2, sourceIn: 0, sourceOut: 2, sourceDuration: 100 }),
    ]);
    const s = setup({ project });
    s.session.play();
    s.clock.now = 1.5;
    s.runNext(); // inside the lookahead window, so the second file is prepared

    expect(s.elements).toHaveLength(2);
    expect(s.ctx.sources.map((source) => source.element)).toEqual(s.elements);
  });

  it("collects and forwards problems", () => {
    const s = setup({ urlFor: () => null });
    s.session.wake();
    const expected: PoolProblem[] = [{ clipId: "a", kind: "missing-media" }];
    expect(s.session.problems()).toEqual(expected);
    expect(s.problems).toEqual(expected);
  });
});

describe("createPlaybackSession: dispose", () => {
  it("stops the loop, silences elements, closes the audio and runs the cleanup once", async () => {
    const s = setup();
    s.session.play();
    expect(s.pending()).toBe(1);

    await s.session.dispose();
    expect(s.counters.cancelled).toBe(1);
    expect(s.pending()).toBe(0);
    expect(s.elements[0].paused).toBe(true);
    expect(s.elements[0].src).toBe("");
    expect(s.ctx.closed).toBe(1);
    expect(s.counters.disposed).toBe(1);

    await s.session.dispose();
    expect(s.ctx.closed).toBe(1);
    expect(s.counters.disposed).toBe(1);
  });

  it("does nothing on a later action", async () => {
    const s = setup();
    await s.session.dispose();
    const before = s.frames.length;
    s.session.wake();
    s.session.seek(1);
    expect(s.frames).toHaveLength(before);
  });
});

// Compile-time check: the session accepts a real media element factory.
const realFactoryFits = (create: () => HTMLMediaElement): (() => PoolElement) => create;
void realFactoryFits;
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/playback/session.test.ts src/lib/playback/audio-graph.test.ts`
Expected: FAIL; `@/lib/playback/session` cannot be resolved, and the `graph.master` test fails because `master` is undefined.

- [ ] **Step 4: Implement `master` and the session**

In `src/lib/playback/audio-graph.ts`: add `/** The node connected to the destination; tap it to meter the output. */ readonly master: AudioNodeLike;` to the `AudioGraph` interface, and add `master,` as the first property of the object returned by `createAudioGraph` (above `attach`).

Create `src/lib/playback/session.ts`:

```ts
import { createTransport, type Transport } from "@/lib/engine/transport";
import type { MediaElementKind } from "@/lib/engine/wanted";
import { createAudioGraph, type AudioContextLike, type AudioGraph } from "@/lib/playback/audio-graph";
import {
  createPlaybackEngine,
  type FrameInfo,
  type PlaybackEngine,
} from "@/lib/playback/engine";
import {
  createMediaPool,
  type MediaPool,
  type PoolElement,
  type PoolProblem,
} from "@/lib/playback/media-pool";
import { projectDuration } from "@/lib/timeline/clip-math";
import type { TimelineProject } from "@/types/timeline";

export interface PlaybackSessionDeps {
  getProject(): TimelineProject;
  audioContext: AudioContextLike;
  createElement(kind: MediaElementKind): PoolElement;
  urlFor(mediaId: string): string | null;
  /** Monotonic clock in seconds. */
  now(): number;
  schedule(callback: () => void): () => void;
  /** Called after each frame's media plan is applied; the picture redraws here. */
  onFrame(frame: FrameInfo, pool: MediaPool): void;
  onProblem?(problem: PoolProblem): void;
  /** Called once at the end of dispose (revoke object URLs here). */
  onDispose?(): void;
}

export interface PlaybackSession {
  transport: Transport;
  pool: MediaPool;
  graph: AudioGraph;
  /** Call from the Play click: resumes audio and starts playback inside the gesture. */
  play(): void;
  pause(): void;
  toggle(): void;
  seek(time: number): void;
  step(direction: 1 | -1, fps: number): void;
  /** Re-plans and redraws once (after an edit, or when media appears while paused). */
  wake(): void;
  problems(): PoolProblem[];
  dispose(): Promise<void>;
}

/** Owns the transport, pool, audio graph and engine, and the rules for the Play click. */
export function createPlaybackSession(deps: PlaybackSessionDeps): PlaybackSession {
  const transport = createTransport({
    now: deps.now,
    duration: () => projectDuration(deps.getProject()),
  });
  const graph = createAudioGraph(deps.audioContext);
  const problems: PoolProblem[] = [];
  let engine: PlaybackEngine | null = null;
  let disposed = false;

  const pool = createMediaPool({
    createElement: deps.createElement,
    urlFor: deps.urlFor,
    attachGain: (element) => graph.attach(element),
    onProblem: (problem) => {
      problems.push(problem);
      deps.onProblem?.(problem);
    },
    onElementReady: () => engine?.wake(),
  });

  const playback = createPlaybackEngine({
    transport,
    getProject: deps.getProject,
    pool,
    schedule: deps.schedule,
    onFrame: (frame) => deps.onFrame(frame, pool),
  });
  engine = playback;

  function wake() {
    playback.wake();
  }

  return {
    transport,
    pool,
    graph,

    play() {
      // Not awaited: the first play() must happen inside the click, and the
      // context finishes resuming a moment later.
      graph.resume().catch(() => {});
      transport.play();
      wake();
    },

    pause() {
      transport.pause();
      wake();
    },

    toggle() {
      if (transport.isPlaying()) this.pause();
      else this.play();
    },

    seek(time) {
      transport.seek(time);
      wake();
    },

    step(direction, fps) {
      transport.stepFrame(direction, fps);
      wake();
    },

    wake,

    problems: () => [...problems],

    async dispose() {
      if (disposed) return;
      disposed = true;
      playback.dispose();
      await graph.close().catch(() => {});
      deps.onDispose?.();
    },
  };
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/playback` then `npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/playback/session.ts src/lib/playback/session.test.ts src/lib/playback/audio-graph.ts src/lib/playback/audio-graph.test.ts src/lib/playback/test-utils.ts
git commit -m "feat: add playback session that owns the engine, pool and audio graph" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Object URLs, image cache and the browser module

**Files:**
- Create: `src/lib/playback/object-url-registry.ts`, `src/lib/playback/image-cache.ts`, `src/lib/playback/browser.ts`
- Test: `src/lib/playback/object-url-registry.test.ts`, `src/lib/playback/image-cache.test.ts`

**Interfaces:**
- Produces:
  - `interface ObjectUrlDeps { create(blob: Blob): string; revoke(url: string): void }`
  - `interface ObjectUrlRegistry { addBlob(mediaId: string, blob: Blob): string; addUrl(mediaId: string, url: string): void; urlFor(mediaId: string): string | null; remove(mediaId: string): void; revokeAll(): void }`
  - `createObjectUrlRegistry(deps?: ObjectUrlDeps): ObjectUrlRegistry`. Only URLs it created itself are revoked; remote URLs added with `addUrl` never are. Adding a media id twice revokes the first owned URL.
  - `interface ImageLike { onload: (() => void) | null; onerror: (() => void) | null; crossOrigin: string | null; src: string }`
  - `interface ImageCache<I extends ImageLike> { get(mediaId: string): I | null; invalidate(mediaId: string): void; dispose(): void }`
  - `createImageCache<I extends ImageLike>(options: { urlFor(mediaId: string): string | null; onLoad(): void; createImage(): I }): ImageCache<I>`. `get` returns the image once loaded and `null` while loading, failed, or without a URL. It sets `crossOrigin = "anonymous"` before `src`, starts each load once, calls `onLoad` when one finishes, never retries a failure until `invalidate`.
  - `browser.ts` (no unit tests; type-checked and exercised in Chrome): `browserNow(): number` (seconds, `performance.now()`), `browserSchedule(callback): () => void` (`requestAnimationFrame`), `createBrowserAudioContext(): AudioContext`, `createBrowserElement(kind: MediaElementKind): HTMLMediaElement` (`playsInline`, `preload = "auto"`, `crossOrigin = "anonymous"` before any `src`), `interface MediaInfo { duration: number; width: number; height: number }`, `readMediaInfo(url: string, kind: "video" | "audio" | "image"): Promise<MediaInfo>` (rejects with a readable message; rejects for a non-finite duration).

- [ ] **Step 1: Write the failing tests**

`src/lib/playback/object-url-registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createObjectUrlRegistry } from "@/lib/playback/object-url-registry";

function setup() {
  const created: string[] = [];
  const revoked: string[] = [];
  const registry = createObjectUrlRegistry({
    create: () => {
      const url = `blob:${created.length + 1}`;
      created.push(url);
      return url;
    },
    revoke: (url) => {
      revoked.push(url);
    },
  });
  return { registry, created, revoked };
}

describe("createObjectUrlRegistry", () => {
  it("creates a URL for a blob and returns it by media id", () => {
    const { registry } = setup();
    const url = registry.addBlob("m1", new Blob(["x"]));
    expect(url).toBe("blob:1");
    expect(registry.urlFor("m1")).toBe("blob:1");
    expect(registry.urlFor("nope")).toBeNull();
  });

  it("revokes a URL when its media is removed or replaced", () => {
    const { registry, revoked } = setup();
    registry.addBlob("m1", new Blob(["x"]));
    registry.addBlob("m1", new Blob(["y"]));
    expect(revoked).toEqual(["blob:1"]);
    registry.remove("m1");
    expect(revoked).toEqual(["blob:1", "blob:2"]);
    expect(registry.urlFor("m1")).toBeNull();
  });

  it("never revokes a remote URL it did not create", () => {
    const { registry, revoked } = setup();
    registry.addUrl("r1", "https://example.com/a.mp4");
    expect(registry.urlFor("r1")).toBe("https://example.com/a.mp4");
    registry.remove("r1");
    registry.addUrl("r2", "https://example.com/b.mp4");
    registry.revokeAll();
    expect(revoked).toEqual([]);
  });

  it("revokes every owned URL and forgets everything", () => {
    const { registry, revoked } = setup();
    registry.addBlob("a", new Blob(["1"]));
    registry.addBlob("b", new Blob(["2"]));
    registry.addUrl("r", "https://example.com/c.mp4");
    registry.revokeAll();
    expect(revoked.sort()).toEqual(["blob:1", "blob:2"]);
    expect(registry.urlFor("a")).toBeNull();
    expect(registry.urlFor("r")).toBeNull();
  });
});
```

`src/lib/playback/image-cache.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createImageCache, type ImageLike } from "@/lib/playback/image-cache";

class FakeImage implements ImageLike {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  /** The order in which properties were assigned. */
  assigned: string[] = [];
  private cross: string | null = null;
  private source = "";
  get crossOrigin() {
    return this.cross;
  }
  set crossOrigin(value: string | null) {
    this.assigned.push("crossOrigin");
    this.cross = value;
  }
  get src() {
    return this.source;
  }
  set src(value: string) {
    this.assigned.push("src");
    this.source = value;
  }
}

function setup(urls: Record<string, string | null> = { m: "blob:img" }) {
  const images: FakeImage[] = [];
  const loads = { count: 0 };
  const cache = createImageCache({
    urlFor: (id) => urls[id] ?? null,
    onLoad: () => {
      loads.count += 1;
    },
    createImage: () => {
      const image = new FakeImage();
      images.push(image);
      return image;
    },
  });
  return { cache, images, loads, urls };
}

describe("createImageCache", () => {
  it("returns null while loading, then the image once loaded, calling onLoad", () => {
    const { cache, images, loads } = setup();
    expect(cache.get("m")).toBeNull();
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe("blob:img");

    images[0].onload?.();
    expect(loads.count).toBe(1);
    expect(cache.get("m")).toBe(images[0]);
    expect(images).toHaveLength(1);
  });

  it("sets crossOrigin before src and starts each load only once", () => {
    const { cache, images } = setup();
    cache.get("m");
    cache.get("m");
    expect(images).toHaveLength(1);
    expect(images[0].assigned).toEqual(["crossOrigin", "src"]);
    expect(images[0].crossOrigin).toBe("anonymous");
  });

  it("does not cache a media id that has no URL yet", () => {
    const { cache, images, urls } = setup({});
    expect(cache.get("m")).toBeNull();
    expect(images).toHaveLength(0);
    urls.m = "blob:late";
    cache.get("m");
    expect(images).toHaveLength(1);
  });

  it("does not retry a failed load until invalidated", () => {
    const { cache, images } = setup();
    cache.get("m");
    images[0].onerror?.();
    expect(cache.get("m")).toBeNull();
    expect(images).toHaveLength(1);

    cache.invalidate("m");
    cache.get("m");
    expect(images).toHaveLength(2);
  });

  it("detaches handlers on dispose so late loads do nothing", () => {
    const { cache, images, loads } = setup();
    cache.get("m");
    cache.dispose();
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
    expect(loads.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/playback/object-url-registry.test.ts src/lib/playback/image-cache.test.ts`
Expected: FAIL; both modules cannot be resolved.

- [ ] **Step 3: Implement the registry and the image cache**

`src/lib/playback/object-url-registry.ts`:

```ts
export interface ObjectUrlDeps {
  create(blob: Blob): string;
  revoke(url: string): void;
}

export interface ObjectUrlRegistry {
  /** Makes an object URL for a blob; the registry owns and later revokes it. */
  addBlob(mediaId: string, blob: Blob): string;
  /** Registers a remote URL; never revoked. */
  addUrl(mediaId: string, url: string): void;
  urlFor(mediaId: string): string | null;
  remove(mediaId: string): void;
  revokeAll(): void;
}

// Called lazily, so importing this module in a non-browser environment is safe.
const browserDeps: ObjectUrlDeps = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

export function createObjectUrlRegistry(deps: ObjectUrlDeps = browserDeps): ObjectUrlRegistry {
  const entries = new Map<string, { url: string; owned: boolean }>();

  function forget(mediaId: string) {
    const entry = entries.get(mediaId);
    if (entry?.owned) deps.revoke(entry.url);
    entries.delete(mediaId);
  }

  return {
    addBlob(mediaId, blob) {
      forget(mediaId);
      const url = deps.create(blob);
      entries.set(mediaId, { url, owned: true });
      return url;
    },
    addUrl(mediaId, url) {
      forget(mediaId);
      entries.set(mediaId, { url, owned: false });
    },
    urlFor: (mediaId) => entries.get(mediaId)?.url ?? null,
    remove: forget,
    revokeAll() {
      for (const mediaId of Array.from(entries.keys())) forget(mediaId);
    },
  };
}
```

`src/lib/playback/image-cache.ts`:

```ts
/** The part of an HTMLImageElement the cache uses. */
export interface ImageLike {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  crossOrigin: string | null;
  src: string;
}

export interface ImageCache<I extends ImageLike> {
  /** The loaded image, or null while loading, after a failure, or without a URL. */
  get(mediaId: string): I | null;
  /** Forget a media id (e.g. its URL changed) so the next get loads it again. */
  invalidate(mediaId: string): void;
  dispose(): void;
}

type Entry<I> = { state: "loading" | "failed"; image: I } | { state: "loaded"; image: I };

export function createImageCache<I extends ImageLike>(options: {
  urlFor(mediaId: string): string | null;
  /** An image finished loading; the owner should redraw. */
  onLoad(): void;
  createImage(): I;
}): ImageCache<I> {
  const entries = new Map<string, Entry<I>>();

  function detach(entry: Entry<I>) {
    entry.image.onload = null;
    entry.image.onerror = null;
  }

  return {
    get(mediaId) {
      const existing = entries.get(mediaId);
      if (existing) return existing.state === "loaded" ? existing.image : null;

      const url = options.urlFor(mediaId);
      if (url === null) return null;

      const image = options.createImage();
      const entry: Entry<I> = { state: "loading", image };
      entries.set(mediaId, entry);
      image.onload = () => {
        entries.set(mediaId, { state: "loaded", image });
        options.onLoad();
      };
      image.onerror = () => {
        entries.set(mediaId, { state: "failed", image });
      };
      // Without this, a cross-origin image would taint the canvas.
      image.crossOrigin = "anonymous";
      image.src = url;
      return null;
    },

    invalidate(mediaId) {
      const entry = entries.get(mediaId);
      if (entry) detach(entry);
      entries.delete(mediaId);
    },

    dispose() {
      for (const entry of entries.values()) detach(entry);
      entries.clear();
    },
  };
}
```

- [ ] **Step 4: Create the browser module**

`src/lib/playback/browser.ts`:

```ts
import type { MediaElementKind } from "@/lib/engine/wanted";

// The only module under src/lib/playback allowed to call browser APIs directly.
// It has no unit tests; it is type-checked and exercised in a real browser.

/** Seconds on a monotonic clock. */
export function browserNow(): number {
  return performance.now() / 1000;
}

/** Runs the callback on the next animation frame; returns a canceller. */
export function browserSchedule(callback: () => void): () => void {
  const id = requestAnimationFrame(() => callback());
  return () => cancelAnimationFrame(id);
}

/** Created suspended until a user gesture resumes it. */
export function createBrowserAudioContext(): AudioContext {
  return new AudioContext();
}

export function createBrowserElement(kind: MediaElementKind): HTMLMediaElement {
  const element = document.createElement(kind);
  if (element instanceof HTMLVideoElement) element.playsInline = true;
  element.preload = "auto";
  // Must be set before any src: without it, cross-origin media is silenced once
  // it is routed through the audio graph.
  element.crossOrigin = "anonymous";
  return element;
}

export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
}

/** Reads a file's length and natural size without keeping an element around. */
export function readMediaInfo(url: string, kind: "video" | "audio" | "image"): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    if (kind === "image") {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () =>
        resolve({ duration: 0, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () =>
        reject(new Error("Could not read that image (a remote server may not allow cross-origin use)."));
      image.src = url;
      return;
    }

    const element = document.createElement(kind);
    element.preload = "metadata";
    element.crossOrigin = "anonymous";
    element.onloadedmetadata = () => {
      const duration = element.duration;
      const width = element instanceof HTMLVideoElement ? element.videoWidth : 0;
      const height = element instanceof HTMLVideoElement ? element.videoHeight : 0;
      element.removeAttribute("src");
      element.load();
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("That file has no usable length."));
        return;
      }
      resolve({ duration, width, height });
    };
    element.onerror = () =>
      reject(
        new Error("Could not read that media file (a remote server may not allow cross-origin use)."),
      );
    element.src = url;
  });
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/playback` then `npx tsc --noEmit`
Expected: PASS; no type errors (this also type-checks `browser.ts`).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/playback/object-url-registry.ts src/lib/playback/object-url-registry.test.ts src/lib/playback/image-cache.ts src/lib/playback/image-cache.test.ts src/lib/playback/browser.ts
git commit -m "feat: add object-URL registry, image cache and browser wiring" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Sample clip generation

**Files:**
- Create: `src/lib/playback/sample-clips.ts`
- Test: `src/lib/playback/sample-clips.test.ts`

**Interfaces:**
- Produces:
  - `interface SampleClipSpec { name: string; duration: number; size: { width: number; height: number }; fps: number; toneHz: number; negate: boolean }`
  - `SAMPLE_CLIPS: SampleClipSpec[]` (two 6-second 640x360 clips at 30 fps: "Sample A" with a 440 Hz tone, "Sample B" with a 660 Hz tone and inverted colours)
  - `buildSampleArgs(spec, outputName): string[]` (the FFmpeg arguments: a `testsrc` video, which burns a running timecode into the picture, plus a `sine` tone, encoded as H.264/AAC)
  - `interface FfmpegLike { exec(args: string[]): Promise<number>; readFile(path: string): Promise<Uint8Array | string>; deleteFile(path: string): Promise<unknown> }` (the real `FFmpeg` satisfies it)
  - `generateSampleClip(ffmpeg, spec): Promise<Blob>`. Throws a readable error for a non-zero exit code or string output, and always deletes the output file.

- [ ] **Step 1: Write the failing test**

`src/lib/playback/sample-clips.test.ts`:

```ts
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { describe, expect, it } from "vitest";

import {
  buildSampleArgs,
  generateSampleClip,
  SAMPLE_CLIPS,
  type FfmpegLike,
} from "@/lib/playback/sample-clips";

// Compile-time check: the real FFmpeg class satisfies FfmpegLike.
const realFfmpegFits = (ffmpeg: FFmpeg): FfmpegLike => ffmpeg;
void realFfmpegFits;

function fakeFfmpeg(options: { exitCode?: number; output?: Uint8Array | string } = {}) {
  const calls = { exec: [] as string[][], read: [] as string[], deleted: [] as string[] };
  const ffmpeg: FfmpegLike = {
    exec: async (args) => {
      calls.exec.push(args);
      return options.exitCode ?? 0;
    },
    readFile: async (path) => {
      calls.read.push(path);
      return options.output ?? new Uint8Array([1, 2, 3, 4]);
    },
    deleteFile: async (path) => {
      calls.deleted.push(path);
      return true;
    },
  };
  return { ffmpeg, calls };
}

describe("SAMPLE_CLIPS", () => {
  it("defines two distinct clips", () => {
    expect(SAMPLE_CLIPS).toHaveLength(2);
    expect(new Set(SAMPLE_CLIPS.map((c) => c.toneHz)).size).toBe(2);
    expect(SAMPLE_CLIPS.some((c) => c.negate)).toBe(true);
  });
});

describe("buildSampleArgs", () => {
  const spec = SAMPLE_CLIPS[0];

  it("describes a timecode test pattern and a tone of the right length", () => {
    const args = buildSampleArgs(spec, "out.mp4");
    expect(args).toContain(`testsrc=duration=${spec.duration}:size=640x360:rate=${spec.fps}`);
    expect(args).toContain(`sine=frequency=${spec.toneHz}:duration=${spec.duration}`);
    expect(args[args.length - 1]).toBe("out.mp4");
  });

  it("inverts the colours only when asked", () => {
    expect(buildSampleArgs(SAMPLE_CLIPS[0], "a.mp4")).not.toContain("negate");
    expect(buildSampleArgs(SAMPLE_CLIPS[1], "b.mp4")).toContain("negate");
  });

  it("encodes for broad browser support", () => {
    const args = buildSampleArgs(spec, "out.mp4");
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args).toContain("aac");
  });
});

describe("generateSampleClip", () => {
  it("returns an mp4 blob with the encoded bytes and cleans up", async () => {
    const { ffmpeg, calls } = fakeFfmpeg();
    const blob = await generateSampleClip(ffmpeg, SAMPLE_CLIPS[0]);
    expect(blob.type).toBe("video/mp4");
    expect(blob.size).toBe(4);
    expect(calls.read).toEqual(calls.deleted);
    expect(calls.exec[0][calls.exec[0].length - 1]).toBe(calls.read[0]);
  });

  it("uses a different output file for each clip", async () => {
    const first = fakeFfmpeg();
    const second = fakeFfmpeg();
    await generateSampleClip(first.ffmpeg, SAMPLE_CLIPS[0]);
    await generateSampleClip(second.ffmpeg, SAMPLE_CLIPS[1]);
    expect(first.calls.read[0]).not.toBe(second.calls.read[0]);
  });

  it("explains a failure and still removes the output", async () => {
    const { ffmpeg, calls } = fakeFfmpeg({ exitCode: 1 });
    await expect(generateSampleClip(ffmpeg, SAMPLE_CLIPS[0])).rejects.toThrow(/exit code 1/);
    expect(calls.deleted).toHaveLength(1);
  });

  it("rejects text output instead of bytes", async () => {
    const { ffmpeg } = fakeFfmpeg({ output: "not bytes" });
    await expect(generateSampleClip(ffmpeg, SAMPLE_CLIPS[0])).rejects.toThrow(/no video data/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/playback/sample-clips.test.ts`
Expected: FAIL; `@/lib/playback/sample-clips` cannot be resolved.

- [ ] **Step 3: Implement the generator**

`src/lib/playback/sample-clips.ts`:

```ts
export interface SampleClipSpec {
  name: string;
  /** Seconds. */
  duration: number;
  size: { width: number; height: number };
  fps: number;
  toneHz: number;
  /** Invert the colours so a cut between two samples is easy to see. */
  negate: boolean;
}

export const SAMPLE_CLIPS: SampleClipSpec[] = [
  { name: "Sample A", duration: 6, size: { width: 640, height: 360 }, fps: 30, toneHz: 440, negate: false },
  { name: "Sample B", duration: 6, size: { width: 640, height: 360 }, fps: 30, toneHz: 660, negate: true },
];

/**
 * FFmpeg arguments for a clip whose picture is the `testsrc` pattern (it burns
 * a running timecode into every frame, so a screenshot shows which source frame
 * is on screen) with a sine tone.
 */
export function buildSampleArgs(spec: SampleClipSpec, outputName: string): string[] {
  const { width, height } = spec.size;
  return [
    "-f",
    "lavfi",
    "-i",
    `testsrc=duration=${spec.duration}:size=${width}x${height}:rate=${spec.fps}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${spec.toneHz}:duration=${spec.duration}`,
    ...(spec.negate ? ["-vf", "negate"] : []),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    outputName,
  ];
}

/** The part of the FFmpeg WASM API used here; the real class satisfies it. */
export interface FfmpegLike {
  exec(args: string[]): Promise<number>;
  readFile(path: string): Promise<Uint8Array | string>;
  deleteFile(path: string): Promise<unknown>;
}

export async function generateSampleClip(ffmpeg: FfmpegLike, spec: SampleClipSpec): Promise<Blob> {
  const slug = spec.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const output = `${slug}.mp4`;
  try {
    const exitCode = await ffmpeg.exec(buildSampleArgs(spec, output));
    if (exitCode !== 0) {
      throw new Error(
        `FFmpeg could not generate "${spec.name}" (exit code ${exitCode}). This FFmpeg build may not support the test pattern; add your own files instead.`,
      );
    }
    const data = await ffmpeg.readFile(output);
    if (typeof data === "string") {
      throw new Error(`FFmpeg returned no video data for "${spec.name}".`);
    }
    return new Blob([new Uint8Array(data)], { type: "video/mp4" });
  } finally {
    await ffmpeg.deleteFile(output).catch(() => {});
  }
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/playback/sample-clips.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors (the `realFfmpegFits` line confirms the real class fits). Whether this FFmpeg core actually supports `lavfi`, `testsrc` and `negate` can only be learned by running it in Chrome (Task 9); the failure path already produces a clear message.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/playback/sample-clips.ts src/lib/playback/sample-clips.test.ts
git commit -m "feat: add generated sample clips with a burned-in timecode" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Harness operations

**Files:**
- Create: `src/lib/playback/harness-ops.ts`
- Test: `src/lib/playback/harness-ops.test.ts`

**Interfaces:**
- Consumes: `fitContain` (Task 1); `insertClip`, `addTrack`, `projectDuration`, `createId`, `IdFn`; types.
- Produces:
  - `HARNESS_FRAME = { width: 1280, height: 720 }`, `IMAGE_CLIP_SECONDS = 5`
  - `interface MediaItem { mediaId: string; name: string; kind: "video" | "audio" | "image"; duration: number; width: number; height: number }`
  - `addMediaToProject(project, item, options?: { at?: number; newId?: IdFn }): TimelineProject`. Video and image clips go on the first video track, appended at the end of the project; audio clips go on the first audio track at `options.at ?? 0`. A missing track is created. Stills are 5 s long with `sourceDuration: null`. Video and image transforms are `fitContain`-ed into `HARNESS_FRAME`.

- [ ] **Step 1: Write the failing test**

`src/lib/playback/harness-ops.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  addMediaToProject,
  HARNESS_FRAME,
  IMAGE_CLIP_SECONDS,
  type MediaItem,
} from "@/lib/playback/harness-ops";
import { emptyTimeline } from "@/lib/sync/timeline-document";
import { seqIds } from "@/lib/timeline/test-utils";

const video = (mediaId: string, overrides: Partial<MediaItem> = {}): MediaItem => ({
  mediaId,
  name: mediaId,
  kind: "video",
  duration: 6,
  width: 640,
  height: 360,
  ...overrides,
});

const base = () => emptyTimeline("h", seqIds("t")); // video t-1, audio t-2

describe("addMediaToProject", () => {
  it("appends videos to the main track one after another", () => {
    let project = addMediaToProject(base(), video("a"), { newId: seqIds("c") });
    project = addMediaToProject(project, video("b"), { newId: seqIds("d") });

    expect(project.clips.map((c) => [c.mediaId, c.trackId, c.start])).toEqual([
      ["a", "t-1", 0],
      ["b", "t-1", 6],
    ]);
    expect(project.clips[0]).toMatchObject({ kind: "video", sourceIn: 0, sourceOut: 6, sourceDuration: 6 });
  });

  it("makes a still image five seconds long with no source length", () => {
    const project = addMediaToProject(base(), video("pic", { kind: "image", duration: 0 }), {
      newId: seqIds("c"),
    });
    expect(project.clips[0]).toMatchObject({
      kind: "image",
      sourceIn: 0,
      sourceOut: IMAGE_CLIP_SECONDS,
      sourceDuration: null,
    });
  });

  it("puts audio on the audio track at the requested time", () => {
    const project = addMediaToProject(base(), video("song", { kind: "audio", duration: 30 }), {
      at: 2,
      newId: seqIds("c"),
    });
    expect(project.clips[0]).toMatchObject({ kind: "audio", trackId: "t-2", start: 2, sourceOut: 30 });
  });

  it("starts audio at 0 by default", () => {
    const project = addMediaToProject(base(), video("song", { kind: "audio" }), { newId: seqIds("c") });
    expect(project.clips[0].start).toBe(0);
  });

  it("creates a missing track", () => {
    const empty = { id: "h", tracks: [], clips: [] };
    const project = addMediaToProject(empty, video("a"), { newId: seqIds("n") });
    expect(project.tracks.map((t) => t.type)).toEqual(["video"]);
    expect(project.clips).toHaveLength(1);
    expect(project.clips[0].trackId).toBe(project.tracks[0].id);
  });

  it("fits the picture inside the frame, centred", () => {
    const wide = addMediaToProject(base(), video("w"), { newId: seqIds("c") });
    expect(wide.clips[0].transform).toMatchObject({ x: 0, y: 0, width: 1280, height: 720 });

    const square = addMediaToProject(base(), video("s", { width: 1000, height: 1000 }), {
      newId: seqIds("c"),
    });
    expect(square.clips[0].transform).toMatchObject({ x: 280, y: 0, width: 720, height: 720 });
  });

  it("uses the whole frame when the natural size is unknown", () => {
    const project = addMediaToProject(base(), video("u", { width: 0, height: 0 }), {
      newId: seqIds("c"),
    });
    expect(project.clips[0].transform).toMatchObject({
      x: 0,
      y: 0,
      width: HARNESS_FRAME.width,
      height: HARNESS_FRAME.height,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/playback/harness-ops.test.ts`
Expected: FAIL; `@/lib/playback/harness-ops` cannot be resolved.

- [ ] **Step 3: Implement the operations**

`src/lib/playback/harness-ops.ts`:

```ts
import { fitContain } from "@/lib/playback/scene";
import { projectDuration } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { insertClip } from "@/lib/timeline/place";
import { addTrack } from "@/lib/timeline/tracks";
import type { Clip, TimelineProject, TrackType } from "@/types/timeline";

export const HARNESS_FRAME = { width: 1280, height: 720 };
export const IMAGE_CLIP_SECONDS = 5;

export interface MediaItem {
  mediaId: string;
  name: string;
  kind: "video" | "audio" | "image";
  /** Seconds; 0 for images. */
  duration: number;
  /** Natural size in pixels; 0 when unknown. */
  width: number;
  height: number;
}

function ensureTrack(
  project: TimelineProject,
  type: TrackType,
  newId: IdFn,
): { project: TimelineProject; trackId: string } {
  const existing = project.tracks.find((track) => track.type === type);
  if (existing) return { project, trackId: existing.id };

  const next = addTrack(project, type, newId);
  const created = next.tracks.find((track) => !project.tracks.some((old) => old.id === track.id));
  if (!created) throw new Error("addTrack did not add a track");
  return { project: next, trackId: created.id };
}

function buildClip(item: MediaItem, trackId: string, start: number, newId: IdFn): Clip {
  const still = item.kind === "image";
  const length = still ? IMAGE_CLIP_SECONDS : item.duration;
  const box =
    item.kind === "audio"
      ? { x: 0, y: 0, ...HARNESS_FRAME }
      : fitContain(item.width, item.height, HARNESS_FRAME.width, HARNESS_FRAME.height);

  return {
    id: newId(),
    trackId,
    kind: item.kind,
    name: item.name,
    mediaId: item.mediaId,
    sourceDuration: still ? null : item.duration,
    start,
    sourceIn: 0,
    sourceOut: length,
    speed: 1,
    reversed: false,
    loop: false,
    volume: 100,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transform: { ...box, rotation: 0, opacity: 1 },
    adjustments: { photo: null, video: null, text: null },
    keyframes: [],
    groupId: null,
    locked: false,
    isPlaceholder: false,
  };
}

/**
 * Adds a media file to the test project. Video and images go on the main
 * track, appended after what is there; audio goes on the audio track at `at`.
 */
export function addMediaToProject(
  project: TimelineProject,
  item: MediaItem,
  options: { at?: number; newId?: IdFn } = {},
): TimelineProject {
  const newId = options.newId ?? createId;
  const type: TrackType = item.kind === "audio" ? "audio" : "video";
  const { project: withTrack, trackId } = ensureTrack(project, type, newId);
  const start = item.kind === "audio" ? (options.at ?? 0) : projectDuration(withTrack);
  return insertClip(withTrack, buildClip(item, trackId, start, newId));
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/playback/harness-ops.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/playback/harness-ops.ts src/lib/playback/harness-ops.test.ts
git commit -m "feat: add operations for putting media on the test project" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Konva scene painter

**Files:**
- Create: `src/components/playback/scene-painter.ts`

**Interfaces:**
- Consumes: `SceneItem`, `fitFrame` (Task 1); Konva (`import Konva from "konva"`).
- Produces:
  - `interface ScenePainterOptions { container: HTMLDivElement; frame: { width: number; height: number }; getImage(mediaId: string): HTMLImageElement | null }`
  - `interface ScenePainter { render(scene: SceneItem[]): void; resize(width: number, height: number): void; nodeCount(): number; destroy(): void }`
  - `createScenePainter(options): ScenePainter`. Draws a black frame, clips drawing to it, keeps one Konva group per clip (created when the clip first appears, destroyed when it leaves), orders groups by scene order, scales the whole stage to fit the container, and calls one `batchDraw` per `render`. No unit tests (Konva needs a real canvas); it is type-checked here and verified in Chrome in Task 9.

- [ ] **Step 1: Write the painter**

`src/components/playback/scene-painter.ts`:

```ts
import Konva from "konva";

import { fitFrame, type SceneItem } from "@/lib/playback/scene";

export interface ScenePainterOptions {
  container: HTMLDivElement;
  frame: { width: number; height: number };
  /** The loaded image for an image clip, or null while it is loading. */
  getImage(mediaId: string): HTMLImageElement | null;
}

export interface ScenePainter {
  render(scene: SceneItem[]): void;
  resize(width: number, height: number): void;
  /** Number of clip nodes currently on the stage (for the debug panel). */
  nodeCount(): number;
  destroy(): void;
}

interface ClipNodes {
  group: Konva.Group;
  image: Konva.Image;
  placeholder: Konva.Group;
  placeholderRect: Konva.Rect;
  placeholderText: Konva.Text;
}

export function createScenePainter({ container, frame, getImage }: ScenePainterOptions): ScenePainter {
  const stage = new Konva.Stage({
    container,
    width: container.clientWidth || frame.width,
    height: container.clientHeight || frame.height,
  });
  // Nothing here is interactive, so skip the hit-detection canvas.
  const layer = new Konva.Layer({ listening: false });
  layer.clip({ x: 0, y: 0, width: frame.width, height: frame.height });
  stage.add(layer);
  layer.add(
    new Konva.Rect({ x: 0, y: 0, width: frame.width, height: frame.height, fill: "#000000" }),
  );

  const nodes = new Map<string, ClipNodes>();

  function fit(width: number, height: number) {
    const placement = fitFrame(width, height, frame.width, frame.height);
    stage.size({ width, height });
    stage.scale({ x: placement.scale, y: placement.scale });
    stage.position({ x: placement.x, y: placement.y });
  }
  fit(stage.width(), stage.height());

  function create(clipId: string): ClipNodes {
    const group = new Konva.Group({ name: clipId });
    const image = new Konva.Image({ image: undefined, visible: false });
    const placeholderRect = new Konva.Rect({
      fill: "rgba(139, 92, 246, 0.25)",
      stroke: "#8b5cf6",
      strokeWidth: 2,
    });
    const placeholderText = new Konva.Text({ fill: "#ffffff", fontSize: 32, align: "center", verticalAlign: "middle" });
    const placeholder = new Konva.Group({ visible: false });
    placeholder.add(placeholderRect, placeholderText);
    group.add(image, placeholder);
    layer.add(group);
    const entry = { group, image, placeholder, placeholderRect, placeholderText };
    nodes.set(clipId, entry);
    return entry;
  }

  function paintItem(entry: ClipNodes, item: SceneItem) {
    const { draw, content } = item;
    entry.group.setAttrs({
      x: draw.x,
      y: draw.y,
      rotation: draw.rotation,
      opacity: Math.max(0, Math.min(1, draw.opacity)),
    });

    let source: CanvasImageSource | null = null;
    let label: string | null = null;
    if (content?.type === "video") {
      source = content.element as unknown as HTMLVideoElement;
    } else if (content?.type === "image") {
      source = getImage(content.mediaId);
    } else if (content?.type === "placeholder") {
      label = content.label;
    }

    entry.image.visible(source !== null);
    if (source !== null) {
      entry.image.image(source);
      entry.image.size({ width: draw.width, height: draw.height });
    }

    entry.placeholder.visible(label !== null);
    if (label !== null) {
      entry.placeholderRect.size({ width: draw.width, height: draw.height });
      entry.placeholderText.setAttrs({ text: label, width: draw.width, height: draw.height });
    }

    entry.group.visible(source !== null || label !== null);
  }

  return {
    render(scene) {
      const seen = new Set<string>();
      scene.forEach((item, index) => {
        seen.add(item.clipId);
        const entry = nodes.get(item.clipId) ?? create(item.clipId);
        paintItem(entry, item);
        // Index 0 is the black frame, so clips start at 1, in paint order.
        entry.group.zIndex(index + 1);
      });
      for (const [clipId, entry] of Array.from(nodes)) {
        if (seen.has(clipId)) continue;
        entry.group.destroy();
        nodes.delete(clipId);
      }
      layer.batchDraw();
    },

    resize(width, height) {
      if (width <= 0 || height <= 0) return;
      fit(width, height);
      layer.batchDraw();
    },

    nodeCount: () => nodes.size,

    destroy() {
      nodes.clear();
      stage.destroy();
    },
  };
}
```

- [ ] **Step 2: Type-check and lint**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx tsc --noEmit` then `npx eslint src/components/playback/scene-painter.ts`
Expected: no errors. If Konva's types reject `entry.image.image(source)` for a `CanvasImageSource | null`-narrowed value, narrow to the non-null branch exactly as written (it is inside `if (source !== null)`); do not widen with `any`.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/components/playback/scene-painter.ts
git commit -m "feat: add imperative Konva scene painter" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Test page and route

**Files:**
- Create: `src/components/playback/playback-harness.tsx`, `src/app/dev/playback/page.tsx`, `src/app/dev/playback/playback-client.tsx`
- Modify: `src/proxy.ts` (matcher only)

**Interfaces:**
- Consumes: everything above; `useClipProjectStore`, `selectProject`, `selectCanUndo`, `selectCanRedo`; `useTransportStore`; `emptyTimeline`; core ops (`splitClip`, `deleteClips`, `setSpeed`, `updateClip`, `updateTrack`); `getFfmpeg`; `Button`.
- Produces: the `/dev/playback` page (a 404 in production), and `window.__playbackHarness` with `{ session, stats, level(): number, audioState(): string, getProject(): TimelineProject }` so Chrome can read and drive the page.

- [ ] **Step 1: Create the route**

`src/app/dev/playback/page.tsx`:

```tsx
import { notFound } from "next/navigation";

import { PlaybackClient } from "@/app/dev/playback/playback-client";

// A developer test page for the playback engine: never served in production.
export default function PlaybackPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PlaybackClient />;
}
```

`src/app/dev/playback/playback-client.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";

// Konva and media elements need the browser, so the view is client-only.
const PlaybackHarness = dynamic(
  () => import("@/components/playback/playback-harness").then((m) => m.PlaybackHarness),
  {
    ssr: false,
    loading: () => <p className="p-6 text-sm text-muted-foreground">Loading the playback test page…</p>,
  },
);

export function PlaybackClient() {
  return <PlaybackHarness />;
}
```

- [ ] **Step 2: Keep the test page off Supabase**

The `proxy.ts` matcher currently runs the Supabase session refresh on every page, which would make the test page fail whenever Supabase is unreachable (for example a paused project). In `src/proxy.ts`, change the matcher string so it also skips paths under `dev/`:

```ts
  matcher: ["/((?!_next/static|_next/image|favicon.ico|dev/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
```

- [ ] **Step 3: Write the view**

`src/components/playback/playback-harness.tsx`:

```tsx
"use client";

import * as React from "react";

import { createScenePainter } from "@/components/playback/scene-painter";
import { Button } from "@/components/ui/button";
import type { SlotState } from "@/lib/engine/slots";
import { getFfmpeg } from "@/lib/export/ffmpeg-client";
import {
  browserNow,
  browserSchedule,
  createBrowserAudioContext,
  createBrowserElement,
  readMediaInfo,
} from "@/lib/playback/browser";
import { addMediaToProject, HARNESS_FRAME, type MediaItem } from "@/lib/playback/harness-ops";
import { createImageCache } from "@/lib/playback/image-cache";
import type { PoolProblem } from "@/lib/playback/media-pool";
import { createObjectUrlRegistry } from "@/lib/playback/object-url-registry";
import { generateSampleClip, SAMPLE_CLIPS } from "@/lib/playback/sample-clips";
import { buildScene } from "@/lib/playback/scene";
import { createPlaybackSession, type PlaybackSession } from "@/lib/playback/session";
import { emptyTimeline } from "@/lib/sync/timeline-document";
import { projectDuration } from "@/lib/timeline/clip-math";
import { createId } from "@/lib/timeline/ids";
import { deleteClips } from "@/lib/timeline/delete";
import { splitClip } from "@/lib/timeline/split";
import { setSpeed, updateClip } from "@/lib/timeline/clip-edits";
import { updateTrack } from "@/lib/timeline/tracks";
import {
  selectCanRedo,
  selectCanUndo,
  selectProject,
  useClipProjectStore,
} from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";
import type { TimelineProject } from "@/types/timeline";

const FPS = 30;
const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4, 8];
const PROJECT_ID = "playback-harness";

interface ElementStats {
  created: number;
  loads: number;
  seeks: number;
}

interface DebugSnapshot {
  slots: SlotState[];
  problems: PoolProblem[];
  stats: ElementStats;
  nodes: number;
  level: number;
  audio: string;
}

interface HarnessDebug {
  session: PlaybackSession;
  stats: ElementStats;
  level: () => number;
  audioState: () => string;
  getProject: () => TimelineProject;
}

declare global {
  interface Window {
    __playbackHarness?: HarnessDebug;
  }
}

/** Counts creations, loads (src assignments) and seeks (currentTime assignments). */
function instrument(element: HTMLMediaElement, stats: ElementStats): HTMLMediaElement {
  stats.created += 1;
  const time = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime");
  const src = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
  const getTime = time?.get;
  const setTime = time?.set;
  const getSrc = src?.get;
  const setSrc = src?.set;
  if (getTime && setTime) {
    Object.defineProperty(element, "currentTime", {
      configurable: true,
      get: () => getTime.call(element) as number,
      set: (value: number) => {
        stats.seeks += 1;
        setTime.call(element, value);
      },
    });
  }
  if (getSrc && setSrc) {
    Object.defineProperty(element, "src", {
      configurable: true,
      get: () => getSrc.call(element) as string,
      set: (value: string) => {
        stats.loads += 1;
        setSrc.call(element, value);
      },
    });
  }
  return element;
}

function kindOf(file: Blob): MediaItem["kind"] | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

export function PlaybackHarness() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const sessionRef = React.useRef<PlaybackSession | null>(null);
  const statsRef = React.useRef<ElementStats>({ created: 0, loads: 0, seeks: 0 });
  const [registry] = React.useState(() => createObjectUrlRegistry());
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [urlText, setUrlText] = React.useState("");
  const [urlKind, setUrlKind] = React.useState<MediaItem["kind"]>("video");
  const [debug, setDebug] = React.useState<DebugSnapshot | null>(null);

  const project = useClipProjectStore(selectProject);
  const selectedIds = useClipProjectStore((s) => s.selectedClipIds);
  const canUndo = useClipProjectStore(selectCanUndo);
  const canRedo = useClipProjectStore(selectCanRedo);
  const time = useTransportStore((s) => s.time);
  const playing = useTransportStore((s) => s.playing);

  const duration = projectDuration(project);
  const selected = project.clips.find((clip) => clip.id === selectedIds[0]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    useClipProjectStore.getState().load(emptyTimeline(PROJECT_ID));
    useTransportStore.getState().reset();
    const stats = statsRef.current;
    stats.created = 0;
    stats.loads = 0;
    stats.seeks = 0;

    const audioContext = createBrowserAudioContext();
    const imageCache = createImageCache({
      urlFor: (mediaId) => registry.urlFor(mediaId),
      onLoad: () => sessionRef.current?.wake(),
      createImage: () => new Image(),
    });
    const painter = createScenePainter({
      container,
      frame: HARNESS_FRAME,
      getImage: (mediaId) => imageCache.get(mediaId),
    });
    const getProject = () => selectProject(useClipProjectStore.getState());

    const session = createPlaybackSession({
      getProject,
      audioContext,
      createElement: (kind) => instrument(createBrowserElement(kind), stats),
      urlFor: (mediaId) => registry.urlFor(mediaId),
      now: browserNow,
      schedule: browserSchedule,
      onFrame: (frame, pool) => {
        useTransportStore.getState().setFrame(frame.time, frame.playing);
        painter.render(buildScene(getProject(), frame.time, (clipId) => pool.elementForClip(clipId)));
      },
      onDispose: () => {
        imageCache.dispose();
        registry.revokeAll();
      },
    });
    sessionRef.current = session;

    // Tap the master output so the page (and Chrome) can see whether sound is flowing.
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    session.graph.master.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const level = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) sum += value * value;
      return Math.sqrt(sum / samples.length);
    };

    const snapshot = (): DebugSnapshot => ({
      slots: session.pool.slots(),
      problems: session.problems(),
      stats: { ...stats },
      nodes: painter.nodeCount(),
      level: level(),
      audio: audioContext.state,
    });
    const poll = window.setInterval(() => setDebug(snapshot()), 250);

    const resize = () => painter.resize(container.clientWidth, container.clientHeight);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    // Any edit (including loading) re-plans and redraws once.
    const unsubscribe = useClipProjectStore.subscribe(() => session.wake());

    window.__playbackHarness = {
      session,
      stats,
      level,
      audioState: () => audioContext.state,
      getProject,
    };
    session.wake();

    return () => {
      window.clearInterval(poll);
      unsubscribe();
      observer.disconnect();
      delete window.__playbackHarness;
      sessionRef.current = null;
      painter.destroy();
      void session.dispose();
    };
  }, [registry]);

  async function finishAdd(mediaId: string, name: string, kind: MediaItem["kind"], url: string) {
    try {
      const info = await readMediaInfo(url, kind);
      useClipProjectStore.getState().apply((p) => addMediaToProject(p, { mediaId, name, kind, ...info }));
      setMessage(null);
    } catch (error) {
      registry.remove(mediaId);
      setMessage(error instanceof Error ? error.message : "Could not add that file.");
    }
  }

  async function addBlob(blob: Blob, name: string, kind: MediaItem["kind"]) {
    const mediaId = createId();
    await finishAdd(mediaId, name, kind, registry.addBlob(mediaId, blob));
  }

  async function onFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    for (const file of files) {
      const kind = kindOf(file);
      if (!kind) {
        setMessage(`Unsupported file type: ${file.type || file.name}`);
        continue;
      }
      await addBlob(file, file.name, kind);
    }
  }

  async function addRemote() {
    const url = urlText.trim();
    if (!url) return;
    const mediaId = createId();
    registry.addUrl(mediaId, url);
    await finishAdd(mediaId, url.split("/").pop() || url, urlKind, url);
  }

  async function generateSamples() {
    setBusy(true);
    try {
      setMessage("Loading FFmpeg (one-time download of about 30 MB)…");
      const ffmpeg = await getFfmpeg();
      for (const spec of SAMPLE_CLIPS) {
        setMessage(`Generating ${spec.name}…`);
        await addBlob(await generateSampleClip(ffmpeg, spec), spec.name, "video");
      }
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate the sample clips.");
    } finally {
      setBusy(false);
    }
  }

  const apply = useClipProjectStore.getState().apply;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4 text-sm">
      <h1 className="text-lg font-semibold">Playback test page</h1>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex flex-col gap-3">
          <div ref={containerRef} className="aspect-video w-full overflow-hidden rounded-md bg-black" />

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => sessionRef.current?.toggle()}>{playing ? "Pause" : "Play"}</Button>
            <Button variant="secondary" onClick={() => sessionRef.current?.step(-1, FPS)}>
              ◀ Frame
            </Button>
            <Button variant="secondary" onClick={() => sessionRef.current?.step(1, FPS)}>
              Frame ▶
            </Button>
            <span className="tabular-nums" data-testid="time">
              {time.toFixed(3)} / {duration.toFixed(3)} s
            </span>
            <Button variant="ghost" disabled={!canUndo} onClick={() => useClipProjectStore.getState().undo()}>
              Undo
            </Button>
            <Button variant="ghost" disabled={!canRedo} onClick={() => useClipProjectStore.getState().redo()}>
              Redo
            </Button>
          </div>

          <input
            type="range"
            aria-label="Scrub"
            min={0}
            max={duration || 1}
            step={0.001}
            value={Math.min(time, duration || 1)}
            onChange={(event) => sessionRef.current?.seek(Number(event.target.value))}
          />

          <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
            <label className="flex items-center gap-2">
              Add files
              <input type="file" multiple accept="video/*,audio/*,image/*" onChange={onFiles} />
            </label>
            <Button disabled={busy} variant="secondary" onClick={generateSamples}>
              Generate sample clips
            </Button>
            <div className="flex items-center gap-2">
              <input
                className="w-64 rounded border px-2 py-1"
                placeholder="https://… (video, audio or image)"
                value={urlText}
                onChange={(event) => setUrlText(event.target.value)}
              />
              <select
                className="rounded border px-1 py-1"
                value={urlKind}
                onChange={(event) => setUrlKind(event.target.value as MediaItem["kind"])}
              >
                <option value="video">video</option>
                <option value="audio">audio</option>
                <option value="image">image</option>
              </select>
              <Button variant="secondary" onClick={addRemote}>
                Add from URL
              </Button>
            </div>
            {message && (
              <p role="status" className="w-full text-amber-600" data-testid="message">
                {message}
              </p>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-3">
          <section className="rounded-md border p-3">
            <h2 className="mb-2 font-medium">Clips</h2>
            <ul className="flex flex-col gap-1">
              {project.clips.map((clip) => (
                <li key={clip.id}>
                  <button
                    type="button"
                    className={`w-full rounded px-2 py-1 text-left ${
                      selectedIds.includes(clip.id) ? "bg-primary/15" : "hover:bg-muted"
                    }`}
                    onClick={() => useClipProjectStore.getState().setSelectedClipIds([clip.id])}
                  >
                    {clip.name} · {clip.kind} · {clip.start.toFixed(2)}s
                    {clip.reversed ? " · reversed" : ""}
                    {clip.speed !== 1 ? ` · ${clip.speed}x` : ""}
                  </button>
                </li>
              ))}
              {project.clips.length === 0 && <li className="text-muted-foreground">No clips yet.</li>}
            </ul>

            {selected && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => apply((p) => splitClip(p, selected.id, time))}>
                  Split at playhead
                </Button>
                <Button size="sm" variant="secondary" onClick={() => apply((p) => deleteClips(p, selectedIds))}>
                  Delete
                </Button>
                <label className="flex items-center gap-1">
                  Speed
                  <select
                    className="rounded border px-1 py-0.5"
                    value={selected.speed}
                    onChange={(event) => apply((p) => setSpeed(p, selected.id, Number(event.target.value)))}
                  >
                    {SPEEDS.map((speed) => (
                      <option key={speed} value={speed}>
                        {speed}x
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={selected.reversed}
                    onChange={() => apply((p) => updateClip(p, selected.id, { reversed: !selected.reversed }))}
                  />
                  Reverse
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={selected.muted}
                    onChange={() => apply((p) => updateClip(p, selected.id, { muted: !selected.muted }))}
                  />
                  Mute clip
                </label>
                <label className="flex w-full items-center gap-2">
                  Volume {selected.volume}%
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={selected.volume}
                    onChange={(event) =>
                      apply((p) => updateClip(p, selected.id, { volume: Number(event.target.value) }))
                    }
                  />
                </label>
              </div>
            )}
          </section>

          <section className="rounded-md border p-3">
            <h2 className="mb-2 font-medium">Tracks</h2>
            <ul className="flex flex-col gap-1">
              {project.tracks.map((track) => (
                <li key={track.id} className="flex items-center gap-3">
                  <span className="w-16">{track.type}</span>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={track.muted}
                      onChange={() => apply((p) => updateTrack(p, track.id, { muted: !track.muted }))}
                    />
                    mute
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={track.hidden}
                      onChange={() => apply((p) => updateTrack(p, track.id, { hidden: !track.hidden }))}
                    />
                    hide
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-md border p-3" data-testid="debug">
            <h2 className="mb-2 font-medium">Debug</h2>
            {debug ? (
              <div className="flex flex-col gap-1 font-mono text-xs">
                <div>
                  elements created {debug.stats.created} · loads {debug.stats.loads} · seeks {debug.stats.seeks}
                </div>
                <div>
                  painter nodes {debug.nodes} · audio {debug.audio} · level {debug.level.toFixed(4)}
                </div>
                {debug.slots.map((slot) => (
                  <div key={slot.id}>
                    {slot.id} {slot.kind} file {slot.mediaId?.slice(0, 8) ?? "–"} clip{" "}
                    {slot.clipId?.slice(0, 8) ?? "–"} t {slot.currentTime.toFixed(3)}
                  </div>
                ))}
                {debug.problems.map((problem, index) => (
                  <div key={index} className="text-red-600">
                    problem: {problem.kind} (clip {problem.clipId.slice(0, 8)})
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Starting…</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Type-check and lint**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx tsc --noEmit` then `npx eslint src/components/playback src/app/dev src/proxy.ts src/lib/playback`
Expected: no errors. If a `react-hooks` rule objects to the effect, restructure the effect without changing what it does (for example move a `setState` call into a callback); do not disable the rule. If `analyser.getFloatTimeDomainData` rejects the `Float32Array` type, allocate it as `new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>`.

- [ ] **Step 5: Check the page compiles and serves**

Run: start the dev server with `mcp__Claude_Browser__preview_start` using the name `scrapbook-dev`, then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dev/playback`
Expected: `200`, and `preview_logs` (level `error`) shows no compile errors. Leave the server running for Task 9.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/components/playback/playback-harness.tsx src/app/dev src/proxy.ts
git commit -m "feat: add the /dev/playback test page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verify in a real Chrome

This task has no new code unless a check fails. It needs the user to have enabled the Claude in Chrome extension. A check that fails is a finding: diagnose the cause with `superpowers:systematic-debugging`, fix it with a test first wherever the fault is in unit-testable logic, and re-run the failed check.

**Files:**
- Create (outside the repo, in the session scratchpad): `cors-server.mjs`
- Possibly modify: any file in this plan, if a check fails.

- [ ] **Step 1: Prepare**

Read the `anthropic-skills:chrome-browser` skill. Load the Claude in Chrome tools it names. Run `list_connected_browsers`. If the result is empty, **stop and ask the user to enable the Claude in Chrome extension**, then wait; do not use the in-app browser as a substitute (it cannot paint frames or play media). Otherwise open a new tab and navigate it to `http://localhost:3000/dev/playback`.
Expected: the heading "Playback test page", the controls and an empty debug panel are visible; `read_console_messages` shows no errors.

- [ ] **Step 2: Generate the sample clips**

Click "Generate sample clips". Wait for the status to clear (the first run downloads the FFmpeg core).
Expected: two clips ("Sample A", "Sample B") appear in the Clips list; the time readout shows `0.000 / 12.000 s`; the painter shows the first frame with a running timecode. If a message says FFmpeg could not generate a clip, record the exact message, report it to the user, and continue the remaining checks with files the user supplies; do not fabricate results.

- [ ] **Step 3: Frame accuracy and redraw after a seek**

With playback paused, use the scrub slider (or `window.__playbackHarness.session.seek(t)`) to seek to 0.5, 2.0, 3.3 and 5.9, taking a zoomed screenshot of the picture after each.
Expected: the burned-in timecode in the picture equals the playhead to within one frame (1/30 s) every time, after the picture has settled. Then seek to 6.1: the picture is now the inverted-colour clip with its timecode at about 0.1. This verifies the redraw-after-`seeked` obligation.

- [ ] **Step 4: Frame stepping**

Seek to 2.0, then click "Frame ▶" five times, zooming on the timecode after each click.
Expected: the timecode advances by one frame (1/30 s) per click, never staying the same for two clicks. Click "◀ Frame" five times; it steps back the same way.

- [ ] **Step 5: Play across a cut between files**

Read the debug counters, seek to 5.0 and press Play, let it run to about 7.0, then Pause and read the counters again.
Expected: no problems listed; elements created 2, loads 2 (one per file); `audio` is `running`; the picture changed from clip A to the inverted clip B at 6.0 without a blank frame in the screenshots taken just before and after.

- [ ] **Step 6: One element across a split**

Select Sample A, seek to 3.0 and click "Split at playhead". Reload the page state is not needed; note the counters, seek to 2.0, press Play, let it run past 4.0 and Pause.
Expected: elements created and loads increase by at most the first-time cost of the split pieces' shared file (the two halves of Sample A must reuse one element: created stays at 2 for the two files), seeks increase by at most the initial positioning, and the picture's timecode runs continuously through 3.0 with no jump.

- [ ] **Step 7: Reverse, speed and mute**

Select a clip: tick "Reverse", seek to 1.0 then 2.0 then 3.0 paused. Expected: the timecode shown goes backwards as the playhead goes forwards (it equals the clip length minus the playhead offset), and `level` stays at about 0 while playing a reversed clip. Untick Reverse. Set Speed to 2x and play 1 second of timeline time: the timecode advances about 2 seconds. Set Speed back to 1x.
Then play with the clip unmuted: `window.__playbackHarness.level()` is clearly above 0.01 while playing and about 0 after Pause. Tick "Mute clip" and play: the level falls to about 0.

- [ ] **Step 8: Remote media, CORS and load errors**

Write a throwaway Node server in the session scratchpad (never in the repo) that listens on port 4010, accepts `POST /upload/<name>` to save a body to memory, and serves `GET /cors/<name>` with `Access-Control-Allow-Origin: *` and `GET /nocors/<name>` without it, both with `Accept-Ranges: bytes` and correct `Range` handling and `Content-Type: video/mp4`, plus `GET /break` which makes every later `GET /cors/...` answer 404 (keeping `Access-Control-Allow-Origin: *`). Start it in the background. From the page, fetch the generated Sample A blob (read its object URL from the registry or re-generate), POST it to `/upload/a.mp4`.
- Add `http://localhost:4010/cors/a.mp4` as video from the URL box. Expected: it is added, plays, and `level` is above 0.01 while it plays (remote audio is not silenced).
- Add `http://localhost:4010/nocors/a.mp4`. Expected: it is **not** added and the page shows a clear "may not allow cross-origin use" message (no silent failure).
- Add the CORS URL again as a second clip, then request `/break`, then press Play across that clip. Expected: the debug panel lists a `load-error` problem for it, exactly once, and the page keeps working.
Stop the server afterwards.

- [ ] **Step 9: Lifecycle and tidiness**

Navigate away from the page and back (and reload).
Expected: `window.__playbackHarness` exists exactly once; the debug panel shows `painter nodes` equal to the number of visible active clips (0 or 1 here, not growing); after pressing Play on the new page load the audio state becomes `running`; no console errors or warnings about unclosed audio contexts or leaked elements. In the first page, confirm after navigating away that no element was still playing (`document.querySelectorAll("video,audio")` held none of ours).

- [ ] **Step 10: Record the evidence and clean up**

Save the screenshots in the session scratchpad. Close the Chrome tab you opened and stop the dev server (`preview_stop`). Write the results of Steps 2–9 into the final report as a table of check, expected, observed, pass/fail. Send the user the two or three most informative screenshots with `SendUserFile`.

- [ ] **Step 11: Commit any fixes**

If any check led to code changes, each fix was made test-first where possible. Run `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npm test`, `npx tsc --noEmit` and `npx eslint src/lib/playback src/components/playback src/app/dev`, then commit with a message naming the fix. If nothing needed fixing there is nothing to commit.

---

### Task 10: Barrel and full verification

**Files:**
- Modify: `src/lib/playback/index.ts`

**Interfaces:**
- Produces: `@/lib/playback` also exports the new modules.

- [ ] **Step 1: Extend the barrel**

Replace the contents of `src/lib/playback/index.ts` with:

```ts
export * from "@/lib/playback/audio-graph";
export * from "@/lib/playback/draw-state";
export * from "@/lib/playback/engine";
export * from "@/lib/playback/harness-ops";
export * from "@/lib/playback/image-cache";
export * from "@/lib/playback/media-pool";
export * from "@/lib/playback/object-url-registry";
export * from "@/lib/playback/sample-clips";
export * from "@/lib/playback/scene";
export * from "@/lib/playback/session";
```

(`browser.ts` is deliberately not exported from the barrel: it is the only module that touches the browser and is imported by name where needed. `test-utils` is not exported either.)

- [ ] **Step 2: Run everything**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npm test` then `npx tsc --noEmit` then `npx eslint src/lib/playback src/components/playback src/app/dev src/proxy.ts`
Expected: all tests pass; no type or lint errors. If `export *` reports a duplicate name, rename the colliding export in its own file and update its tests.

- [ ] **Step 3: Confirm only the allowed existing files changed**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && git diff --stat main -- src ':!src/lib/playback' ':!src/components/playback' ':!src/app/dev'`
Expected: only `src/proxy.ts` appears (the playback files are listed separately under their own paths).

- [ ] **Step 4: Confirm the pure modules stayed pure**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && grep -rnE "document\.|window\.|new AudioContext|requestAnimationFrame|setTimeout|setInterval|performance\.|Date\.now|new Image" src/lib/playback --include=*.ts --exclude=*.test.ts --exclude=test-utils.ts --exclude=browser.ts`
Expected: no output.

- [ ] **Step 5: Confirm the page is a 404 in production**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npm run build`
Expected: the build succeeds and lists `/dev/playback`. Then run the production server on port 3001 in the background (`prod.cmd`, or `npx next start -p 3001`), request it, and stop the server:
`curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/dev/playback`
Expected: `404`.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/playback/index.ts
git commit -m "feat: export the picture, session and harness modules" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage** (section 5.3 and the 3b review obligations)

| Requirement | Task |
|---|---|
| Pure scene builder; a video clip never shows another clip's frame | 1 |
| Imperative Konva painter, one node per clip, paint order, batchDraw | 7, verified 9 |
| Obligation (a): redraw when a seek finishes | 2 (`onElementReady`), 3 (session wake), 9 Step 3–4 |
| Obligation (b): load failures reported | 2, verified 9 Step 8 |
| Obligation (c): `crossOrigin="anonymous"` before `src`; CORS | 4 (`createBrowserElement`, image cache), verified 9 Step 8 |
| Obligation (d): wake the engine when media appears/changes | 3 (`wake`), 8 (store subscription, image `onLoad`), 9 |
| Obligation (e): close the audio graph on shutdown; revoke URLs | 3 (`dispose`, `onDispose`), 8 |
| Obligation (f): ignore element errors during dispose | 2 |
| Autoplay: audio resumed in the first Play click, first `play()` inside it | 3, verified 9 Step 5 and 7 |
| `performance.now()` clock and `requestAnimationFrame` scheduler | 4 |
| `/dev/playback` public, hidden in production, repo route pattern | 8, 10 |
| Test page controls, file/URL pickers, debug panel | 8 |
| Generated sample clips with burned-in timecode, with fallback message | 5, 8, 9 Step 2 |
| Verification in Chrome including a throwaway CORS server outside the repo | 9 |

Gaps accepted: the Konva painter and `browser.ts` have no unit tests (they need a real canvas and browser); Task 9 is their test. Whether this FFmpeg core can produce the `testsrc` pattern is unknown until Task 9 Step 2; a clear fallback message exists.

**2. Placeholder scan:** no TBD/TODO; every code step shows the code, every command step shows the command and expectation.

**3. Type consistency:** `SceneItem`/`SceneContent` (Task 1) are used by the painter (Task 7) and the page (Task 8); `PoolProblem` gains `"load-error"` in Task 2 and is displayed in Task 8; `PlaybackSession` (Task 3) is used by the page; `MediaItem` is defined once in Task 6 and used by the page; `ObjectUrlRegistry` and `ImageCache` signatures match their uses in Task 8; `AudioGraph.master` (Task 3) is used by the page's meter.

**4. Review Focus:** stale frames (Task 1 unit, Task 9 Steps 3–4); sound and CORS (Task 9 Steps 7–8); lifecycle (Task 3 unit, Task 9 Step 9); visible errors once (Tasks 2 and 5 units, Task 9 Steps 2 and 8); painter nodes and z-order (Task 9 Steps 5 and 9).

## Execution Handoff

Before Task 9: enable the Claude in Chrome extension in your real Chrome. Task 5's generated clips download about 30 MB of FFmpeg core from unpkg the first time the page generates them.
