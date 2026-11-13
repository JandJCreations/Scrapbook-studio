# Timeline Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save and load a `TimelineProject` in Supabase as one JSON document per project, with validated loading, revision-checked atomic saves, a debounced autosaver, version-history snapshots and a media-URL resolver, all unit-tested.

**Architecture:** The document format (Zod parse/serialize) and a `TimelineStorage` interface are framework-free and tested against an in-memory fake. A Supabase implementation of that interface is tested with a small recording fake of the query builder. A pure `createAutosaver` (debounce, serialized saves) and a `createTimelineSync` controller (load with retry, revision tracking, conflict handling, committed-state-only saves) hold all the logic; a thin React hook only wires them to the Supabase client and the clip store. The old tables and sync code are not touched.

**Tech Stack:** TypeScript (strict), Vitest with fake timers, Zod 4 (existing), `@supabase/supabase-js` types (existing), zustand (existing).

**Spec:** `docs/superpowers/specs/2026-10-14-clip-timeline-design.md`, section 7 (revised 2026-10-15). Builds on `docs/superpowers/plans/2026-10-14-clip-timeline-core.md` (already merged to `main`).

## Global Constraints

- Work on branch `feature/timeline-persistence`; never commit to `main`.
- The migration is **additive**: `canvas_objects`, `audio_tracks`, `audio_clips` and all existing sync code (`src/lib/sync/project-content-sync.ts`, `src/hooks/use-project-content-sync.ts`) stay untouched and working.
- The saved document contains `mediaId` only, never signed URLs.
- A malformed or unsupported document is a load error. It is never repaired and never overwritten.
- A save must never run before a successful load, and only the last *committed* project is saved, never a mid-drag preview.
- A save replaces the whole document in one `UPDATE ... WHERE id = ? AND timeline_rev = ?`; zero rows updated is a conflict, not an overwrite.
- Migrations are pasted by hand into the Supabase SQL Editor (this repo has no CLI workflow); this plan only ships the SQL file.
- Template conversion (`apply-template.ts`, `template-catalog.ts`) is **out of scope**; it belongs to the port plan.
- No `any`. Run tests with `npx vitest run <file>`; type-check with `npx tsc --noEmit`.
- If `node` is not found in a spawned PowerShell, run `$env:Path += ";C:\Program Files\nodejs"` first.
- End every commit message with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).

## Review Focus

Failure modes the spec implies but a reasonable implementation could miss. Each has a test in the task named on the right.

- A failed, retried or malformed load must never lead to an overwrite of the stored project: no save before a successful load, and a malformed document is a permanent error that is not retried. (Task 1, Task 5)
- A stale revision (second tab or device) must be a conflict, never an overwrite, and after a conflict no further autosave happens until the user reloads. (Task 2, Task 5)
- Closing or hiding the tab right after an edit must not lose it (stop and flush save immediately), and a drag in progress must save only the pre-drag state. (Task 5)
- An edit made while a save is in flight must trigger a follow-up save, with never two saves running at once, and revision numbers must stay sequential. (Task 3, Task 5)
- A persistently failing save (offline, expired login) must not retry forever or wedge the autosaver, and must recover on the next edit. (Task 3, Task 5)

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0006_project_timeline.sql` | Adds `projects.timeline` and `projects.timeline_rev` |
| `src/lib/supabase/database.types.ts` | Modified: the two new `projects` columns |
| `src/lib/sync/timeline-document.ts` | Zod schema, `serializeTimeline`, `parseTimeline`, `emptyTimeline`, snapshot helpers, `TimelineDocumentError` |
| `src/lib/sync/timeline-storage.ts` | `TimelineStorage` interface and its result types |
| `src/lib/sync/supabase-timeline-storage.ts` | Supabase implementation of `TimelineStorage` |
| `src/lib/sync/autosaver.ts` | Framework-free debounced, serialized saver |
| `src/lib/sync/media-urls.ts` | `collectMediaIds`, `resolveMediaUrls` (pure, dependency-injected) |
| `src/lib/sync/supabase-media-deps.ts` | Supabase wiring for `resolveMediaUrls` |
| `src/lib/sync/test-utils.ts` | `MemoryTimelineStorage` fake (tests only) |
| `src/lib/sync/timeline-sync.ts` | `createTimelineSync` controller |
| `src/store/use-clip-project-store.ts` | Modified: `selectSavableProject` selector |
| `src/hooks/use-timeline-sync.ts` | Thin React hook |

Each `*.test.ts` sits beside the file it tests.

---

### Task 1: Document format

**Files:**
- Create: `src/lib/sync/timeline-document.ts`
- Test: `src/lib/sync/timeline-document.test.ts`

**Interfaces:**
- Consumes: `addTrack` (`@/lib/timeline/tracks`), `createId`, `IdFn` (`@/lib/timeline/ids`), types `Clip`, `TimelineProject`, `Track` (`@/types/timeline`); test helpers from `@/lib/timeline/test-utils`.
- Produces:
  - `TIMELINE_SCHEMA_VERSION = 1`
  - `class TimelineDocumentError extends Error`
  - `interface TimelineDocument { schemaVersion: 1; tracks: Track[]; clips: Clip[] }`
  - `interface FrameSize { width: number; height: number }`
  - `serializeTimeline(project): TimelineDocument` (drops the project id)
  - `parseTimeline(projectId: string, raw: unknown): TimelineProject`. Throws `TimelineDocumentError` for any invalid document (wrong shape or version, unknown track type, duplicate ids, a clip on a missing track, `speed <= 0`, `sourceOut <= sourceIn`, negative `start`, non-finite numbers).
  - `emptyTimeline(projectId, newId?: IdFn): TimelineProject` (one video track at order 0, one audio track at order 1, no clips)
  - `interface TimelineSnapshot { schemaVersion: 1; timeline: TimelineDocument; frame: FrameSize }`
  - `serializeSnapshot(project, frame): TimelineSnapshot`
  - `parseSnapshot(projectId, raw): { project: TimelineProject; frame: FrameSize }`. A snapshot without `schemaVersion: 1` throws `TimelineDocumentError` whose message contains `older editor`.

- [ ] **Step 1: Write the failing test**

`src/lib/sync/timeline-document.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  emptyTimeline,
  parseSnapshot,
  parseTimeline,
  serializeSnapshot,
  serializeTimeline,
  TimelineDocumentError,
} from "@/lib/sync/timeline-document";
import { makeClip, makeProject, makeStandardTracks, seqIds } from "@/lib/timeline/test-utils";

const keyframe = { id: "k1", time: 1, x: 0, y: 0, rotation: 0, opacity: 1 };

const sample = () =>
  makeProject(makeStandardTracks(), [
    makeClip({ id: "a", start: 0, sourceOut: 10, keyframes: [keyframe] }),
    makeClip({
      id: "o",
      trackId: "t2",
      kind: "image",
      sourceDuration: null,
      start: 2,
      sourceOut: 3,
      groupId: "g1",
    }),
  ]);

/** A serialized document as plain JSON, the way it comes back from the database. */
const sampleJson = () => JSON.parse(JSON.stringify(serializeTimeline(sample())));

describe("serializeTimeline / parseTimeline", () => {
  it("round-trips a project", () => {
    const parsed = parseTimeline("p1", sampleJson());
    expect(parsed).toEqual(sample());
  });

  it("writes schemaVersion 1 and drops the project id", () => {
    const doc = serializeTimeline(sample());
    expect(doc.schemaVersion).toBe(1);
    expect("id" in doc).toBe(false);
  });

  it("uses the project id it is given", () => {
    expect(parseTimeline("other", sampleJson()).id).toBe("other");
  });
});

