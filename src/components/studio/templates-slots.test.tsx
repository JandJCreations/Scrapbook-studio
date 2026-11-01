// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssetsTab } from "@/components/studio/assets-tab";
import { SlotFillPanel } from "@/components/studio/slot-fill-panel";
import { TEMPLATE_CATALOG } from "@/lib/templates/template-catalog";
import type { MediaItem } from "@/types/media";

const item = (overrides: Partial<MediaItem>): MediaItem => ({
  id: "m1",
  name: "Beach",
  type: "image",
  mimeType: "image/jpeg",
  size: 1,
  url: "https://example.com/a.jpg",
  thumbnailUrl: null,
  duration: null,
  folderId: null,
  createdAt: "2026-01-01T00:00:00Z",
  status: "ready",
  progress: 100,
  ...overrides,
});

describe("templates in the Assets tab", () => {
  it("lists every template and hands back the one chosen", () => {
    const onTemplate = vi.fn();
    render(<AssetsTab onAdd={vi.fn()} onTemplate={onTemplate} onAddMusic={vi.fn()} />);
    for (const template of TEMPLATE_CATALOG) {
      expect(screen.getByRole("button", { name: `Use the ${template.name} template` })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Use the Birthday Bash template" }));
    expect(onTemplate).toHaveBeenCalledWith(TEMPLATE_CATALOG.find((t) => t.name === "Birthday Bash"));
  });
});

describe("SlotFillPanel", () => {
  it("offers the library's pictures and videos and reports the one chosen", () => {
    const onFill = vi.fn();
    const photo = item({});
    render(
      <SlotFillPanel
        items={[photo, item({ id: "s", name: "Song", type: "audio" }), item({ id: "b", name: "Busy", status: "processing" })]}
        loading={false}
        onFill={onFill}
      />,
    );
    expect(screen.queryByText("Song")).toBeNull();
    expect(screen.queryByText("Busy")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Put Beach in this slot" }));
    expect(onFill).toHaveBeenCalledWith(photo);
  });

  it("says what to do when the library is empty or loading", () => {
    const { rerender } = render(<SlotFillPanel items={[]} loading={false} onFill={vi.fn()} />);
    expect(screen.getByText(/upload a photo or video/i)).toBeTruthy();
    rerender(<SlotFillPanel items={[]} loading onFill={vi.fn()} />);
    expect(screen.getByText(/loading your media/i)).toBeTruthy();
  });
});
