// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectPanel } from "@/components/studio/project-panel";

const frame = { width: 1920, height: 1080 };

describe("ProjectPanel", () => {
  it("lists the shapes a video can have and marks the current one", () => {
    render(<ProjectPanel frame={frame} duration={12.4} clipCount={3} onFrameChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Landscape 16:9" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Portrait 9:16" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Square 1:1" })).toBeTruthy();
  });

  it("changes the shape of the video from a tile", () => {
    const onFrameChange = vi.fn();
    render(<ProjectPanel frame={frame} duration={0} clipCount={0} onFrameChange={onFrameChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Portrait 9:16" }));
    expect(onFrameChange).toHaveBeenCalledWith({ width: 1080, height: 1920 });
  });

  it("says how long the video is and how many clips are in it", () => {
    render(<ProjectPanel frame={frame} duration={72.3} clipCount={5} onFrameChange={vi.fn()} />);
    expect(screen.getByText("1:12.3")).toBeTruthy();
    expect(screen.getByText("5 clips")).toBeTruthy();
  });

  it("says what to do when the video is empty", () => {
    render(<ProjectPanel frame={frame} duration={0} clipCount={0} onFrameChange={vi.fn()} />);
    expect(screen.getByText(/import photos or videos/i)).toBeTruthy();
  });
});
