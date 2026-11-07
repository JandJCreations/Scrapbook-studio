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
    auth: { getUser: () => (signIn === "never" ? new Promise(() => {}) : Promise.resolve({ data: { user: null } })) },
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

  it("gives nothing local to a file type that is not supported", () => {
    const [id] = useMediaStore.getState().addFiles([new File(["x"], "notes.txt", { type: "text/plain" })], null);
    const item = useMediaStore.getState().items.find((i) => i.id === id)!;
    expect(item.localUrl).toBeUndefined();
    expect(isUsable(item)).toBe(false);
  });

  it("stops being usable when the upload fails (not signed in), rather than silently losing the file later", async () => {
    const [id] = useMediaStore.getState().addFiles([new File(["x"], "a.mp4", { type: "video/mp4" })], null);
    await vi.waitFor(() => expect(useMediaStore.getState().items.find((i) => i.id === id)?.status).toBe("error"));
    expect(isUsable(useMediaStore.getState().items.find((i) => i.id === id)!)).toBe(false);
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