describe("parseTimeline: rejects invalid documents", () => {
  it.each([[null], ["text"], [[]], [42]])("rejects the non-object %j", (raw) => {
    expect(() => parseTimeline("p1", raw)).toThrow(TimelineDocumentError);
    expect(() => parseTimeline("p1", raw)).toThrow(/\(root\)/);
  });

  it("rejects a different schemaVersion", () => {
    const doc = sampleJson();
    doc.schemaVersion = 2;
    expect(() => parseTimeline("p1", doc)).toThrow(/schemaVersion/);
  });

  it("rejects a missing tracks array", () => {
    const doc = sampleJson();
    delete doc.tracks;
    expect(() => parseTimeline("p1", doc)).toThrow(/tracks/);
  });

  it("rejects an unknown track type", () => {
    const doc = sampleJson();
    doc.tracks[0].type = "hologram";
    expect(() => parseTimeline("p1", doc)).toThrow(/tracks\.0\.type/);
  });

  it("rejects duplicate track ids", () => {
    const doc = sampleJson();
    doc.tracks[1].id = doc.tracks[0].id;
    expect(() => parseTimeline("p1", doc)).toThrow(/Duplicate track id/);
  });

  it("rejects duplicate clip ids", () => {
    const doc = sampleJson();
    doc.clips[1].id = doc.clips[0].id;
    expect(() => parseTimeline("p1", doc)).toThrow(/Duplicate clip id/);
  });

  it("rejects a clip on a track that does not exist", () => {
    const doc = sampleJson();
    doc.clips[0].trackId = "gone";
    expect(() => parseTimeline("p1", doc)).toThrow(/missing track/);
  });

  it("rejects a zero or negative speed", () => {
    const doc = sampleJson();
    doc.clips[0].speed = 0;
    expect(() => parseTimeline("p1", doc)).toThrow(/clips\.0\.speed/);
  });

  it("rejects sourceOut that is not greater than sourceIn", () => {
    const doc = sampleJson();
    doc.clips[0].sourceOut = doc.clips[0].sourceIn;
    expect(() => parseTimeline("p1", doc)).toThrow(/clips\.0\.sourceOut/);
  });

  it("rejects a negative start", () => {
    const doc = sampleJson();
    doc.clips[0].start = -1;
    expect(() => parseTimeline("p1", doc)).toThrow(/clips\.0\.start/);
  });

  it("rejects non-finite numbers", () => {
    const doc = sampleJson();
    doc.clips[0].start = Infinity;
    expect(() => parseTimeline("p1", doc)).toThrow(/clips\.0\.start/);
  });

  it("rejects adjustments that are not objects", () => {
    const doc = sampleJson();
    doc.clips[0].adjustments.photo = "nope";
    expect(() => parseTimeline("p1", doc)).toThrow(/adjustments/);
  });
});

describe("emptyTimeline", () => {
  it("has one main video track and one audio track and no clips", () => {
    const project = emptyTimeline("p9", seqIds());
    expect(project.id).toBe("p9");
    expect(project.clips).toEqual([]);
    expect(project.tracks.map((t) => [t.id, t.type, t.order])).toEqual([
      ["id-1", "video", 0],
      ["id-2", "audio", 1],
    ]);
  });
});

describe("snapshots", () => {
  const frame = { width: 1080, height: 1920 };

  it("round-trips a project and its frame", () => {
    const raw = JSON.parse(JSON.stringify(serializeSnapshot(sample(), frame)));
    expect(parseSnapshot("p1", raw)).toEqual({ project: sample(), frame });
  });

  it("rejects an old-shape snapshot with a clear message", () => {
    const old = { objects: [], tracks: [], clips: [], frame };
    expect(() => parseSnapshot("p1", old)).toThrow(/older editor/);
    expect(() => parseSnapshot("p1", old)).toThrow(TimelineDocumentError);
  });

  it("rejects a snapshot with a bad frame", () => {
    const raw = JSON.parse(JSON.stringify(serializeSnapshot(sample(), frame)));
    raw.frame.width = 0;
    expect(() => parseSnapshot("p1", raw)).toThrow(TimelineDocumentError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/sync/timeline-document.test.ts`
Expected: FAIL; `@/lib/sync/timeline-document` cannot be resolved.

- [ ] **Step 3: Implement the document module**

`src/lib/sync/timeline-document.ts`:

```ts
import { z } from "zod";

import { createId, type IdFn } from "@/lib/timeline/ids";
import { addTrack } from "@/lib/timeline/tracks";
import type { Clip, TimelineProject, Track } from "@/types/timeline";

export const TIMELINE_SCHEMA_VERSION = 1;

export class TimelineDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineDocumentError";
  }
}

export interface FrameSize {
  width: number;
  height: number;
}

export interface TimelineDocument {
  schemaVersion: typeof TIMELINE_SCHEMA_VERSION;
  tracks: Track[];
  clips: Clip[];
}

export interface TimelineSnapshot {
  schemaVersion: typeof TIMELINE_SCHEMA_VERSION;
  timeline: TimelineDocument;
  frame: FrameSize;
}

// Photo/video/text adjustment shapes are owned by their own types and change
// often; here we only require "an object or null" and trust the editor to
// have written the rest.
const looseObject = z.record(z.string(), z.unknown());

const trackSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["video", "overlay", "audio"]),
  order: z.number(),
  muted: z.boolean(),
  locked: z.boolean(),
  hidden: z.boolean(),
  solo: z.boolean(),
});

const keyframeSchema = z.object({
  id: z.string(),
  time: z.number(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  opacity: z.number(),
});

// Only the constraints that would otherwise cause division by zero, NaN or
// an impossible clip are enforced; bounds the engine already tolerates
// (e.g. sourceOut a hair past sourceDuration) must not brick a project.
const clipSchema = z
  .object({
    id: z.string().min(1),
    trackId: z.string().min(1),
    kind: z.enum(["video", "image", "text", "audio", "sticker"]),
    name: z.string(),
    mediaId: z.string(),
    sourceDuration: z.number().positive().nullable(),
    start: z.number().min(0),
    sourceIn: z.number().min(0),
    sourceOut: z.number(),
    speed: z.number().positive(),
    reversed: z.boolean(),
    loop: z.boolean(),
    volume: z.number(),
    muted: z.boolean(),
    fadeIn: z.number().min(0),
    fadeOut: z.number().min(0),
    transform: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      rotation: z.number(),
      opacity: z.number(),
    }),
    adjustments: z.object({
      photo: looseObject.nullable(),
      video: looseObject.nullable(),
      text: looseObject.nullable(),
    }),
    keyframes: z.array(keyframeSchema),
    groupId: z.string().nullable(),
    locked: z.boolean(),
    isPlaceholder: z.boolean(),
  })
  .refine((clip) => clip.sourceOut > clip.sourceIn, {
    message: "sourceOut must be greater than sourceIn",
    path: ["sourceOut"],
  });

const documentSchema = z.object({
  schemaVersion: z.literal(TIMELINE_SCHEMA_VERSION),
  tracks: z.array(trackSchema),
  clips: z.array(clipSchema),
});

const frameSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

export function serializeTimeline(project: TimelineProject): TimelineDocument {
  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    tracks: project.tracks,
    clips: project.clips,
  };
}

/** Validates a stored document. Throws TimelineDocumentError; never repairs. */
export function parseTimeline(projectId: string, raw: unknown): TimelineProject {
  const result = documentSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    throw new TimelineDocumentError(`Invalid timeline at ${path}: ${issue.message}`);
  }

  const { tracks, clips } = result.data;

  const trackIds = new Set<string>();
  for (const track of tracks) {
    if (trackIds.has(track.id)) {
      throw new TimelineDocumentError(`Duplicate track id "${track.id}"`);
    }
    trackIds.add(track.id);
  }

  const clipIds = new Set<string>();
  for (const clip of clips) {
    if (clipIds.has(clip.id)) {
      throw new TimelineDocumentError(`Duplicate clip id "${clip.id}"`);
    }
    clipIds.add(clip.id);
    if (!trackIds.has(clip.trackId)) {
      throw new TimelineDocumentError(
        `Clip "${clip.id}" references missing track "${clip.trackId}"`,
      );
    }
  }

  return { id: projectId, tracks: tracks as Track[], clips: clips as unknown as Clip[] };
}

/** A brand-new project: one main video track and one audio track. */
export function emptyTimeline(projectId: string, newId: IdFn = createId): TimelineProject {
  const base: TimelineProject = { id: projectId, tracks: [], clips: [] };
  return addTrack(addTrack(base, "video", newId), "audio", newId);
}

export function serializeSnapshot(project: TimelineProject, frame: FrameSize): TimelineSnapshot {
  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    timeline: serializeTimeline(project),
    frame,
  };
}

