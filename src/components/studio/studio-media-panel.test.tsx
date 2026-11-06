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

const panel = (items: MediaItem[], extra: Partial<React.ComponentProps<typeof StudioMediaPanel>> = {}) =>
  render(<StudioMediaPanel items={items} loading={false} onAdd={vi.fn()} onAddMany={vi.fn()} {...extra} />);

describe("StudioMediaPanel", () => {
  it("adds one photo to the video", () => {
    const onAdd = vi.fn();
    const photo = item({});
    panel([photo], { onAdd });
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the video" }));
    expect(onAdd).toHaveBeenCalledWith(photo);
  });

  it("shows photos and videos, but not songs, and skips files that are not ready", () => {
    panel([
      item({ id: "a", name: "Beach" }),
      item({ id: "b", name: "Clip", type: "video" }),
      item({ id: "c", name: "Song", type: "audio" }),
      item({ id: "d", name: "Uploading", status: "processing" }),
    ]);
    expect(screen.getByText("Beach")).toBeTruthy();
    expect(screen.getByText("Clip")).toBeTruthy();
    expect(screen.queryByText("Song")).toBeNull();
    expect(screen.queryByText("Uploading")).toBeNull();
  });

  it("explains an empty library, and a loading one", () => {
    const view = panel([]);
    expect(screen.getByText(/import some/i)).toBeTruthy();
    view.unmount();
    render(<StudioMediaPanel items={[]} loading onAdd={vi.fn()} onAddMany={vi.fn()} />);
    expect(screen.getByText(/loading your media/i)).toBeTruthy();
  });

  it("offers import only where the environment allows it, and hands over the chosen files", () => {
    const view = panel([]);
    expect(screen.queryByTestId("import-area")).toBeNull();
    view.unmount();
    const onUpload = vi.fn();
    const { container } = panel([], { onUpload });
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onUpload).toHaveBeenCalledWith([file]);
  });

  it("ticks several and adds them together in the order of the list, then clears", () => {
    const onAddMany = vi.fn();
    const a = item({ id: "a", name: "Beach" });
    const b = item({ id: "b", name: "Forest" });
    const c = item({ id: "c", name: "Lake" });
    panel([a, b, c], { onAddMany });
    expect(screen.queryByRole("button", { name: /^Add \d+ / })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Lake" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Beach" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to the video" }));
    expect(onAddMany).toHaveBeenCalledWith([a, c]);
    expect(screen.queryByRole("button", { name: /^Add \d+ / })).toBeNull();
  });

  it("can clear a selection without adding", () => {
    const onAddMany = vi.fn();
    panel([item({ id: "a", name: "Beach" })], { onAddMany });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Beach" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("button", { name: /^Add \d+ / })).toBeNull();
    expect(onAddMany).not.toHaveBeenCalled();
  });

  it("lets a photo or video be dragged out to the timeline", () => {
    const photo = item({ id: "p1", name: "Beach" });
    panel([photo]);
    const tile = screen.getByText("Beach").closest("li")!;
    expect(tile.getAttribute("draggable")).toBe("true");
    const data: Record<string, string> = {};
    const dataTransfer = {
      types: [] as string[],
      effectAllowed: "none",
      setData: (type: string, value: string) => {
        data[type] = value;
      },
      getData: (type: string) => data[type] ?? "",
    };
    fireEvent.dragStart(tile, { dataTransfer });
    expect(JSON.parse(data["application/x-studio-media"])).toEqual({ source: "library", id: "p1" });
  });

  it("has a big, styled import area that takes files dropped on it", () => {
    const onUpload = vi.fn();
    panel([], { onUpload });
    const area = screen.getByTestId("import-area");
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    fireEvent.drop(area, { dataTransfer: { files: [file], types: ["Files"] } });
    expect(onUpload).toHaveBeenCalledWith([file]);
  });

  it("takes files dropped anywhere in the panel, not only on the import area", () => {
    const onUpload = vi.fn();
    const { container } = panel([item({})], { onUpload });
    const file = new File(["x"], "b.mp4", { type: "video/mp4" });
    fireEvent.drop(container.firstChild as HTMLElement, { dataTransfer: { files: [file], types: ["Files"] } });
    expect(onUpload).toHaveBeenCalledWith([file]);
  });

  it("ignores a drop of something that is not files", () => {
    const onUpload = vi.fn();
    panel([], { onUpload });
    fireEvent.drop(screen.getByTestId("import-area"), { dataTransfer: { files: [], types: ["text/plain"] } });
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("has an Import button that opens the file picker", () => {
    const onUpload = vi.fn();
    const { container } = panel([], { onUpload });
    expect(screen.getByRole("button", { name: "Import" })).toBeTruthy();
    expect(container.querySelector("input[type=file]")).not.toBeNull();
  });

  it("lists a file that is still uploading if it is on this computer, with its progress, and can add it", () => {
    const onAdd = vi.fn();
    const uploading = item({ id: "u", name: "Fresh", status: "processing", progress: 35, localUrl: "blob:u" });
    panel([uploading], { onAdd });
    expect(screen.getByText("Fresh")).toBeTruthy();
    expect(screen.getByText(/uploading 35%/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Fresh to the video" }));
    expect(onAdd).toHaveBeenCalledWith(uploading);
  });

  it("does not list an upload that has nothing local to play, or one that failed", () => {
    panel([item({ id: "a", name: "Pending", status: "processing" }), item({ id: "b", name: "Broken", status: "error", localUrl: "blob:b" })]);
    expect(screen.queryByText("Pending")).toBeNull();
    expect(screen.queryByText("Broken")).toBeNull();
  });
});
