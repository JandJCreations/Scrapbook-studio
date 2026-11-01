// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AudioPanel } from "@/components/studio/audio-panel";
import { PhotoPanel, VideoPanel } from "@/components/studio/look-panels";
import { DEFAULT_PHOTO_ADJUSTMENTS } from "@/types/photo-adjustments";
import { createDefaultVideoAdjustments } from "@/types/video-adjustments";

const handlers = () => ({
  onPreview: vi.fn(),
  onCommit: vi.fn(),
  onApply: vi.fn(),
  onOpacity: vi.fn(),
  onReset: vi.fn(),
});

describe("PhotoPanel", () => {
  it("applies a filter preset at once", () => {
    const h = handlers();
    render(<PhotoPanel adjustments={DEFAULT_PHOTO_ADJUSTMENTS} opacity={1} {...h} />);
    fireEvent.change(screen.getByLabelText("Filter"), { target: { value: "mono" } });
    expect(h.onApply).toHaveBeenCalledWith({ filterPreset: "mono" });
  });

  it("previews a slider move and commits it", async () => {
    const h = handlers();
    render(<PhotoPanel adjustments={DEFAULT_PHOTO_ADJUSTMENTS} opacity={1} {...h} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Brightness" }), { key: "ArrowRight" });
    expect(h.onPreview).toHaveBeenCalledWith({ brightness: 1 });
    await vi.waitFor(() => expect(h.onCommit).toHaveBeenCalled());
  });

  it("flips with the flip buttons", () => {
    const h = handlers();
    render(<PhotoPanel adjustments={DEFAULT_PHOTO_ADJUSTMENTS} opacity={1} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: "Flip horizontally" }));
    expect(h.onApply).toHaveBeenCalledWith({ flipHorizontal: true });
    fireEvent.click(screen.getByRole("button", { name: "Flip vertically" }));
    expect(h.onApply).toHaveBeenCalledWith({ flipVertical: true });
  });

  it("turns the shadow on with its whole nested setting and shows its controls only then", () => {
    const h = handlers();
    const { rerender } = render(
      <PhotoPanel adjustments={DEFAULT_PHOTO_ADJUSTMENTS} opacity={1} {...h} />,
    );
    expect(screen.queryByLabelText("Shadow colour")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Shadow" }));
    expect(h.onApply).toHaveBeenCalledWith({
      shadow: { ...DEFAULT_PHOTO_ADJUSTMENTS.shadow, enabled: true },
    });
    rerender(
      <PhotoPanel
        adjustments={{
          ...DEFAULT_PHOTO_ADJUSTMENTS,
          shadow: { ...DEFAULT_PHOTO_ADJUSTMENTS.shadow, enabled: true },
        }}
        opacity={1}
        {...h}
      />,
    );
    expect(screen.getByLabelText("Shadow colour")).toBeTruthy();
  });

  it("reports opacity as a fraction and resets", () => {
    const h = handlers();
    render(<PhotoPanel adjustments={DEFAULT_PHOTO_ADJUSTMENTS} opacity={1} {...h} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Opacity" }), { key: "ArrowLeft" });
    expect(h.onOpacity).toHaveBeenCalledWith(0.99);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(h.onReset).toHaveBeenCalledTimes(1);
  });
});

describe("VideoPanel", () => {
  it("edits the video look and offers no flip or border", () => {
    const h = handlers();
    render(<VideoPanel adjustments={createDefaultVideoAdjustments(6)} opacity={1} {...h} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Saturation" }), { key: "ArrowRight" });
    expect(h.onPreview).toHaveBeenCalledWith({ saturation: 1 });
    expect(screen.queryByRole("button", { name: "Flip horizontally" })).toBeNull();
    expect(screen.queryByRole("slider", { name: "Border width" })).toBeNull();
  });
});

describe("AudioPanel", () => {
  const base = { volume: 100, muted: false, fadeIn: 0, fadeOut: 0, speed: 1, maxFade: 10 };

  it("applies mute and speed, previews volume and fades", async () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const onApply = vi.fn();
    const onSpeed = vi.fn();
    render(
      <AudioPanel {...base} onPreview={onPreview} onCommit={onCommit} onApply={onApply} onSpeed={onSpeed} />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Mute" }));
    expect(onApply).toHaveBeenCalledWith({ muted: true });
    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "2" } });
    expect(onSpeed).toHaveBeenCalledWith(2);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Volume" }), { key: "ArrowLeft" });
    expect(onPreview).toHaveBeenCalledWith({ volume: 99 });
    fireEvent.keyDown(screen.getByRole("slider", { name: "Fade in" }), { key: "ArrowRight" });
    expect(onPreview).toHaveBeenCalledWith({ fadeIn: 0.1 });
    await vi.waitFor(() => expect(onCommit).toHaveBeenCalled());
  });
});