export function parseSnapshot(
  projectId: string,
  raw: unknown,
): { project: TimelineProject; frame: FrameSize } {
  const isCurrent =
    typeof raw === "object" &&
    raw !== null &&
    (raw as { schemaVersion?: unknown }).schemaVersion === TIMELINE_SCHEMA_VERSION;
  if (!isCurrent) {
    throw new TimelineDocumentError(
      "This version was saved by an older editor and can't be restored.",
    );
  }

  const { timeline, frame } = raw as { timeline?: unknown; frame?: unknown };
  const parsedFrame = frameSchema.safeParse(frame);
  if (!parsedFrame.success) {
    throw new TimelineDocumentError("Invalid frame size in saved version");
  }
  return { project: parseTimeline(projectId, timeline), frame: parsedFrame.data };
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `npx vitest run src/lib/sync/timeline-document.test.ts` then `npx tsc --noEmit`
Expected: all tests PASS; no type errors. If a `toThrow(/clips\.0\.speed/)`-style path assertion fails because Zod formats the path differently, read the actual message and adjust only that regex, never loosen the validation.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/timeline-document.ts src/lib/sync/timeline-document.test.ts
git commit -m "feat: add validated timeline document format" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migration, DB types and Supabase storage

**Files:**
- Create: `supabase/migrations/0006_project_timeline.sql`
- Modify: `src/lib/supabase/database.types.ts` (the `projects` table)
- Create: `src/lib/sync/timeline-storage.ts`
- Create: `src/lib/sync/supabase-timeline-storage.ts`
- Test: `src/lib/sync/supabase-timeline-storage.test.ts`

**Interfaces:**
- Consumes: Task 1 exports (`emptyTimeline`, `parseSnapshot`, `parseTimeline`, `serializeSnapshot`, `serializeTimeline`, `FrameSize`, `TimelineDocumentError`); `Database` type; `SupabaseClient` type.
- Produces:
  - `interface LoadedTimeline { project: TimelineProject; rev: number; frame: FrameSize }`
  - `type SaveResult = { ok: true; rev: number } | { ok: false; reason: "conflict" }`
  - `interface VersionSummary { id: string; label: string | null; createdAt: string }`
  - `interface TimelineStorage` with: `load(projectId): Promise<LoadedTimeline>`; `save(projectId, project, expectedRev): Promise<SaveResult>`; `saveVersion(projectId, project, frame, label?): Promise<void>`; `listVersions(projectId): Promise<VersionSummary[]>`; `loadVersion(projectId, versionId): Promise<{ project: TimelineProject; frame: FrameSize }>`; `deleteVersion(versionId): Promise<void>`
  - `createSupabaseTimelineStorage(client: SupabaseClient<Database>): TimelineStorage`. A save that updates zero rows returns `{ ok: false, reason: "conflict" }` (this also covers "project no longer available"); any database error throws.

- [ ] **Step 1: Create the migration**

`supabase/migrations/0006_project_timeline.sql`:

```sql
-- Stores the unified clip/track timeline as one JSON document per project.
-- Run in the Supabase SQL Editor after 0001-0005.
-- Additive: canvas_objects / audio_tracks / audio_clips are untouched and
-- keep working. The existing RLS policy on public.projects already covers
-- both new columns.

alter table public.projects
  add column if not exists timeline jsonb,
  add column if not exists timeline_rev integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_timeline_is_object'
  ) then
    alter table public.projects
      add constraint projects_timeline_is_object
      check (timeline is null or jsonb_typeof(timeline) = 'object');
  end if;
end $$;
```

- [ ] **Step 2: Add the columns to the generated types**

In `src/lib/supabase/database.types.ts`, inside the `projects` table:

Row block: replace

```ts
          frame_height: number;
          folder_id: string | null;
```

with

```ts
          frame_height: number;
          folder_id: string | null;
          timeline: unknown;
          timeline_rev: number;
```

Insert and Update blocks (the same two lines appear in both, so replace both occurrences): replace

```ts
          frame_height?: number;
          folder_id?: string | null;
```

with

```ts
          frame_height?: number;
          folder_id?: string | null;
          timeline?: unknown;
          timeline_rev?: number;
```

Run: `npx tsc --noEmit`. Expected: no new errors.

- [ ] **Step 3: Create the storage interface**

`src/lib/sync/timeline-storage.ts`:

```ts
import type { FrameSize } from "@/lib/sync/timeline-document";
import type { TimelineProject } from "@/types/timeline";

export interface LoadedTimeline {
  project: TimelineProject;
  /** Revision this project was loaded at; pass it back to `save`. */
  rev: number;
  frame: FrameSize;
}

export type SaveResult = { ok: true; rev: number } | { ok: false; reason: "conflict" };

export interface VersionSummary {
  id: string;
  label: string | null;
  createdAt: string;
}

export interface TimelineStorage {
  /** Throws TimelineDocumentError for a malformed stored document. */
  load(projectId: string): Promise<LoadedTimeline>;
  /**
   * Replaces the stored timeline only if its revision still equals
   * `expectedRev`. Returns `conflict` instead of overwriting; throws on
   * database errors.
   */
  save(projectId: string, project: TimelineProject, expectedRev: number): Promise<SaveResult>;
  saveVersion(
    projectId: string,
    project: TimelineProject,
    frame: FrameSize,
    label?: string,
  ): Promise<void>;
  listVersions(projectId: string): Promise<VersionSummary[]>;
  loadVersion(
    projectId: string,
    versionId: string,
  ): Promise<{ project: TimelineProject; frame: FrameSize }>;
  deleteVersion(versionId: string): Promise<void>;
}
```

- [ ] **Step 4: Write the failing test**

`src/lib/sync/supabase-timeline-storage.test.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseTimelineStorage } from "@/lib/sync/supabase-timeline-storage";
import {
  serializeSnapshot,
  serializeTimeline,
  TimelineDocumentError,
} from "@/lib/sync/timeline-document";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";

interface FakeCall {
  table: string;
  op: "select" | "update" | "insert" | "delete";
  payload: unknown;
  columns: string | null;
  filters: Array<[string, unknown]>;
}
interface FakeResult {
  data: unknown;
  error: { message: string } | null;
}
interface FakeBuilder {
  select(columns?: string): FakeBuilder;
  update(payload: unknown): FakeBuilder;
  insert(payload: unknown): FakeBuilder;
  delete(): FakeBuilder;
  eq(column: string, value: unknown): FakeBuilder;
  order(column: string, options?: unknown): FakeBuilder;
  single(): FakeBuilder;
  then(
    onFulfilled: (value: FakeResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ): Promise<unknown>;
}

/** Records the query chain and answers with whatever `respond` returns. */
function fakeClient(respond: (call: FakeCall) => FakeResult) {
  const calls: FakeCall[] = [];
  const client = {
    from(table: string): FakeBuilder {
      const call: FakeCall = { table, op: "select", payload: undefined, columns: null, filters: [] };
      const builder: FakeBuilder = {
        select(columns) {
          call.columns = columns ?? null;
          return builder;
        },
        update(payload) {
          call.op = "update";
          call.payload = payload;
          return builder;
        },
        insert(payload) {
          call.op = "insert";
          call.payload = payload;
          return builder;
        },
        delete() {
          call.op = "delete";
          return builder;
        },
        eq(column, value) {
          call.filters.push([column, value]);
          return builder;
        },
        order() {
          return builder;
        },
        single() {
          return builder;
        },
        then(onFulfilled, onRejected) {
          calls.push(call);
          return Promise.resolve(respond(call)).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

const ok = (data: unknown): FakeResult => ({ data, error: null });
const fail = (message: string): FakeResult => ({ data: null, error: { message } });

const project = () =>
  makeProject(makeStandardTracks(), [makeClip({ id: "a", start: 0, sourceOut: 10 })]);
const frame = { width: 1920, height: 1080 };

describe("load", () => {
  it("parses the stored document and returns its revision and frame", async () => {
    const { client, calls } = fakeClient(() =>
      ok({
        timeline: JSON.parse(JSON.stringify(serializeTimeline(project()))),
        timeline_rev: 7,
        frame_width: 1920,
        frame_height: 1080,
      }),
    );
    const loaded = await createSupabaseTimelineStorage(client).load("p1");
    expect(loaded.project).toEqual(project());
    expect(loaded.rev).toBe(7);
    expect(loaded.frame).toEqual(frame);
    expect(calls[0].table).toBe("projects");
    expect(calls[0].columns).toContain("timeline");
    expect(calls[0].filters).toEqual([["id", "p1"]]);
  });

  it("returns a default timeline when none has been saved yet", async () => {
    const { client } = fakeClient(() =>
      ok({ timeline: null, timeline_rev: 0, frame_width: 1280, frame_height: 720 }),
    );
    const loaded = await createSupabaseTimelineStorage(client).load("p9");
    expect(loaded.project.id).toBe("p9");
    expect(loaded.project.clips).toEqual([]);
    expect(loaded.project.tracks.map((t) => t.type)).toEqual(["video", "audio"]);
    expect(loaded.rev).toBe(0);
  });

  it("rejects with TimelineDocumentError for a malformed document", async () => {
    const { client } = fakeClient(() =>
      ok({ timeline: { schemaVersion: 2 }, timeline_rev: 1, frame_width: 1, frame_height: 1 }),
    );
    await expect(createSupabaseTimelineStorage(client).load("p1")).rejects.toBeInstanceOf(
      TimelineDocumentError,
    );
  });

  it("rejects on a database error", async () => {
    const { client } = fakeClient(() => fail("boom"));
    await expect(createSupabaseTimelineStorage(client).load("p1")).rejects.toMatchObject({
      message: "boom",
    });
  });
});

describe("save", () => {
  it("updates only when the revision matches and returns the new revision", async () => {
    const { client, calls } = fakeClient(() => ok([{ timeline_rev: 4 }]));
    const result = await createSupabaseTimelineStorage(client).save("p1", project(), 3);
    expect(result).toEqual({ ok: true, rev: 4 });
    expect(calls[0].op).toBe("update");
    expect(calls[0].payload).toEqual({
      timeline: serializeTimeline(project()),
      timeline_rev: 4,
    });
    expect(calls[0].filters).toEqual([
      ["id", "p1"],
      ["timeline_rev", 3],
    ]);
  });

  it("reports a conflict when no row matched the revision", async () => {
    const { client } = fakeClient(() => ok([]));
    expect(await createSupabaseTimelineStorage(client).save("p1", project(), 3)).toEqual({
      ok: false,
      reason: "conflict",
    });
  });

  it("treats a null result as a conflict too", async () => {
    const { client } = fakeClient(() => ok(null));
    expect(await createSupabaseTimelineStorage(client).save("p1", project(), 3)).toEqual({
      ok: false,
      reason: "conflict",
    });
  });

  it("throws on a database error instead of reporting a conflict", async () => {
    const { client } = fakeClient(() => fail("offline"));
    await expect(createSupabaseTimelineStorage(client).save("p1", project(), 3)).rejects.toMatchObject({
      message: "offline",
    });
  });
});

describe("versions", () => {
  it("saves a snapshot with a trimmed label", async () => {
    const { client, calls } = fakeClient(() => ok(null));
    await createSupabaseTimelineStorage(client).saveVersion("p1", project(), frame, "  Before cut ");
    expect(calls[0].table).toBe("project_versions");
    expect(calls[0].op).toBe("insert");
    expect(calls[0].payload).toEqual({
      project_id: "p1",
      label: "Before cut",
      snapshot: serializeSnapshot(project(), frame),
    });
  });

  it.each([[undefined], [""], ["   "]])("stores a null label for %j", async (label) => {
    const { client, calls } = fakeClient(() => ok(null));
    await createSupabaseTimelineStorage(client).saveVersion("p1", project(), frame, label);
    expect((calls[0].payload as { label: unknown }).label).toBeNull();
  });

  it("lists versions newest first as summaries", async () => {
    const { client } = fakeClient(() =>
      ok([{ id: "v1", label: "A", created_at: "2026-10-15T00:00:00Z" }]),
    );
    expect(await createSupabaseTimelineStorage(client).listVersions("p1")).toEqual([
      { id: "v1", label: "A", createdAt: "2026-10-15T00:00:00Z" },
    ]);
  });

  it("loads and parses a current snapshot", async () => {
    const { client } = fakeClient(() =>
      ok({ snapshot: JSON.parse(JSON.stringify(serializeSnapshot(project(), frame))) }),
    );
    expect(await createSupabaseTimelineStorage(client).loadVersion("p1", "v1")).toEqual({
      project: project(),
      frame,
    });
  });

  it("refuses to load an old-shape snapshot", async () => {
    const { client } = fakeClient(() => ok({ snapshot: { objects: [], tracks: [], clips: [], frame } }));
    await expect(createSupabaseTimelineStorage(client).loadVersion("p1", "v1")).rejects.toThrow(
      /older editor/,
    );
  });

  it("deletes by id and surfaces errors", async () => {
    const { client, calls } = fakeClient(() => ok(null));
    await createSupabaseTimelineStorage(client).deleteVersion("v1");
    expect(calls[0].op).toBe("delete");
    expect(calls[0].filters).toEqual([["id", "v1"]]);

    const failing = fakeClient(() => fail("denied"));
    await expect(createSupabaseTimelineStorage(failing.client).deleteVersion("v1")).rejects.toMatchObject({
      message: "denied",
    });
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run src/lib/sync/supabase-timeline-storage.test.ts`
Expected: FAIL; `@/lib/sync/supabase-timeline-storage` cannot be resolved.

- [ ] **Step 6: Implement the Supabase storage**

`src/lib/sync/supabase-timeline-storage.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import {
  emptyTimeline,
  parseSnapshot,
  parseTimeline,
  serializeSnapshot,
  serializeTimeline,
} from "@/lib/sync/timeline-document";
import type { TimelineStorage } from "@/lib/sync/timeline-storage";

export function createSupabaseTimelineStorage(client: SupabaseClient<Database>): TimelineStorage {
  return {
    async load(projectId) {
      const { data, error } = await client
        .from("projects")
        .select("timeline, timeline_rev, frame_width, frame_height")
        .eq("id", projectId)
        .single();
      if (error) throw error;

      const project =
        data.timeline == null ? emptyTimeline(projectId) : parseTimeline(projectId, data.timeline);
      return {
        project,
        rev: data.timeline_rev,
        frame: { width: data.frame_width, height: data.frame_height },
      };
    },

    async save(projectId, project, expectedRev) {
      // One UPDATE guarded by the revision: atomic, and zero rows means
      // someone else saved first (or the project is gone).
      const { data, error } = await client
        .from("projects")
        .update({ timeline: serializeTimeline(project), timeline_rev: expectedRev + 1 })
        .eq("id", projectId)
        .eq("timeline_rev", expectedRev)
        .select("timeline_rev");
      if (error) throw error;
      if (!data || data.length === 0) return { ok: false, reason: "conflict" };
      return { ok: true, rev: data[0].timeline_rev };
    },

    async saveVersion(projectId, project, frame, label) {
      const { error } = await client.from("project_versions").insert({
        project_id: projectId,
        label: label?.trim() || null,
        snapshot: serializeSnapshot(project, frame),
      });
      if (error) throw error;
    },

    async listVersions(projectId) {
      const { data, error } = await client
        .from("project_versions")
        .select("id, label, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        label: row.label,
        createdAt: row.created_at,
      }));
    },

    async loadVersion(projectId, versionId) {
      const { data, error } = await client
        .from("project_versions")
        .select("snapshot")
        .eq("id", versionId)
        .single();
      if (error || !data) throw error ?? new Error("Version not found");
      return parseSnapshot(projectId, data.snapshot);
    },

    async deleteVersion(versionId) {
      const { error } = await client.from("project_versions").delete().eq("id", versionId);
      if (error) throw error;
    },
  };
}
```

- [ ] **Step 7: Run the tests and the type check**

Run: `npx vitest run src/lib/sync` then `npx tsc --noEmit`
Expected: all PASS; no type errors.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0006_project_timeline.sql src/lib/supabase/database.types.ts src/lib/sync/timeline-storage.ts src/lib/sync/supabase-timeline-storage.ts src/lib/sync/supabase-timeline-storage.test.ts
git commit -m "feat: add timeline migration and revision-checked Supabase storage" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Autosaver

**Files:**
- Create: `src/lib/sync/autosaver.ts`
- Test: `src/lib/sync/autosaver.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface AutosaverOptions { save: () => Promise<void>; delayMs: number; onError?: (error: unknown) => void }`
  - `interface Autosaver { schedule(): void; flush(): Promise<void>; cancel(): void }`
  - `createAutosaver(options): Autosaver`
  - Rules: `schedule` debounces; saves never overlap (a `schedule` that fires during a save triggers exactly one follow-up save after it finishes); `flush` runs a pending save now and resolves when idle; `cancel` drops a pending save; a save that rejects or throws synchronously calls `onError` and leaves the saver usable.

- [ ] **Step 1: Write the failing test**

`src/lib/sync/autosaver.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAutosaver } from "@/lib/sync/autosaver";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createAutosaver", () => {
  it("debounces: many schedules inside the delay produce one save", async () => {
    const save = vi.fn(async () => {});
    const saver = createAutosaver({ save, delayMs: 100 });

    saver.schedule();
    await vi.advanceTimersByTimeAsync(60);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(60);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(99);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush saves immediately and does not save a second time later", async () => {
    const save = vi.fn(async () => {});
    const saver = createAutosaver({ save, delayMs: 100 });

    saver.schedule();
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing pending resolves without saving", async () => {
    const save = vi.fn(async () => {});
    const saver = createAutosaver({ save, delayMs: 100 });
    await saver.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("cancel drops a pending save", async () => {
    const save = vi.fn(async () => {});
    const saver = createAutosaver({ save, delayMs: 100 });
    saver.schedule();
    saver.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
  });

  it("runs one follow-up save when an edit arrives mid-save, never two at once", async () => {
    let release: () => void = () => {};
    let running = 0;
    let maxRunning = 0;
    const save = vi.fn(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      running -= 1;
    });
    const saver = createAutosaver({ save, delayMs: 100 });

    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);

    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1); // first save still in flight

    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);

    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(running).toBe(0);
    expect(maxRunning).toBe(1);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("flush waits for an in-flight save and its follow-up", async () => {
    let release: () => void = () => {};
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const saver = createAutosaver({ save, delayMs: 100 });

    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);
    saver.schedule();

    let flushed = false;
    const flushing = saver.flush().then(() => {
      flushed = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(flushed).toBe(false);

    release();
    await vi.advanceTimersByTimeAsync(0);
    release();
    await flushing;
    expect(flushed).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("reports a rejected save through onError and stays usable", async () => {
    const onError = vi.fn();
    let calls = 0;
    const save = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
    });
    const saver = createAutosaver({ save, delayMs: 100, onError });

    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(onError).toHaveBeenCalledTimes(1);

    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("is not wedged by a save that throws synchronously", async () => {
    const onError = vi.fn();
    const save = vi.fn((): Promise<void> => {
      throw new Error("sync boom");
    });
    const saver = createAutosaver({ save, delayMs: 100, onError });

    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);

    expect(onError).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/sync/autosaver.test.ts`
Expected: FAIL; `@/lib/sync/autosaver` cannot be resolved.

- [ ] **Step 3: Implement the autosaver**

`src/lib/sync/autosaver.ts`:

```ts
export interface AutosaverOptions {
  save: () => Promise<void>;
  delayMs: number;
  onError?: (error: unknown) => void;
}

export interface Autosaver {
  /** Debounced: (re)starts the timer. */
  schedule(): void;
  /** Runs a pending save now and resolves once nothing is running or queued. */
  flush(): Promise<void>;
  /** Drops a pending save. A save already in flight still completes. */
  cancel(): void;
}

export function createAutosaver({ save, delayMs, onError }: AutosaverOptions): Autosaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let rerun = false;

  function run(): Promise<void> {
    if (inFlight) {
      rerun = true;
      return inFlight;
    }
    // `save` runs in a microtask so `inFlight` is assigned before it can
    // finish, even if it throws synchronously.
    const current: Promise<void> = Promise.resolve()
      .then(save)
      .catch((error: unknown) => onError?.(error))
      .then(() => {
        inFlight = null;
        if (rerun) {
          rerun = false;
          return run();
        }
      });
    inFlight = current;
    return current;
  }

  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, delayMs);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        await run();
      } else if (inFlight) {
        await inFlight;
      }
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      rerun = false;
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/sync/autosaver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/autosaver.ts src/lib/sync/autosaver.test.ts
git commit -m "feat: add debounced serialized autosaver" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Media URL resolver

**Files:**
- Create: `src/lib/sync/media-urls.ts`
- Create: `src/lib/sync/supabase-media-deps.ts`
- Test: `src/lib/sync/media-urls.test.ts`

**Interfaces:**
- Consumes: `TimelineProject` type; existing `getSignedUrls(paths): Promise<Map<string, string>>` from `@/lib/supabase/storage`.
- Produces:
  - `interface MediaRow { id: string; type: "image" | "video" | "audio"; storage_path: string; thumbnail_path: string | null }`
  - `interface ResolvedMedia { type: MediaRow["type"]; url: string; posterUrl: string | null }`
  - `type MediaUrlMap = Map<string, ResolvedMedia>`
  - `interface MediaUrlDeps { fetchMediaRows(ids: string[]): Promise<MediaRow[]>; getSignedUrls(paths: string[]): Promise<Map<string, string>> }`
  - `collectMediaIds(project): string[]`: unique `mediaId`s that are UUIDs (bundled stickers and template assets use non-UUID ids and are skipped; the port plan resolves those).
  - `resolveMediaUrls(ids, deps): Promise<MediaUrlMap>`: a row whose file has no signed URL is left out of the map.
  - `createSupabaseMediaDeps(client): MediaUrlDeps`

- [ ] **Step 1: Write the failing test**

`src/lib/sync/media-urls.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  collectMediaIds,
  resolveMediaUrls,
  type MediaRow,
  type MediaUrlDeps,
} from "@/lib/sync/media-urls";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

