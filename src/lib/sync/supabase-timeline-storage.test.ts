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
