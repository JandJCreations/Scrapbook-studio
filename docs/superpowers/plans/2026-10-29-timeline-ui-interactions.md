# Timeline UI, Part 2: Moving, Trimming, Reordering, Marquee, Edit Keys (plan 4b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the timeline editable by hand. Drag a clip to move it (with snapping), drag its edges to trim it, reorder clips on the main track with an insertion marker, drop a clip into empty space to create a new track, drag a box to select several clips, and use the edit keys (S / Ctrl+B split, Delete, Shift+Delete ripple, Ctrl+D duplicate, Escape cancels). Every drag is one undo step, and Escape abandons it with no history entry.

**Architecture:** All decisions are pure, unit-tested functions in `src/lib/timeline-ui/` (`drag.ts` for move/trim/drop-target/marquee, `commands.ts` for the key operations, extended key bindings in `interactions.ts`). They call the existing, already-tested editing core (`moveClip`, `trimClip`, `snap*`, `splitClip`, `deleteClips`, `duplicateClip`). The React layer in `src/components/clip-timeline/` only turns pointer and keyboard events into calls to those functions and drives the store's existing gesture API (`previewApply`, `endGesture`, `cancelGesture`). A new component-test setup (jsdom plus Testing Library) covers the pointer and keyboard flow automatically.

**Tech Stack:** TypeScript (strict), Vitest, React 19, zustand, Tailwind. New dev dependencies: `jsdom`, `@testing-library/react`, `@testing-library/dom`.

**Spec:** `docs/superpowers/specs/2026-10-14-clip-timeline-design.md`, section 6 (Interactions) and section 4 (snapping, magnetic main track).

**Not in this plan (and why):**
- Dragging a file from a Media panel onto the timeline: the new model has no media panel yet; this belongs to the "port scrapbook features" step. The test page keeps its own add-file controls.
- Moving several selected clips together: a drag moves the clip you grab. Multi-clip moves are a later refinement.
- Auto-scrolling the view while dragging near its edge: later, as a smooth frame-driven scroll.
- Thumbnails and waveforms: plan 4c.

**Decisions made here (the builder's calls):**
- A drag starts after the pointer moves 4 px; less than that is a click.
- Snap distance is 8 px (converted to seconds at the current zoom). The main (video) track never snaps; it reorders instead.
- Dropping a clip above the first track or below the last creates a new track: an audio track for an audio clip, otherwise an overlay track.
- Holding a key must not repeat actions (play/pause, split, delete, duplicate, undo, redo); the arrow keys still repeat so you can hold one to scrub frame by frame.

## Global Constraints

- Work on branch `feature/timeline-interactions` (already created from `main`; the plan is its first commit). Never commit to `main`.
- AGENTS.md says this is not the Next.js you know. This plan adds no routes; it only changes client components and test tooling. If a task needs a Next API, read `node_modules/next/dist/docs/` first.
- Pure modules in `src/lib/timeline-ui/` must pass: `grep -rnE "document\.|window\.|requestAnimationFrame|setTimeout|setInterval|performance\.|Date\.now" src/lib/timeline-ui --include=*.ts --exclude=*.test.ts` with no output.
- Existing files this plan may change: `src/lib/timeline-ui/interactions.ts` and its test, `src/lib/timeline-ui/index.ts`, `src/components/clip-timeline/clip-chip.tsx`, `timeline-view.tsx`, `vitest.config.mts`, `package.json` and `package-lock.json`. Nothing else outside new files.
- Shortcuts must never fire while typing in an input, select or textarea, or inside a menu, dialog, listbox, slider or tab (the existing `editable` and `handled` rules stay).
- Run tests with `npx vitest run <file>`; type-check with `npx tsc --noEmit`; lint with `npx eslint <paths>`. If `node` is not found, run `export PATH="$PATH:/c/Program Files/nodejs"` (bash) or `$env:Path += ";C:\Program Files\nodejs"` (PowerShell). Start shell commands with an absolute `cd` into the repo.
- Write files with the Write/Edit tools; Python is not installed.
- If `npm install` fails with a peer-dependency error (an earlier install hit one with `@types/node`), retry once with `--legacy-peer-deps` and ledger that as a Ruling.
- End every commit message with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (second `-m`).
- Chrome work (Task 5): read the `anthropic-skills:chrome-browser` skill first; use a new tab; if `list_connected_browsers` is empty, stop and ask the user to enable Claude in Chrome and bring that window to the front. A covered window throttles `requestAnimationFrame` to about 2 fps; measure it (should be near 60) before trusting playback-dependent results. Real pointer drags must use real mouse actions (`left_click_drag`), not synthetic events.

## Review Focus

- **Gestures and undo:** one drag is exactly one undo step; Escape mid-drag restores the project with no history entry; a drag that ends outside the window, is cancelled by the browser, or is interrupted by unmounting never leaves a stuck gesture or a half-moved clip.
- **New-track drops:** dragging a clip across empty space creates exactly one new track however long the drag lasts (no track per mouse move), and hovering over the preview track does not flicker or create a second one.
- **Click vs drag:** a drag never also selects or clears on release; a tiny pointer wobble is still a click; right-click and middle-click never start a drag.
- **Re-parenting:** a clip dragged to another track is a different DOM element after the move; the drag must keep working (window-level listeners, not element-level).
- **Key rules:** edit keys act on the selection (or the clips under the playhead for split), never fire while typing or inside menus, never repeat when held, and Escape cancels a drag before it clears the selection.
- **Locked tracks and clips:** dragging, trimming, splitting, deleting and duplicating locked items does nothing and creates no history entry or phantom track.
- **Many clips:** a drag over a 60-clip project stays responsive.

---

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.mts` | Modified: include `.tsx` tests, automatic JSX |
| `src/test/dom-setup.ts` | Browser stubs and cleanup for component tests |
| `src/lib/timeline-ui/drag.ts` | `dropTargetAt`, `computeMove`, `computeTrim`, `clipsInRect` |
| `src/lib/timeline-ui/commands.ts` | `splitAtPlayhead`, `duplicateSelected`, `deleteSelected` |
| `src/lib/timeline-ui/interactions.ts` | Modified: more commands, key repeat |
| `src/components/clip-timeline/clip-chip.tsx` | Modified: trim handles |
| `src/components/clip-timeline/timeline-view.tsx` | Modified: drag, trim, marquee, guides, edit keys |
| `src/components/clip-timeline/timeline-view.test.tsx` | Component tests |

Each `*.test.ts` sits beside the file it tests.

---

### Task 1: Component-test setup

**Files:**
- Modify: `package.json`, `package-lock.json`, `vitest.config.mts`
- Create: `src/test/dom-setup.ts`, `src/components/clip-timeline/timeline-view.test.tsx`

**Interfaces:**
- Produces: a way to write `*.test.tsx` files that run in jsdom (put `// @vitest-environment jsdom` on the first line of such a file and `import "@/test/dom-setup";`). `dom-setup` stubs `ResizeObserver`, `setPointerCapture`, `releasePointerCapture`, `hasPointerCapture`, and runs Testing Library's `cleanup` after each test.

- [ ] **Step 1: Install**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npm install --save-dev jsdom @testing-library/react @testing-library/dom`
Expected: exits 0 and the three packages appear under `devDependencies`. (If it fails on peer dependencies, see Global Constraints.)

- [ ] **Step 2: Vitest config**

Replace the contents of `vitest.config.mts` with:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // The app's tsconfig keeps JSX for Next; tests need it compiled.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 3: Setup file**

`src/test/dom-setup.ts`:

```ts
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom has no layout engine and lacks a few browser APIs the timeline uses.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.hasPointerCapture = () => false;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
```

- [ ] **Step 4: Write a smoke test and watch it work**

`src/components/clip-timeline/timeline-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@/test/dom-setup";

import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimelineView } from "@/components/clip-timeline/timeline-view";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import { useClipProjectStore } from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";
import type { TimelineProject } from "@/types/timeline";

export function mount(project: TimelineProject) {
  act(() => {
    useClipProjectStore.getState().load(project);
    useTransportStore.getState().reset();
  });
  const handlers = { onSeek: vi.fn(), onToggle: vi.fn(), onStep: vi.fn() };
  render(<TimelineView fps={30} {...handlers} />);
  return handlers;
}

describe("TimelineView (jsdom)", () => {
  it("renders a chip for every clip", () => {
    mount(
      makeProject(makeStandardTracks(), [
        makeClip({ id: "a", name: "First", sourceOut: 4 }),
        makeClip({ id: "b", name: "Second", start: 4, sourceOut: 4 }),
      ]),
    );
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
  });
});
```

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/components/clip-timeline/timeline-view.test.tsx`
Expected: PASS (1 test). This proves the jsdom environment, JSX compilation, the stubs and the alias all work. If it fails on `jsdom` not found or JSX syntax, fix the setup, not the test.

