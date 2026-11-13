# Studio Shell (Editor Port, Slice 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working editor on the new clip timeline, built beside the old one. You open a project, see the stage with frame-accurate playback, add photos, videos and music from your media library (as a sequence, as an overlay for collages, or as audio), select, drag, resize and rotate things directly on the stage with snapping, edit on the timeline underneath, undo and redo, and everything is saved automatically. Text, stickers, adjustments, templates and export come in later slices.

**Architecture:** Pure, unit-tested editing operations (`src/lib/editor/`), a media-URL store (resolves and refreshes signed URLs, tested with fakes), and an in-memory timeline storage for development. The React layer is a `StudioView` that takes everything environment-specific through one `StudioEnv` object, so the same view runs against Supabase (the real route `/studio/[id]`) and against memory and local files (the developer harness `/dev/studio`, a 404 in production). The stage is the existing Konva painter for content plus a new non-drawing Konva layer for selection, move, resize and rotate, which drives the store's gesture API so each drag is one undo step. The timeline from plans 4a to 4c is mounted underneath.

**Tech Stack:** TypeScript (strict), Vitest (node and jsdom), React 19, react-konva and Konva (existing), zustand, Tailwind and the existing `ui/` components. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-30-editor-port-design.md` (slice 1), building on `2026-10-14-clip-timeline-design.md`.

**Not in this plan (later slices):** text, stickers and the assets and layers tabs, photo/video/audio inspector panels, keyframes UI, templates and the new-project dialog, export, version history, the welcome tour, mobile layout, removing the old editor. The stage has no zoom or pan yet (it always fits the frame). Dragging a clip that has keyframes is disabled on the stage until the keyframes slice.

**Decisions made here (the builder's calls):**
- Each new overlay element gets its own overlay track on top; "in front" means "on a track above" (design decision 1).
- Deleting clips removes tracks that become empty (except the main video track). Dragging a clip away on the timeline still leaves its old track behind; that is fixed together with the layers slice, because it changes the timeline's drag tests.
- Photos and videos added with the main button go to the end of the main sequence, fitted inside the frame; "Overlay" puts one on its own track at the playhead at 40% of the frame; music goes on the audio track at the playhead; stills last 5 seconds.
- The frame size is chosen from the existing four presets in the toolbar and saved separately from the timeline (as the old editor did).
- `/studio` becomes a protected route like `/editor`.

## Global Constraints

- Work on branch `feature/studio-shell` (already created from `main`; the design and this plan are its first commits). Never commit to `main`.
- AGENTS.md says this is not the Next.js you know. Before writing the route files, read the relevant guides in `node_modules/next/dist/docs/` (routing, `notFound`, client components with `dynamic` and `ssr: false`). The repo's existing pattern is a server `page.tsx` that renders a client wrapper which `dynamic`-imports the view with `ssr: false`; follow it exactly (see `src/app/editor/[id]/` and `src/app/dev/playback/`).
- Pure files in `src/lib/editor/` and the new `media-url-store.ts` / `memory-timeline-storage.ts` must pass: `grep -rnE "document\.|window\.|requestAnimationFrame|setTimeout|setInterval|performance\.|Date\.now|new Image|localStorage" src/lib/editor src/lib/sync/media-url-store.ts src/lib/sync/memory-timeline-storage.ts --include=*.ts --exclude=*.test.ts` with no output (clocks are injected).
- Existing files this plan may change: `src/lib/timeline/tracks.ts` (+ its test), `src/lib/timeline-ui/commands.ts` (+ its test), `src/lib/sync/media-urls.ts` (export one helper), `src/hooks/use-timeline-sync.ts`, `src/lib/supabase/middleware.ts` (protected prefixes), `src/lib/timeline-ui/index.ts`. The old editor files are not touched.
- The old editor is frozen from here on; do not edit anything under `src/components/canvas/`, `src/components/timeline/`, or the old stores.
- Never let a drag, a keystroke or playback wait on network calls, thumbnails or saving.
- Run tests with `npx vitest run <file>`; type-check with `npx tsc --noEmit`; lint with `npx eslint <paths>`. If `node` is not found, run `export PATH="$PATH:/c/Program Files/nodejs"` (bash) or `$env:Path += ";C:\Program Files\nodejs"` (PowerShell). Start shell commands with an absolute `cd` into the repo.
- Write files with the Write/Edit tools; Python is not installed. Avoid large shell heredocs (they failed to parse before); use the Write tool for multi-line files.
- Component test files start with `// @vitest-environment jsdom` and `import "@/test/dom-setup";`. react-konva needs a real canvas, so it is not unit-tested; its logic lives in pure functions that are.
- End every commit message with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (second `-m`).
- Browser work (Task 9): read the `anthropic-skills:chrome-browser` skill first; use a new tab; if `list_connected_browsers` is empty, use the built-in browser for everything that does not depend on animation frames and ask the user to connect Chrome for the rest. A covered Chrome window throttles `requestAnimationFrame` to about 2 fps: measure it before trusting playback results. Real drags need real mouse actions.

## Review Focus

- **One drag, one undo step:** moving, resizing and rotating one or several clips on the stage each commit as a single history entry; Escape or losing the pointer never leaves a half-moved clip or an open gesture; a multi-select drag moves every selected clip together and none is lost.
- **Stage and painter agree:** the selection box sits exactly on what is drawn, at any frame size and window size, including rotated clips and clips partly outside the frame.
- **Locked, hidden and animated clips:** a locked clip cannot be dragged or resized; a clip on a hidden track has no hit area; a clip with keyframes is selectable but not draggable.
- **Environment seam:** the real route and the harness differ only through `StudioEnv`; nothing in `StudioView` imports Supabase directly.
- **Media URLs:** signed URLs are refreshed before they expire without interrupting playback; an unresolvable file shows a plain chip and a clear state, never a crash; no request storm when many clips use the same file.
- **Lifecycle:** leaving the editor, switching projects, or React StrictMode's double mount leaves no audio context, frame loop, Konva stage, timer or store subscription behind, and never saves one project's timeline into another.
- **Save safety:** nothing is saved before a successful load; loading errors, conflicts and retry states are visible; the frame size change is saved once, not on every render.
- **Keys:** the timeline's global keys keep working with the stage focused and never fire while typing; nothing here steals them.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/timeline/tracks.ts` | Modified: `pruneEmptyTracks` |
| `src/lib/timeline-ui/commands.ts` | Modified: delete also prunes empty tracks |
| `src/lib/editor/ops.ts` | Add media as sequence / overlay / audio; set transforms (pure) |
| `src/lib/editor/stage.ts` | Stage boxes, node-to-transform, snapping (pure) |
| `src/lib/sync/media-urls.ts` | Modified: export `isStorageMediaId` |
| `src/lib/sync/media-url-store.ts` | Signed-URL cache with refresh (pure, injected clock and deps) |
| `src/lib/sync/memory-timeline-storage.ts` | In-memory `TimelineStorage` for development and tests |
| `src/hooks/use-timeline-sync.ts` | Modified: optional storage argument |
| `src/components/studio/studio-env.ts` | The `StudioEnv` interface |
| `src/components/studio/use-studio-media.ts` | Keeps the URL store filled for the project's media |
| `src/components/studio/use-studio-playback.ts` | Audio, painter, session, visuals for one mounted editor |
| `src/components/studio/stage-interaction.tsx` | Konva selection layer with transformer |
| `src/components/studio/studio-stage.tsx` | Painter container plus interaction layer |
| `src/components/studio/studio-media-panel.tsx` | Media tab: add as sequence / overlay / audio |
| `src/components/studio/studio-toolbar.tsx` | Back, name, undo/redo, frame picker, save status |
| `src/components/studio/studio-view.tsx` | The editor layout and its loading/error states |
| `src/app/studio/[id]/page.tsx`, `studio-client.tsx`, `supabase-env.ts` | The real route and its Supabase environment |
| `src/app/dev/studio/page.tsx`, `studio-dev-client.tsx` | The developer harness |
| `src/lib/supabase/middleware.ts` | Modified: protect `/studio` |

Each `*.test.ts(x)` sits beside the file it tests.

---

### Task 1: Prune empty tracks, and delete uses it

**Files:**
- Modify: `src/lib/timeline/tracks.ts`, `src/lib/timeline/tracks.test.ts`, `src/lib/timeline-ui/commands.ts`, `src/lib/timeline-ui/commands.test.ts`

