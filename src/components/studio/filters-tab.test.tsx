// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FiltersTab } from "@/components/studio/filters-tab";
import { makeClip } from "@/lib/timeline/test-utils";
import { DEFAULT_PHOTO_ADJUSTMENTS, type FilterPreset } from "@/types/photo-adjustments";

const photo = (preset: FilterPreset = "none") =>
  makeClip({
    kind: "image",
    sourceDuration: null,
    adjustments: { photo: { ...DEFAULT_PHOTO_ADJUSTMENTS, filterPreset: preset }, video: null, text: null },
  });

describe("FiltersTab", () => {
  it("asks for a clip first when nothing usable is selected", () => {
    render(<FiltersTab clip={null} onPick={vi.fn()} />);
    expect(screen.getByText(/select a photo or video/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Filter Vivid" })).toBeNull();
  });

  it("shows every filter as a tile and applies the one clicked", () => {
    const onPick = vi.fn();
    render(<FiltersTab clip={photo()} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "Filter Vivid" }));
    expect(onPick).toHaveBeenCalledWith("vivid");
    fireEvent.click(screen.getByRole("button", { name: "Filter None" }));
    expect(onPick).toHaveBeenCalledWith("none");
  });

  it("marks the filter the photo has now", () => {
    render(<FiltersTab clip={photo("mono")} onPick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Filter Mono" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Filter Vivid" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("is not offered for music", () => {
    render(<FiltersTab clip={makeClip({ kind: "audio" })} onPick={vi.fn()} />);
    expect(screen.getByText(/select a photo or video/i)).toBeTruthy();
  });
});
