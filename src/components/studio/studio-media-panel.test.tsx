// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioMediaPanel } from "@/components/studio/studio-media-panel";
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

describe("StudioMediaPanel", () => {
  it("adds a photo to the sequence or as an overlay", () => {
    const onAdd = vi.fn();
    const photo = item({});
    render(<StudioMediaPanel items={[photo]} loading={false} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the sequence" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Beach as an overlay" }));
    expect(onAdd).toHaveBeenNthCalledWith(1, photo, "sequence");
    expect(onAdd).toHaveBeenNthCalledWith(2, photo, "overlay");
  });

  it("offers a single Add for music", () => {
    const onAdd = vi.fn();
    const song = item({ id: "s1", name: "Song", type: "audio", mimeType: "audio/mpeg", duration: 30 });
    render(<StudioMediaPanel items={[song]} loading={false} onAdd={onAdd} />);
    expect(screen.queryByRole("button", { name: /overlay/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add Song as music" }));
    expect(onAdd).toHaveBeenCalledWith(song, "sequence");
  });

  it("leaves out items that are not ready yet", () => {
    render(
      <StudioMediaPanel
        items={[item({ id: "a", name: "Ready" }), item({ id: "b", name: "Busy", status: "processing" })]}
        loading={false}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.queryByText("Busy")).toBeNull();
    expect(screen.getByText("Ready")).toBeTruthy();
  });

  it("explains an empty library and offers upload", () => {
    const onUpload = vi.fn();
    render(<StudioMediaPanel items={[]} loading={false} onAdd={vi.fn()} onUpload={onUpload} />);
    expect(screen.getByText(/no media yet/i)).toBeTruthy();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onUpload).toHaveBeenCalledWith([file]);
  });

  it("says it is loading while the library loads", () => {
    render(<StudioMediaPanel items={[]} loading onAdd={vi.fn()} />);
    expect(screen.getByText(/loading your media/i)).toBeTruthy();
  });
});
