import { describe, expect, it } from "vitest";

import { dropGroupOf, expandToGroups, groupClips, ungroupClips } from "@/lib/timeline/groups";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";

const project = (groups: Array<string | null> = [null, null, null]) =>
  makeProject(
    makeStandardTracks(),
    groups.map((groupId, i) => makeClip({ id: `c${i + 1}`, trackId: "t1", start: i * 5, groupId })),
  );

const groupOf = (p: ReturnType<typeof project>, id: string) => p.clips.find((c) => c.id === id)?.groupId;

describe("groupClips", () => {
  it("gives two or more clips one shared group", () => {
    const next = groupClips(project(), ["c1", "c3"], () => "g1");
    expect(groupOf(next, "c1")).toBe("g1");
    expect(groupOf(next, "c3")).toBe("g1");
    expect(groupOf(next, "c2")).toBeNull();
  });

  it("does nothing for fewer than two usable clips, and skips locked ones", () => {
    const p = project();
    expect(groupClips(p, ["c1"], () => "g")).toBe(p);
    expect(groupClips(p, ["c1", "missing"], () => "g")).toBe(p);
    const locked = { ...p, clips: p.clips.map((c) => (c.id === "c2" ? { ...c, locked: true } : c)) };
    expect(groupClips(locked, ["c1", "c2"], () => "g")).toBe(locked);
  });

  it("merges existing groups of the chosen clips into one", () => {
    const p = project(["a", "a", "b"]);
    const next = groupClips(p, ["c1", "c2", "c3"], () => "g");
    expect(next.clips.map((c) => c.groupId)).toEqual(["g", "g", "g"]);
  });
});

describe("ungroupClips", () => {
  it("frees the chosen clips and leaves other groups alone", () => {
    const next = ungroupClips(project(["a", "a", "b"]), ["c1", "c2"]);
    expect(next.clips.map((c) => c.groupId)).toEqual([null, null, "b"]);
  });

  it("returns the same project when nothing was grouped", () => {
    const p = project();
    expect(ungroupClips(p, ["c1"])).toBe(p);
  });
});

describe("expandToGroups", () => {
  it("adds the other members of every group touched", () => {
    const p = project(["a", "a", null]);
    expect(expandToGroups(p, ["c1"])).toEqual(["c1", "c2"]);
    expect(expandToGroups(p, ["c3"])).toEqual(["c3"]);
  });

  it("keeps the given order, adds new ids after, and does not repeat", () => {
    const p = project(["a", "a", "a"]);
    expect(expandToGroups(p, ["c3", "c1"])).toEqual(["c3", "c1", "c2"]);
  });

  it("returns the same array when nothing needs adding", () => {
    const ids = ["c1", "c2"];
    expect(expandToGroups(project(["a", "a", null]), ids)).toBe(ids);
  });
});

describe("dropGroupOf", () => {
  it("takes the whole group out of a selection when one member is toggled off", () => {
    const p = project(["a", "a", null]);
    expect(dropGroupOf(p, ["c3"], "c1")).toEqual(["c3"]);
    expect(dropGroupOf(p, ["c2", "c3"], "c1")).toEqual(["c3"]);
  });

  it("leaves the selection alone for a clip that is in no group", () => {
    const ids = ["c1"];
    expect(dropGroupOf(project(["a", "a", null]), ids, "c3")).toBe(ids);
  });
});
