import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// How the sign-in check answers: nobody signed in (the upload fails at once), or never (the upload is still going).
let signIn: "nobody" | "never" = "nobody";

/** A fake query builder: any chain of calls ends in an empty, successful answer. */
function fakeQuery(): unknown {
  const chain: unknown = new Proxy(function () {}, {
    get: (_target, prop) => (prop === "then" ? (resolve: (v: unknown) => void) => resolve({ data: [], error: null }) : chain),
    apply: () => chain,
  });
  return chain;
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: () => (signIn === "never" ? new Promise(() => {}) : Promise.resolve({ data: { user: null } })),
      getSession: () => (signIn === "never" ? new Promise(() => {}) : Promise.resolve({ data: { session: null } })),
    },
    from: () => fakeQuery(),
    storage: { from: () => fakeQuery() },
  }),
}));

import { isUsable } from "@/lib/media/local-media";
import { useMediaStore } from "@/store/use-media-store";

beforeEach(() => {
  let n = 0;
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => `blob:local-${++n}`, revokeObjectURL: vi.fn() });
  signIn = "nobody";
  useMediaStore.setState({ items: [] });
});
afterEach(() => vi.unstubAllGlobals());

describe("addFiles keeps the file on this computer", () => {
  it("gives a new item a local address at once, so it can be used before it is uploaded", () => {
    const [id] = useMediaStore.getState().addFiles([new File(["x"], "beach.jpg", { type: "image/jpeg" })], null);
    const item = useMediaStore.getState().items.find((i) => i.id === id)!;
    expect(item.status).toBe("processing");
    expect(item.localUrl).toMatch(/^blob:local-/);
    expect(isUsable(item)).toBe(true);
  });

  it("leaves out a file that isn't a photo, video or song (a folder's notes), adding the rest", () => {
    const before = useMediaStore.getState().items.length;
    const ids = useMediaStore.getState().addFiles(
      [new File(["x"], "notes.txt", { type: "text/plain" }), new File(["x"], "a.jpg", { type: "image/jpeg" })],
      null,
    );
    expect(ids).toHaveLength(1);
    expect(useMediaStore.getState().items.length).toBe(before + 1);
    expect(useMediaStore.getState().items.find((i) => i.id === ids[0])?.name).not.toMatch(/notes/);
  });

  it("stops being usable when the upload fails (not signed in), rather than silently losing the file later", async () => {
    const [id] = useMediaStore.getState().addFiles([new File(["x"], "a.mp4", { type: "video/mp4" })], null);
    await vi.waitFor(() => expect(useMediaStore.getState().items.find((i) => i.id === id)?.status).toBe("error"));
    expect(isUsable(useMediaStore.getState().items.find((i) => i.id === id)!)).toBe(false);
  });
});

describe("addAlbum", () => {
  it("puts a whole folder into a library folder named after it, reusing one that already exists", () => {
    signIn = "never";
    const ids = useMediaStore.getState().addAlbum("Beach trip", [
      new File(["x"], "IMG_1.jpg", { type: "image/jpeg" }),
      new File(["x"], "IMG_2.jpg", { type: "image/jpeg" }),
    ]);
    const folder = useMediaStore.getState().folders.find((f) => f.name === "Beach trip")!;
    expect(folder).toBeTruthy();
    const added = useMediaStore.getState().items.filter((i) => ids.includes(i.id));
    expect(added.map((i) => i.folderId)).toEqual([folder.id, folder.id]);

    useMediaStore.getState().addAlbum("beach trip", [new File(["x"], "IMG_3.jpg", { type: "image/jpeg" })]);
    expect(useMediaStore.getState().folders.filter((f) => f.name.toLowerCase() === "beach trip")).toHaveLength(1);
  });

  it("makes no empty folder for a folder with no photos in it", () => {
    const before = useMediaStore.getState().folders.length;
    expect(useMediaStore.getState().addAlbum("Documents", [new File(["x"], "notes.txt", { type: "text/plain" })])).toEqual([]);
    expect(useMediaStore.getState().folders.length).toBe(before);
  });
});

describe("the rest of the store keeps the local files straight", () => {
  it("keeps a file that is still uploading when the library finishes loading", async () => {
    signIn = "never"; // the upload is still going when the library arrives
    const [id] = useMediaStore.getState().addFiles([new File(["x"], "late.jpg", { type: "image/jpeg" })], null);
    useMediaStore.setState({ loaded: false, loading: false });
    await useMediaStore.getState().fetchMedia();
    expect(useMediaStore.getState().items.some((i) => i.id === id && i.localUrl)).toBe(true);
  });

  it("lets go of the local files of every item deleted together", () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: revoke });
    const ids = useMediaStore.getState().addFiles(
      [new File(["x"], "a.jpg", { type: "image/jpeg" }), new File(["y"], "b.jpg", { type: "image/jpeg" })],
      null,
    );
    useMediaStore.getState().deleteItems(ids);
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});

describe("uploads that lose the connection", () => {
  it("say there's no internet (not \"signed out\") and carry on by themselves when it comes back", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const [id] = useMediaStore.getState().addFiles([new File(["x"], "pier.jpg", { type: "image/jpeg" })], null);
    await vi.waitFor(() => expect(useMediaStore.getState().items.find((i) => i.id === id)?.status).toBe("error"));
    const failed = useMediaStore.getState().items.find((i) => i.id === id)!;
    expect(failed.connectionLost).toBe(true);
    expect(failed.error).toMatch(/no internet/i);

    vi.stubGlobal("navigator", { onLine: true });
    signIn = "never"; // the retried upload is still going
    useMediaStore.getState().retryLostUploads();
    expect(useMediaStore.getState().items.find((i) => i.id === id)?.status).toBe("processing");
  });

  it("names iPhone's look-alike files by their place in the batch", () => {
    const ids = useMediaStore
      .getState()
      .addFiles([new File(["x"], "image.jpg", { type: "image/jpeg" }), new File(["y"], "image.jpg", { type: "image/jpeg" })], null);
    const names = ids.map((id) => useMediaStore.getState().items.find((i) => i.id === id)!.name);
    expect(names[0]).toMatch(/^Photo 1, /);
    expect(names[1]).toMatch(/^Photo 2, /);
  });
});