**Interfaces:**
- Produces: `pruneEmptyTracks(project: TimelineProject): TimelineProject`. Removes every track that has no clips, except tracks of type `video` (the main track stays even when empty), then renumbers `order` to `0..n-1` keeping the existing order. Returns the **same project** when nothing is removed.
- `deleteSelected(project, ids, ripple)` now prunes after a delete that removed something; when nothing was deleted it returns the same project as before (no pruning, no change).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/timeline/tracks.test.ts` (add `pruneEmptyTracks` to its import from `@/lib/timeline/tracks`; `makeClip`, `makeProject`, `makeStandardTracks` come from `@/lib/timeline/test-utils`, add them to the existing import if not present):

```ts
describe("pruneEmptyTracks", () => {
  it("removes empty overlay and audio tracks and renumbers the rest", () => {
    // t2 overlay (0), t1 video (1), t3 audio (2); only t1 has a clip
    const project = makeProject(makeStandardTracks(), [makeClip({ id: "a", trackId: "t1" })]);
    const pruned = pruneEmptyTracks(project);
    expect(pruned.tracks.map((t) => [t.id, t.order])).toEqual([["t1", 0]]);
  });

  it("keeps the main video track even when it is empty", () => {
    const project = makeProject(makeStandardTracks(), []);
    expect(pruneEmptyTracks(project).tracks.map((t) => t.id)).toEqual(["t1"]);
  });

  it("keeps tracks that hold clips, in their existing order", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", trackId: "t1" }),
      makeClip({ id: "o", trackId: "t2", kind: "image", sourceDuration: null }),
    ]);
    expect(pruneEmptyTracks(project).tracks.map((t) => [t.id, t.order])).toEqual([
      ["t2", 0],
      ["t1", 1],
    ]);
  });

  it("returns the same project when nothing is empty", () => {
    const project = makeProject(
      [makeStandardTracks()[1]],
      [makeClip({ id: "a", trackId: "t1" })],
    );
    expect(pruneEmptyTracks(project)).toBe(project);
  });
});
```

Append to `src/lib/timeline-ui/commands.test.ts` inside `describe("deleteSelected", ...)`:

```ts
  it("removes a track that the delete leaves empty, but not the main track", () => {
    const result = deleteSelected(project, ["o1", "o2"], false);
    expect(result.tracks.some((t) => t.id === "t2")).toBe(false);
    expect(result.tracks.some((t) => t.id === "t1")).toBe(true);
  });

  it("does not prune when nothing was deleted", () => {
    const tidy = makeProject(makeStandardTracks(), [video("a", 0, 4)]); // t2 and t3 are empty
    expect(deleteSelected(tidy, [], false)).toBe(tidy);
    expect(deleteSelected(tidy, ["missing"], false)).toBe(tidy);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline/tracks.test.ts src/lib/timeline-ui/commands.test.ts`
Expected: FAIL (`pruneEmptyTracks` is not exported; the new delete test fails).

- [ ] **Step 3: Implement**

Append to `src/lib/timeline/tracks.ts`:

```ts
/**
 * Removes tracks that hold no clips, except the main video track, and
 * renumbers the rest. Returns the same project when nothing is removed.
 */
export function pruneEmptyTracks(project: TimelineProject): TimelineProject {
  const used = new Set(project.clips.map((clip) => clip.trackId));
  const kept = project.tracks.filter((track) => track.type === "video" || used.has(track.id));
  if (kept.length === project.tracks.length) return project;
  const tracks = [...kept]
    .sort((a, b) => a.order - b.order)
    .map((track, index) => (track.order === index ? track : { ...track, order: index }));
  return { ...project, tracks };
}
```

In `src/lib/timeline-ui/commands.ts` replace `deleteSelected` with:

```ts
export function deleteSelected(
  project: TimelineProject,
  ids: string[],
  ripple: boolean,
): TimelineProject {
  const next = ripple ? rippleDeleteClips(project, ids) : deleteClips(project, ids);
  // Only tidy up after a delete that really removed something.
  return next === project ? project : pruneEmptyTracks(next);
}
```

and add `import { pruneEmptyTracks } from "@/lib/timeline/tracks";` to its imports.

- [ ] **Step 4: Run the tests and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/timeline src/lib/timeline-ui src/components/clip-timeline` then `npx tsc --noEmit`
Expected: PASS everywhere. If an existing component test breaks because a track now disappears after Delete (for example one that counts tracks after deleting the only clip on a track), decide by reading it whether the test or the behaviour is wrong; the design says empty tracks go, so update that test and ledger a Ruling.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/timeline src/lib/timeline-ui
git commit -m "feat: remove tracks left empty by a delete" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Editing operations (pure)

**Files:**
- Create: `src/lib/editor/ops.ts`
- Test: `src/lib/editor/ops.test.ts`

**Interfaces:**
- Consumes: `fitContain` (`@/lib/playback/scene`), `clipEnd`, `createId`/`IdFn`, `clipsOnTrack`, `insertClip`, `addTrack`, `updateClip`, `FrameSize` (`@/lib/sync/timeline-document`).
- Produces:
  - `STILL_SECONDS = 5`, `OVERLAY_SCALE = 0.4`
  - `interface EditorMedia { mediaId: string; name: string; kind: "video" | "image" | "audio"; duration: number; width: number; height: number }` (`duration` 0 for images; sizes 0 when unknown)
  - `interface AddResult { project: TimelineProject; clipId: string }`
  - `addToSequence(project, media, frame, newId?): AddResult`. Video and image: appended to the end of the main video track (created if missing), the picture fitted inside the frame (letterboxed, centred). An audio item is delegated to `addAudioClip` at time 0.
  - `addAsOverlay(project, media, frame, at, newId?): AddResult`. Video and image: a **new overlay track on top** and a clip at `max(0, at)`, fitted inside `OVERLAY_SCALE` of the frame and centred in it. An audio item is delegated to `addAudioClip` at `at`.
  - `addAudioClip(project, media, frame, at, newId?): AddResult`. First audio track (created if missing), clip at `max(0, at)`, transform covering the frame.
  - `setClipTransforms(project, patches: Record<string, Partial<ClipTransform>>): TimelineProject`. Applies each patch with `updateClip`; unknown clips are skipped; returns the same project when nothing changed.
  - A still (`image`) has `sourceDuration: null` and lasts `STILL_SECONDS`; video and audio last `duration` and have `sourceDuration: duration`. Ids: a new overlay track's id is drawn from `newId` first, then the clip's.

- [ ] **Step 1: Write the failing test**

`src/lib/editor/ops.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  addAsOverlay,
  addAudioClip,
  addToSequence,
  OVERLAY_SCALE,
  setClipTransforms,
  STILL_SECONDS,
  type EditorMedia,
} from "@/lib/editor/ops";
import { emptyTimeline } from "@/lib/sync/timeline-document";
import { clipEnd } from "@/lib/timeline/clip-math";
import { findClip } from "@/lib/timeline/lookup";
import { seqIds } from "@/lib/timeline/test-utils";

const frame = { width: 1920, height: 1080 };
const video = (mediaId: string, overrides: Partial<EditorMedia> = {}): EditorMedia => ({
  mediaId,
  name: mediaId,
  kind: "video",
  duration: 6,
  width: 1920,
  height: 1080,
  ...overrides,
});
const base = () => emptyTimeline("p", seqIds("t")); // video t-1, audio t-2

describe("addToSequence", () => {
  it("appends to the end of the main track, one after another", () => {
    const a = addToSequence(base(), video("a"), frame, seqIds("c"));
    const b = addToSequence(a.project, video("b"), frame, seqIds("d"));
    expect(b.project.clips.map((c) => [c.mediaId, c.trackId, c.start])).toEqual([
      ["a", "t-1", 0],
      ["b", "t-1", 6],
    ]);
    expect(b.clipId).toBe(findClip(b.project, b.clipId)?.id);
  });

  it("is not pushed later by longer music on another track", () => {
    const withMusic = addAudioClip(base(), video("m", { kind: "audio", duration: 60 }), frame, 0, seqIds("m"));
    const result = addToSequence(withMusic.project, video("a"), frame, seqIds("c"));
    expect(findClip(result.project, result.clipId)?.start).toBe(0);
  });

  it("fits a picture inside the frame, centred", () => {
    const square = addToSequence(base(), video("s", { width: 1000, height: 1000 }), frame, seqIds("c"));
    expect(findClip(square.project, square.clipId)?.transform).toMatchObject({
      x: 420,
      y: 0,
      width: 1080,
      height: 1080,
    });
  });

  it("makes a still image five seconds long with no source length", () => {
    const result = addToSequence(base(), video("p", { kind: "image", duration: 0 }), frame, seqIds("c"));
    expect(findClip(result.project, result.clipId)).toMatchObject({
      kind: "image",
      sourceDuration: null,
      sourceIn: 0,
      sourceOut: STILL_SECONDS,
    });
  });

  it("creates the main track when there is none", () => {
    const empty = { id: "p", tracks: [], clips: [] };
    const result = addToSequence(empty, video("a"), frame, seqIds("n"));
    expect(result.project.tracks.map((t) => t.type)).toEqual(["video"]);
  });

  it("sends an audio item to the audio track instead", () => {
    const result = addToSequence(base(), video("m", { kind: "audio", duration: 30 }), frame, seqIds("c"));
    expect(findClip(result.project, result.clipId)).toMatchObject({ kind: "audio", trackId: "t-2", start: 0 });
  });
});

describe("addAsOverlay", () => {
  it("puts the picture on its own new overlay track on top, at the playhead", () => {
    const first = addAsOverlay(base(), video("a"), frame, 2, seqIds("n"));
    const second = addAsOverlay(first.project, video("b"), frame, 3, seqIds("m"));

    const types = second.project.tracks.sort((x, y) => x.order - y.order).map((t) => t.type);
    expect(types).toEqual(["overlay", "overlay", "video", "audio"]);

    const bClip = findClip(second.project, second.clipId)!;
    const aClip = findClip(second.project, first.clipId)!;
    const order = (clipTrackId: string) => second.project.tracks.find((t) => t.id === clipTrackId)!.order;
    expect(order(bClip.trackId)).toBeLessThan(order(aClip.trackId)); // the newest is on top
    expect(bClip.start).toBe(3);
    expect(aClip.start).toBe(2);
  });

  it("fits at 40% of the frame and centres it", () => {
    const result = addAsOverlay(base(), video("a"), frame, 0, seqIds("n"));
    const clip = findClip(result.project, result.clipId)!;
    expect(clip.transform.width).toBeCloseTo(1920 * OVERLAY_SCALE, 6);
    expect(clip.transform.height).toBeCloseTo(1080 * OVERLAY_SCALE, 6);
    expect(clip.transform.x).toBeCloseTo((1920 - clip.transform.width) / 2, 6);
    expect(clip.transform.y).toBeCloseTo((1080 - clip.transform.height) / 2, 6);
  });

  it("never starts before time 0 and keeps a video's length", () => {
    const result = addAsOverlay(base(), video("a", { duration: 4 }), frame, -3, seqIds("n"));
    const clip = findClip(result.project, result.clipId)!;
    expect(clip.start).toBe(0);
    expect(clipEnd(clip)).toBe(4);
  });

  it("sends an audio item to the audio track", () => {
    const result = addAsOverlay(base(), video("m", { kind: "audio" }), frame, 5, seqIds("n"));
    expect(findClip(result.project, result.clipId)).toMatchObject({ kind: "audio", start: 5 });
    expect(result.project.tracks.filter((t) => t.type === "overlay")).toHaveLength(0);
  });
});

describe("addAudioClip", () => {
  it("places music on the audio track at the requested time", () => {
    const result = addAudioClip(base(), video("m", { kind: "audio", duration: 30 }), frame, 2, seqIds("c"));
    expect(findClip(result.project, result.clipId)).toMatchObject({
      kind: "audio",
      trackId: "t-2",
      start: 2,
      sourceOut: 30,
      sourceDuration: 30,
    });
  });

  it("creates an audio track when there is none", () => {
    const noAudio = { id: "p", tracks: base().tracks.filter((t) => t.type === "video"), clips: [] };
    const result = addAudioClip(noAudio, video("m", { kind: "audio" }), frame, 0, seqIds("n"));
    expect(result.project.tracks.map((t) => t.type).sort()).toEqual(["audio", "video"]);
  });
});

describe("setClipTransforms", () => {
  it("applies each patch to its own clip", () => {
    const a = addToSequence(base(), video("a"), frame, seqIds("c"));
    const b = addAsOverlay(a.project, video("b"), frame, 0, seqIds("n"));
    const result = setClipTransforms(b.project, {
      [a.clipId]: { x: 10 },
      [b.clipId]: { rotation: 45, width: 300 },
    });
    expect(findClip(result, a.clipId)?.transform.x).toBe(10);
    expect(findClip(result, b.clipId)?.transform).toMatchObject({ rotation: 45, width: 300 });
  });

  it("skips unknown clips and returns the same project when nothing changes", () => {
    const a = addToSequence(base(), video("a"), frame, seqIds("c"));
    const same = setClipTransforms(a.project, { missing: { x: 1 } });
    expect(same).toBe(a.project);
    const unchanged = setClipTransforms(a.project, {
      [a.clipId]: { x: findClip(a.project, a.clipId)!.transform.x },
    });
    expect(unchanged).toBe(a.project);
  });

  it("ignores a locked clip", () => {
    const a = addToSequence(base(), video("a"), frame, seqIds("c"));
    const locked = {
      ...a.project,
      clips: a.project.clips.map((c) => ({ ...c, locked: true })),
    };
    expect(setClipTransforms(locked, { [a.clipId]: { x: 99 } })).toBe(locked);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/editor/ops.test.ts`
Expected: FAIL; module cannot be resolved.

- [ ] **Step 3: Implement**

`src/lib/editor/ops.ts`:

```ts
import { fitContain } from "@/lib/playback/scene";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { updateClip } from "@/lib/timeline/clip-edits";
import { clipEnd } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { clipsOnTrack } from "@/lib/timeline/lookup";
import { insertClip } from "@/lib/timeline/place";
import { addTrack } from "@/lib/timeline/tracks";
import type { Clip, ClipTransform, TimelineProject, TrackType } from "@/types/timeline";

export const STILL_SECONDS = 5;
export const OVERLAY_SCALE = 0.4;

export interface EditorMedia {
  mediaId: string;
  name: string;
  kind: "video" | "image" | "audio";
  /** Seconds; 0 for images. */
  duration: number;
  /** Natural size in pixels; 0 when unknown. */
  width: number;
  height: number;
}

export interface AddResult {
  project: TimelineProject;
  clipId: string;
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

function buildClip(
  media: EditorMedia,
  trackId: string,
  start: number,
  transform: ClipTransform,
  newId: IdFn,
): Clip {
  const still = media.kind === "image";
  return {
    id: newId(),
    trackId,
    kind: media.kind,
    name: media.name,
    mediaId: media.mediaId,
    sourceDuration: still ? null : media.duration,
    start,
    sourceIn: 0,
    sourceOut: still ? STILL_SECONDS : media.duration,
    speed: 1,
    reversed: false,
    loop: false,
    volume: 100,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transform,
    adjustments: { photo: null, video: null, text: null },
    keyframes: [],
    groupId: null,
    locked: false,
    isPlaceholder: false,
  };
}

export function addAudioClip(
  project: TimelineProject,
  media: EditorMedia,
  frame: FrameSize,
  at: number,
  newId: IdFn = createId,
): AddResult {
  const { project: withTrack, trackId } = ensureTrack(project, "audio", newId);
  const clip = buildClip(
    media,
    trackId,
    Math.max(0, at),
    { x: 0, y: 0, width: frame.width, height: frame.height, rotation: 0, opacity: 1 },
    newId,
  );
  return { project: insertClip(withTrack, clip), clipId: clip.id };
}

/** Appends a photo or video to the end of the main sequence, fitted inside the frame. */
export function addToSequence(
  project: TimelineProject,
  media: EditorMedia,
  frame: FrameSize,
  newId: IdFn = createId,
): AddResult {
  if (media.kind === "audio") return addAudioClip(project, media, frame, 0, newId);
  const { project: withTrack, trackId } = ensureTrack(project, "video", newId);
  const end = clipsOnTrack(withTrack, trackId).reduce((latest, clip) => Math.max(latest, clipEnd(clip)), 0);
  const box = fitContain(media.width, media.height, frame.width, frame.height);
  const clip = buildClip(media, trackId, end, { ...box, rotation: 0, opacity: 1 }, newId);
  return { project: insertClip(withTrack, clip), clipId: clip.id };
}

/** Puts a photo or video on its own new overlay track on top, small and centred (a collage piece). */
export function addAsOverlay(
  project: TimelineProject,
  media: EditorMedia,
  frame: FrameSize,
  at: number,
  newId: IdFn = createId,
): AddResult {
  if (media.kind === "audio") return addAudioClip(project, media, frame, at, newId);
  const withTrack = addTrack(project, "overlay", newId);
  const created = withTrack.tracks.find((track) => !project.tracks.some((old) => old.id === track.id));
  if (!created) throw new Error("addTrack did not add a track");

  const box = fitContain(
    media.width,
    media.height,
    frame.width * OVERLAY_SCALE,
    frame.height * OVERLAY_SCALE,
  );
  const transform: ClipTransform = {
    x: (frame.width - box.width) / 2,
    y: (frame.height - box.height) / 2,
    width: box.width,
    height: box.height,
    rotation: 0,
    opacity: 1,
  };
  const clip = buildClip(media, created.id, Math.max(0, at), transform, newId);
  return { project: insertClip(withTrack, clip), clipId: clip.id };
}

/** Applies a position/size/rotation patch to each listed clip. Locked or unknown clips are left alone. */
export function setClipTransforms(
  project: TimelineProject,
  patches: Record<string, Partial<ClipTransform>>,
): TimelineProject {
  let result = project;
  for (const [clipId, patch] of Object.entries(patches)) {
    const clip = result.clips.find((c) => c.id === clipId);
    if (!clip) continue;
    result = updateClip(result, clipId, { transform: { ...clip.transform, ...patch } });
  }
  return result;
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/editor/ops.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors. Worked example for the square test: fitting 1000x1000 into 1920x1080 gives scale 1.08, so 1080x1080 at x = (1920-1080)/2 = 420. `setClipTransforms` returns the same reference for an identical patch because `updateClip` compares property values with `Object.is` and a freshly spread transform object is a new reference, so check the result: if the "unchanged" test fails, change `setClipTransforms` to skip patches whose every value already equals the clip's transform (compare keys of the patch against `clip.transform`) before calling `updateClip`, and keep the test.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/editor
git commit -m "feat: add editor operations for adding media and setting transforms" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Stage geometry (pure)

**Files:**
- Create: `src/lib/editor/stage.ts`
- Test: `src/lib/editor/stage.test.ts`

**Interfaces:**
- Consumes: `buildScene` (`@/lib/playback/scene`); `computeSnap`, `GuideLine` (`@/lib/canvas/alignment`); `TimelineProject`.
- Produces:
  - `MIN_BOX_SIZE = 8`, `SNAP_PX = 6`
  - `interface StageBox { clipId: string; x: number; y: number; width: number; height: number; rotation: number; locked: boolean; animated: boolean }`
  - `stageBoxes(project, time): StageBox[]`: one box per clip that is visible at `time` (active, on a visible track, not audio), in paint order (bottom first), taken from `buildScene` so the box is exactly what is drawn. `locked` is true when the clip or its track is locked; `animated` when the clip has keyframes.
  - `nodeToTransform(node: { x; y; rotation; width; height; scaleX; scaleY }): { x; y; width; height; rotation }`: size is `width * |scaleX|` and `height * |scaleY|`, never below `MIN_BOX_SIZE`.
  - `snapMove(moving: { id; x; y; width; height }, boxes: StageBox[], frame: { width; height }, scale: number): { x: number; y: number; guides: GuideLine[] }`: snaps the moving box's edges and centre to the frame's edges and centre and to every other box (excluding `moving.id` and any id in `excludeIds`), with a threshold of `SNAP_PX / scale` frame units (the argument `scale` is the stage zoom).
  - Signature detail: `snapMove(moving, boxes, frame, scale, excludeIds: string[] = [])`.

- [ ] **Step 1: Write the failing test**

`src/lib/editor/stage.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  MIN_BOX_SIZE,
  nodeToTransform,
  snapMove,
  stageBoxes,
  type StageBox,
} from "@/lib/editor/stage";
import { makeClip, makeProject, makeTrack } from "@/lib/timeline/test-utils";

const tracks = [
  makeTrack({ id: "o", type: "overlay", order: 0 }),
  makeTrack({ id: "v", type: "video", order: 1 }),
  makeTrack({ id: "a", type: "audio", order: 2 }),
];
const transform = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
  rotation: 0,
  opacity: 1,
});

