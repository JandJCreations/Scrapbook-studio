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

describe("transitions in the document", () => {
  const withTransition = (transition: unknown) => {
    const doc = JSON.parse(JSON.stringify(serializeTimeline(makeProject(makeStandardTracks(), [makeClip({ id: "a" })]))));
    doc.clips[0].transition = transition;
    return doc;
  };

  it("keeps a transition through a save and load", () => {
    const doc = withTransition({ type: "slide-left", duration: 0.8 });
    expect(parseTimeline("p", doc).clips[0].transition).toEqual({ type: "slide-left", duration: 0.8 });
  });

  it("opens projects saved before transitions existed", () => {
    const doc = withTransition(undefined);
    delete doc.clips[0].transition;
    expect(parseTimeline("p", doc).clips[0].transition ?? null).toBeNull();
  });

  it("rejects an unknown transition", () => {
    expect(() => parseTimeline("p", withTransition({ type: "spin", duration: 1 }))).toThrow();
    expect(() => parseTimeline("p", withTransition({ type: "fade", duration: -1 }))).toThrow();
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

describe("serializeTimeline: refuses to write what cannot be loaded back", () => {
  it.each([
    ["a NaN start", { start: NaN }],
    ["an Infinity start", { start: Infinity }],
    ["a zero speed", { speed: 0 }],
    ["a zero sourceDuration", { sourceDuration: 0 }],
  ])("throws for %s", (_label, overrides) => {
    const project = makeProject(makeStandardTracks(), [makeClip(overrides)]);
    expect(() => serializeTimeline(project)).toThrow(TimelineDocumentError);
  });

  it("still serializes a valid project", () => {
    expect(() => serializeTimeline(sample())).not.toThrow();
  });
});
