// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useStudioTheme } from "@/hooks/use-studio-theme";

afterEach(() => document.documentElement.classList.remove("dark", "studio-theme"));

describe("useStudioTheme", () => {
  it("makes the page dark while the editor is open, and puts it back after", () => {
    const view = renderHook(() => useStudioTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("studio-theme")).toBe(true);
    view.unmount();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.classList.contains("studio-theme")).toBe(false);
  });

  it("leaves the dark mode the user chose in place when the editor closes", () => {
    document.documentElement.classList.add("dark");
    const view = renderHook(() => useStudioTheme());
    view.unmount();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("studio-theme")).toBe(false);
  });
});
