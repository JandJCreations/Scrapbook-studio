import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  // Nobody is signed in: the upload fails straight away, but the file is still on this computer.
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { isUsable } from "@/lib/media/local-media";
import { useMediaStore } from "@/store/use-media-store";

beforeEach(() => {
  let n = 0;
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => `blob:local-${++n}`, revokeObjectURL: vi.fn() });
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
