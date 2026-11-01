// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CUSTOM_FONT_PREFIX,
  cssUrl,
  customFontFamily,
  isCustomFontFamily,
  registerCustomFont,
  resetCustomFonts,
  setCustomFontsPending,
  whenCustomFontReady,
} from "@/lib/fonts/custom-fonts";
import { loadGoogleFont } from "@/lib/fonts/load-google-font";

afterEach(() => {
  vi.useRealTimers();
  resetCustomFonts();
  document.head.innerHTML = "";
});

describe("custom font names", () => {
  it("are recognised by their prefix and built from the font's id", () => {
    expect(customFontFamily("abc")).toBe(`${CUSTOM_FONT_PREFIX}abc`);
    expect(isCustomFontFamily("custom-abc")).toBe(true);
    expect(isCustomFontFamily("Lora")).toBe(false);
  });
});

describe("whenCustomFontReady", () => {
  it("waits for the list to be fetched, then for that font to load", async () => {
    let finishList!: () => void;
    setCustomFontsPending(new Promise<void>((resolve) => (finishList = resolve)));
    const order: string[] = [];
    const ready = whenCustomFontReady("custom-a").then(() => order.push("ready"));
    await Promise.resolve();
    expect(order).toEqual([]);

    let finishFont!: () => void;
    registerCustomFont("custom-a", new Promise<void>((resolve) => (finishFont = resolve)));
    finishList();
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual([]);
    finishFont();
    await ready;
    expect(order).toEqual(["ready"]);
  });

  it("settles even when the font failed to load, so painting and export never hang on it", async () => {
    registerCustomFont("custom-bad", Promise.reject(new Error("corrupt")));
    await expect(whenCustomFontReady("custom-bad")).resolves.toBeUndefined();
  });

  it("settles at once for a font nobody registered", async () => {
    await expect(whenCustomFontReady("custom-unknown")).resolves.toBeUndefined();
  });
});

describe("loadGoogleFont with a custom family", () => {
  it("never asks Google for it; it waits for the registered font instead", async () => {
    let finishFont!: () => void;
    registerCustomFont("custom-z", new Promise<void>((resolve) => (finishFont = resolve)));
    const done = vi.fn();
    const pending = loadGoogleFont("custom-z").then(done);
    await Promise.resolve();
    expect(document.head.querySelector("link")).toBeNull();
    expect(done).not.toHaveBeenCalled();
    finishFont();
    await pending;
    expect(done).toHaveBeenCalled();
  });
});

describe("a font that takes too long", () => {
  it("stops being waited for, so painting and export are never held up by a stalled download", async () => {
    vi.useFakeTimers();
    setCustomFontsPending(new Promise<void>(() => {}));
    const done = vi.fn();
    void whenCustomFontReady("custom-slow").then(done);
    await vi.advanceTimersByTimeAsync(3000);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(done).toHaveBeenCalled();
  });

  it("also gives up on one font that never finishes", async () => {
    vi.useFakeTimers();
    registerCustomFont("custom-stuck", new Promise<void>(() => {}));
    const done = vi.fn();
    void whenCustomFontReady("custom-stuck").then(done);
    await vi.advanceTimersByTimeAsync(5000);
    expect(done).toHaveBeenCalled();
  });
});

describe("cssUrl", () => {
  it("quotes the address, so brackets and quotes in it cannot end the url() early", () => {
    expect(cssUrl("https://x/a b(1).ttf")).toBe('url("https://x/a b(1).ttf")');
    expect(cssUrl('https://x/a"b\\c.ttf')).toBe('url("https://x/a%22b%5Cc.ttf")');
  });
});
