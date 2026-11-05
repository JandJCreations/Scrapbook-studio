// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PreviewControls } from "@/components/studio/preview-controls";

const props = () => ({ time: 3.5, duration: 12, playing: false, onToggle: vi.fn(), onSeek: vi.fn(), onFullscreen: vi.fn() });

describe("PreviewControls", () => {
  it("shows where the video is and how long it is", () => {
    render(<PreviewControls {...props()} />);
    expect(screen.getByText("0:03.5")).toBeTruthy();
    expect(screen.getByText("0:12.0")).toBeTruthy();
  });

  it("has a play button that says what it will do", () => {
    const p = props();
    const view = render(<PreviewControls {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(p.onToggle).toHaveBeenCalledTimes(1);
    view.unmount();
    render(<PreviewControls {...p} playing />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("has a bar to drag to any moment of the video", () => {
    const p = props();
    render(<PreviewControls {...p} />);
    const bar = screen.getByRole("slider", { name: "Seek" }) as HTMLInputElement;
    expect(Number(bar.value)).toBeCloseTo(3.5);
    expect(Number(bar.max)).toBe(12);
    fireEvent.change(bar, { target: { value: "8" } });
    expect(p.onSeek).toHaveBeenCalledWith(8);
  });

  it("goes full screen from its button, and has a bar that cannot be used on an empty video", () => {
    const p = props();
    render(<PreviewControls {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(p.onFullscreen).toHaveBeenCalledTimes(1);
  });

  it("disables the bar when there is nothing to play", () => {
    render(<PreviewControls {...props()} duration={0} time={0} />);
    expect((screen.getByRole("slider", { name: "Seek" }) as HTMLInputElement).disabled).toBe(true);
  });
});