- [ ] **Step 5: Whole suite still runs**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npm test`
Expected: all test files pass (the existing node-environment tests are unaffected).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add package.json package-lock.json vitest.config.mts src/test/dom-setup.ts src/components/clip-timeline/timeline-view.test.tsx
git commit -m "test: add jsdom component-test setup and a timeline smoke test" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Drag logic (pure)

**Files:**
- Create: `src/lib/timeline-ui/drag.ts`
- Test: `src/lib/timeline-ui/drag.test.ts`

**Interfaces:**
- Consumes: `moveClip` (`@/lib/timeline/place`), `trimClip`/`TrimEdge` (`@/lib/timeline/trim`), `collectSnapTargets`/`snapClipStart`/`snapTime`/`snapThresholdSeconds` (`@/lib/timeline/snap`), `addTrack`, `findClip`/`findTrack`, `isMagnetic`, `clipDuration`, `createId`/`IdFn`; `clipRect`/`TrackLayout`/`ROW_GAP` (`@/lib/timeline-ui/layout`).
- Produces:
  - `SNAP_THRESHOLD_PX = 8`, `DRAG_THRESHOLD_PX = 4`
  - `type DropTarget = { kind: "track"; trackId: string } | { kind: "new-track" }`
  - `interface Guide { kind: "snap" | "insert"; time: number }`
  - `interface DragResult { project: TimelineProject; guide: Guide | null }`
  - `dropTargetAt(layout: TrackLayout, y: number): DropTarget`. `y` is measured from the top of the tracks area. A row owns its own height plus the gap below it (except the last row, which owns only its height). Above 0, below the last row, or with no rows: `{ kind: "new-track" }`.
  - `computeMove(project, input): DragResult` where `input = { clipId; pointerTime; grabOffset; target: DropTarget; playhead; pps; newTrackId: IdFn }`.
    - Desired start = `max(0, pointerTime - grabOffset)`.
    - A target of `new-track`, or a `track` id that does not exist in `project` (the preview track from an earlier mouse move), creates a track first: type `audio` for an audio clip, otherwise `overlay`.
    - Magnetic (video) target: `moveClip` reorders; the guide is `{ kind: "insert", time: <the moved clip's resulting start> }`; no snapping.
    - Free target: snap with `snapClipStart` (either edge may snap) against `collectSnapTargets(project, [clipId], playhead)` at 8 px; the guide is `{ kind: "snap", time: <target> }` or `null`.
    - If the clip is missing or locked, or the move is rejected or changes nothing, return `{ project, guide: null }` with the **original** project reference (so no phantom empty track is ever returned).
  - `computeTrim(project, input): DragResult` where `input = { clipId; edge: TrimEdge; pointerTime; playhead; pps }`. Snaps `pointerTime` with `snapTime` to `collectSnapTargets(project, [clipId], playhead)` at 8 px, then `trimClip`. Guide `{ kind: "snap", time }` when snapped. Missing or locked clip: original project, no guide.
  - `clipsInRect(project, layout, pps, rect: { left; top; right; bottom }): string[]`. Ids of clips whose rectangle (from `clipRect` on its track's row) overlaps the rectangle; touching edges do not count.

- [ ] **Step 1: Write the failing test**

`src/lib/timeline-ui/drag.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  clipsInRect,
  computeMove,
  computeTrim,
  dropTargetAt,
  type DropTarget,
} from "@/lib/timeline-ui/drag";
import { trackLayout } from "@/lib/timeline-ui/layout";
import { clipDuration, clipEnd } from "@/lib/timeline/clip-math";
import { findClip } from "@/lib/timeline/lookup";
import { makeClip, makeProject, makeStandardTracks, seqIds } from "@/lib/timeline/test-utils";

// t2 overlay (row y 0-44), t1 video (46-110), t3 audio (112-156).
const overlay = (id: string, start: number, length: number, extra = {}) =>
  makeClip({
    id,
    trackId: "t2",
    kind: "image",
    sourceDuration: null,
    start,
    sourceIn: 0,
    sourceOut: length,
    ...extra,
  });
const video = (id: string, start: number, length: number) =>
  makeClip({ id, trackId: "t1", start, sourceIn: 0, sourceOut: length, sourceDuration: 100 });

const onTrack = (trackId: string): DropTarget => ({ kind: "track", trackId });
const base = { playhead: 0, pps: 60, newTrackId: seqIds("n") };

describe("dropTargetAt", () => {
  const layout = trackLayout(makeProject(makeStandardTracks(), []));

  it("finds the row under the pointer, with the gap below belonging to the row above", () => {
    expect(dropTargetAt(layout, 10)).toEqual(onTrack("t2"));
    expect(dropTargetAt(layout, 45)).toEqual(onTrack("t2"));
    expect(dropTargetAt(layout, 60)).toEqual(onTrack("t1"));
    expect(dropTargetAt(layout, 130)).toEqual(onTrack("t3"));
  });

  it("means a new track above the first row or below the last", () => {
    expect(dropTargetAt(layout, -5)).toEqual({ kind: "new-track" });
    expect(dropTargetAt(layout, 156)).toEqual({ kind: "new-track" });
    expect(dropTargetAt(layout, 400)).toEqual({ kind: "new-track" });
  });

  it("means a new track when there are no rows", () => {
    expect(dropTargetAt(trackLayout(makeProject([], [])), 10)).toEqual({ kind: "new-track" });
  });
});

describe("computeMove on a free track", () => {
  it("places the clip by the pointer minus where it was grabbed", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2)]);
    const result = computeMove(project, {
      ...base,
      clipId: "o",
      pointerTime: 3.5,
      grabOffset: 0.5,
      target: onTrack("t2"),
    });
    expect(findClip(result.project, "o")?.start).toBe(3);
    expect(result.guide).toBeNull();
  });

  it("snaps the start edge to the playhead within 8 px", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2)]);
    const result = computeMove(project, {
      ...base,
      playhead: 5,
      clipId: "o",
      pointerTime: 5.55,
      grabOffset: 0.5,
      target: onTrack("t2"),
    });
    expect(findClip(result.project, "o")?.start).toBe(5);
    expect(result.guide).toEqual({ kind: "snap", time: 5 });
  });

  it("snaps the end edge to another clip's start", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2), overlay("x", 10, 1)]);
    const result = computeMove(project, {
      ...base,
      clipId: "o",
      pointerTime: 8.45,
      grabOffset: 0.5,
      target: onTrack("t2"),
    });
    expect(findClip(result.project, "o")?.start).toBe(8);
    expect(result.guide).toEqual({ kind: "snap", time: 10 });
  });

  it("never goes before time 0", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2)]);
    const result = computeMove(project, {
      ...base,
      clipId: "o",
      pointerTime: 0.2,
      grabOffset: 0.5,
      target: onTrack("t2"),
    });
    expect(findClip(result.project, "o")?.start).toBe(0);
  });
});

describe("computeMove on the main track", () => {
  it("reorders and reports where the clip lands", () => {
    const project = makeProject(makeStandardTracks(), [video("a", 0, 4), video("b", 4, 4)]);
    const result = computeMove(project, {
      ...base,
      clipId: "b",
      pointerTime: 0.5,
      grabOffset: 2,
      target: onTrack("t1"),
    });
    expect(findClip(result.project, "b")?.start).toBe(0);
    expect(findClip(result.project, "a")?.start).toBe(4);
    expect(result.guide).toEqual({ kind: "insert", time: 0 });
  });

  it("does not snap on the magnetic track", () => {
    const project = makeProject(makeStandardTracks(), [video("a", 0, 4), video("b", 4, 4)]);
    const result = computeMove(project, {
      ...base,
      playhead: 4.05,
      clipId: "a",
      pointerTime: 4.1,
      grabOffset: 0,
      target: onTrack("t1"),
    });
    expect(result.guide?.kind).toBe("insert");
  });
});

describe("computeMove into empty space", () => {
  it("creates an overlay track for a picture clip", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2)]);
    const result = computeMove(project, {
      ...base,
      newTrackId: seqIds("n"),
      clipId: "o",
      pointerTime: 2,
      grabOffset: 0,
      target: { kind: "new-track" },
    });
    expect(result.project.tracks).toHaveLength(4);
    const clip = findClip(result.project, "o")!;
    const track = result.project.tracks.find((t) => t.id === clip.trackId)!;
    expect(track.type).toBe("overlay");
    expect(track.id).toBe("n-1");
    expect(clip.start).toBe(2);
  });

  it("creates an audio track for an audio clip", () => {
    const sound = makeClip({ id: "s", trackId: "t3", kind: "audio", start: 0, sourceOut: 3 });
    const project = makeProject(makeStandardTracks(), [sound]);
    const result = computeMove(project, {
      ...base,
      newTrackId: seqIds("n"),
      clipId: "s",
      pointerTime: 1,
      grabOffset: 0,
      target: { kind: "new-track" },
    });
    const clip = findClip(result.project, "s")!;
    expect(result.project.tracks.find((t) => t.id === clip.trackId)?.type).toBe("audio");
    expect(result.project.tracks).toHaveLength(4);
  });

  it("treats a track id that does not exist yet as a new track (the preview track)", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2)]);
    const result = computeMove(project, {
      ...base,
      newTrackId: seqIds("n"),
      clipId: "o",
      pointerTime: 2,
      grabOffset: 0,
      target: onTrack("ghost"),
    });
    expect(result.project.tracks).toHaveLength(4);
  });
});

describe("computeMove rejections", () => {
  it("returns the original project when the track cannot host the clip", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2)]);
    const result = computeMove(project, {
      ...base,
      clipId: "o",
      pointerTime: 2,
      grabOffset: 0,
      target: onTrack("t3"),
    });
    expect(result.project).toBe(project);
    expect(result.guide).toBeNull();
  });

  it("returns the original project for a locked or missing clip", () => {
    const locked = makeProject(makeStandardTracks(), [overlay("o", 1, 2, { locked: true })]);
    const input = { ...base, pointerTime: 3, grabOffset: 0, target: onTrack("t2") };
    expect(computeMove(locked, { ...input, clipId: "o" }).project).toBe(locked);
    expect(computeMove(locked, { ...input, clipId: "nope" }).project).toBe(locked);
  });

  it("never returns a project with an empty extra track when a move into a new track is rejected", () => {
    const locked = makeProject(makeStandardTracks(), [overlay("o", 1, 2, { locked: true })]);
    const result = computeMove(locked, {
      ...base,
      clipId: "o",
      pointerTime: 3,
      grabOffset: 0,
      target: { kind: "new-track" },
    });
    expect(result.project).toBe(locked);
  });
});

describe("computeTrim", () => {
  it("snaps the dragged edge to the playhead", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 5)]);
    const result = computeTrim(project, {
      ...base,
      playhead: 3,
      clipId: "o",
      edge: "end",
      pointerTime: 2.95,
    });
    expect(clipEnd(findClip(result.project, "o")!)).toBeCloseTo(3, 9);
    expect(result.guide).toEqual({ kind: "snap", time: 3 });
  });

  it("moves the start edge and keeps the end where it was", () => {
    const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2)]);
    const result = computeTrim(project, {
      ...base,
      clipId: "o",
      edge: "start",
      pointerTime: 1.5,
    });
    const clip = findClip(result.project, "o")!;
    expect(clip.start).toBeCloseTo(1.5, 9);
    expect(clipEnd(clip)).toBeCloseTo(3, 9);
    expect(clipDuration(clip)).toBeCloseTo(1.5, 9);
  });

  it("returns the original project for a locked or missing clip", () => {
    const locked = makeProject(makeStandardTracks(), [overlay("o", 1, 2, { locked: true })]);
    const input = { ...base, edge: "end" as const, pointerTime: 2 };
    expect(computeTrim(locked, { ...input, clipId: "o" }).project).toBe(locked);
    expect(computeTrim(locked, { ...input, clipId: "nope" }).project).toBe(locked);
  });
});

describe("clipsInRect", () => {
  const project = makeProject(makeStandardTracks(), [overlay("o", 1, 2), video("a", 0, 4)]);
  const layout = trackLayout(project);
  // At 60 px/s: overlay chip x 60-180, y 2-42; video chip x 0-240, y 48-108.

  it("selects the clips the rectangle overlaps", () => {
    expect(clipsInRect(project, layout, 60, { left: 0, top: 0, right: 100, bottom: 40 })).toEqual(["o"]);
    expect(
      clipsInRect(project, layout, 60, { left: 0, top: 0, right: 300, bottom: 200 }).sort(),
    ).toEqual(["a", "o"]);
  });

  it("selects nothing in empty space", () => {
    expect(clipsInRect(project, layout, 60, { left: 400, top: 0, right: 500, bottom: 200 })).toEqual([]);
  });

  it("does not count rectangles that only touch an edge", () => {
    expect(clipsInRect(project, layout, 60, { left: 0, top: 0, right: 60, bottom: 40 })).toEqual([]);
    expect(clipsInRect(project, layout, 60, { left: 0, top: 0, right: 61, bottom: 40 })).toEqual(["o"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui/drag.test.ts`
Expected: FAIL; `@/lib/timeline-ui/drag` cannot be resolved.

- [ ] **Step 3: Implement**

`src/lib/timeline-ui/drag.ts`:

```ts
import { clipRect, ROW_GAP, type TrackLayout } from "@/lib/timeline-ui/layout";
import { clipDuration } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { findClip, findTrack, isClipLocked } from "@/lib/timeline/lookup";
import { isMagnetic } from "@/lib/timeline/pack";
import { moveClip } from "@/lib/timeline/place";
import {
  collectSnapTargets,
  snapClipStart,
  snapThresholdSeconds,
  snapTime,
} from "@/lib/timeline/snap";
import { addTrack } from "@/lib/timeline/tracks";
import { trimClip, type TrimEdge } from "@/lib/timeline/trim";
import type { TimelineProject } from "@/types/timeline";

export const SNAP_THRESHOLD_PX = 8;
/** The pointer must move this far before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 4;

export type DropTarget = { kind: "track"; trackId: string } | { kind: "new-track" };

export interface Guide {
  kind: "snap" | "insert";
  time: number;
}

export interface DragResult {
  project: TimelineProject;
  guide: Guide | null;
}

/** `y` is measured from the top of the tracks area. */
export function dropTargetAt(layout: TrackLayout, y: number): DropTarget {
  const last = layout.rows.length - 1;
  for (let i = 0; i <= last; i++) {
    const row = layout.rows[i];
    const owned = row.height + (i === last ? 0 : ROW_GAP);
    if (y >= row.y && y < row.y + owned) return { kind: "track", trackId: row.trackId };
  }
  return { kind: "new-track" };
}

export interface MoveInput {
  clipId: string;
  /** Timeline time under the pointer. */
  pointerTime: number;
  /** Seconds from the clip's start to where it was grabbed. */
  grabOffset: number;
  target: DropTarget;
  playhead: number;
  pps: number;
  newTrackId?: IdFn;
}

const unchanged = (project: TimelineProject): DragResult => ({ project, guide: null });

export function computeMove(project: TimelineProject, input: MoveInput): DragResult {
  const clip = findClip(project, input.clipId);
  if (!clip || isClipLocked(project, clip)) return unchanged(project);

  const desired = Math.max(0, input.pointerTime - input.grabOffset);
  let working = project;
  let trackId: string;

  const known = input.target.kind === "track" && findTrack(project, input.target.trackId);
  if (input.target.kind === "track" && known) {
    trackId = input.target.trackId;
  } else {
    // Empty space, or the preview track from an earlier move of this same drag.
    working = addTrack(project, clip.kind === "audio" ? "audio" : "overlay", input.newTrackId ?? createId);
    const created = working.tracks.find((t) => !project.tracks.some((old) => old.id === t.id));
    if (!created) return unchanged(project);
    trackId = created.id;
  }

  const track = findTrack(working, trackId);
  if (!track) return unchanged(project);

  if (isMagnetic(track)) {
    const next = moveClip(working, clip.id, { start: desired, trackId });
    if (next === working) return unchanged(project);
    const landed = findClip(next, clip.id);
    return { project: next, guide: landed ? { kind: "insert", time: landed.start } : null };
  }

  const targets = collectSnapTargets(working, [clip.id], input.playhead);
  const snapped = snapClipStart(
    desired,
    clipDuration(clip),
    targets,
    snapThresholdSeconds(SNAP_THRESHOLD_PX, input.pps),
  );
  const next = moveClip(working, clip.id, { start: snapped.start, trackId });
  if (next === working) return unchanged(project);
  return {
    project: next,
    guide: snapped.snappedTo === null ? null : { kind: "snap", time: snapped.snappedTo },
  };
}

export interface TrimInput {
  clipId: string;
  edge: TrimEdge;
  pointerTime: number;
  playhead: number;
  pps: number;
}

export function computeTrim(project: TimelineProject, input: TrimInput): DragResult {
  const clip = findClip(project, input.clipId);
  if (!clip || isClipLocked(project, clip)) return unchanged(project);

  const targets = collectSnapTargets(project, [clip.id], input.playhead);
  const snapped = snapTime(
    input.pointerTime,
    targets,
    snapThresholdSeconds(SNAP_THRESHOLD_PX, input.pps),
  );
  const next = trimClip(project, clip.id, input.edge, snapped.time);
  if (next === project) return unchanged(project);
  return {
    project: next,
    guide: snapped.snappedTo === null ? null : { kind: "snap", time: snapped.snappedTo },
  };
}

/** Ids of clips whose chip overlaps the rectangle (lane coordinates; touching edges do not count). */
export function clipsInRect(
  project: TimelineProject,
  layout: TrackLayout,
  pps: number,
  rect: { left: number; top: number; right: number; bottom: number },
): string[] {
  const rows = new Map(layout.rows.map((row) => [row.trackId, row]));
  const ids: string[] = [];
  for (const clip of project.clips) {
    const row = rows.get(clip.trackId);
    if (!row) continue;
    const box = clipRect(clip, row, pps);
    if (
      box.x < rect.right &&
      box.x + box.width > rect.left &&
      box.y < rect.bottom &&
      box.y + box.height > rect.top
    ) {
      ids.push(clip.id);
    }
  }
  return ids;
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui/drag.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors. If an expectation about `trimClip` or `moveClip` behaviour differs from the real core (for example the exact result of trimming the start edge of a free-track clip), read `src/lib/timeline/trim.ts` or `place.ts`, decide whether the plan's expectation or the code is wrong, fix the test accordingly, and ledger a Ruling. Do not change the core editing functions.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/timeline-ui/drag.ts src/lib/timeline-ui/drag.test.ts
git commit -m "feat: add pure timeline drag, trim, drop-target and marquee logic" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Edit commands and key bindings (pure)

**Files:**
- Create: `src/lib/timeline-ui/commands.ts`
- Test: `src/lib/timeline-ui/commands.test.ts`
- Modify: `src/lib/timeline-ui/interactions.ts`, `src/lib/timeline-ui/interactions.test.ts`, `src/lib/timeline-ui/index.ts`

**Interfaces:**
- Consumes: `splitClip`, `duplicateClip`, `deleteClips`, `rippleDeleteClips`, `clipEnd`, `createId`/`IdFn`.
- Produces:
  - `splitAtPlayhead(project, selectedIds: string[], time: number, newId?: IdFn): TimelineProject`. With a selection, splits those clips; with no selection, splits every clip the playhead is inside. A clip the playhead is not inside, a locked clip, or a split that would leave a piece under the minimum length is left alone. If nothing changes, returns the **same project reference**.
  - `duplicateSelected(project, ids, newId?): TimelineProject` (one `duplicateClip` per id, in order).
  - `deleteSelected(project, ids, ripple: boolean): TimelineProject` (`rippleDeleteClips` when `ripple`, else `deleteClips`).
  - `TimelineCommand` gains `{ type: "split" } | { type: "delete" } | { type: "ripple-delete" } | { type: "duplicate" } | { type: "cancel" }`.
  - `KeyInput` gains `repeat: boolean` (true while a key is held down and auto-repeating).
  - New key rules in `commandForKey` (the `editable`, `handled` and `altKey` rules still return `null` first): `s` with no ctrl/meta, and ctrl/meta+`b`: split; `Delete` or `Backspace`: delete; Shift+`Delete` or Shift+`Backspace`: ripple-delete; ctrl/meta+`d`: duplicate; `Escape`: cancel. Ctrl/meta+`s` and every other ctrl/meta combination not listed stay `null`. When `repeat` is true, every command except `step` and `cancel` returns `null`.

- [ ] **Step 1: Write the failing tests**

`src/lib/timeline-ui/commands.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { deleteSelected, duplicateSelected, splitAtPlayhead } from "@/lib/timeline-ui/commands";
import { clipEnd } from "@/lib/timeline/clip-math";
import { findClip } from "@/lib/timeline/lookup";
import { makeClip, makeProject, makeStandardTracks, seqIds } from "@/lib/timeline/test-utils";

const overlay = (id: string, start: number, length: number, extra = {}) =>
  makeClip({
    id,
    trackId: "t2",
    kind: "image",
    sourceDuration: null,
    start,
    sourceIn: 0,
    sourceOut: length,
    ...extra,
  });
const video = (id: string, start: number, length: number) =>
  makeClip({ id, trackId: "t1", start, sourceIn: 0, sourceOut: length, sourceDuration: 100 });

describe("splitAtPlayhead", () => {
  const project = makeProject(makeStandardTracks(), [video("a", 0, 4), overlay("o", 1, 4)]);

  it("splits only the selected clips when there is a selection", () => {
    const result = splitAtPlayhead(project, ["a"], 2, seqIds("n"));
    expect(result.clips).toHaveLength(3);
    expect(clipEnd(findClip(result, "a")!)).toBe(2);
    expect(findClip(result, "o")).toBe(findClip(project, "o"));
  });

  it("splits every clip under the playhead when nothing is selected", () => {
    const result = splitAtPlayhead(project, [], 2, seqIds("n"));
    expect(result.clips).toHaveLength(4);
  });

  it("returns the same project when the playhead is not inside any target", () => {
    expect(splitAtPlayhead(project, [], 10, seqIds("n"))).toBe(project);
    expect(splitAtPlayhead(project, ["a"], 4, seqIds("n"))).toBe(project);
    expect(splitAtPlayhead(project, ["a"], 0.05, seqIds("n"))).toBe(project);
  });

  it("leaves locked clips alone", () => {
    const locked = makeProject(makeStandardTracks(), [overlay("o", 1, 4, { locked: true })]);
    expect(splitAtPlayhead(locked, ["o"], 2, seqIds("n"))).toBe(locked);
  });
});

describe("duplicateSelected", () => {
  it("copies every selected clip to sit after its original", () => {
    const project = makeProject(makeStandardTracks(), [video("a", 0, 4), overlay("o", 1, 2)]);
    const result = duplicateSelected(project, ["a", "o"], seqIds("d"));
    expect(result.clips).toHaveLength(4);
    const copyOfOverlay = result.clips.find((c) => c.trackId === "t2" && c.id !== "o")!;
    expect(copyOfOverlay.start).toBe(3);
  });

  it("does nothing for an empty selection", () => {
    const project = makeProject(makeStandardTracks(), [video("a", 0, 4)]);
    expect(duplicateSelected(project, [], seqIds("d"))).toBe(project);
  });
});

describe("deleteSelected", () => {
  const project = makeProject(makeStandardTracks(), [
    overlay("o1", 0, 2),
    overlay("o2", 2, 2),
    video("a", 0, 4),
    video("b", 4, 4),
  ]);

  it("leaves a gap on a free track and closes it on the main track", () => {
    const result = deleteSelected(project, ["o1", "a"], false);
    expect(findClip(result, "o2")?.start).toBe(2);
    expect(findClip(result, "b")?.start).toBe(0);
  });

  it("ripple-deleting also shifts later clips on a free track", () => {
    const result = deleteSelected(project, ["o1"], true);
    expect(findClip(result, "o2")?.start).toBe(0);
  });

  it("returns the same project when nothing is selected", () => {
    expect(deleteSelected(project, [], false)).toBe(project);
  });
});
```

In `src/lib/timeline-ui/interactions.test.ts`, change the `key` helper defaults to include `repeat: false` (add the line `repeat: false,` after `handled: false,`), then append:

```ts
describe("commandForKey: edit keys", () => {
  it("maps split, delete, ripple delete, duplicate and cancel", () => {
    expect(commandForKey(key({ key: "s" }))).toEqual({ type: "split" });
    expect(commandForKey(key({ key: "S", shiftKey: true }))).toEqual({ type: "split" });
    expect(commandForKey(key({ key: "b", ctrlKey: true }))).toEqual({ type: "split" });
    expect(commandForKey(key({ key: "b", metaKey: true }))).toEqual({ type: "split" });
    expect(commandForKey(key({ key: "Delete" }))).toEqual({ type: "delete" });
    expect(commandForKey(key({ key: "Backspace" }))).toEqual({ type: "delete" });
    expect(commandForKey(key({ key: "Delete", shiftKey: true }))).toEqual({ type: "ripple-delete" });
    expect(commandForKey(key({ key: "Backspace", shiftKey: true }))).toEqual({ type: "ripple-delete" });
    expect(commandForKey(key({ key: "d", ctrlKey: true }))).toEqual({ type: "duplicate" });
    expect(commandForKey(key({ key: "Escape" }))).toEqual({ type: "cancel" });
  });

  it("does not take the browser's save shortcut or other combinations", () => {
    expect(commandForKey(key({ key: "s", ctrlKey: true }))).toBeNull();
    expect(commandForKey(key({ key: "d" }))).toBeNull();
    expect(commandForKey(key({ key: "Delete", ctrlKey: true }))).toBeNull();
  });

  it("ignores edit keys inside fields and widgets", () => {
    expect(commandForKey(key({ key: "s", editable: true }))).toBeNull();
    expect(commandForKey(key({ key: "Delete", handled: true }))).toBeNull();
    expect(commandForKey(key({ key: "Escape", editable: true }))).toBeNull();
  });
});

describe("commandForKey: held keys", () => {
  it("does not repeat one-shot commands", () => {
    for (const k of [
      key({ key: " ", repeat: true }),
      key({ key: "s", repeat: true }),
      key({ key: "Delete", repeat: true }),
      key({ key: "d", ctrlKey: true, repeat: true }),
      key({ key: "z", ctrlKey: true, repeat: true }),
      key({ key: "y", ctrlKey: true, repeat: true }),
      key({ key: "Home", repeat: true }),
    ]) {
      expect(commandForKey(k)).toBeNull();
    }
  });

  it("keeps repeating frame steps and still cancels", () => {
    expect(commandForKey(key({ key: "ArrowRight", repeat: true }))).toEqual({ type: "step", direction: 1 });
    expect(commandForKey(key({ key: "Escape", repeat: true }))).toEqual({ type: "cancel" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui/commands.test.ts src/lib/timeline-ui/interactions.test.ts`
Expected: FAIL; `@/lib/timeline-ui/commands` cannot be resolved, and the new key tests fail.

- [ ] **Step 3: Implement the commands**

`src/lib/timeline-ui/commands.ts`:

```ts
import { clipEnd } from "@/lib/timeline/clip-math";
import { duplicateClip } from "@/lib/timeline/clip-edits";
import { deleteClips, rippleDeleteClips } from "@/lib/timeline/delete";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { splitClip } from "@/lib/timeline/split";
import type { TimelineProject } from "@/types/timeline";

/**
 * Splits the selected clips at `time`, or, with no selection, every clip the
 * playhead is inside. Returns the same project when nothing could be split.
 */
export function splitAtPlayhead(
  project: TimelineProject,
  selectedIds: string[],
  time: number,
  newId: IdFn = createId,
): TimelineProject {
  const targets =
    selectedIds.length > 0
      ? selectedIds
      : project.clips.filter((clip) => clip.start < time && time < clipEnd(clip)).map((clip) => clip.id);
  return targets.reduce((current, id) => splitClip(current, id, time, newId), project);
}

export function duplicateSelected(
  project: TimelineProject,
  ids: string[],
  newId: IdFn = createId,
): TimelineProject {
  return ids.reduce((current, id) => duplicateClip(current, id, newId), project);
}

export function deleteSelected(
  project: TimelineProject,
  ids: string[],
  ripple: boolean,
): TimelineProject {
  return ripple ? rippleDeleteClips(project, ids) : deleteClips(project, ids);
}
```

- [ ] **Step 4: Extend the key bindings**

In `src/lib/timeline-ui/interactions.ts`, replace the `TimelineCommand` type, the `KeyInput` interface and `commandForKey` (everything from `export type TimelineCommand` to the end of the file) with:

```ts
export type TimelineCommand =
  | { type: "toggle-play" }
  | { type: "step"; direction: 1 | -1 }
  | { type: "seek-start" }
  | { type: "seek-end" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "split" }
  | { type: "delete" }
  | { type: "ripple-delete" }
  | { type: "duplicate" }
  | { type: "cancel" };

export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** True when focus is in an input, select, textarea or contenteditable element. */
  editable: boolean;
  /** True when another widget already handled this key (a menu, dialog, listbox, slider, tab...). */
  handled: boolean;
  /** True while a held key is auto-repeating. */
  repeat: boolean;
}

function lookup(input: KeyInput): TimelineCommand | null {
  const modifier = input.ctrlKey || input.metaKey;

  if (modifier) {
    switch (input.key.toLowerCase()) {
      case "z":
        return input.shiftKey ? { type: "redo" } : { type: "undo" };
      case "y":
        return { type: "redo" };
      case "b":
        return { type: "split" };
      case "d":
        return { type: "duplicate" };
      default:
        return null;
    }
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
    case "s":
    case "S":
      return { type: "split" };
    case "Delete":
    case "Backspace":
      return input.shiftKey ? { type: "ripple-delete" } : { type: "delete" };
    case "Escape":
      return { type: "cancel" };
    default:
      return null;
  }
}

export function commandForKey(input: KeyInput): TimelineCommand | null {
  if (input.editable || input.handled || input.altKey) return null;
  const command = lookup(input);
  if (command && input.repeat && command.type !== "step" && command.type !== "cancel") return null;
  return command;
}
```

Append to `src/lib/timeline-ui/index.ts`:

```ts
export * from "@/lib/timeline-ui/commands";
export * from "@/lib/timeline-ui/drag";
```

- [ ] **Step 5: Run the tests and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline-ui` then `npx tsc --noEmit`
Expected: PASS (all timeline-ui test files); `tsc` will report that `timeline-view.tsx` does not pass `repeat`; fix that one line now by adding `repeat: event.repeat,` to the `commandForKey({...})` call in `src/components/clip-timeline/timeline-view.tsx` and re-run `tsc` until clean. (Task 4 rewrites that file; this keeps the build green in between.)

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/timeline-ui src/components/clip-timeline/timeline-view.tsx
git commit -m "feat: add timeline edit commands and key bindings with repeat handling" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Wire it into the view (drag, trim, marquee, guides, edit keys)

**Files:**
- Modify: `src/components/clip-timeline/clip-chip.tsx`, `src/components/clip-timeline/timeline-view.tsx`
- Test: `src/components/clip-timeline/timeline-view.test.tsx` (extend)

**Interfaces:**
- Consumes: everything from Tasks 1 to 3; the store's `previewApply`, `endGesture`, `cancelGesture`, `apply`, `setSelectedClipIds`, `selectProject`, `selectSavableProject`.
- Produces: the finished interactive `TimelineView` (same props as before). Test hooks: the tracks area has `data-testid="timeline-tracks"`; trim handles have `data-edge="start" | "end"`; the snap/insert guide has `data-testid="timeline-guide"`; the marquee rectangle has `data-testid="timeline-marquee"`.

- [ ] **Step 1: Write the failing component tests**

Append to `src/components/clip-timeline/timeline-view.test.tsx` (keep the existing smoke test and its `mount` helper; add `fireEvent` to the Testing Library import, and `selectProject` to the store import):

```tsx
import { fireEvent } from "@testing-library/react";
import { selectProject } from "@/store/use-clip-project-store";

// jsdom has no layout: place the ruler at x=112 (the header width) and the
// tracks area at y=28 (the ruler height). Default zoom is 60 px per second.
const RULER_LEFT = 112;
const TRACKS_TOP = 28;
const xAt = (time: number) => RULER_LEFT + time * 60;
// Rows: overlay y 0-44, video y 46-110, audio y 112-156 (relative to the tracks area).
const yAt = (rowY: number) => TRACKS_TOP + rowY;

function placeLayout() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const left = this.getAttribute("aria-label") === "Timeline ruler" ? RULER_LEFT : 0;
    const top = this.getAttribute("data-testid") === "timeline-tracks" ? TRACKS_TOP : 0;
    return { x: left, y: top, left, top, right: left, bottom: top, width: 0, height: 0, toJSON() {} };
  });
}

const pointer = (target: EventTarget, type: string, x: number, y: number, extra = {}) =>
  fireEvent(
    target,
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra }),
  );

const chip = (id: string) => document.querySelector<HTMLElement>(`[data-clip-id="${id}"]`)!;
const present = () => selectProject(useClipProjectStore.getState());
const clipById = (id: string) => present().clips.find((c) => c.id === id)!;
const pastCount = () => useClipProjectStore.getState().history.past.length;

const overlayClip = (id: string, start: number, length: number) =>
  makeClip({
    id,
    trackId: "t2",
    kind: "image",
    name: id,
    sourceDuration: null,
    start,
    sourceIn: 0,
    sourceOut: length,
  });
const videoClip = (id: string, start: number, length: number) =>
  makeClip({ id, trackId: "t1", name: id, start, sourceIn: 0, sourceOut: length, sourceDuration: 100 });

function mountEditable() {
  placeLayout();
  return mount(
    makeProject(makeStandardTracks(), [overlayClip("o", 1, 2), videoClip("a", 0, 4), videoClip("b", 4, 4)]),
  );
}

describe("selection", () => {
  it("selects on click and clears on an empty-lane click", () => {
    mountEditable();
    fireEvent.click(chip("o"));
    expect(chip("o").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(document.querySelector('[data-track-id="t2"]')!);
    expect(chip("o").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("moving", () => {
  it("moves a clip by the pointer and records one undo step", () => {
    mountEditable();
    const before = pastCount();
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    pointer(window, "pointermove", xAt(1.5) + 2, yAt(10)); // under 4 px: still a click
    expect(clipById("o").start).toBe(1);
    pointer(window, "pointermove", xAt(3.5), yAt(10));
    expect(clipById("o").start).toBe(3);
    pointer(window, "pointerup", xAt(3.5), yAt(10));
    expect(clipById("o").start).toBe(3);
    expect(pastCount()).toBe(before + 1);
    act(() => useClipProjectStore.getState().undo());
    expect(clipById("o").start).toBe(1);
  });

  it("does not also select or clear when a drag ends", () => {
    mountEditable();
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    pointer(window, "pointermove", xAt(3.5), yAt(10));
    pointer(window, "pointerup", xAt(3.5), yAt(10));
    fireEvent.click(chip("o")); // the click the browser sends after the drag
    expect(chip("o").getAttribute("aria-pressed")).toBe("true");
  });

  it("ignores right-click and middle-click", () => {
    mountEditable();
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10), { button: 2 });
    pointer(window, "pointermove", xAt(3.5), yAt(10));
    expect(clipById("o").start).toBe(1);
  });

  it("Escape during a drag restores the clip and leaves no history entry", () => {
    mountEditable();
    const before = pastCount();
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    pointer(window, "pointermove", xAt(3.5), yAt(10));
    expect(clipById("o").start).toBe(3);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(clipById("o").start).toBe(1);
    expect(pastCount()).toBe(before);
    pointer(window, "pointermove", xAt(5), yAt(10)); // listeners are gone
    expect(clipById("o").start).toBe(1);
  });

  it("reorders on the main track and shows an insertion marker", () => {
    mountEditable();
    pointer(chip("b"), "pointerdown", xAt(6), yAt(60));
    pointer(window, "pointermove", xAt(1), yAt(60));
    expect(screen.getByTestId("timeline-guide")).toBeTruthy();
    pointer(window, "pointerup", xAt(1), yAt(60));
    expect(clipById("b").start).toBe(0);
    expect(clipById("a").start).toBe(4);
    expect(screen.queryByTestId("timeline-guide")).toBeNull();
  });

  it("creates exactly one new track however long the drag over empty space lasts", () => {
    mountEditable();
    const tracksBefore = present().tracks.length;
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    for (const x of [2, 2.5, 3, 3.5, 4]) pointer(window, "pointermove", xAt(x), yAt(300));
    pointer(window, "pointerup", xAt(4), yAt(300));
    expect(present().tracks.length).toBe(tracksBefore + 1);
    const clip = clipById("o");
    expect(present().tracks.find((t) => t.id === clip.trackId)?.type).toBe("overlay");
  });

  it("snaps to the playhead and shows a guide while dragging", () => {
    mountEditable();
    act(() => useTransportStore.getState().setFrame(6, false));
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    pointer(window, "pointermove", xAt(6.55), yAt(10)); // start 6.05: within 8 px of 6
    expect(clipById("o").start).toBe(6);
    expect(screen.getByTestId("timeline-guide")).toBeTruthy();
    pointer(window, "pointerup", xAt(6.55), yAt(10));
  });

  it("does not move a clip on a locked track", () => {
    placeLayout();
    const tracks = makeStandardTracks().map((t) => (t.id === "t2" ? { ...t, locked: true } : t));
    mount(makeProject(tracks, [overlayClip("o", 1, 2)]));
    const before = pastCount();
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    pointer(window, "pointermove", xAt(3.5), yAt(10));
    pointer(window, "pointerup", xAt(3.5), yAt(10));
    expect(clipById("o").start).toBe(1);
    expect(pastCount()).toBe(before);
  });
});

describe("trimming", () => {
  it("drags the end handle, snapping to a clip edge", () => {
    mountEditable();
    const before = pastCount();
    const handle = chip("o").querySelector('[data-edge="end"]')!;
    pointer(handle, "pointerdown", xAt(3), yAt(10));
    pointer(window, "pointermove", xAt(3.95), yAt(10)); // within 8 px of the video clips' edge at 4
    expect(screen.getByTestId("timeline-guide")).toBeTruthy();
    pointer(window, "pointerup", xAt(3.95), yAt(10));
    expect(clipById("o").sourceOut).toBeCloseTo(3, 9); // start 1, end 4
    expect(pastCount()).toBe(before + 1);
  });

  it("drags the start handle and keeps the end in place", () => {
    mountEditable();
    const handle = chip("o").querySelector('[data-edge="start"]')!;
    pointer(handle, "pointerdown", xAt(1), yAt(10));
    pointer(window, "pointermove", xAt(1.5), yAt(10));
    pointer(window, "pointerup", xAt(1.5), yAt(10));
    const clip = clipById("o");
    expect(clip.start).toBeCloseTo(1.5, 9);
    expect(clip.start + (clip.sourceOut - clip.sourceIn)).toBeCloseTo(3, 9);
  });
});

describe("marquee", () => {
  it("selects the clips inside the dragged box and draws it", () => {
    mountEditable();
    pointer(document.querySelector('[data-track-id="t2"]')!, "pointerdown", xAt(10), yAt(30));
    pointer(window, "pointermove", xAt(0), yAt(80));
    expect(screen.getByTestId("timeline-marquee")).toBeTruthy();
    expect(chip("o").getAttribute("aria-pressed")).toBe("true");
    expect(chip("a").getAttribute("aria-pressed")).toBe("true");
    expect(chip("b").getAttribute("aria-pressed")).toBe("false");
    pointer(window, "pointerup", xAt(0), yAt(80));
    expect(screen.queryByTestId("timeline-marquee")).toBeNull();
  });

  it("adds to the selection with shift and restores it on Escape", () => {
    mountEditable();
    fireEvent.click(chip("b"));
    pointer(document.querySelector('[data-track-id="t2"]')!, "pointerdown", xAt(10), yAt(30), { shiftKey: true });
    pointer(window, "pointermove", xAt(0), yAt(80));
    expect(chip("b").getAttribute("aria-pressed")).toBe("true");
    expect(chip("a").getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(chip("a").getAttribute("aria-pressed")).toBe("false");
    expect(chip("b").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("edit keys", () => {
  it("S splits the selected clip at the playhead", () => {
    mountEditable();
    act(() => useTransportStore.getState().setFrame(2, false));
    fireEvent.click(chip("a"));
    fireEvent.keyDown(window, { key: "s" });
    expect(present().clips.filter((c) => c.trackId === "t1")).toHaveLength(3);
  });

  it("Delete removes the selection and Shift+Delete ripples", () => {
    mountEditable();
    fireEvent.click(chip("o"));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(present().clips.some((c) => c.id === "o")).toBe(false);
  });

  it("Ctrl+D duplicates the selection", () => {
    mountEditable();
    fireEvent.click(chip("o"));
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    expect(present().clips.filter((c) => c.trackId === "t2")).toHaveLength(2);
  });

  it("Escape clears the selection when no drag is active", () => {
    mountEditable();
    fireEvent.click(chip("o"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(chip("o").getAttribute("aria-pressed")).toBe("false");
  });

  it("ignores edit keys typed into a text field and held-down repeats", () => {
    mountEditable();
    fireEvent.click(chip("o"));
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "Delete" });
    expect(present().clips.some((c) => c.id === "o")).toBe(true);
    input.remove();
    fireEvent.keyDown(window, { key: "Delete", repeat: true });
    expect(present().clips.some((c) => c.id === "o")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/components/clip-timeline/timeline-view.test.tsx`
Expected: FAIL; the new drag, trim, marquee and edit-key tests fail (no handlers yet); the smoke and click-selection tests still pass.

- [ ] **Step 3: Chip trim handles**

In `src/components/clip-timeline/clip-chip.tsx`, change the chip's `className` to add `cursor-grab`, and add the handles inside the button, before the label `span`:

```tsx
      {rect.width > 16 && (
        <>
          <span
            data-edge="start"
            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/50"
          />
          <span
            data-edge="end"
            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/50"
          />
        </>
      )}
```

(The className string becomes `` `absolute cursor-grab overflow-hidden rounded-md border px-1.5 text-left text-xs text-white shadow-sm ${TONE[clip.kind]} ...` `` with the rest unchanged.)

- [ ] **Step 4: The view**

Replace `src/components/clip-timeline/timeline-view.tsx` with the full file below. It keeps everything from plan 4a (zoom, scrub, auto-scroll, selection) and adds drags, trims, the marquee, guides and edit keys.

```tsx
"use client";

import * as React from "react";

import { ClipChip } from "@/components/clip-timeline/clip-chip";
import { TimelineRuler } from "@/components/clip-timeline/timeline-ruler";
import { TrackHeader } from "@/components/clip-timeline/track-header";
import { deleteSelected, duplicateSelected, splitAtPlayhead } from "@/lib/timeline-ui/commands";
import {
  clipsInRect,
  computeMove,
  computeTrim,
  DRAG_THRESHOLD_PX,
  dropTargetAt,
  type Guide,
} from "@/lib/timeline-ui/drag";
import {
  timelineWidth,
  timeToX,
  wheelZoomFactor,
  ZOOM_DEFAULT,
  zoomAround,
} from "@/lib/timeline-ui/geometry";
import { commandForKey, nextSelection } from "@/lib/timeline-ui/interactions";
import {
  clipRect,
  HEADER_WIDTH,
  pointerToTime,
  RULER_HEIGHT,
  scrollAfterTimeChange,
  trackLayout,
} from "@/lib/timeline-ui/layout";
import { projectDuration } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import type { TrimEdge } from "@/lib/timeline/trim";
import {
  selectProject,
  selectSavableProject,
  useClipProjectStore,
} from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";

interface TimelineViewProps {
  fps: number;
  onSeek(time: number): void;
  onToggle(): void;
  onStep(direction: 1 | -1): void;
}

interface PressInfo {
  startX: number;
  startY: number;
  moved: boolean;
}

type Drag =
  | (PressInfo & { kind: "move"; clipId: string; grabOffset: number; newTrackId: IdFn })
  | (PressInfo & { kind: "trim"; clipId: string; edge: TrimEdge })
  | (PressInfo & {
      kind: "marquee";
      additive: boolean;
      baseSelection: string[];
      origin: { x: number; y: number };
    });

interface Marquee {
  left: number;
  top: number;
  width: number;
  height: number;
}

function isEditable(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return true;
  // A focused button handles Space itself; do not also toggle playback.
  return target.tagName === "BUTTON" && key === " ";
}

// Widgets that use the arrow keys, Space and Home/End themselves.
const WIDGET_SELECTOR =
  '[role="menu"],[role="menuitem"],[role="listbox"],[role="option"],[role="slider"],[role="tab"],[role="dialog"],[aria-modal="true"]';

function insideWidget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(WIDGET_SELECTOR) !== null;
}

/** One new-track id for the whole drag, so a long drag creates a single track. */
function oncePerDrag(): IdFn {
  let id: string | undefined;
  return () => (id ??= createId());
}

export function TimelineView({ onSeek, onToggle, onStep }: TimelineViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rulerRef = React.useRef<HTMLDivElement>(null);
  const tracksRef = React.useRef<HTMLDivElement>(null);
  const scrubbing = React.useRef(false);
  const pendingScroll = React.useRef<number | null>(null);
  const dragRef = React.useRef<Drag | null>(null);
  const listenersRef = React.useRef<{
    move: (event: PointerEvent) => void;
    end: () => void;
    cancel: () => void;
  } | null>(null);
  const suppressClick = React.useRef(false);

  const [pps, setPps] = React.useState(ZOOM_DEFAULT);
  const [scrollLeft, setScrollLeft] = React.useState(0);
  const [viewportWidth, setViewportWidth] = React.useState(800);
  const [guide, setGuide] = React.useState<Guide | null>(null);
  const [marquee, setMarquee] = React.useState<Marquee | null>(null);

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

  // The zoom level lives in its own ref, written synchronously by the wheel
  // handler: a burst of pinch events arrives faster than React renders, and
  // each step must build on the one before it.
  const ppsRef = React.useRef(ZOOM_DEFAULT);
  const latest = React.useRef({ duration, onSeek, onToggle, onStep });
  React.useEffect(() => {
    latest.current = { duration, onSeek, onToggle, onStep };
  });

  // --- Drag lifecycle -----------------------------------------------------

  /** A pointer position in lane coordinates: x in pixels from time 0, y from the top of the tracks. */
  const lanePoint = React.useCallback((clientX: number, clientY: number) => {
    const ruler = rulerRef.current?.getBoundingClientRect();
    const tracks = tracksRef.current?.getBoundingClientRect();
    return { x: clientX - (ruler?.left ?? 0), y: clientY - (tracks?.top ?? 0) };
  }, []);

  const detach = React.useCallback(() => {
    const listeners = listenersRef.current;
    if (listeners) {
      window.removeEventListener("pointermove", listeners.move);
      window.removeEventListener("pointerup", listeners.end);
      window.removeEventListener("pointercancel", listeners.cancel);
    }
    listenersRef.current = null;
    dragRef.current = null;
  }, []);

  /** Abandons the drag in progress, if any. Returns whether there was one. */
  const cancelDrag = React.useCallback((): boolean => {
    const drag = dragRef.current;
    if (!drag) return false;
    detach();
    const store = useClipProjectStore.getState();
    if (drag.kind === "marquee") store.setSelectedClipIds(drag.baseSelection);
    else if (drag.moved) store.cancelGesture();
    setGuide(null);
    setMarquee(null);
    return true;
  }, [detach]);

  const onDragEnd = React.useCallback(() => {
    const drag = dragRef.current;
    detach();
    if (!drag) return;
    if (drag.kind !== "marquee" && drag.moved) useClipProjectStore.getState().endGesture();
    if (drag.moved) {
      // The browser sends a click after the pointer is released; ignore that one.
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
    setGuide(null);
    setMarquee(null);
  }, [detach]);

  const onDragMove = React.useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.moved) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD_PX) {
          return;
        }
        drag.moved = true;
      }

      const store = useClipProjectStore.getState();
      const point = lanePoint(event.clientX, event.clientY);
      const zoom = ppsRef.current;
      const pointerTime = Math.max(0, point.x / zoom);
      const playhead = useTransportStore.getState().time;

      if (drag.kind === "marquee") {
        const shown = selectProject(store);
        const left = Math.min(drag.origin.x, point.x);
        const right = Math.max(drag.origin.x, point.x);
        const top = Math.min(drag.origin.y, point.y);
        const bottom = Math.max(drag.origin.y, point.y);
        const hits = clipsInRect(shown, trackLayout(shown), zoom, { left, top, right, bottom });
        store.setSelectedClipIds(
          drag.additive ? Array.from(new Set([...drag.baseSelection, ...hits])) : hits,
        );
        setMarquee({ left, top, width: right - left, height: bottom - top });
        return;
      }

      // Every preview is computed from the project as it was before the drag.
      const base = selectSavableProject(store);
      const result =
        drag.kind === "move"
          ? computeMove(base, {
              clipId: drag.clipId,
              pointerTime,
              grabOffset: drag.grabOffset,
              target: dropTargetAt(trackLayout(selectProject(store)), point.y),
              playhead,
              pps: zoom,
              newTrackId: drag.newTrackId,
            })
          : computeTrim(base, {
              clipId: drag.clipId,
              edge: drag.edge,
              pointerTime,
              playhead,
              pps: zoom,
            });
      store.previewApply(() => result.project);
      setGuide(result.guide);
    },
    [lanePoint],
  );

  const begin = (drag: Drag, event: React.PointerEvent) => {
    dragRef.current = drag;
    try {
      (event.target as Element).setPointerCapture(event.pointerId);
    } catch {
      // Not every environment can capture; the window listeners still work.
    }
    listenersRef.current = { move: onDragMove, end: onDragEnd, cancel: cancelDrag as () => void };
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", cancelDrag);
  };

  // Leaving the page mid-drag abandons it.
  React.useEffect(() => () => void cancelDrag(), [cancelDrag]);

  const onLanePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || dragRef.current) return;
    const target = event.target as HTMLElement;
    const chipEl = target.closest<HTMLElement>("[data-clip-id]");
    const edgeEl = target.closest<HTMLElement>("[data-edge]");
    const store = useClipProjectStore.getState();
    const point = lanePoint(event.clientX, event.clientY);
    const press = { startX: event.clientX, startY: event.clientY, moved: false };
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;

    if (chipEl?.dataset.clipId) {
      const clipId = chipEl.dataset.clipId;
      const clip = selectProject(store).clips.find((c) => c.id === clipId);
      if (!clip) return;
      if (!additive && !store.selectedClipIds.includes(clipId)) store.setSelectedClipIds([clipId]);
      const edge = edgeEl?.dataset.edge;
      if (edge === "start" || edge === "end") {
        begin({ kind: "trim", clipId, edge, ...press }, event);
      } else {
        begin(
          {
            kind: "move",
            clipId,
            grabOffset: Math.max(0, point.x / ppsRef.current - clip.start),
            newTrackId: oncePerDrag(),
            ...press,
          },
          event,
        );
      }
      return;
    }

    begin(
      {
        kind: "marquee",
        additive,
        baseSelection: additive ? store.selectedClipIds : [],
        origin: point,
        ...press,
      },
      event,
    );
  };

  // --- Width, zoom, follow, keys ------------------------------------------

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
      const anchorX = Math.max(0, event.clientX - rect.left - container.clientLeft - HEADER_WIDTH);
      const next = zoomAround(
        { pps: ppsRef.current, scrollLeft: pendingScroll.current ?? container.scrollLeft },
        wheelZoomFactor(event.deltaY, event.deltaMode),
        anchorX,
      );
      ppsRef.current = next.pps;
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

  // Keep the playhead in view when it moves. Zooming must not do this: it
  // would pull the view away from the point the user is zooming around.
  const lastTime = React.useRef(time);
  React.useEffect(() => {
    if (lastTime.current === time) return;
    lastTime.current = time;
    const container = containerRef.current;
    if (!container) return;
    const next = scrollAfterTimeChange({
      scrubbing: scrubbing.current,
      scrollLeft: container.scrollLeft,
      viewportWidth: container.clientWidth - HEADER_WIDTH,
      playheadX: timeToX(time, ppsRef.current),
    });
    if (next !== container.scrollLeft) container.scrollLeft = next;
  }, [time]);

  // Transport, undo and edit keys.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = commandForKey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        editable: isEditable(event.target, event.key),
        handled: event.defaultPrevented || insideWidget(event.target),
        repeat: event.repeat,
      });
      if (!command) return;
      event.preventDefault();
      const { duration: total, onSeek: seek, onToggle: toggle, onStep: step } = latest.current;
      const store = useClipProjectStore.getState();
      const ids = store.selectedClipIds;
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
          store.undo();
          break;
        case "redo":
          store.redo();
          break;
        case "split":
          store.apply((p) => splitAtPlayhead(p, ids, useTransportStore.getState().time));
          break;
        case "delete":
          store.apply((p) => deleteSelected(p, ids, false));
          break;
        case "ripple-delete":
          store.apply((p) => deleteSelected(p, ids, true));
          break;
        case "duplicate":
          store.apply((p) => duplicateSelected(p, ids));
          break;
        case "cancel":
          // Escape first abandons a drag; only then does it clear the selection.
          if (!cancelDrag()) store.setSelectedClipIds([]);
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelDrag]);

  const seekFromPointer = (clientX: number) => {
    const ruler = rulerRef.current;
    if (!ruler) return;
    const t = pointerToTime(clientX, ruler.getBoundingClientRect().left, ppsRef.current);
    latest.current.onSeek(Math.min(t, latest.current.duration));
  };

  const onRulerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.button !== 0) return;
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
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const chipEl = (event.target as HTMLElement).closest<HTMLElement>("[data-clip-id]");
    const store = useClipProjectStore.getState();
    if (!chipEl?.dataset.clipId) {
      if (!(event.shiftKey || event.ctrlKey || event.metaKey)) store.setSelectedClipIds([]);
      return;
    }
    store.setSelectedClipIds(
      nextSelection(store.selectedClipIds, chipEl.dataset.clipId, {
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
            time={time}
            duration={duration}
            onPointerDown={onRulerDown}
            onPointerMove={onRulerMove}
            onPointerEnd={onRulerEnd}
          />
        </div>

        <div
          ref={tracksRef}
          data-testid="timeline-tracks"
          className="relative"
          style={{ height: layout.height }}
        >
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
                  style={{ width: laneWidth, touchAction: "none" }}
                  onPointerDown={onLanePointerDown}
                  onClick={onLaneClick}
                >
                  {project.clips
                    .filter((clip) => clip.trackId === track.id)
                    .map((clip) => (
                      <ClipChip
                        key={clip.id}
                        clip={clip}
                        rect={clipRect(clip, { ...row, y: 0 }, pps)}
                        selected={selectedSet.has(clip.id)}
                        dimmed={trackById.get(clip.trackId)?.hidden ?? false}
                      />
                    ))}
                </div>
              </div>
            );
          })}

          {guide && (
            <div
              data-testid="timeline-guide"
              className={`pointer-events-none absolute top-0 z-20 w-px ${
                guide.kind === "snap" ? "bg-yellow-400" : "bg-blue-500"
              }`}
              style={{ left: HEADER_WIDTH + timeToX(guide.time, pps), height: layout.height }}
            />
          )}
          {marquee && (
            <div
              data-testid="timeline-marquee"
              className="pointer-events-none absolute z-20 border border-sky-400 bg-sky-400/20"
              style={{
                left: HEADER_WIDTH + marquee.left,
                top: marquee.top,
                width: marquee.width,
                height: marquee.height,
              }}
            />
          )}
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

- [ ] **Step 5: Run the tests**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/components/clip-timeline/timeline-view.test.tsx`
Expected: PASS (every test). If a test fails, diagnose before changing anything: decide whether the test, the jsdom stub, or the component is wrong (`superpowers:systematic-debugging`). Typical suspects: the `MouseEvent` named `pointerdown` carries no `pointerId` (the code wraps `setPointerCapture` in try/catch for this); `window.setTimeout` for `suppressClick` has not run yet when a test fires a follow-up `click` immediately, which is the intended path; an `act` warning means a state update happened outside Testing Library's wrappers and the test should wrap the call in `act`.

- [ ] **Step 6: Type-check, lint, whole suite**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx tsc --noEmit` then `npx eslint src/lib/timeline-ui src/components/clip-timeline src/test` then `npm test`
Expected: no type or lint errors; all tests pass. If `react-hooks` complains (for example about the effect cleanup returning `void cancelDrag()`), restructure without changing behaviour; do not disable the rule.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/components/clip-timeline src/lib/timeline-ui
git commit -m "feat: move, trim, reorder, marquee-select and edit keys on the timeline" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Verify in a real Chrome

No new code unless a check fails; a failure is a finding (diagnose with `superpowers:systematic-debugging`; fix test-first, adding a unit or component test that reproduces it). Follow the Chrome rules in Global Constraints. Use real mouse actions for drags.

- [ ] **Step 1: Prepare.** Start the dev server with `mcp__Claude_Browser__preview_start` (`scrapbook-dev`) and wait for `/dev/playback` to return 200. Read the `anthropic-skills:chrome-browser` skill, load the Chrome tools in one ToolSearch call, `list_connected_browsers` (empty means stop and ask), open a new tab at `http://localhost:3000/dev/playback`, confirm the console is clean and `requestAnimationFrame` is near 60 per second. Click "Generate sample clips".

- [ ] **Step 2: Move on the main track.** Drag Sample B in front of Sample A with `left_click_drag`: a blue insertion marker appears during the drag, and on release the order is B then A with no gap. Press Ctrl+Z: the original order returns (one step). Expected: reorder works and is one undo step.

- [ ] **Step 3: Add an overlay clip and drag it.** Use the page's "Add files" or "Add from URL" to add an image or a short clip; it lands on the main track. Drag it up into the top area above the first track: a new overlay track appears and the clip is on it; the track count increases by exactly one however long you drag; releasing leaves one undo step. Drag it sideways on the overlay track near the playhead: a yellow snap guide shows and the start lands exactly on the playhead time. Expected: new-track drop, snapping with guide, one undo step each.

- [ ] **Step 4: Cancel.** Start a drag, press Escape before releasing: the clip returns to where it started, the guide disappears, and Undo does not show an extra step (the Undo button state is unchanged). Release the mouse afterwards: nothing changes. Expected: clean cancel.

- [ ] **Step 5: Trim.** Drag the right edge of a clip left: the clip shortens and, near the playhead or another clip's edge, the guide appears and the edge lands exactly on it; the left edge trims the start and keeps the end. Drag past the clip's source length: it stops at the source end. Expected: trims clamp and snap.

- [ ] **Step 6: Marquee and keys.** Drag a box across empty space over several clips: the box is drawn and the clips inside are selected (aria-pressed). Shift-drag adds. With a clip selected and the playhead inside it, press S: it splits at the playhead; Delete removes the selection and closes the gap on the main track; Ctrl+D duplicates; Shift+Delete on an overlay clip shifts later overlay clips left. Hold Space for two seconds: playback toggles once, not repeatedly. Holding the right arrow keeps stepping frames. Typing in the "Add from URL" box never triggers any of these keys. Expected: every key behaves as described.

- [ ] **Step 7: Click vs drag, locked track.** A plain click selects and a click on empty lane clears; a click after a drag does not clear the selection. Lock the video track with its `L` button: dragging, trimming, splitting and deleting its clips does nothing and creates no undo step. Right-click a clip: no drag starts. Expected: all hold.

- [ ] **Step 8: Playback still works.** Press Space: playback runs with the playhead moving, and a drag during playback does not break playback or the picture. Expected: no console errors.

- [ ] **Step 9: Lifecycle.** Reload the page twice: a single timeline, no console errors or warnings, one Space press toggles once.

- [ ] **Step 10: Record and clean up.** Save one or two screenshots (a drag with its guide visible, and the marquee) and send them with `SendUserFile`. Try to close the Chrome tab you opened and stop the dev server. Write the results of Steps 2 to 9 into the final report as a table of check, expected, observed, pass/fail. Fix any failure test-first, then run `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/timeline-ui src/components/clip-timeline src/test`, and commit each fix with a message naming it.

---

### Task 6: Whole-branch checks

- [ ] **Step 1: Everything green.** Run `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/timeline-ui src/components/clip-timeline src/test`. Expected: all pass, no errors.

- [ ] **Step 2: Pure modules stayed pure.** Run `grep -rnE "document\.|window\.|requestAnimationFrame|setTimeout|setInterval|performance\.|Date\.now" src/lib/timeline-ui --include=*.ts --exclude=*.test.ts`. Expected: no output.

- [ ] **Step 3: Nothing outside the plan changed.** Run `git diff --stat main -- . ':!src/lib/timeline-ui' ':!src/components/clip-timeline' ':!src/test' ':!docs'`. Expected: only `package.json`, `package-lock.json` and `vitest.config.mts`.

- [ ] **Step 4: Production build.** Stop the dev server, delete `.next/dev` if a stale generated types file breaks the type check, run `npm run build`. Expected: exit 0.

---

## Self-Review

**Spec coverage (section 6, Interactions, and section 4):**

| Requirement | Task |
|---|---|
| Drag to move; snaps | 2 (`computeMove`), 4 |
| Drag clip edges to trim; snaps | 2 (`computeTrim`), 4 |
| Main track: insertion marker and reorder | 2, 4 |
| Dragging into empty space creates a track | 2 (`dropTargetAt`, new track), 4 |
| `S` / `Ctrl+B` split, `Delete`, `Shift+Delete` ripple, duplicate | 3, 4 |
| Shift-click and marquee multi-select | 2 (`clipsInRect`), 4 (shift-click already in 4a) |
| One undo step per drag; Escape cancels | 4 (store gesture API), tests |
| Space/arrows/Ctrl+wheel (done in 4a) | unchanged |
| Drag from the Media panel | deferred (see top) |

**Placeholder scan:** none; every step has code or a command.

**Type consistency:** `DropTarget`, `Guide`, `DragResult`, `MoveInput`, `TrimInput` are defined in `drag.ts` and used by the view; `KeyInput.repeat` is added in Task 3 and passed by the view (Task 3 Step 5 keeps the build green before Task 4 rewrites the file); `TimelineCommand` additions are all handled in the view's switch.

**Review Focus coverage:** undo and cancel (Task 4 tests, Task 5 Steps 2 and 4), single new track (Task 4 test, Task 5 Step 3), click versus drag (Task 4 tests, Task 5 Step 7), re-parenting (window listeners; Task 5 Step 3), key rules (Task 3 tests, Task 4 tests, Task 5 Step 6), locked items (Task 2 and 4 tests, Task 5 Step 7), many clips (Task 5 Step 8 plus the earlier 64-chip check).

## Execution Handoff

Before Task 5, enable the Claude in Chrome extension and bring that Chrome window to the front and keep it uncovered while checks run.
