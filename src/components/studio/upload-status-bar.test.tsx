// @vitest-environment jsdom
import "@/test/dom-setup";

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { UploadStatusBar } from "@/components/studio/upload-status-bar";
import type { MediaItem } from "@/types/media";

const item = (patch: Partial<MediaItem>): MediaItem => ({
  id: "a",
  name: "a.jpg",
  type: "image",
  mimeType: "image/jpeg",
  size: 1,
  url: "",
  thumbnailUrl: null,
  duration: null,
  folderId: null,
  createdAt: "",
  status: "ready",
  progress: 100,
  ...patch,
});

describe("UploadStatusBar", () => {
  it("is hidden when nothing is uploading", () => {
    const { container } = render(<UploadStatusBar library={[item({})]} onShowUploads={vi.fn()} />);
    expect(container.textContent).toBe("");
  });

  it("counts the batch and asks to keep the page open", () => {
    const library = [
      item({ id: "a", status: "processing", progress: 50 }),
      item({ id: "b", status: "processing", progress: 0 }),
    ];
    const view = render(<UploadStatusBar library={library} onShowUploads={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toMatch(/0 of 2 uploaded · keep this page open/);
    expect(screen.getByTestId("upload-status").textContent).toMatch(/25%/);
    view.rerender(<UploadStatusBar library={[item({ id: "a" }), library[1]]} onShowUploads={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toMatch(/1 of 2 uploaded/);
  });

  it("offers to try failed uploads again", () => {
    const onRetryAll = vi.fn();
    const onShowUploads = vi.fn();
    render(
      <UploadStatusBar
        library={[item({ status: "error", retryable: true, error: "Lost the connection" })]}
        onShowUploads={onShowUploads}
        onRetryAll={onRetryAll}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("1 file didn't upload.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(onRetryAll).toHaveBeenCalled();
    expect(onShowUploads).toHaveBeenCalled();
  });
});
