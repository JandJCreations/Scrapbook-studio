// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCustomFontService, MAX_FONT_BYTES, type FontStore } from "@/lib/fonts/custom-font-service";
import { resetCustomFonts, whenCustomFontReady } from "@/lib/fonts/custom-fonts";

afterEach(() => resetCustomFonts());

type LoadFace = (family: string, source: ArrayBuffer | string) => Promise<void>;

function setup(overrides: Partial<FontStore> = {}, loadFace = vi.fn<LoadFace>(async () => {})) {
  const store: FontStore = {
    userId: async () => "u1",
    rows: async () => [],
    signedUrls: async (paths) => new Map(paths.map((p) => [p, `https://x/${p}`])),
    upload: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    insert: vi.fn(async () => {}),
    ...overrides,
  };
  const service = createCustomFontService({ store, loadFace, newId: () => "id1" });
  return { store, service, loadFace };
}

const file = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: "font/ttf" });

describe("add", () => {
  it("checks the font loads, stores it, records it and makes it ready under its family", async () => {
    const { service, store, loadFace } = setup();
    const font = await service.add(file("Hand Written.ttf"));
    expect(font).toEqual({ id: "id1", name: "Hand Written", family: "custom-id1" });
    expect(loadFace).toHaveBeenCalledWith("custom-id1", expect.any(ArrayBuffer));
    expect(store.upload).toHaveBeenCalledWith("u1/fonts/id1/Hand Written.ttf", expect.any(File));
    expect(store.insert).toHaveBeenCalledWith({
      id: "id1",
      owner_id: "u1",
      name: "Hand Written",
      family: "custom-id1",
      storage_path: "u1/fonts/id1/Hand Written.ttf",
    });
    await expect(whenCustomFontReady("custom-id1")).resolves.toBeUndefined();
  });

  it("refuses what is not a font file, or is too big, without touching storage", async () => {
    const { service, store } = setup();
    await expect(service.add(file("notes.txt"))).rejects.toThrow(/font file/i);
    await expect(service.add(file("big.ttf", MAX_FONT_BYTES + 1))).rejects.toThrow(/too big/i);
    expect(store.upload).not.toHaveBeenCalled();
  });

  it("refuses a file the browser cannot read as a font", async () => {
    const { service, store } = setup({}, vi.fn<LoadFace>(async () => { throw new Error("parse"); }));
    await expect(service.add(file("broken.ttf"))).rejects.toThrow(/not a usable font/i);
    expect(store.upload).not.toHaveBeenCalled();
  });

  it("fails, and cleans up the upload, when the font cannot be recorded", async () => {
    const { service, store } = setup({ insert: vi.fn(async () => { throw new Error("db"); }) });
    await expect(service.add(file("a.ttf"))).rejects.toThrow(/could not be saved/i);
    expect(store.remove).toHaveBeenCalledWith("u1/fonts/id1/a.ttf");
  });

  it("needs a signed-in user", async () => {
    const { service } = setup({ userId: async () => null });
    await expect(service.add(file("a.ttf"))).rejects.toThrow(/signed in/i);
  });
});

describe("list", () => {
  it("registers every stored font and skips one that will not load", async () => {
    const loadFace = vi.fn<LoadFace>(async (family) => {
      if (family === "custom-bad") throw new Error("corrupt");
    });
    const { service } = setup(
      {
        rows: async () => [
          { id: "a", name: "Good", family: "custom-a", storage_path: "u1/fonts/a/Good.ttf" },
          { id: "bad", name: "Bad", family: "custom-bad", storage_path: "u1/fonts/bad/Bad.ttf" },
          { id: "c", name: "Unsigned", family: "custom-c", storage_path: "missing" },
        ],
        signedUrls: async (paths) => new Map(paths.filter((p) => p !== "missing").map((p) => [p, `https://x/${p}`])),
      },
      loadFace,
    );
    const fonts = await service.list();
    expect(fonts).toEqual([{ id: "a", name: "Good", family: "custom-a" }]);
    expect(loadFace).toHaveBeenCalledWith("custom-a", "https://x/u1/fonts/a/Good.ttf");
  });
});
