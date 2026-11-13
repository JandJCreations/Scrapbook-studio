// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadGoogleFont } from "@/lib/fonts/load-google-font";

afterEach(() => {
  document.head.innerHTML = "";
});

describe("loadGoogleFont", () => {
  it("waits for the stylesheet before asking for the font, and loads both weights", async () => {
    const load = vi.fn(async () => []);
    Object.defineProperty(document, "fonts", { value: { load }, configurable: true });

    const done = loadGoogleFont("Lora");
    const link = document.head.querySelector("link") as HTMLLinkElement;
    expect(link.href).toContain("family=Lora");
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled(); // the font faces are not known until the CSS arrives

    link.dispatchEvent(new Event("load"));
    await done;
    expect(load).toHaveBeenCalledWith('400 16px "Lora"');
    expect(load).toHaveBeenCalledWith('700 16px "Lora"');
  });

  it("settles when the stylesheet fails to load", async () => {
    Object.defineProperty(document, "fonts", { value: { load: vi.fn(async () => []) }, configurable: true });
    const done = loadGoogleFont("Pacifico");
    (document.head.querySelector("link") as HTMLLinkElement).dispatchEvent(new Event("error"));
    await expect(done).resolves.toBeUndefined();
  });

  it("never asks Google for a font the user uploaded in an earlier version (custom-...)", async () => {
    await expect(loadGoogleFont("custom-1234")).resolves.toBeUndefined();
    expect(document.head.querySelector("link")).toBeNull();
  });
});