describe("collectMediaIds", () => {
  it("returns each uuid media id once and skips non-uuid and empty ids", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "1", mediaId: ID_A }),
      makeClip({ id: "2", mediaId: ID_A }),
      makeClip({ id: "3", mediaId: ID_B }),
      makeClip({ id: "4", mediaId: "sticker:heart" }),
      makeClip({ id: "5", mediaId: "" }),
    ]);
    expect(collectMediaIds(project).sort()).toEqual([ID_A, ID_B]);
  });

  it("returns an empty list for an empty project", () => {
    expect(collectMediaIds(makeProject(makeStandardTracks(), []))).toEqual([]);
  });
});

function deps(rows: MediaRow[], signed: Record<string, string>) {
  return {
    fetchMediaRows: vi.fn<MediaUrlDeps["fetchMediaRows"]>(async () => rows),
    getSignedUrls: vi.fn<MediaUrlDeps["getSignedUrls"]>(async (paths) => {
      const map = new Map<string, string>();
      for (const path of paths) if (signed[path]) map.set(path, signed[path]);
      return map;
    }),
  };
}

describe("resolveMediaUrls", () => {
  it("does not call anything for an empty id list", async () => {
    const d = deps([], {});
    expect((await resolveMediaUrls([], d)).size).toBe(0);
    expect(d.fetchMediaRows).not.toHaveBeenCalled();
    expect(d.getSignedUrls).not.toHaveBeenCalled();
  });

  it("maps each id to its signed url, with a poster for videos", async () => {
    const d = deps(
      [
        { id: ID_A, type: "video", storage_path: "u/a.mp4", thumbnail_path: "u/a.jpg" },
        { id: ID_B, type: "image", storage_path: "u/b.png", thumbnail_path: null },
      ],
      { "u/a.mp4": "https://s/a.mp4", "u/a.jpg": "https://s/a.jpg", "u/b.png": "https://s/b.png" },
    );
    const map = await resolveMediaUrls([ID_A, ID_B], d);
    expect(map.get(ID_A)).toEqual({ type: "video", url: "https://s/a.mp4", posterUrl: "https://s/a.jpg" });
    expect(map.get(ID_B)).toEqual({ type: "image", url: "https://s/b.png", posterUrl: null });
    expect(d.fetchMediaRows).toHaveBeenCalledWith([ID_A, ID_B]);
  });

  it("leaves out media whose file could not be signed", async () => {
    const d = deps(
      [{ id: ID_A, type: "image", storage_path: "u/a.png", thumbnail_path: null }],
      {},
    );
    expect((await resolveMediaUrls([ID_A], d)).has(ID_A)).toBe(false);
  });

  it("leaves out ids that have no media row", async () => {
    const d = deps([], {});
    expect((await resolveMediaUrls([ID_A], d)).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/sync/media-urls.test.ts`
Expected: FAIL; `@/lib/sync/media-urls` cannot be resolved.

- [ ] **Step 3: Implement the resolver and its Supabase wiring**

`src/lib/sync/media-urls.ts`:

```ts
import type { TimelineProject } from "@/types/timeline";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MediaRow {
  id: string;
  type: "image" | "video" | "audio";
  storage_path: string;
  thumbnail_path: string | null;
}

export interface ResolvedMedia {
  type: MediaRow["type"];
  url: string;
  posterUrl: string | null;
}

export type MediaUrlMap = Map<string, ResolvedMedia>;

export interface MediaUrlDeps {
  fetchMediaRows(ids: string[]): Promise<MediaRow[]>;
  getSignedUrls(paths: string[]): Promise<Map<string, string>>;
}

/**
 * Unique media ids that live in Storage. Bundled stickers and template assets
 * use non-UUID ids and are resolved elsewhere.
 */
export function collectMediaIds(project: TimelineProject): string[] {
  const ids = new Set<string>();
  for (const clip of project.clips) {
    if (clip.mediaId && UUID_RE.test(clip.mediaId)) ids.add(clip.mediaId);
  }
  return Array.from(ids);
}

/**
 * Looks up fresh signed URLs. Signed URLs expire, so these are never part of
 * the saved document. Media that cannot be resolved is simply absent from the
 * map; the caller shows a placeholder.
 */
export async function resolveMediaUrls(ids: string[], deps: MediaUrlDeps): Promise<MediaUrlMap> {
  const resolved: MediaUrlMap = new Map();
  if (ids.length === 0) return resolved;

  const rows = await deps.fetchMediaRows(ids);
  const paths = rows.flatMap((row) =>
    [row.storage_path, row.thumbnail_path].filter((p): p is string => Boolean(p)),
  );
  const signed = await deps.getSignedUrls(paths);

  for (const row of rows) {
    const url = signed.get(row.storage_path);
    if (!url) continue;
    const posterUrl = row.thumbnail_path ? (signed.get(row.thumbnail_path) ?? null) : null;
    resolved.set(row.id, { type: row.type, url, posterUrl });
  }
  return resolved;
}
```

`src/lib/sync/supabase-media-deps.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { getSignedUrls } from "@/lib/supabase/storage";
import type { MediaRow, MediaUrlDeps } from "@/lib/sync/media-urls";

export function createSupabaseMediaDeps(client: SupabaseClient<Database>): MediaUrlDeps {
  return {
    async fetchMediaRows(ids) {
      const { data, error } = await client
        .from("media_items")
        .select("id, type, storage_path, thumbnail_path")
        .in("id", ids);
      if (error) throw error;
      return (data ?? []) as MediaRow[];
    },
    getSignedUrls,
  };
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/lib/sync/media-urls.test.ts` then `npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/media-urls.ts src/lib/sync/supabase-media-deps.ts src/lib/sync/media-urls.test.ts
git commit -m "feat: add media URL resolver kept out of the saved document" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Sync controller

**Files:**
- Modify: `src/store/use-clip-project-store.ts` (add `selectSavableProject`)
- Modify: `src/store/use-clip-project-store.test.ts` (test for it)
- Create: `src/lib/sync/test-utils.ts`
- Create: `src/lib/sync/timeline-sync.ts`
- Test: `src/lib/sync/timeline-sync.test.ts`

**Interfaces:**
- Consumes: `createAutosaver` (Task 3); `TimelineStorage`, `FrameSize`, `LoadedTimeline`, `SaveResult`, `VersionSummary` (Task 2); `TimelineDocumentError`, `emptyTimeline` (Task 1); the clip store (`useClipProjectStore`, `EMPTY_PROJECT`).
- Produces:
  - `selectSavableProject(s): TimelineProject`: `s.history.gestureBase ?? s.history.present`.
  - `class MemoryTimelineStorage implements TimelineStorage` (tests only) with knobs `loadFailures`, `loadError`, `loadGate`, `saveFailures`, `saveGate`, and recorders `loadCalls`, `saveAttempts`, `saves`, `maxInFlightSaves`, plus `project`, `rev`, `frame`.
  - `type SyncPhase = "loading" | "ready" | "error" | "conflict"`; `interface SyncStatus { phase: SyncPhase; error: string | null }`
  - `interface TimelineSyncOptions { projectId; storage; getSavable(): TimelineProject; subscribe(listener: () => void): () => void; loadProject(project: TimelineProject, frame: FrameSize): void; onStatus(status: SyncStatus): void; delayMs?: number (default 1500); maxLoadAttempts?: number (default 4); retryDelayMs?: number (default 1500) }`
  - `interface TimelineSync { load(): void; flush(): Promise<void>; stop(): Promise<void> }`
  - `createTimelineSync(options): TimelineSync`. Behaviour: `load()` (re)starts loading, and is also how the UI retries after an error or reloads after a conflict. It retries transient load failures up to `maxLoadAttempts`, treats `TimelineDocumentError` as permanent (no retry), and subscribes to changes only after a successful load. It never saves outside the `ready` phase, never saves a project identical to the last saved one, serializes saves with sequential revisions, stops autosaving on conflict, retries a failing save at most 3 times per edit, and `stop()` unsubscribes and flushes.

- [ ] **Step 1: Add the savable selector test and code**

In `src/store/use-clip-project-store.test.ts`, extend the import from `@/store/use-clip-project-store` to include `selectSavableProject`, then add this test at the end of the `describe("gestures", ...)` block:

```ts
  it("saves only committed state: mid-drag the savable project is the pre-drag one", () => {
    const before = selectProject(state());
    state().previewApply((p) => moveClip(p, "o", { start: 5 }));
    expect(selectSavableProject(state())).toBe(before);

    state().endGesture();
    expect(selectSavableProject(state())).toBe(selectProject(state()));
    expect(getClip(selectSavableProject(state()), "o").start).toBe(5);
  });
```

Run: `npx vitest run src/store/use-clip-project-store.test.ts`
Expected: FAIL (`selectSavableProject` is not exported).

In `src/store/use-clip-project-store.ts`, add after `selectProject`:

```ts
/** The last committed project: a drag in progress is never saved. */
export const selectSavableProject = (s: ClipProjectStore) =>
  s.history.gestureBase ?? s.history.present;
```

Run: `npx vitest run src/store/use-clip-project-store.test.ts`
Expected: PASS.

- [ ] **Step 2: Create the in-memory storage fake**

`src/lib/sync/test-utils.ts` (imported only by tests):

```ts
import type { FrameSize } from "@/lib/sync/timeline-document";
import type {
  LoadedTimeline,
  SaveResult,
  TimelineStorage,
  VersionSummary,
} from "@/lib/sync/timeline-storage";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import type { TimelineProject } from "@/types/timeline";

/** A remote project with a main clip `a` (t1) and an overlay image `o` (t2). */
export function remoteProject(): TimelineProject {
  return makeProject(makeStandardTracks(), [
    makeClip({ id: "a", start: 0, sourceOut: 10 }),
    makeClip({ id: "o", trackId: "t2", kind: "image", sourceDuration: null, start: 2, sourceOut: 3 }),
  ]);
}

/** In-memory TimelineStorage with failure and timing knobs for tests. */
export class MemoryTimelineStorage implements TimelineStorage {
  project: TimelineProject;
  rev: number;
  frame: FrameSize;

  loadCalls = 0;
  saveAttempts = 0;
  saves: Array<{ project: TimelineProject; expectedRev: number }> = [];
  maxInFlightSaves = 0;

  /** Fail this many loads with a network error, then succeed. */
  loadFailures = 0;
  /** Fail every load with this error. */
  loadError: Error | null = null;
  /** Loads wait for this promise. */
  loadGate: Promise<void> | null = null;
  /** Fail this many saves with a network error (Infinity = always). */
  saveFailures = 0;
  /** Saves wait for this promise. */
  saveGate: Promise<void> | null = null;

  private inFlightSaves = 0;
  versions = new Map<
    string,
    { label: string | null; createdAt: string; project: TimelineProject; frame: FrameSize }
  >();

  constructor(
    project: TimelineProject = remoteProject(),
    rev = 0,
    frame: FrameSize = { width: 1920, height: 1080 },
  ) {
    this.project = project;
    this.rev = rev;
    this.frame = frame;
  }

  async load(): Promise<LoadedTimeline> {
    this.loadCalls += 1;
    if (this.loadGate) await this.loadGate;
    if (this.loadError) throw this.loadError;
    if (this.loadFailures > 0) {
      this.loadFailures -= 1;
      throw new Error("network down");
    }
    return { project: this.project, rev: this.rev, frame: this.frame };
  }

  async save(
    _projectId: string,
    project: TimelineProject,
    expectedRev: number,
  ): Promise<SaveResult> {
    this.saveAttempts += 1;
    this.inFlightSaves += 1;
    this.maxInFlightSaves = Math.max(this.maxInFlightSaves, this.inFlightSaves);
    try {
      if (this.saveGate) await this.saveGate;
      if (this.saveFailures > 0) {
        this.saveFailures -= 1;
        throw new Error("offline");
      }
      if (expectedRev !== this.rev) return { ok: false, reason: "conflict" };
      this.rev += 1;
      this.project = project;
      this.saves.push({ project, expectedRev });
      return { ok: true, rev: this.rev };
    } finally {
      this.inFlightSaves -= 1;
    }
  }

  async saveVersion(
    _projectId: string,
    project: TimelineProject,
    frame: FrameSize,
    label?: string,
  ): Promise<void> {
    this.versions.set(`v${this.versions.size + 1}`, {
      label: label?.trim() || null,
      createdAt: new Date(0).toISOString(),
      project,
      frame,
    });
  }

  async listVersions(): Promise<VersionSummary[]> {
    return Array.from(this.versions, ([id, v]) => ({
      id,
      label: v.label,
      createdAt: v.createdAt,
    }));
  }

  async loadVersion(_projectId: string, versionId: string) {
    const version = this.versions.get(versionId);
    if (!version) throw new Error("Version not found");
    return { project: version.project, frame: version.frame };
  }

  async deleteVersion(versionId: string): Promise<void> {
    this.versions.delete(versionId);
  }
}
```

- [ ] **Step 3: Write the failing controller test**

`src/lib/sync/timeline-sync.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryTimelineStorage } from "@/lib/sync/test-utils";
import { TimelineDocumentError } from "@/lib/sync/timeline-document";
import { createTimelineSync, type SyncStatus } from "@/lib/sync/timeline-sync";
import { moveClip } from "@/lib/timeline/place";
import { getClip } from "@/lib/timeline/test-utils";
import {
  EMPTY_PROJECT,
  selectProject,
  selectSavableProject,
  useClipProjectStore,
} from "@/store/use-clip-project-store";

const DELAY = 100;
const RETRY = 50;

const store = () => useClipProjectStore.getState();

/** Always produces a new project reference, whatever the content. */
const touch = () => store().apply((p) => ({ ...p, clips: [...p.clips] }));

function setup(storage: MemoryTimelineStorage, maxLoadAttempts = 3) {
  const statuses: SyncStatus[] = [];
  const sync = createTimelineSync({
    projectId: "p1",
    storage,
    getSavable: () => selectSavableProject(useClipProjectStore.getState()),
    subscribe: (listener) => useClipProjectStore.subscribe(listener),
    loadProject: (project) => useClipProjectStore.getState().load(project),
    onStatus: (status) => statuses.push(status),
    delayMs: DELAY,
    maxLoadAttempts,
    retryDelayMs: RETRY,
  });
  return { sync, statuses };
}

const phases = (statuses: SyncStatus[]) => statuses.map((s) => s.phase);

let active: { stop: () => Promise<void> } | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  store().load(EMPTY_PROJECT);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await active?.stop();
  active = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function start(storage: MemoryTimelineStorage, maxLoadAttempts = 3) {
  const made = setup(storage, maxLoadAttempts);
  active = made.sync;
  made.sync.load();
  await vi.advanceTimersByTimeAsync(0);
  return made;
}

describe("loading", () => {
  it("loads the remote project into the store and becomes ready without saving", async () => {
    const storage = new MemoryTimelineStorage();
    const { statuses } = await start(storage);

    expect(phases(statuses)).toEqual(["loading", "ready"]);
    expect(selectProject(store())).toBe(storage.project);

    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.saveAttempts).toBe(0);
  });

  it("retries transient load failures", async () => {
    const storage = new MemoryTimelineStorage();
    storage.loadFailures = 2;
    const { statuses } = await start(storage);
    await vi.advanceTimersByTimeAsync(200);

    expect(storage.loadCalls).toBe(3);
    expect(phases(statuses)).toEqual(["loading", "ready"]);
  });

  it("gives up after the maximum attempts and never saves in the error phase", async () => {
    const storage = new MemoryTimelineStorage();
    storage.loadFailures = 99;
    const { statuses } = await start(storage);
    await vi.advanceTimersByTimeAsync(500);

    expect(storage.loadCalls).toBe(3);
    expect(statuses[statuses.length - 1]).toMatchObject({ phase: "error", error: "network down" });

    touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.saveAttempts).toBe(0);
  });

  it("can be retried after an error", async () => {
    const storage = new MemoryTimelineStorage();
    storage.loadFailures = 99;
    const { sync, statuses } = await start(storage);
    await vi.advanceTimersByTimeAsync(500);

    storage.loadFailures = 0;
    sync.load();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses[statuses.length - 1].phase).toBe("ready");
  });

  it("treats a malformed document as permanent: no retry, no save", async () => {
    const storage = new MemoryTimelineStorage();
    storage.loadError = new TimelineDocumentError("bad document");
    const { statuses } = await start(storage);
    await vi.advanceTimersByTimeAsync(500);

    expect(storage.loadCalls).toBe(1);
    expect(statuses[statuses.length - 1]).toMatchObject({ phase: "error", error: "bad document" });

    touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.saveAttempts).toBe(0);
  });

  it("never saves edits made to the store before the load finishes", async () => {
    const storage = new MemoryTimelineStorage();
    let open: () => void = () => {};
    storage.loadGate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const { sync } = setup(storage);
    active = sync;
    sync.load();

    touch();
    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.saveAttempts).toBe(0);

    open();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.saveAttempts).toBe(0);
  });
});

describe("autosave", () => {
  it("saves the edited project once after the delay, at the loaded revision", async () => {
    const storage = new MemoryTimelineStorage();
    await start(storage);

    store().apply((p) => moveClip(p, "o", { start: 8 }));
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(storage.saveAttempts).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(storage.saves).toHaveLength(1);
    expect(storage.saves[0].expectedRev).toBe(0);
    expect(storage.rev).toBe(1);
    expect(getClip(storage.project, "o").start).toBe(8);
  });

  it("collapses rapid edits into one save of the latest state", async () => {
    const storage = new MemoryTimelineStorage();
    await start(storage);

    store().apply((p) => moveClip(p, "o", { start: 5 }));
    store().apply((p) => moveClip(p, "o", { start: 6 }));
    store().apply((p) => moveClip(p, "o", { start: 7 }));
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(storage.saves).toHaveLength(1);
    expect(getClip(storage.project, "o").start).toBe(7);
  });

  it("does not save a drag in progress, only its committed result", async () => {
    const storage = new MemoryTimelineStorage();
    await start(storage);

    store().previewApply((p) => moveClip(p, "o", { start: 5 }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.saveAttempts).toBe(0);

    store().endGesture();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(storage.saves).toHaveLength(1);
    expect(getClip(storage.project, "o").start).toBe(5);
  });

  it("saves an edit made during a save afterwards, one at a time, with sequential revisions", async () => {
    const storage = new MemoryTimelineStorage();
    let open: () => void = () => {};
    storage.saveGate = new Promise<void>((resolve) => {
      open = resolve;
    });
    await start(storage);

    store().apply((p) => moveClip(p, "o", { start: 5 }));
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(storage.saveAttempts).toBe(1);

    store().apply((p) => moveClip(p, "o", { start: 9 }));
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(storage.saveAttempts).toBe(1);

    open();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(storage.saves.map((s) => s.expectedRev)).toEqual([0, 1]);
    expect(storage.maxInFlightSaves).toBe(1);
    expect(getClip(storage.project, "o").start).toBe(9);
  });

  it("stops autosaving after a conflict until reloaded", async () => {
    const storage = new MemoryTimelineStorage();
    const { sync, statuses } = await start(storage);

    storage.rev = 5; // someone else saved
    touch();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(statuses[statuses.length - 1].phase).toBe("conflict");
    expect(storage.saveAttempts).toBe(1);

    touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.saveAttempts).toBe(1);

    sync.load();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses[statuses.length - 1].phase).toBe("ready");

    touch();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(storage.saves).toHaveLength(1);
    expect(storage.saves[0].expectedRev).toBe(5);
  });

  it("retries a failing save a few times, then waits for the next edit", async () => {
    const storage = new MemoryTimelineStorage();
    storage.saveFailures = Infinity;
    await start(storage);

    touch();
    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.saveAttempts).toBe(4); // first try + 3 retries, then it stops

    storage.saveFailures = 0;
    touch();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(storage.saves).toHaveLength(1);
  });
});

describe("stop and flush", () => {
  it("stop saves a pending edit immediately and then ignores further edits", async () => {
    const storage = new MemoryTimelineStorage();
    const { sync } = await start(storage);

    store().apply((p) => moveClip(p, "o", { start: 8 }));
    await sync.stop();
    expect(storage.saves).toHaveLength(1);
    expect(getClip(storage.project, "o").start).toBe(8);

    touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.saves).toHaveLength(1);
  });

  it("flush saves a pending edit without waiting for the delay", async () => {
    const storage = new MemoryTimelineStorage();
    const { sync } = await start(storage);

    store().apply((p) => moveClip(p, "o", { start: 8 }));
    await sync.flush();
    expect(storage.saves).toHaveLength(1);
  });

  it("an abandoned load does not populate the store", async () => {
    const storage = new MemoryTimelineStorage();
    let open: () => void = () => {};
    storage.loadGate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const { sync, statuses } = setup(storage);
    sync.load();
    await sync.stop();

    open();
    await vi.advanceTimersByTimeAsync(0);
    expect(selectProject(store())).toBe(EMPTY_PROJECT);
    expect(phases(statuses)).toEqual(["loading"]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/lib/sync/timeline-sync.test.ts`
Expected: FAIL; `@/lib/sync/timeline-sync` cannot be resolved.

- [ ] **Step 5: Implement the controller**

`src/lib/sync/timeline-sync.ts`:

```ts
import { createAutosaver } from "@/lib/sync/autosaver";
import { TimelineDocumentError, type FrameSize } from "@/lib/sync/timeline-document";
import type { TimelineStorage } from "@/lib/sync/timeline-storage";
import type { TimelineProject } from "@/types/timeline";

export type SyncPhase = "loading" | "ready" | "error" | "conflict";

export interface SyncStatus {
  phase: SyncPhase;
  error: string | null;
}

export interface TimelineSyncOptions {
  projectId: string;
  storage: TimelineStorage;
  /** The last committed project (never a mid-drag preview). */
  getSavable: () => TimelineProject;
  /** Calls the listener after every store change; returns an unsubscribe. */
  subscribe: (listener: () => void) => () => void;
  loadProject: (project: TimelineProject, frame: FrameSize) => void;
  onStatus: (status: SyncStatus) => void;
  delayMs?: number;
  maxLoadAttempts?: number;
  retryDelayMs?: number;
}

export interface TimelineSync {
  /** (Re)starts loading. Also how the UI retries after an error or reloads after a conflict. */
  load(): void;
  flush(): Promise<void>;
  /** Abandons loading, stops listening, and saves any pending edit. */
  stop(): Promise<void>;
}

const DEFAULT_DELAY_MS = 1500;
const DEFAULT_MAX_LOAD_ATTEMPTS = 4;
const DEFAULT_RETRY_DELAY_MS = 1500;
const MAX_SAVE_RETRIES = 3;

export function createTimelineSync(options: TimelineSyncOptions): TimelineSync {
  const { projectId, storage, getSavable, subscribe, loadProject, onStatus } = options;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const maxLoadAttempts = options.maxLoadAttempts ?? DEFAULT_MAX_LOAD_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let phase: SyncPhase = "loading";
  let rev = 0;
  let lastSaved: TimelineProject | null = null;
  let unsubscribe: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let loadToken = 0; // bumped to abandon in-flight loads
  let stopped = false;
  let saveFailures = 0;

  function setStatus(next: SyncPhase, error: string | null = null) {
    phase = next;
    onStatus({ phase: next, error });
  }

  // Saving is only ever possible in the "ready" phase, so a failed or
  // unfinished load can never overwrite the stored project.
  async function saveNow() {
    if (phase !== "ready" || lastSaved === null) return;
    const project = getSavable();
    if (project === lastSaved) return;

    const result = await storage.save(projectId, project, rev);
    if (!result.ok) {
      autosaver.cancel();
      setStatus("conflict", "This project was changed somewhere else.");
      return;
    }
    rev = result.rev;
    lastSaved = project;
    saveFailures = 0;
  }

  const autosaver = createAutosaver({
    save: saveNow,
    delayMs,
    onError(error) {
      console.error("Failed to autosave timeline:", error);
      saveFailures += 1;
      if (saveFailures <= MAX_SAVE_RETRIES && !stopped) autosaver.schedule();
    },
  });

  function clearRetryTimer() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function attemptLoad(token: number, attempt: number) {
    storage.load(projectId).then(
      (loaded) => {
        if (token !== loadToken) return;
        rev = loaded.rev;
        loadProject(loaded.project, loaded.frame);
        lastSaved = getSavable();
        saveFailures = 0;

        unsubscribe?.();
        unsubscribe = subscribe(() => {
          if (phase !== "ready") return;
          if (getSavable() === lastSaved) return;
          saveFailures = 0;
          autosaver.schedule();
        });
        setStatus("ready");
      },
      (error: unknown) => {
        if (token !== loadToken) return;
        const permanent = error instanceof TimelineDocumentError;
        if (permanent || attempt >= maxLoadAttempts) {
          setStatus("error", error instanceof Error ? error.message : "Failed to load project");
          return;
        }
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (token === loadToken) attemptLoad(token, attempt + 1);
        }, retryDelayMs);
      },
    );
  }

  return {
    load() {
      stopped = false;
      loadToken += 1;
      clearRetryTimer();
      autosaver.cancel();
      unsubscribe?.();
      unsubscribe = null;
      setStatus("loading");
      attemptLoad(loadToken, 1);
    },

    flush() {
      return autosaver.flush();
    },

    async stop() {
      stopped = true;
      loadToken += 1;
      clearRetryTimer();
      unsubscribe?.();
      unsubscribe = null;
      await autosaver.flush();
    },
  };
}
```

- [ ] **Step 6: Run the tests and the type check**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: all PASS (the earlier 176 plus the new ones); no type errors. If a fake-timer test is off by one tick, fix the test's `advanceTimersByTimeAsync` amount only after reasoning about which timer fires when, never by loosening an assertion.

- [ ] **Step 7: Commit**

```bash
git add src/store/use-clip-project-store.ts src/store/use-clip-project-store.test.ts src/lib/sync/test-utils.ts src/lib/sync/timeline-sync.ts src/lib/sync/timeline-sync.test.ts
git commit -m "feat: add timeline sync controller with load retry, conflicts and safe autosave" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: React hook and full verification

**Files:**
- Create: `src/hooks/use-timeline-sync.ts`

**Interfaces:**
- Consumes: `createTimelineSync`, `SyncStatus`, `TimelineSync` (Task 5); `createSupabaseTimelineStorage` (Task 2); `createClient` (`@/lib/supabase/client`); `selectSavableProject`, `useClipProjectStore`; `FrameSize`.
- Produces: `useTimelineSync(projectId): { status: SyncStatus; frame: FrameSize | null; reload: () => void }`. It loads on mount, flushes when the tab is hidden or the page is hidden, and stops (flushing) on unmount. It is not used anywhere yet; the timeline UI plan consumes it.

- [ ] **Step 1: Write the hook**

`src/hooks/use-timeline-sync.ts`:

```ts
"use client";

import * as React from "react";

import { createClient } from "@/lib/supabase/client";
import { createSupabaseTimelineStorage } from "@/lib/sync/supabase-timeline-storage";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { createTimelineSync, type SyncStatus, type TimelineSync } from "@/lib/sync/timeline-sync";
import { selectSavableProject, useClipProjectStore } from "@/store/use-clip-project-store";

/**
 * Loads a project's timeline into the clip store and keeps it saved. `reload`
 * retries after a load error or discards local edits after a conflict.
 */
export function useTimelineSync(projectId: string) {
  const [status, setStatus] = React.useState<SyncStatus>({ phase: "loading", error: null });
  const [frame, setFrame] = React.useState<FrameSize | null>(null);
  const syncRef = React.useRef<TimelineSync | null>(null);

  React.useEffect(() => {
    const sync = createTimelineSync({
      projectId,
      storage: createSupabaseTimelineStorage(createClient()),
      getSavable: () => selectSavableProject(useClipProjectStore.getState()),
      subscribe: (listener) => useClipProjectStore.subscribe(listener),
      loadProject: (project, loadedFrame) => {
        useClipProjectStore.getState().load(project);
        setFrame(loadedFrame);
      },
      onStatus: setStatus,
    });
    syncRef.current = sync;
    sync.load();

    function flushWhenHidden() {
      if (document.visibilityState === "hidden") void sync.flush();
    }
    function flushNow() {
      void sync.flush();
    }
    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("pagehide", flushNow);

    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("pagehide", flushNow);
      syncRef.current = null;
      void sync.stop();
    };
  }, [projectId]);

  const reload = React.useCallback(() => {
    syncRef.current?.load();
  }, []);

  return { status, frame, reload };
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` then `npx eslint src/lib/sync src/hooks/use-timeline-sync.ts src/store`
Expected: no errors. If `react-hooks` lint objects to the effect structure, restructure to satisfy the rule without changing behaviour, and note the change.

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: every test file passes; no skipped tests.

- [ ] **Step 4: Confirm existing sync code and app are untouched**

Run: `git diff --stat main -- src ':!src/lib/sync/timeline-document.ts' ':!src/lib/sync/timeline-document.test.ts' ':!src/lib/sync/timeline-storage.ts' ':!src/lib/sync/supabase-timeline-storage.ts' ':!src/lib/sync/supabase-timeline-storage.test.ts' ':!src/lib/sync/autosaver.ts' ':!src/lib/sync/autosaver.test.ts' ':!src/lib/sync/media-urls.ts' ':!src/lib/sync/media-urls.test.ts' ':!src/lib/sync/supabase-media-deps.ts' ':!src/lib/sync/test-utils.ts' ':!src/lib/sync/timeline-sync.ts' ':!src/lib/sync/timeline-sync.test.ts' ':!src/hooks/use-timeline-sync.ts'`
Expected: only `src/lib/supabase/database.types.ts`, `src/store/use-clip-project-store.ts` and `src/store/use-clip-project-store.test.ts` appear. `src/lib/sync/project-content-sync.ts` and `src/hooks/use-project-content-sync.ts` must not appear.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-timeline-sync.ts
git commit -m "feat: add useTimelineSync hook" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage** (section 7, as revised)

| Requirement | Task |
|---|---|
| `0006` additive migration: `timeline jsonb`, `timeline_rev`, object check; no new RLS | 2 |
| Document `{ schemaVersion, tracks, clips }`, `mediaId` only; null loads as default timeline | 1, 2 |
| Zod validation on load; malformed is an error, never repaired or overwritten | 1, 5 |
| Revision-checked atomic save; conflict result | 2, 5 |
| Autosave: debounce, no save before load, flush on hide/unmount, load retries, committed state only | 3, 5, 6 |
| Media URLs resolved into a separate map, non-UUID ids left to the port plan | 4 |
| Version snapshots `{ schemaVersion, timeline, frame }`; old shape rejected clearly | 1, 2 |
| Old tables and sync untouched | Constraint, verified in 6 |
| Template conversion deferred | Out of scope (stated) |
| Applying the migration by hand | Constraint, handoff |

Gaps accepted: the Supabase SQL itself cannot be executed here (connector unauthorized), so the migration and the real round trip are first verified by the user and then by the timeline UI plan.

**2. Placeholder scan:** no TBD/TODO; every step has code or an exact command.

**3. Type consistency:** `TimelineStorage`, `LoadedTimeline`, `SaveResult`, `VersionSummary`, `FrameSize`, `SyncStatus`, `TimelineSync`, `AutosaverOptions`, `MediaUrlDeps` are each defined once and used with the same names and signatures downstream. `MemoryTimelineStorage.load` and `.listVersions` take no parameters, which a class implementing the interface may do.

**4. Review Focus:** all five failure modes have named tests: Task 5 "never saves edits made before the load finishes" and "malformed document is permanent"; Task 2 and Task 5 conflict tests; Task 5 "stop saves a pending edit" and "does not save a drag in progress"; Tasks 3 and 5 in-flight tests; Tasks 3 and 5 failing-save tests.

## Execution Handoff

Two things to do yourself, outside this plan:
- **Apply the migration.** Paste `supabase/migrations/0006_project_timeline.sql` into the Supabase SQL Editor (Dashboard → SQL Editor → New query → Run). It is safe to run twice. Nothing in the app reads the new columns until the timeline UI plan, so nothing changes for you until then.
- **If your Supabase project has been idle for weeks,** it may be paused; restore it first or the SQL Editor will not respond.
