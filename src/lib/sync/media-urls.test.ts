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