describe("stageBoxes", () => {
  it("lists visible clips bottom first, using what is drawn", () => {
    const project = makeProject(tracks, [
      makeClip({ id: "over", trackId: "o", kind: "image", sourceDuration: null, transform: transform(10, 20, 100, 50) }),
      makeClip({ id: "main", trackId: "v", transform: transform(0, 0, 1920, 1080) }),
    ]);
    const boxes = stageBoxes(project, 1);
    expect(boxes.map((b) => b.clipId)).toEqual(["main", "over"]);
    expect(boxes[1]).toMatchObject({ x: 10, y: 20, width: 100, height: 50, locked: false, animated: false });
  });

  it("leaves out audio, clips not playing now, and clips on hidden tracks", () => {
    const hidden = [
      makeTrack({ id: "o", type: "overlay", order: 0, hidden: true }),
      makeTrack({ id: "v", type: "video", order: 1 }),
      makeTrack({ id: "a", type: "audio", order: 2 }),
    ];
    const project = makeProject(hidden, [
      makeClip({ id: "h", trackId: "o", kind: "image", sourceDuration: null }),
      makeClip({ id: "later", trackId: "v", start: 50 }),
      makeClip({ id: "snd", trackId: "a", kind: "audio" }),
      makeClip({ id: "now", trackId: "v", start: 0 }),
    ]);
    expect(stageBoxes(project, 1).map((b) => b.clipId)).toEqual(["now"]);
  });

  it("marks locked clips, clips on locked tracks, and animated clips", () => {
    const lockedTrack = [
      makeTrack({ id: "o", type: "overlay", order: 0, locked: true }),
      makeTrack({ id: "v", type: "video", order: 1 }),
    ];
    const keyframe = { id: "k", time: 0, x: 0, y: 0, rotation: 0, opacity: 1 };
    const project = makeProject(lockedTrack, [
      makeClip({ id: "a", trackId: "o", kind: "image", sourceDuration: null }),
      makeClip({ id: "b", trackId: "v", locked: true }),
      makeClip({ id: "c", trackId: "v", start: 0, keyframes: [keyframe] }),
    ]);
    const byId = Object.fromEntries(stageBoxes(project, 1).map((b) => [b.clipId, b]));
    expect(byId.a.locked).toBe(true);
    expect(byId.b.locked).toBe(true);
    expect(byId.c.animated).toBe(true);
    expect(byId.c.locked).toBe(false);
  });
});

describe("nodeToTransform", () => {
  it("turns a stretched node back into a real size with scale 1", () => {
    expect(
      nodeToTransform({ x: 5, y: 6, rotation: 30, width: 100, height: 50, scaleX: 2, scaleY: 1.5 }),
    ).toEqual({ x: 5, y: 6, width: 200, height: 75, rotation: 30 });
  });

  it("never goes below the minimum size and ignores flipped scale signs", () => {
    const result = nodeToTransform({ x: 0, y: 0, rotation: 0, width: 100, height: 100, scaleX: -0.01, scaleY: 0.01 });
    expect(result.width).toBe(MIN_BOX_SIZE);
    expect(result.height).toBe(MIN_BOX_SIZE);
  });
});

