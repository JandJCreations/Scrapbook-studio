// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SELECT_ALL_LIMIT, StudioMediaPanel } from "@/components/studio/studio-media-panel";
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
    expect(onUpload).toHaveBeenCalledWith([file], null);
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

  it("selects every photo and clip with one tap, and clears them again", () => {
    const onAddMany = vi.fn();
    const all = ["Beach", "Forest", "Lake"].map((name, i) => item({ id: String(i), name }));
    panel(all, { onAddMany });
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("3 of 3 selected")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Select all" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("button", { name: /^Add \d+ / })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 3 to the video" }));
    expect(onAddMany).toHaveBeenCalledWith(all);
  });

  it("selects as many as the editor can take at once, and says the rest were left", () => {
    const all = Array.from({ length: SELECT_ALL_LIMIT + 5 }, (_, i) => item({ id: `p${i}`, name: `Photo ${i}` }));
    panel(all);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByRole("button", { name: `Add ${SELECT_ALL_LIMIT} to the video` })).toBeTruthy();
    expect(screen.getByText(new RegExp(`first ${SELECT_ALL_LIMIT} of ${SELECT_ALL_LIMIT + 5}`))).toBeTruthy();
  });

  it("offers a whole folder on a computer, naming the album after it", () => {
    const onUpload = vi.fn();
    panel([], { onUpload });
    const input = screen.getByLabelText("Import a folder") as HTMLInputElement;
    expect(input.hasAttribute("webkitdirectory")).toBe(true);
    const photo = new File(["x"], "IMG_2.jpg", { type: "image/jpeg" });
    Object.defineProperty(photo, "webkitRelativePath", { value: "Beach trip/IMG_2.jpg" });
    fireEvent.change(input, { target: { files: [photo] } });
    expect(onUpload).toHaveBeenCalledWith([photo], "Beach trip");
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

  it("has a big, styled import area that takes files dropped on it", async () => {
    const onUpload = vi.fn();
    panel([], { onUpload });
    const area = screen.getByTestId("import-area");
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    fireEvent.drop(area, { dataTransfer: { files: [file], types: ["Files"] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith([file], null));
  });

  it("takes files dropped anywhere in the panel, not only on the import area", async () => {
    const onUpload = vi.fn();
    const { container } = panel([item({})], { onUpload });
    const file = new File(["x"], "b.mp4", { type: "video/mp4" });
    fireEvent.drop(container.firstChild as HTMLElement, { dataTransfer: { files: [file], types: ["Files"] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith([file], null));
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

  it("does not list an upload that has nothing local to play", () => {
    panel([item({ id: "a", name: "Pending", status: "processing" })]);
    expect(screen.queryByText("Pending")).toBeNull();
  });

  it("keeps a failed upload in view with the reason, and it can't be added", () => {
    panel([item({ id: "b", name: "Broken", status: "error", error: "Too big to save (74 MB).", localUrl: "blob:b" })]);
    expect(screen.getByText("Broken")).toBeTruthy();
    expect(screen.getByText("Too big to save (74 MB).")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Broken to the video" })).toBeNull();
  });

  it("retries or removes a failed upload", () => {
    const onRetryUpload = vi.fn();
    const onRemoveUpload = vi.fn();
    panel(
      [
        item({ id: "b", name: "Dropped", status: "error", error: "Lost the connection", retryable: true }),
        item({ id: "c", name: "Huge", status: "error", error: "Too big", retryable: false }),
      ],
      { onRetryUpload, onRemoveUpload },
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry Dropped" }));
    expect(onRetryUpload).toHaveBeenCalledWith("b");
    // Trying again can't help a file that is too big.
    expect(screen.queryByRole("button", { name: "Retry Huge" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove Huge" }));
    expect(onRemoveUpload).toHaveBeenCalledWith("c");
  });

  it("says when an upload is waiting its turn, being saved or being made smaller", () => {
    panel([
      item({ id: "w", name: "Next", status: "processing", stage: "waiting", progress: 0, localUrl: "blob:w" }),
      item({ id: "s", name: "Long clip", type: "video", status: "processing", stage: "shrinking", progress: 40, localUrl: "blob:s" }),
      item({ id: "v", name: "Nearly", status: "processing", stage: "saving", progress: 96, localUrl: "blob:v" }),
    ], { onUpload: vi.fn() });
    expect(screen.getByText("Waiting…")).toBeTruthy();
    expect(screen.getByText("Making smaller 40%")).toBeTruthy();
    expect(screen.getByText("Saving…")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/Uploading 3 files/);
  });

  it("shows a photo's picture while it is still uploading", () => {
    panel([item({ id: "p", name: "Sunset", status: "processing", progress: 20, thumbnailUrl: "blob:thumb", localUrl: "blob:p" })]);
    // The picture sits inside the tick button, which is hidden from screen readers (the checkbox speaks for it).
    expect(screen.getByRole("img", { name: "Sunset", hidden: true }).getAttribute("src")).toBe("blob:thumb");
  });
});