describe("snapMove", () => {
  const frame = { width: 1000, height: 600 };
  const box = (clipId: string, x: number, y: number, width: number, height: number): StageBox => ({
    clipId,
    x,
    y,
    width,
    height,
    rotation: 0,
    locked: false,
    animated: false,
  });

  it("snaps to the frame's edges and centre", () => {
    // 100 wide box dragged to x=395: its centre (445)... use left edge near frame centre 500? choose right edge
    const result = snapMove({ id: "m", x: 3, y: 100, width: 100, height: 100 }, [], frame, 1);
    expect(result.x).toBe(0); // left edge snaps to the frame's left edge
    expect(result.guides.some((g) => g.axis === "x" && g.position === 0)).toBe(true);
  });

  it("snaps to another box's edge", () => {
    const others = [box("other", 400, 300, 200, 100)];
    const result = snapMove({ id: "m", x: 603, y: 50, width: 100, height: 50 }, others, frame, 1);
    expect(result.x).toBe(600); // left edge to the other box's right edge
  });

  it("uses a tighter range when zoomed in and ignores excluded boxes", () => {
    const others = [box("other", 400, 300, 200, 100)];
    expect(snapMove({ id: "m", x: 606, y: 50, width: 100, height: 50 }, others, frame, 1).x).toBe(600);
    // at 4x zoom the threshold is 1.5 frame units, so 6 away no longer snaps
    expect(snapMove({ id: "m", x: 606, y: 50, width: 100, height: 50 }, others, frame, 4).x).toBe(606);
    expect(
      snapMove({ id: "m", x: 603, y: 50, width: 100, height: 50 }, others, frame, 1, ["other"]).x,
    ).toBe(603);
  });

  it("leaves the position alone when nothing is close", () => {
    const result = snapMove({ id: "m", x: 123, y: 77, width: 50, height: 40 }, [], frame, 1);
    expect(result).toMatchObject({ x: 123, y: 77, guides: [] });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/editor/stage.test.ts`
Expected: FAIL; module cannot be resolved.

- [ ] **Step 3: Implement**

`src/lib/editor/stage.ts`:

```ts
import { computeSnap, type Box, type GuideLine } from "@/lib/canvas/alignment";
import { buildScene } from "@/lib/playback/scene";
import { isClipLocked } from "@/lib/timeline/lookup";
import type { TimelineProject } from "@/types/timeline";

export const MIN_BOX_SIZE = 8;
/** How close, in screen pixels, a dragged box must be to snap. */
export const SNAP_PX = 6;

export interface StageBox {
  clipId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
  /** Has keyframes: selectable, but dragging waits for the keyframes slice. */
  animated: boolean;
}

/** The boxes on the stage at `time`, bottom first, exactly as the painter draws them. */
export function stageBoxes(project: TimelineProject, time: number): StageBox[] {
  const clips = new Map(project.clips.map((clip) => [clip.id, clip]));
  const boxes: StageBox[] = [];
  for (const item of buildScene(project, time, () => undefined)) {
    const clip = clips.get(item.clipId);
    if (!clip) continue;
    boxes.push({
      clipId: clip.id,
      x: item.draw.x,
      y: item.draw.y,
      width: item.draw.width,
      height: item.draw.height,
      rotation: item.draw.rotation,
      locked: isClipLocked(project, clip),
      animated: clip.keyframes.length > 0,
    });
  }
  return boxes;
}

/** A transformed node's position, rotation and real size (its scale folded back into width and height). */
export function nodeToTransform(node: {
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}): { x: number; y: number; width: number; height: number; rotation: number } {
  return {
    x: node.x,
    y: node.y,
    width: Math.max(MIN_BOX_SIZE, node.width * Math.abs(node.scaleX)),
    height: Math.max(MIN_BOX_SIZE, node.height * Math.abs(node.scaleY)),
    rotation: node.rotation,
  };
}

/** Snaps a dragged box to the frame and to the other boxes; `scale` is the stage zoom. */
export function snapMove(
  moving: { id: string; x: number; y: number; width: number; height: number },
  boxes: StageBox[],
  frame: { width: number; height: number },
  scale: number,
  excludeIds: string[] = [],
): { x: number; y: number; guides: GuideLine[] } {
  const skip = new Set([moving.id, ...excludeIds]);
  const others: Box[] = boxes
    .filter((box) => !skip.has(box.clipId))
    .map((box) => ({ id: box.clipId, x: box.x, y: box.y, width: box.width, height: box.height }));
  others.push({ id: "__frame__", x: 0, y: 0, width: frame.width, height: frame.height });
  return computeSnap(moving, others, SNAP_PX / scale);
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/editor/stage.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors. If a snapping expectation is off (the existing `computeSnap` snaps the nearest of the moving box's left/centre/right edges to the other's left/centre/right), work the arithmetic by hand; for "snaps to another box's edge": moving left edge at 603 and the other box's right edge at 600 are 3 apart, within 6, so x becomes 600. For "frame's edges and centre": the moving box's left edge at 3 is 3 from the frame's left edge at 0, so x becomes 0 and a guide at 0 appears. Fix the test only if its arithmetic is wrong; do not change `computeSnap`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/editor/stage.ts src/lib/editor/stage.test.ts
git commit -m "feat: add pure stage geometry, node-to-transform and snapping" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Media URL store and in-memory storage (pure)

**Files:**
- Modify: `src/lib/sync/media-urls.ts`
- Create: `src/lib/sync/media-url-store.ts`, `src/lib/sync/memory-timeline-storage.ts`
- Test: `src/lib/sync/media-url-store.test.ts`, `src/lib/sync/memory-timeline-storage.test.ts`

**Interfaces:**
- `media-urls.ts` gains `export function isStorageMediaId(id: string): boolean` (the existing UUID test; `collectMediaIds` uses it).
- Produces in `media-url-store.ts`:
  - `interface MediaUrlSource { urlFor(mediaId: string): string | null; posterFor(mediaId: string): string | null; ensure(ids: string[]): Promise<void>; subscribe(listener: () => void): () => void; getVersion(): number }`
  - `interface MediaUrlStore extends MediaUrlSource { dispose(): void }`
  - `createMediaUrlStore(options: { deps: MediaUrlDeps; now?: () => number; ttlMs?: number; retryAfterMs?: number }): MediaUrlStore` (defaults: clock `Date.now`, `ttlMs` 20 hours, `retryAfterMs` 15 seconds).
  - Behaviour: `ensure(ids)` ignores ids that are not Storage ids (bundled assets); asks `resolveMediaUrls` once for the ids that are missing, expired, not already being fetched and not failed in the last `retryAfterMs`; stores each result with an expiry of `now + ttlMs`; remembers ids the server did not return, and ids whose request threw, as failed at the current time; bumps the version and notifies subscribers once per completed request that stored anything; the returned promise resolves when every requested id has been settled (never rejects). `urlFor`/`posterFor` return the stored value, even past expiry, until a refresh replaces it. After `dispose`, results are ignored and nothing notifies.
- Produces in `memory-timeline-storage.ts`: `createMemoryTimelineStorage(options?: { frame?: FrameSize }): TimelineStorage`. `load` returns the saved project (or an empty timeline for that id), its revision (starting at 0) and the frame; `save` succeeds only when `expectedRev` equals the current revision (then stores a copy and increments), else `{ ok: false, reason: "conflict" }`; versions (`saveVersion`, `listVersions` newest first, `loadVersion`, `deleteVersion`) are kept in memory.

- [ ] **Step 1: Write the failing tests**

`src/lib/sync/media-url-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createMediaUrlStore } from "@/lib/sync/media-url-store";
import type { MediaRow, MediaUrlDeps } from "@/lib/sync/media-urls";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function setup(options: { missing?: string[]; fail?: boolean } = {}) {
  const calls: string[][] = [];
  const clock = { now: 0 };
  let failNext = options.fail ?? false;
  const deps: MediaUrlDeps = {
    async fetchMediaRows(ids) {
      calls.push([...ids]);
      if (failNext) {
        failNext = false;
        throw new Error("network");
      }
      return ids
        .filter((id) => !(options.missing ?? []).includes(id))
        .map<MediaRow>((id) => ({
          id,
          type: "video",
          storage_path: `path/${id}`,
          thumbnail_path: `thumb/${id}`,
        }));
    },
    async getSignedUrls(paths) {
      return new Map(paths.map((p) => [p, `https://signed/${p}?t=${clock.now}`]));
    },
  };
  const store = createMediaUrlStore({ deps, now: () => clock.now, ttlMs: 1000, retryAfterMs: 100 });
  const heard = { count: 0 };
  store.subscribe(() => {
    heard.count += 1;
  });
  return { store, calls, clock, heard, failOnce: () => (failNext = true) };
}

describe("createMediaUrlStore", () => {
  it("resolves ids once, serves url and poster, and notifies", async () => {
    const { store, calls, heard } = setup();
    expect(store.urlFor(A)).toBeNull();
    await store.ensure([A, B]);
    expect(calls).toEqual([[A, B]]);
    expect(store.urlFor(A)).toBe(`https://signed/path/${A}?t=0`);
    expect(store.posterFor(A)).toBe(`https://signed/thumb/${A}?t=0`);
    expect(store.getVersion()).toBe(1);
    expect(heard.count).toBe(1);

    await store.ensure([A]);
    expect(calls).toHaveLength(1); // already resolved
  });

  it("ignores bundled-asset ids that do not live in Storage", async () => {
    const { store, calls } = setup();
    await store.ensure(["asset:star", "template-x-photo"]);
    expect(calls).toHaveLength(0);
    expect(store.urlFor("asset:star")).toBeNull();
  });

  it("shares one request between overlapping calls", async () => {
    const { store, calls } = setup();
    await Promise.all([store.ensure([A]), store.ensure([A, B]), store.ensure([B])]);
    expect(calls.flat().filter((id) => id === A)).toHaveLength(1);
    expect(calls.flat().filter((id) => id === B)).toHaveLength(1);
  });

  it("refreshes an expired url", async () => {
    const { store, calls, clock } = setup();
    await store.ensure([A]);
    clock.now = 2000; // past the 1000 ms lifetime
    expect(store.urlFor(A)).toBe(`https://signed/path/${A}?t=0`); // old one still served meanwhile
    await store.ensure([A]);
    expect(calls).toHaveLength(2);
    expect(store.urlFor(A)).toBe(`https://signed/path/${A}?t=2000`);
  });

  it("does not hammer ids the server does not know, but tries again later", async () => {
    const { store, calls, clock } = setup({ missing: [A] });
    await store.ensure([A]);
    await store.ensure([A]);
    expect(calls).toHaveLength(1);
    expect(store.urlFor(A)).toBeNull();
    clock.now = 500; // past the retry delay
    await store.ensure([A]);
    expect(calls).toHaveLength(2);
  });

  it("survives a failed request and retries after the delay", async () => {
    const { store, calls, clock, failOnce } = setup();
    failOnce();
    await expect(store.ensure([A])).resolves.toBeUndefined();
    expect(store.urlFor(A)).toBeNull();
    await store.ensure([A]); // too soon: no new request
    expect(calls).toHaveLength(1);
    clock.now = 500;
    await store.ensure([A]);
    expect(calls).toHaveLength(2);
    expect(store.urlFor(A)).not.toBeNull();
  });

  it("ignores results that arrive after dispose", async () => {
    const { store, heard } = setup();
    const pending = store.ensure([A]);
    store.dispose();
    await pending;
    expect(store.urlFor(A)).toBeNull();
    expect(heard.count).toBe(0);
  });
});
```

`src/lib/sync/memory-timeline-storage.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createMemoryTimelineStorage } from "@/lib/sync/memory-timeline-storage";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";

const project = (id: string) => ({
  ...makeProject(makeStandardTracks(), [makeClip({ id: "a", trackId: "t1" })]),
  id,
});

describe("createMemoryTimelineStorage", () => {
  it("loads an empty timeline at revision 0 with the frame", async () => {
    const storage = createMemoryTimelineStorage({ frame: { width: 800, height: 600 } });
    const loaded = await storage.load("p1");
    expect(loaded.project.id).toBe("p1");
    expect(loaded.project.clips).toEqual([]);
    expect(loaded.rev).toBe(0);
    expect(loaded.frame).toEqual({ width: 800, height: 600 });
  });

  it("saves against the current revision and serves it back", async () => {
    const storage = createMemoryTimelineStorage();
    expect(await storage.save("p1", project("p1"), 0)).toEqual({ ok: true, rev: 1 });
    const loaded = await storage.load("p1");
    expect(loaded.rev).toBe(1);
    expect(loaded.project.clips.map((c) => c.id)).toEqual(["a"]);
  });

  it("reports a conflict for a stale revision and keeps the stored copy", async () => {
    const storage = createMemoryTimelineStorage();
    await storage.save("p1", project("p1"), 0);
    expect(await storage.save("p1", { ...project("p1"), clips: [] }, 0)).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect((await storage.load("p1")).project.clips).toHaveLength(1);
  });

  it("does not let later edits to a saved object change the stored copy", async () => {
    const storage = createMemoryTimelineStorage();
    const saved = project("p1");
    await storage.save("p1", saved, 0);
    saved.clips.pop();
    expect((await storage.load("p1")).project.clips).toHaveLength(1);
  });

  it("keeps versions, newest first, and can restore and delete them", async () => {
    const storage = createMemoryTimelineStorage();
    const frame = { width: 100, height: 100 };
    await storage.saveVersion("p1", project("p1"), frame, "first");
    await storage.saveVersion("p1", { ...project("p1"), clips: [] }, frame);
    const list = await storage.listVersions("p1");
    expect(list.map((v) => v.label)).toEqual([null, "first"]);
    const restored = await storage.loadVersion("p1", list[1].id);
    expect(restored.project.clips).toHaveLength(1);
    await storage.deleteVersion(list[1].id);
    expect(await storage.listVersions("p1")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/sync/media-url-store.test.ts src/lib/sync/memory-timeline-storage.test.ts`
Expected: FAIL; both modules cannot be resolved.

- [ ] **Step 3: Implement**

In `src/lib/sync/media-urls.ts`, replace the use of the private regex in `collectMediaIds` with an exported helper: add

```ts
export function isStorageMediaId(id: string): boolean {
  return UUID_RE.test(id);
}
```

right after the `UUID_RE` declaration, and change `collectMediaIds` to use `isStorageMediaId(clip.mediaId)`.

`src/lib/sync/media-url-store.ts`:

```ts
import { isStorageMediaId, resolveMediaUrls, type MediaUrlDeps } from "@/lib/sync/media-urls";

export interface MediaUrlSource {
  urlFor(mediaId: string): string | null;
  posterFor(mediaId: string): string | null;
  /** Resolves signed URLs for ids that are missing or about to expire. Never rejects. */
  ensure(ids: string[]): Promise<void>;
  subscribe(listener: () => void): () => void;
  /** Changes whenever new URLs arrive; the snapshot for useSyncExternalStore. */
  getVersion(): number;
}

export interface MediaUrlStore extends MediaUrlSource {
  dispose(): void;
}

const DEFAULT_TTL_MS = 20 * 60 * 60 * 1000; // signed URLs last 24 hours; refresh well before
const DEFAULT_RETRY_AFTER_MS = 15_000;

interface Entry {
  url: string;
  posterUrl: string | null;
  expiresAt: number;
}

export function createMediaUrlStore(options: {
  deps: MediaUrlDeps;
  now?: () => number;
  ttlMs?: number;
  retryAfterMs?: number;
}): MediaUrlStore {
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const retryAfterMs = options.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
  const entries = new Map<string, Entry>();
  const inflight = new Map<string, Promise<void>>();
  const failedAt = new Map<string, number>();
  const listeners = new Set<() => void>();
  let version = 0;
  let disposed = false;

  const fresh = (id: string) => {
    const entry = entries.get(id);
    return entry !== undefined && entry.expiresAt > now();
  };
  const recentlyFailed = (id: string) => {
    const at = failedAt.get(id);
    return at !== undefined && now() - at < retryAfterMs;
  };

  return {
    urlFor: (id) => entries.get(id)?.url ?? null,
    posterFor: (id) => entries.get(id)?.posterUrl ?? null,

    async ensure(ids) {
      if (disposed) return;
      const wanted = Array.from(new Set(ids.filter(isStorageMediaId)));
      const need = wanted.filter((id) => !fresh(id) && !inflight.has(id) && !recentlyFailed(id));

      if (need.length > 0) {
        const request = resolveMediaUrls(need, options.deps).then(
          (resolved) => {
            if (disposed) return;
            for (const id of need) {
              const result = resolved.get(id);
              if (result) {
                entries.set(id, {
                  url: result.url,
                  posterUrl: result.posterUrl,
                  expiresAt: now() + ttlMs,
                });
                failedAt.delete(id);
              } else {
                failedAt.set(id, now());
              }
            }
            if (resolved.size > 0) {
              version += 1;
              for (const listener of Array.from(listeners)) listener();
            }
          },
          () => {
            if (disposed) return;
            for (const id of need) failedAt.set(id, now());
          },
        );
        for (const id of need) inflight.set(id, request);
        void request.finally(() => {
          for (const id of need) if (inflight.get(id) === request) inflight.delete(id);
        });
      }

      await Promise.all(wanted.map((id) => inflight.get(id)).filter((p): p is Promise<void> => !!p));
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getVersion: () => version,

    dispose() {
      disposed = true;
      listeners.clear();
      entries.clear();
      inflight.clear();
    },
  };
}
```

`src/lib/sync/memory-timeline-storage.ts`:

```ts
import { emptyTimeline, type FrameSize } from "@/lib/sync/timeline-document";
import type { TimelineStorage, VersionSummary } from "@/lib/sync/timeline-storage";
import { createId } from "@/lib/timeline/ids";
import type { TimelineProject } from "@/types/timeline";

const DEFAULT_FRAME: FrameSize = { width: 1920, height: 1080 };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

interface StoredVersion extends VersionSummary {
  project: TimelineProject;
  frame: FrameSize;
}

/** A TimelineStorage that lives in memory: for the developer harness and tests. */
export function createMemoryTimelineStorage(options: { frame?: FrameSize } = {}): TimelineStorage {
  const frame = options.frame ?? DEFAULT_FRAME;
  const stored = new Map<string, { project: TimelineProject; rev: number }>();
  const versions: StoredVersion[] = [];
  let tick = 0;

  return {
    async load(projectId) {
      const entry = stored.get(projectId);
      return {
        project: entry ? clone(entry.project) : emptyTimeline(projectId),
        rev: entry?.rev ?? 0,
        frame,
      };
    },

    async save(projectId, project, expectedRev) {
      const current = stored.get(projectId)?.rev ?? 0;
      if (current !== expectedRev) return { ok: false, reason: "conflict" };
      stored.set(projectId, { project: clone(project), rev: current + 1 });
      return { ok: true, rev: current + 1 };
    },

    async saveVersion(projectId, project, versionFrame, label) {
      tick += 1;
      versions.push({
        id: createId(),
        label: label?.trim() || null,
        createdAt: new Date(tick * 1000).toISOString(),
        project: clone({ ...project, id: projectId }),
        frame: versionFrame,
      });
    },

    async listVersions() {
      return versions
        .map<VersionSummary>(({ id, label, createdAt }) => ({ id, label, createdAt }))
        .reverse();
    },

    async loadVersion(projectId, versionId) {
      const version = versions.find((v) => v.id === versionId);
      if (!version) throw new Error("Version not found");
      return { project: clone({ ...version.project, id: projectId }), frame: version.frame };
    },

    async deleteVersion(versionId) {
      const index = versions.findIndex((v) => v.id === versionId);
      if (index >= 0) versions.splice(index, 1);
    },
  };
}
```

(The memory storage's `new Date(...)` is only used to build a timestamp string from a counter; it does not read the clock. If the purity grep objects, build the string by hand: `` `2026-01-01T00:00:${String(tick).padStart(2, "0")}.000Z` ``.)

- [ ] **Step 4: Run the tests and the type check**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/lib/sync` then `npx tsc --noEmit`
Expected: PASS (all sync tests, including the existing `media-urls.test.ts`); no type errors. If the "survives a failed request" test hangs or the "does not hammer" test sees an extra call, trace `ensure`: failed ids are stamped with `now()`, so a second call at the same fake time is inside `retryAfterMs` (100 ms) and requests nothing.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/lib/sync
git commit -m "feat: add the signed-URL store and an in-memory timeline storage" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The environment seam and the browser hooks

**Files:**
- Modify: `src/hooks/use-timeline-sync.ts`
- Create: `src/components/studio/studio-env.ts`, `src/components/studio/use-studio-media.ts`, `src/components/studio/use-studio-playback.ts`

**Interfaces:**
- Produces:
  - `useTimelineSync(projectId: string, storage?: TimelineStorage)`: unchanged behaviour; when `storage` is omitted it builds the Supabase one exactly as before. `frame` is still returned; add `setFrame(frame)` to the return value (local state only; persisting is the caller's job).
  - `interface StudioEnv { projectId: string; projectName: string; backHref: string; storage: TimelineStorage; media: MediaUrlSource; library: MediaItem[]; libraryLoading: boolean; saveFrame(frame: FrameSize): Promise<void>; uploadFiles?(files: File[]): void }`
  - `useStudioMedia(media: MediaUrlSource, project: TimelineProject): void`: asks the source to resolve every Storage-backed media id used by the project whenever the set of ids changes, and again every 10 minutes (the store refreshes only what is near expiry).
  - `useStudioPlayback(options: { media: MediaUrlSource; frame: FrameSize | null }): { containerRef: React.RefObject<HTMLDivElement | null>; session: PlaybackSession | null; visuals: MediaVisuals | null }`. When `frame` is set and the container exists it creates (and on cleanup disposes) the audio context, image cache, scene painter, playback session, thumbnail and waveform services; subscribes the session to project edits and to `media` changes (`session.wake()`); and mirrors the transport into `useTransportStore` exactly like the playback test page does. It is the studio's version of the effect in `src/components/playback/playback-harness.tsx` (read it and keep the same lifecycle rules: aliveRef-style guards, painter destroyed before the session is disposed, services disposed on cleanup, no work after cleanup).

No unit tests (browser hooks); type-checked and exercised in Task 9.

- [ ] **Step 1: Make the sync hook accept a storage**

In `src/hooks/use-timeline-sync.ts` change the signature and the storage line:

```ts
export function useTimelineSync(projectId: string, storage?: TimelineStorage) {
```

and inside `createTimelineSync({ ... })` use `storage: storage ?? createSupabaseTimelineStorage(createClient()),`; add `storage` to the effect's dependency array; import `type TimelineStorage` from `@/lib/sync/timeline-storage`. Also return `setFrame` (the existing `useState` setter) alongside `status`, `frame`, `reload`. A caller that creates its storage inline would re-run the effect every render, so callers must memoise it (the env builders do).

- [ ] **Step 2: The environment type**

`src/components/studio/studio-env.ts`:

```ts
import type { MediaUrlSource } from "@/lib/sync/media-url-store";
import type { FrameSize } from "@/lib/sync/timeline-document";
import type { TimelineStorage } from "@/lib/sync/timeline-storage";
import type { MediaItem } from "@/types/media";

/**
 * Everything the editor needs from its surroundings. The real route fills it
 * from Supabase; the developer harness fills it from memory and local files.
 * StudioView never imports Supabase itself.
 */
export interface StudioEnv {
  projectId: string;
  projectName: string;
  backHref: string;
  storage: TimelineStorage;
  media: MediaUrlSource;
  /** The user's media library, for the Media tab. */
  library: MediaItem[];
  libraryLoading: boolean;
  saveFrame(frame: FrameSize): Promise<void>;
  /** Present when the Media tab may offer an upload button. */
  uploadFiles?(files: File[]): void;
}
```

- [ ] **Step 3: The media hook**

`src/components/studio/use-studio-media.ts`:

```ts
"use client";

import * as React from "react";

import type { MediaUrlSource } from "@/lib/sync/media-url-store";
import { collectMediaIds } from "@/lib/sync/media-urls";
import type { TimelineProject } from "@/types/timeline";

const REFRESH_EVERY_MS = 10 * 60 * 1000;

/** Keeps the URL source filled for every Storage-backed file the project uses. */
export function useStudioMedia(media: MediaUrlSource, project: TimelineProject): void {
  const ids = React.useMemo(() => collectMediaIds(project), [project]);
  const key = ids.join(",");

  React.useEffect(() => {
    const wanted = key === "" ? [] : key.split(",");
    void media.ensure(wanted);
    const timer = window.setInterval(() => void media.ensure(wanted), REFRESH_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [media, key]);
}
```

- [ ] **Step 4: The playback hook**

Read `src/components/playback/playback-harness.tsx` (its main `useEffect`) and write `src/components/studio/use-studio-playback.ts` as its studio equivalent. It must:

1. Return `{ containerRef, session, visuals }` with `session` and `visuals` held in React state so the view re-renders when they become available.
2. Run one effect keyed on `[media, frame?.width, frame?.height]` that does nothing until `frame` and the container exist. Inside: create `createBrowserAudioContext()`, a `createImageCache` (`urlFor: media.urlFor`, `onLoad: () => sessionRef.wake()`, `createImage: () => new Image()`), `createScenePainter({ container, frame, getImage })`, a `ResizeObserver` that calls `painter.resize(container.clientWidth, container.clientHeight)` (and once at start), and `createPlaybackSession` with `getProject` reading `selectProject(useClipProjectStore.getState())`, `urlFor: media.urlFor`, `createElement: createBrowserElement`, `now: browserNow`, `schedule: browserSchedule`, and an `onFrame` that writes `useTransportStore.getState().setFrame(frame.time, frame.playing)` and calls `painter.render(buildScene(getProject(), frame.time, (clipId) => pool.elementForClip(clipId)))`.
3. Create `createThumbnailService` (`urlFor: media.urlFor`, `extractor: createVideoFrameExtractor()`) and `createWaveformService` (`urlFor: media.urlFor`, `loadPeaks: loadPeaksFromUrl`) and expose them as `visuals` (`{ thumbnails, waveforms, urlFor: media.urlFor }`).
4. Subscribe: `useClipProjectStore.subscribe(() => session.wake())` and `media.subscribe(() => { imageCache.invalidateAll?.(); session.wake(); })` — the image cache has no `invalidateAll`; instead keep it simple and call `session.wake()` only (a failed image lookup returns null without caching when the URL is missing, so a later redraw retries).
5. On cleanup, in this order: mark dead, unsubscribe both, disconnect the observer, `thumbnails.dispose()`, `waveforms.dispose()`, `imageCache.dispose()`, `painter.destroy()`, `void session.dispose()`, then clear `session` and `visuals` state, and reset `useTransportStore`. After cleanup nothing may call into the painter or session.
6. Not touch `window.__playbackHarness`.

Imports to use (all exist): `createBrowserAudioContext`, `createBrowserElement`, `browserNow`, `browserSchedule` from `@/lib/playback/browser`; `createImageCache` from `@/lib/playback/image-cache`; `createPlaybackSession`, `type PlaybackSession` from `@/lib/playback/session`; `buildScene` from `@/lib/playback/scene`; `createScenePainter` from `@/components/playback/scene-painter`; `createThumbnailService`, `createWaveformService` from `@/lib/timeline-ui`; `createVideoFrameExtractor`, `loadPeaksFromUrl` from `@/lib/timeline-ui/browser-media`; the stores; `type MediaVisuals` from `@/components/clip-timeline/clip-visuals`.

- [ ] **Step 5: Type-check, lint**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx tsc --noEmit` then `npx eslint src/hooks src/components/studio`
Expected: no errors. Fix real problems without disabling rules.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/hooks/use-timeline-sync.ts src/components/studio
git commit -m "feat: add the studio environment seam and its media and playback hooks" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The stage (painter plus interaction layer)

**Files:**
- Create: `src/components/studio/stage-interaction.tsx`, `src/components/studio/studio-stage.tsx`

**Interfaces:**
- Consumes: `stageBoxes`, `nodeToTransform`, `snapMove`, `StageBox` (Task 3); `setClipTransforms` (Task 2); `fitFrame` (`@/lib/playback/scene`); `AlignmentGuidesLayer` and `GuideLine` (existing, in `src/components/canvas/alignment-guides-layer.tsx` and `src/lib/canvas/alignment.ts`); `nextSelection`; react-konva `Stage`, `Layer`, `Rect`, `Transformer`.
- Produces:
  - `StageInteraction` props `{ width: number; height: number; frame: FrameSize; boxes: StageBox[]; selectedIds: string[] }`. A react-konva `Stage` laid over the painter: its scale and offset come from `fitFrame(width, height, frame.width, frame.height)` so one frame unit equals what the painter draws. One transparent `Rect` per box (same x, y, width, height, rotation; `draggable` unless locked or animated; later boxes are on top). Pressing a rect selects it (shift toggles); pressing empty stage clears the selection. A `Transformer` is attached to the selected, unlocked, non-animated rects. Snapping guides are drawn while dragging.
  - Gesture rules: every change goes through `useClipProjectStore.getState().previewApply(...)` with `setClipTransforms` over **all** the gesture's patches together (each call recomputes from the pre-gesture project, so patches for several clips must be sent together), and ends with `endGesture()` (drag end, transform end). Dragging one selected clip moves every selected unlocked, non-animated clip by the same amount, and snaps the dragged clip's box. Transforming writes each node's `nodeToTransform` and resets the node's scale to 1. Escape during a gesture is handled by the timeline's global key handler only when the timeline owns the drag; here Escape simply leaves selection logic alone (a stage gesture ends on pointer release).
  - `StudioStage` props `{ containerRef: React.RefObject<HTMLDivElement | null>; frame: FrameSize | null }`. It renders the painter's container `div` (relative, full size, `data-testid="studio-stage"`), measures its size (use the existing `useElementSize` hook from `@/hooks/use-element-size`), and when the size and frame are known renders `<StageInteraction>` absolutely over it with `boxes = stageBoxes(project, time)` from the clip store and transport store and `selectedIds` from the clip store. The painter's own `<canvas>` is created by Konva inside the container; the interaction `Stage` is a sibling absolutely positioned above it, so give the painter its own inner `div` (`ref={containerRef}`, `absolute inset-0`) and the interaction layer a second `div` above (`absolute inset-0`, `z-10`).

No unit tests (react-konva needs a real canvas; its decisions are in Task 3's tested functions). Checked in Task 9.

- [ ] **Step 1: The interaction layer**

`src/components/studio/stage-interaction.tsx`:

```tsx
"use client";

import * as React from "react";
import type Konva from "konva";
import { Layer, Rect, Stage, Transformer } from "react-konva";

import { AlignmentGuidesLayer } from "@/components/canvas/alignment-guides-layer";
import type { GuideLine } from "@/lib/canvas/alignment";
import { setClipTransforms } from "@/lib/editor/ops";
import { MIN_BOX_SIZE, nodeToTransform, snapMove, type StageBox } from "@/lib/editor/stage";
import { fitFrame } from "@/lib/playback/scene";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { nextSelection } from "@/lib/timeline-ui/interactions";
import { useClipProjectStore } from "@/store/use-clip-project-store";
import type { ClipTransform } from "@/types/timeline";

interface StageInteractionProps {
  width: number;
  height: number;
  frame: FrameSize;
  boxes: StageBox[];
  selectedIds: string[];
}

type Patches = Record<string, Partial<ClipTransform>>;

export function StageInteraction({ width, height, frame, boxes, selectedIds }: StageInteractionProps) {
  const fit = fitFrame(width, height, frame.width, frame.height);
  const transformerRef = React.useRef<Konva.Transformer>(null);
  const nodes = React.useRef(new Map<string, Konva.Rect>());
  const patches = React.useRef<Patches>({});
  const dragStarts = React.useRef(new Map<string, { x: number; y: number }>());
  const [guides, setGuides] = React.useState<GuideLine[]>([]);

  const boxById = React.useMemo(() => new Map(boxes.map((box) => [box.clipId, box])), [boxes]);
  const editable = (id: string) => {
    const box = boxById.get(id);
    return box !== undefined && !box.locked && !box.animated;
  };

  // The transformer handles the selected clips that may be edited.
  React.useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const attached = selectedIds
      .filter(editable)
      .map((id) => nodes.current.get(id))
      .filter((node): node is Konva.Rect => node !== undefined);
    transformer.nodes(attached);
    transformer.getLayer()?.batchDraw();
    // `editable` reads boxById, which is covered by `boxes`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, boxes]);

  const preview = () => {
    const snapshot = { ...patches.current };
    useClipProjectStore.getState().previewApply((project) => setClipTransforms(project, snapshot));
  };
  const finish = () => {
    const had = Object.keys(patches.current).length > 0;
    patches.current = {};
    dragStarts.current.clear();
    setGuides([]);
    if (had) useClipProjectStore.getState().endGesture();
  };

  const select = (id: string, additive: boolean) => {
    const store = useClipProjectStore.getState();
    const current = store.selectedClipIds;
    if (additive) {
      store.setSelectedClipIds(nextSelection(current, id, { shift: true, ctrl: false }));
    } else if (!current.includes(id)) {
      store.setSelectedClipIds([id]);
    }
  };

  const onDragStart = (id: string) => {
    dragStarts.current.clear();
    const moving = selectedIds.includes(id) ? selectedIds.filter(editable) : [id];
    for (const clipId of moving) {
      const node = nodes.current.get(clipId);
      if (node) dragStarts.current.set(clipId, { x: node.x(), y: node.y() });
    }
  };

  const onDragMove = (id: string, node: Konva.Rect) => {
    const start = dragStarts.current.get(id);
    if (!start) return;
    const moving = Array.from(dragStarts.current.keys());
    const snapped = snapMove(
      { id, x: node.x(), y: node.y(), width: node.width(), height: node.height() },
      boxes,
      frame,
      fit.scale,
      moving,
    );
    node.position({ x: snapped.x, y: snapped.y });
    setGuides(snapped.guides);

    const dx = snapped.x - start.x;
    const dy = snapped.y - start.y;
    for (const [clipId, origin] of dragStarts.current) {
      const x = origin.x + dx;
      const y = origin.y + dy;
      patches.current[clipId] = { x, y };
      if (clipId !== id) nodes.current.get(clipId)?.position({ x, y });
    }
    preview();
  };

  const onTransform = (id: string, node: Konva.Rect) => {
    const t = nodeToTransform({
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      width: node.width(),
      height: node.height(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
    });
    node.setAttrs({ width: t.width, height: t.height, scaleX: 1, scaleY: 1 });
    patches.current[id] = t;
    preview();
  };

  return (
    <Stage
      width={width}
      height={height}
      x={fit.x}
      y={fit.y}
      scaleX={fit.scale}
      scaleY={fit.scale}
      className="touch-none"
      onMouseDown={(event) => {
        if (event.target === event.target.getStage()) {
          useClipProjectStore.getState().setSelectedClipIds([]);
        }
      }}
      onTouchStart={(event) => {
        if (event.target === event.target.getStage()) {
          useClipProjectStore.getState().setSelectedClipIds([]);
        }
      }}
    >
      <Layer>
        {boxes.map((box) => (
          <Rect
            key={box.clipId}
            ref={(node) => {
              if (node) nodes.current.set(box.clipId, node);
              else nodes.current.delete(box.clipId);
            }}
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            rotation={box.rotation}
            fill="rgba(0,0,0,0.001)"
            draggable={!box.locked && !box.animated}
            onMouseDown={(event) => select(box.clipId, event.evt.shiftKey)}
            onTouchStart={() => select(box.clipId, false)}
            onDragStart={() => onDragStart(box.clipId)}
            onDragMove={(event) => onDragMove(box.clipId, event.target as Konva.Rect)}
            onDragEnd={finish}
            onTransform={(event) => onTransform(box.clipId, event.target as Konva.Rect)}
            onTransformEnd={finish}
          />
        ))}
        <Transformer
          ref={transformerRef}
          rotateAnchorOffset={24}
          anchorSize={10}
          borderStroke="#8b5cf6"
          anchorStroke="#8b5cf6"
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < MIN_BOX_SIZE || newBox.height < MIN_BOX_SIZE ? oldBox : newBox
          }
        />
        <AlignmentGuidesLayer
          guides={guides}
          viewport={{ x: fit.x, y: fit.y, scale: fit.scale }}
          width={width}
          height={height}
        />
      </Layer>
    </Stage>
  );
}
```

- [ ] **Step 2: The stage component**

`src/components/studio/studio-stage.tsx`:

```tsx
"use client";

import * as React from "react";

import { StageInteraction } from "@/components/studio/stage-interaction";
import { useElementSize } from "@/hooks/use-element-size";
import { stageBoxes } from "@/lib/editor/stage";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";

interface StudioStageProps {
  /** Receives the painter's canvas; owned by useStudioPlayback. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  frame: FrameSize | null;
}

export function StudioStage({ containerRef, frame }: StudioStageProps) {
  const { ref: sizeRef, size } = useElementSize<HTMLDivElement>();
  const project = useClipProjectStore(selectProject);
  const selectedIds = useClipProjectStore((s) => s.selectedClipIds);
  const time = useTransportStore((s) => s.time);
  const boxes = React.useMemo(() => stageBoxes(project, time), [project, time]);

  return (
    <div
      ref={sizeRef}
      data-testid="studio-stage"
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/30"
    >
      <div ref={containerRef} className="absolute inset-0" />
      {frame && size.width > 0 && size.height > 0 && (
        <div className="absolute inset-0 z-10">
          <StageInteraction
            width={size.width}
            height={size.height}
            frame={frame}
            boxes={boxes}
            selectedIds={selectedIds}
          />
        </div>
      )}
    </div>
  );
}
```

(Check `useElementSize`'s real signature in `src/hooks/use-element-size.ts`; the old editor uses `const { ref, size } = useElementSize<HTMLDivElement>()`, so this matches.)

- [ ] **Step 3: Type-check, lint**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx tsc --noEmit` then `npx eslint src/components/studio`
Expected: no errors. If react-konva's `Rect` `ref` callback typing complains, use `ref={(node: Konva.Rect | null) => {...}}`. If the exhaustive-deps comment is flagged as unnecessary, remove it.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/components/studio
git commit -m "feat: add the studio stage with selection, move, resize and rotate" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Media panel and toolbar (testable components)

**Files:**
- Create: `src/components/studio/studio-media-panel.tsx`, `src/components/studio/studio-toolbar.tsx`
- Test: `src/components/studio/studio-media-panel.test.tsx`, `src/components/studio/studio-toolbar.test.tsx`

**Interfaces:**
- Consumes: existing `MediaThumbnail` (`@/components/media/media-thumbnail`, check its props), `Button`, `MediaItem` (`@/types/media`), `FRAME_PRESETS` (`@/lib/export/frame-presets`), `SyncStatus` (`@/lib/sync/timeline-sync`).
- Produces:
  - `StudioMediaPanel` props `{ items: MediaItem[]; loading: boolean; onAdd(item: MediaItem, mode: "sequence" | "overlay"): void; onUpload?(files: File[]): void }`. Lists only items with `status === "ready"`. Each photo or video item shows its thumbnail, name and two buttons labelled "Add" (aria-label `Add <name> to the sequence`) and "Overlay" (`Add <name> as an overlay`); an audio item shows a music row with just "Add" (`Add <name> as music`, calls `onAdd(item, "sequence")`). An empty library shows the text "No media yet" and, when `onUpload` is given, an upload control (a file input that accepts `video/*,audio/*,image/*` and calls `onUpload` with the chosen files). While `loading` and empty, shows "Loading your media…".
  - `StudioToolbar` props `{ projectName: string; backHref: string; status: SyncStatus; canUndo: boolean; canRedo: boolean; onUndo(): void; onRedo(): void; frame: { width: number; height: number } | null; onFrameChange(preset: { width: number; height: number }): void }`. Shows a back link with accessible name "Back to dashboard", the project name, Undo and Redo buttons (disabled per props), a frame size `select` (label "Frame size", one option per `FRAME_PRESETS` entry; the current one selected, or an extra "Custom" option when the frame matches no preset), and a status line: "Saved" when `phase === "ready"`, "Loading…" when loading, "Couldn't save" plus the error text when `phase === "error"`, "Changed elsewhere" when `phase === "conflict"`.

- [ ] **Step 1: Write the failing tests**

`src/components/studio/studio-media-panel.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioMediaPanel } from "@/components/studio/studio-media-panel";
import type { MediaItem } from "@/types/media";

const item = (overrides: Partial<MediaItem>): MediaItem => ({
  id: "m1",
  name: "Beach",
  type: "image",
  mimeType: "image/jpeg",
  size: 1,
  url: "https://example.com/a.jpg",
  thumbnailUrl: null,
  duration: null,
  folderId: null,
  createdAt: "2026-01-01T00:00:00Z",
  status: "ready",
  progress: 100,
  ...overrides,
});

describe("StudioMediaPanel", () => {
  it("adds a photo to the sequence or as an overlay", () => {
    const onAdd = vi.fn();
    const photo = item({});
    render(<StudioMediaPanel items={[photo]} loading={false} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the sequence" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Beach as an overlay" }));
    expect(onAdd).toHaveBeenNthCalledWith(1, photo, "sequence");
    expect(onAdd).toHaveBeenNthCalledWith(2, photo, "overlay");
  });

  it("offers a single Add for music", () => {
    const onAdd = vi.fn();
    const song = item({ id: "s1", name: "Song", type: "audio", mimeType: "audio/mpeg", duration: 30 });
    render(<StudioMediaPanel items={[song]} loading={false} onAdd={onAdd} />);
    expect(screen.queryByRole("button", { name: /overlay/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add Song as music" }));
    expect(onAdd).toHaveBeenCalledWith(song, "sequence");
  });

  it("leaves out items that are not ready yet", () => {
    render(
      <StudioMediaPanel
        items={[item({ id: "a", name: "Ready" }), item({ id: "b", name: "Busy", status: "processing" })]}
        loading={false}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.queryByText("Busy")).toBeNull();
    expect(screen.getByText("Ready")).toBeTruthy();
  });

  it("explains an empty library and offers upload", () => {
    const onUpload = vi.fn();
    render(<StudioMediaPanel items={[]} loading={false} onAdd={vi.fn()} onUpload={onUpload} />);
    expect(screen.getByText(/no media yet/i)).toBeTruthy();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onUpload).toHaveBeenCalledWith([file]);
  });

  it("says it is loading while the library loads", () => {
    render(<StudioMediaPanel items={[]} loading onAdd={vi.fn()} />);
    expect(screen.getByText(/loading your media/i)).toBeTruthy();
  });
});
```

`src/components/studio/studio-toolbar.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioToolbar } from "@/components/studio/studio-toolbar";
import type { SyncStatus } from "@/lib/sync/timeline-sync";

const base = {
  projectName: "My trip",
  backHref: "/dashboard",
  status: { phase: "ready", error: null } as SyncStatus,
  canUndo: true,
  canRedo: false,
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  frame: { width: 1920, height: 1080 },
  onFrameChange: vi.fn(),
};

describe("StudioToolbar", () => {
  it("shows the name, a back link and the save state", () => {
    render(<StudioToolbar {...base} />);
    expect(screen.getByText("My trip")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href")).toBe("/dashboard");
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("reports each sync state in words", () => {
    const { rerender } = render(<StudioToolbar {...base} status={{ phase: "loading", error: null }} />);
    expect(screen.getByText("Loading…")).toBeTruthy();
    rerender(<StudioToolbar {...base} status={{ phase: "error", error: "offline" }} />);
    expect(screen.getByText(/couldn.t save/i)).toBeTruthy();
    expect(screen.getByText(/offline/)).toBeTruthy();
    rerender(<StudioToolbar {...base} status={{ phase: "conflict", error: null }} />);
    expect(screen.getByText(/changed elsewhere/i)).toBeTruthy();
  });

  it("enables undo and redo only when there is something to do, and calls back", () => {
    const onUndo = vi.fn();
    render(<StudioToolbar {...base} onUndo={onUndo} />);
    const undo = screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement;
    const redo = screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    expect(redo.disabled).toBe(true);
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("changes the frame size from the presets", () => {
    const onFrameChange = vi.fn();
    render(<StudioToolbar {...base} onFrameChange={onFrameChange} />);
    const select = screen.getByLabelText("Frame size") as HTMLSelectElement;
    expect(select.value).toBe("landscape");
    fireEvent.change(select, { target: { value: "portrait" } });
    expect(onFrameChange).toHaveBeenCalledWith({ width: 1080, height: 1920 });
  });

  it("offers a Custom entry when the frame matches no preset", () => {
    render(<StudioToolbar {...base} frame={{ width: 777, height: 555 }} />);
    expect((screen.getByLabelText("Frame size") as HTMLSelectElement).value).toBe("custom");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/components/studio`
Expected: FAIL; both components cannot be resolved.

- [ ] **Step 3: Implement the media panel**

Read `src/components/media/media-thumbnail.tsx` first and use it as is (pass the item the way other callers such as `media-card.tsx` do). `src/components/studio/studio-media-panel.tsx`:

```tsx
"use client";

import * as React from "react";
import { Music } from "lucide-react";

import { MediaThumbnail } from "@/components/media/media-thumbnail";
import { Button } from "@/components/ui/button";
import type { MediaItem } from "@/types/media";

interface StudioMediaPanelProps {
  items: MediaItem[];
  loading: boolean;
  onAdd(item: MediaItem, mode: "sequence" | "overlay"): void;
  onUpload?(files: File[]): void;
}

export function StudioMediaPanel({ items, loading, onAdd, onUpload }: StudioMediaPanelProps) {
  const ready = items.filter((item) => item.status === "ready");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {onUpload && (
        <label className="block text-xs text-muted-foreground">
          <span className="mb-1 block font-medium text-foreground">Upload</span>
          <input
            type="file"
            multiple
            accept="video/*,audio/*,image/*"
            className="block w-full text-xs"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) onUpload(files);
            }}
          />
        </label>
      )}

      {ready.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading your media…" : "No media yet. Upload photos, videos or music to start."}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {ready.map((item) => (
          <li key={item.id} className="flex items-center gap-2 rounded-md border p-2">
            {item.type === "audio" ? (
              <span className="flex size-12 shrink-0 items-center justify-center rounded bg-violet-500/20 text-violet-600">
                <Music className="size-5" />
              </span>
            ) : (
              <span className="size-12 shrink-0 overflow-hidden rounded">
                <MediaThumbnail item={item} />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-sm" title={item.name}>
              {item.name}
            </span>
            {item.type === "audio" ? (
              <Button
                size="xs"
                variant="secondary"
                aria-label={`Add ${item.name} as music`}
                onClick={() => onAdd(item, "sequence")}
              >
                Add
              </Button>
            ) : (
              <span className="flex gap-1">
                <Button
                  size="xs"
                  variant="secondary"
                  aria-label={`Add ${item.name} to the sequence`}
                  onClick={() => onAdd(item, "sequence")}
                >
                  Add
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label={`Add ${item.name} as an overlay`}
                  onClick={() => onAdd(item, "overlay")}
                >
                  Overlay
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

If `MediaThumbnail`'s props differ from `item={item}`, adapt to what the file actually accepts; if it needs a layout wrapper, keep the 48 px square.

- [ ] **Step 4: Implement the toolbar**

`src/components/studio/studio-toolbar.tsx`:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Redo2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FRAME_PRESETS } from "@/lib/export/frame-presets";
import type { SyncStatus } from "@/lib/sync/timeline-sync";

interface StudioToolbarProps {
  projectName: string;
  backHref: string;
  status: SyncStatus;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  frame: { width: number; height: number } | null;
  onFrameChange(preset: { width: number; height: number }): void;
}

function statusText(status: SyncStatus): string {
  switch (status.phase) {
    case "loading":
      return "Loading…";
    case "ready":
      return "Saved";
    case "error":
      return status.error ? `Couldn't save: ${status.error}` : "Couldn't save";
    case "conflict":
      return "Changed elsewhere";
  }
}

export function StudioToolbar({
  projectName,
  backHref,
  status,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  frame,
  onFrameChange,
}: StudioToolbarProps) {
  const current = frame
    ? FRAME_PRESETS.find((p) => p.width === frame.width && p.height === frame.height)?.id ?? "custom"
    : "landscape";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
      <Link
        href={backHref}
        aria-label="Back to dashboard"
        className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
      >
        <ArrowLeft className="size-4" />
      </Link>
      <h1 className="min-w-0 truncate text-sm font-medium">{projectName}</h1>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
          <Redo2 className="size-4" />
        </Button>

        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="sr-only">Frame size</span>
          <select
            aria-label="Frame size"
            className="rounded border bg-background px-1 py-1 text-xs text-foreground"
            value={current}
            onChange={(event) => {
              const preset = FRAME_PRESETS.find((p) => p.id === event.target.value);
              if (preset) onFrameChange({ width: preset.width, height: preset.height });
            }}
          >
            {FRAME_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
            {current === "custom" && <option value="custom">Custom</option>}
          </select>
        </label>

        <span className="w-40 truncate text-right text-xs text-muted-foreground" role="status">
          {statusText(status)}
        </span>
      </div>
    </header>
  );
}
```

(`getByLabelText("Frame size")` finds the select through its `aria-label`; the `sr-only` span inside the label is only decoration, so remove the wrapping `<label>` if Testing Library reports two matches, keeping the `aria-label` on the select.)

- [ ] **Step 5: Run the tests, type-check, lint**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/components/studio` then `npx tsc --noEmit` then `npx eslint src/components/studio`
Expected: PASS; no type or lint errors.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/components/studio
git commit -m "feat: add the studio media panel and toolbar" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The editor view, the real route, and the developer harness

**Files:**
- Create: `src/components/studio/studio-view.tsx`, `src/app/studio/[id]/page.tsx`, `src/app/studio/[id]/studio-client.tsx`, `src/app/studio/[id]/supabase-env.ts`, `src/app/dev/studio/page.tsx`, `src/app/dev/studio/studio-dev-client.tsx`
- Modify: `src/lib/supabase/middleware.ts` (add `/studio` to `PROTECTED_PREFIXES`)

**Interfaces:**
- `StudioView({ env }: { env: StudioEnv })`:
  - Calls `useTimelineSync(env.projectId, env.storage)` and `useStudioMedia(env.media, project)`, and `useStudioPlayback({ media: env.media, frame })`.
  - While `status.phase === "loading"`: a skeleton. `"error"` before any content loaded: a message with a "Try again" button (`reload`). `"conflict"`: a message "This project changed in another window." with a "Reload" button (`reload`). Once loaded it renders the toolbar, a left sidebar with the media panel, the stage, a transport row (Play/Pause button, the time readout `m:ss.s / m:ss.s`), and the timeline (`TimelineView` with `visuals`, `onSeek`, `onToggle`, `onStep` wired to the session).
  - Adding media: `onAdd(item, mode)` reads the file's natural size (`readMediaInfo(url, kind)` from `@/lib/playback/browser`, after `await env.media.ensure([item.id])`; if no URL can be found, show a toast-style message and stop), builds an `EditorMedia`, then `useClipProjectStore.getState().apply(project => addToSequence / addAsOverlay(project, media, frame, playheadTime))` and selects the new clip (`setSelectedClipIds([clipId])`). Audio uses `addAudioClip` at the playhead. Failures show a visible message in the sidebar (not only the console). Work started before the view unmounted must not touch the store afterwards (guard with an alive ref like the playback test page's `aliveRef`).
  - Changing the frame: `setFrame(preset)` locally and `env.saveFrame(preset)` once; on failure show the message and revert.
  - The Play button toggles `session.toggle()`; Space and the other keys come from `TimelineView`.
- Real route: `src/app/studio/[id]/page.tsx` is a server component that awaits `params` and renders `<StudioClient projectId={id} />`; `studio-client.tsx` (`"use client"`) dynamic-imports a small `SupabaseStudio` component with `ssr: false` and a skeleton `loading`. `SupabaseStudio({ projectId })` uses `useSupabaseStudioEnv(projectId)` from `supabase-env.ts` and renders `<StudioView env={env} />`, or "Project not found" with a link back when the project list has loaded and does not contain the id.
- `useSupabaseStudioEnv(projectId): StudioEnv | null` (a hook in `supabase-env.ts`): memoises `createSupabaseTimelineStorage(createClient())`; creates `createMediaUrlStore({ deps: createSupabaseMediaDeps(createClient()) })` once per project id and disposes it on cleanup; reads the project name from `useProjectStore` (calling `fetchProjects()` on mount) and the library from `useMediaStore` (`items`, `fetchMedia()` on mount, `loading`); `saveFrame` is `saveProjectFrame` from `@/lib/sync/project-content-sync`; `uploadFiles` is `(files) => useMediaStore.getState().addFiles(files, null)`; `backHref` is `/dashboard`. Returns `null` until the project list has loaded.
- Harness: `src/app/dev/studio/page.tsx` is a server component that calls `notFound()` when `process.env.NODE_ENV === "production"` and otherwise renders `<StudioDevClient />`. `studio-dev-client.tsx` (`"use client"`) dynamic-imports `StudioDev` (ssr: false). `StudioDev` builds a `StudioEnv` in memory: `createMemoryTimelineStorage()`, a media source over an object-URL registry (`createObjectUrlRegistry()` from `@/lib/playback/object-url-registry`) whose `urlFor` is `registry.urlFor`, `ensure` resolves at once, and `subscribe`/`getVersion` are no-ops; a `library` state of `MediaItem`s; `uploadFiles` registers each chosen file (`registry.addBlob(id, file)`) and appends a `MediaItem` (type from the file, `status: "ready"`, `url` the object URL, duration read with `readMediaInfo`); and two extra buttons above the studio, "Add sample clips" (uses `getFfmpeg`, `generateSampleClip`, `SAMPLE_CLIPS` as the playback test page does) and "Add sample tone" (uses `makeToneWav`), which add `MediaItem`s to the library. Everything is cleaned up (registry `revokeAll`, store disposed) on unmount.
- Middleware: `const PROTECTED_PREFIXES = ["/dashboard", "/editor", "/studio"];`.

Component test for `StudioView` is limited to what jsdom can show without a canvas: because `useStudioPlayback` needs the browser, the view test mocks `@/components/studio/use-studio-playback` and `@/components/studio/studio-stage` with `vi.mock` and checks the states.

- [ ] **Step 1: Write the failing view test**

`src/components/studio/studio-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@/test/dom-setup";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioEnv } from "@/components/studio/studio-env";
import { StudioView } from "@/components/studio/studio-view";
import { createMemoryTimelineStorage } from "@/lib/sync/memory-timeline-storage";
import type { TimelineStorage } from "@/lib/sync/timeline-storage";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";
import type { MediaItem } from "@/types/media";

// The painter, audio and Konva stage need a real browser; the view's own
// behaviour is what these tests are about.
vi.mock("@/components/studio/use-studio-playback", () => ({
  useStudioPlayback: () => ({
    containerRef: { current: null },
    session: { toggle: vi.fn(), seek: vi.fn(), step: vi.fn() },
    visuals: null,
  }),
}));
vi.mock("@/components/studio/studio-stage", () => ({
  StudioStage: () => <div data-testid="stage" />,
}));
vi.mock("@/lib/playback/browser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/playback/browser")>()),
  readMediaInfo: async () => ({ duration: 6, width: 1920, height: 1080 }),
}));

const photo: MediaItem = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Beach",
  type: "image",
  mimeType: "image/jpeg",
  size: 1,
  url: "https://example.com/a.jpg",
  thumbnailUrl: null,
  duration: null,
  folderId: null,
  createdAt: "2026-01-01T00:00:00Z",
  status: "ready",
  progress: 100,
};

function env(overrides: Partial<StudioEnv> = {}): StudioEnv {
  return {
    projectId: "p1",
    projectName: "My trip",
    backHref: "/dashboard",
    storage: createMemoryTimelineStorage(),
    media: {
      urlFor: () => "blob:x",
      posterFor: () => null,
      ensure: async () => {},
      subscribe: () => () => {},
      getVersion: () => 0,
    },
    library: [photo],
    libraryLoading: false,
    saveFrame: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => {
  act(() => useClipProjectStore.getState().load({ id: "", tracks: [], clips: [] }));
});

describe("StudioView", () => {
  it("shows a skeleton, then the editor once the project has loaded", async () => {
    render(<StudioView env={env()} />);
    expect(screen.queryByText("My trip")).toBeNull();
    expect(await screen.findByText("My trip")).toBeTruthy();
    expect(screen.getByTestId("stage")).toBeTruthy();
  });

  it("explains a load failure and retries", async () => {
    let attempts = 0;
    const storage: TimelineStorage = {
      ...createMemoryTimelineStorage(),
      load: async (id) => {
        attempts += 1;
        if (attempts <= 4) throw new Error("offline");
        return createMemoryTimelineStorage().load(id);
      },
    };
    render(<StudioView env={env({ storage })} />);
    expect(await screen.findByText(/couldn.t load/i, {}, { timeout: 15000 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("My trip", {}, { timeout: 15000 })).toBeTruthy();
  }, 40000);

  it("adds a photo to the sequence from the media panel and selects it", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the sequence" }));
    await vi.waitFor(() => {
      const project = selectProject(useClipProjectStore.getState());
      expect(project.clips).toHaveLength(1);
    });
    const project = selectProject(useClipProjectStore.getState());
    expect(project.clips[0]).toMatchObject({ kind: "image", mediaId: photo.id });
    expect(useClipProjectStore.getState().selectedClipIds).toEqual([project.clips[0].id]);
  });

  it("adds a photo as an overlay on its own track", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach as an overlay" }));
    await vi.waitFor(() => expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(1));
    const project = selectProject(useClipProjectStore.getState());
    expect(project.tracks.find((t) => t.id === project.clips[0].trackId)?.type).toBe("overlay");
  });

  it("saves a frame size change once and shows it", async () => {
    const saveFrame = vi.fn(async () => {});
    render(<StudioView env={env({ saveFrame })} />);
    await screen.findByText("My trip");
    fireEvent.change(screen.getByLabelText("Frame size"), { target: { value: "square" } });
    expect(saveFrame).toHaveBeenCalledTimes(1);
    expect(saveFrame).toHaveBeenCalledWith({ width: 1080, height: 1080 });
    expect((screen.getByLabelText("Frame size") as HTMLSelectElement).value).toBe("square");
  });

  it("does not touch the project after it unmounts mid-add", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = env({
      media: {
        urlFor: () => "blob:x",
        posterFor: () => null,
        ensure: async () => gate,
        subscribe: () => () => {},
        getVersion: () => 0,
      },
    });
    const view = render(<StudioView env={slow} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the sequence" }));
    view.unmount();
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/components/studio/studio-view.test.tsx`
Expected: FAIL; `studio-view` cannot be resolved.

- [ ] **Step 3: Implement the view**

`src/components/studio/studio-view.tsx` (write it with these parts; the test above defines the behaviour):

- `"use client"`; imports: `StudioMediaPanel`, `StudioToolbar`, `StudioStage`, `useStudioMedia`, `useStudioPlayback`, `TimelineView`, `Button`, `Skeleton` (`@/components/ui/skeleton`), `useTimelineSync`, `readMediaInfo` from `@/lib/playback/browser`, `addAsOverlay`/`addAudioClip`/`addToSequence`/`type EditorMedia` from `@/lib/editor/ops`, the clip, transport stores and their selectors (`selectProject`, `selectCanUndo`, `selectCanRedo`), `type MediaItem`, `type StudioEnv`.
- Component body:
  1. `const { status, frame, setFrame, reload } = useTimelineSync(env.projectId, env.storage);`
  2. `const project = useClipProjectStore(selectProject); useStudioMedia(env.media, project);`
  3. `const { containerRef, session, visuals } = useStudioPlayback({ media: env.media, frame });`
  4. `const aliveRef = React.useRef(true); React.useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);` and `const [message, setMessage] = React.useState<string | null>(null); const say = (t) => { if (aliveRef.current) setMessage(t); };`
  5. `const addMedia = async (item: MediaItem, mode: "sequence" | "overlay")`: returns early when `!frame`; `await env.media.ensure([item.id]);` `const url = env.media.urlFor(item.id) ?? item.url;` if `!url` → `say("That file isn't available right now.")`; `kind = item.type`; `let info = { duration: item.duration ?? 0, width: 0, height: 0 }; try { info = await readMediaInfo(url, kind); } catch { if (kind !== "image") say(...)? }` — treat a failed read as: for images fall back to size 0 (full-frame fit) and carry on; for video/audio say "Couldn't read that file." and return. Then `if (!aliveRef.current) return;` build `EditorMedia { mediaId: item.id, name: item.name, kind, duration: info.duration || item.duration || 0, width: info.width, height: info.height }`, read the playhead from `useTransportStore.getState().time`, and run the matching op inside `useClipProjectStore.getState().apply((p) => { result = op(p...); return result.project; })`, capturing `clipId` from the closure, then `useClipProjectStore.getState().setSelectedClipIds([clipId])`. Clear the message on success.
  6. `const changeFrame = (preset) => { const previous = frame; setFrame(preset); env.saveFrame(preset).catch(() => { setFrame(previous); say("Couldn't save the frame size."); }); }`
  7. Render by phase: `loading` (and no content yet) → skeleton layout (`Skeleton` header, sidebar, stage); `error` → centred message `Couldn't load this project` with the error text and a "Try again" button calling `reload`; `conflict` → "This project changed in another window." and a "Reload" button. Otherwise the layout: `div.flex.h-svh.flex-col` containing `StudioToolbar`, then a row (`aside` 18rem wide with `StudioMediaPanel` and the message paragraph; then a column with `StudioStage`, a transport bar, and the `TimelineView`), where the transport bar has a Play/Pause `Button` (`aria-label` "Play" or "Pause" from `useTransportStore((s) => s.playing)`) calling `session?.toggle()` and a time readout.
  8. Transport readout helper: `formatClock(seconds)` → `m:ss.s`; put it in the same file.
  9. Note: while `status.phase` is `"error"` after content has loaded (a save failure), keep showing the editor and only the toolbar status text; distinguish by a `loadedOnce` ref set the first time `phase` becomes `"ready"`.

- [ ] **Step 4: Implement the routes and the harness**

Read `node_modules/next/dist/docs/` for the app router, `notFound`, and client components (AGENTS.md rule), then mirror `src/app/editor/[id]/page.tsx` + `editor-client.tsx` and `src/app/dev/playback/page.tsx` + `playback-client.tsx` exactly.

`src/app/studio/[id]/page.tsx`:

```tsx
import { StudioClient } from "@/app/studio/[id]/studio-client";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudioClient projectId={id} />;
}
```

`src/app/studio/[id]/studio-client.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

const SupabaseStudio = dynamic(
  () => import("@/app/studio/[id]/supabase-studio").then((m) => m.SupabaseStudio),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-svh flex-col">
        <Skeleton className="h-12 w-full rounded-none" />
        <div className="flex flex-1">
          <Skeleton className="hidden h-full w-72 rounded-none sm:block" />
          <Skeleton className="h-full flex-1 rounded-none" />
        </div>
      </div>
    ),
  },
);

export function StudioClient({ projectId }: { projectId: string }) {
  return <SupabaseStudio projectId={projectId} />;
}
```

Create `src/app/studio/[id]/supabase-studio.tsx` (`"use client"`): `export function SupabaseStudio({ projectId })` calls `useSupabaseStudioEnv(projectId)`; while it returns `null` shows the skeleton; when the project list has loaded and does not contain the id (the hook returns `{ missing: true }`: have `useSupabaseStudioEnv` return `{ env: StudioEnv | null; missing: boolean }`) shows "Project not found" with a `Link` to `/dashboard`; otherwise `<StudioView env={env} />`. Put the env hook in `supabase-env.ts` as specified above (add `"use client"`; it uses hooks).

`src/app/dev/studio/page.tsx`:

```tsx
import { notFound } from "next/navigation";

import { StudioDevClient } from "@/app/dev/studio/studio-dev-client";

// A developer harness for the studio editor: never served in production.
export default function StudioDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StudioDevClient />;
}
```

`src/app/dev/studio/studio-dev-client.tsx` dynamic-imports `StudioDev` from `@/app/dev/studio/studio-dev` (`"use client"` file you write with the in-memory env and the two sample buttons described above) with `ssr: false` and a plain loading line.

In `src/lib/supabase/middleware.ts` change the prefixes line to include `"/studio"`.

- [ ] **Step 5: Run the tests, type-check, lint, whole suite**

Run: `cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App" && npx vitest run src/components/studio` then `npx tsc --noEmit` then `npx eslint src/components/studio src/app/studio src/app/dev/studio src/lib/supabase/middleware.ts` then `npm test`
Expected: all pass; no type or lint errors. The load-failure test relies on `createTimelineSync` retrying four times at 1.5 s; if it is too slow, pass `delayMs`/`retryDelayMs` through a test-only option on `useTimelineSync` instead of lengthening timeouts, and ledger the change.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/julia/OneDrive/Desktop/Scrapbook App"
git add src/components/studio src/app/studio src/app/dev/studio src/lib/supabase/middleware.ts
git commit -m "feat: add the studio editor view, its real route and the developer harness" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verify in a real browser

No new code unless a check fails; a failure is a finding (diagnose with `superpowers:systematic-debugging`; fix test-first wherever the fault is in pure or testable code). Follow the browser rules in Global Constraints. All checks use `http://localhost:3000/dev/studio`.

- [ ] **Step 1: Prepare.** Start the dev server (`mcp__Claude_Browser__preview_start`, `scrapbook-dev`); wait for `/dev/studio` to return 200. Open the page (Chrome if connected, otherwise the built-in browser). Console must be clean. Click "Add sample clips" and "Add sample tone".

- [ ] **Step 2: Layout and states.** The editor appears: toolbar with the name and "Saved", media panel listing the three files, stage, transport bar, timeline. Expected: all present and sized sensibly; no overlap at 1368 wide.

- [ ] **Step 3: Add media.** Add Sample A with "Add": it appears on the main sequence, fills the stage letterboxed, is selected and shows on the timeline. Add Sample B: it follows A on the sequence. Add the tone with its "Add": it appears on the audio row at the playhead. Add Sample A again with "Overlay": a new overlay track appears on top and a small centred copy is on the stage, selected. Expected: all four, the overlay track on top, 40%-size centred overlay.

- [ ] **Step 4: Select, move, resize, rotate (real mouse).** On the stage, click the overlay: a purple box with handles appears exactly over it. Drag it: it follows the pointer and snaps to the frame's centre or edges with a guide line; release: **one** undo step (press the toolbar Undo once and it returns to where it started). Drag a corner handle: it resizes; drag the rotate handle: it rotates; each is one undo step. Click empty stage: selection clears. Shift-click two items and drag one: both move together. Expected: all behave; reading `useClipProjectStore` after each (via the page's debug handle if present, or by reading the timeline chips and DOM) matches.

- [ ] **Step 5: Locked and animated.** Lock the overlay's track with the timeline's `L` button: the stage box can still be clicked but shows no handles and cannot be dragged. Unlock. Expected: as described.

- [ ] **Step 6: Playback.** Press Space (focus on the page, not an input): the stage plays, the timeline playhead moves, sound plays (the tone), the selection box stays on the right item as the playhead moves. Pause. Seek with the ruler. Expected: no stutter, the box follows the clip.

- [ ] **Step 7: Frame size.** Change the frame to Portrait: the stage re-fits, clips keep their transforms, `saveFrame` runs once (dev harness: confirm via the memory env's call or console log you add temporarily and remove). Expected: re-fit without losing the selection or playback state beyond a reset to the start.

- [ ] **Step 8: Delete and tidy.** Select the overlay and press Delete: it goes and its track disappears; Undo brings both back. Expected: as described.

- [ ] **Step 9: Lifecycle.** Reload twice; navigate away mid-load and back: no console errors or warnings, one timeline, Space toggles once, no leftover audio.

- [ ] **Step 10: Record and clean up.** Save and send one or two screenshots (the stage with the selection box and the timeline). Stop the dev server, close any tab you opened. Write the results of Steps 2 to 9 as a table (check, expected, observed, pass/fail) in the final report. Fix any failure test-first, then run `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/editor src/lib/sync src/components/studio src/app/studio src/app/dev/studio`, and commit each fix with a message naming it.

---

### Task 10: Whole-branch checks

- [ ] **Step 1: Everything green.** Run `npm test`, `npx tsc --noEmit`, `npx eslint src`. Expected: all pass; no new lint errors beyond any that existed on `main` (compare with `git stash`-free means: run `npx eslint src/components/canvas src/components/timeline` on main only if unsure).

- [ ] **Step 2: Pure files stayed pure.** Run the purity grep from Global Constraints. Expected: no output.

- [ ] **Step 3: The old editor was not touched.** Run `git diff --stat main -- src/components/canvas src/components/timeline src/store src/app/editor`. Expected: no output.

- [ ] **Step 4: Production build and gating.** Stop the dev server, delete `.next/dev` if a stale generated types file breaks the type check, run `npm run build`; then start the production server (`scrapbook-prod`) and request `/dev/studio` (expect 404) and `/studio/anything` (expect a redirect to login, status 307 or 308, because the route is now protected). Stop the server. Expected: build exit 0; the two responses as stated.

---

## Self-Review

**Spec coverage (design doc, slice 1):**

| Requirement | Task |
|---|---|
| Route, load/save, states | 5 (sync hook), 8 (view, routes) |
| Media URLs resolved and refreshed | 4, 5 |
| Stage with select/move/resize/rotate, snapping, one undo per gesture | 3, 6, 9 Step 4 |
| Media panel: sequence / overlay / audio | 2, 7, 8, 9 Step 3 |
| Toolbar basics, frame picker, save status, undo/redo | 7, 8 |
| Timeline mounted, playback, transport | 5, 8, 9 Step 6 |
| Empty tracks removed on delete (decision 2) | 1, 9 Step 8 |
| Layer order is track order; overlay on its own track (decision 1) | 2 |
| Harness without login or database | 4 (memory storage), 8, 9 |
| `/studio` protected | 8, 10 Step 4 |

**Gaps accepted, stated up front:** no stage zoom or pan, keyframed clips not draggable on the stage, dragging on the timeline still leaves an emptied track behind, the real route is verified by composition tests and build, not end to end (needs the migration and a login).

**Placeholder scan:** none left; Task 5 Step 4 and Task 8 Step 3 describe browser/composition code by exact responsibilities and imports because they mirror existing files the executor must read (`playback-harness.tsx`, the old route files) and are verified in Task 9.

**Type consistency:** `EditorMedia`/`AddResult` (Task 2) feed `StudioView` (Task 8); `StageBox` (Task 3) feeds `StageInteraction` and `StudioStage` (Task 6); `MediaUrlSource` (Task 4) is in `StudioEnv` (Task 5) and the hooks; `StudioEnv.library` is `MediaItem[]` (existing type) used by `StudioMediaPanel` (Task 7); `useTimelineSync`'s new `setFrame` (Task 5) is used by `StudioView` (Task 8).

**Review Focus coverage:** one drag one undo (Task 6 design, Task 9 Step 4), stage/painter agreement (Task 3 tests, Task 9 Step 4), locked/hidden/animated (Task 3 tests, Task 9 Step 5), environment seam (Task 5/8; `StudioView` has no Supabase import), media URLs (Task 4 tests), lifecycle (Task 5 rules, Task 8 test "does not touch the project after it unmounts", Task 9 Step 9), save safety (existing `createTimelineSync` plus the frame test), keys (Task 9 Step 6).

## Execution Handoff

Before Task 9, if you want real-Chrome results for Steps 4 and 6, enable the Claude in Chrome extension and bring that window to the front and keep it uncovered. The built-in browser can run the pointer checks but not time-based playback.
