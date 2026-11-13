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
  onReset: vi.fn(),
});

describe("PhotoPanel", () => {
  it("applies a filter preset at once", () => {
    const h = handlers();
    render(<PhotoPanel adjustments={DEFAULT_PHOTO_ADJUSTMENTS} {...h} />);
    fireEvent.change(screen.getByLabelText("Filter"), { target: { value: "mono" } });
    expect(h.onApply).toHaveBeenCalledWith({ filterPreset: "mono" });
  });

  it("previews a slider move and commits it", async () => {
    const h = handlers();
    render(<PhotoPanel adjustments={DEFAULT_PHOTO_ADJUSTMENTS} {...h} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Brightness" }), { key: "ArrowRight" });
    expect(h.onPreview).toHaveBeenCalledWith({ brightness: 1 });
    await vi.waitFor(() => expect(h.onCommit).toHaveBeenCalled());
  });

  it("resets the look", () => {
    const h = handlers();
    render(<PhotoPanel adjustments={DEFAULT_PHOTO_ADJUSTMENTS} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(h.onReset).toHaveBeenCalledTimes(1);
  });

  it("has highlights, shadows and sharpness sliders that preview their own setting", async () => {
    const h = handlers();
    render(<PhotoPanel adjustments={DEFAULT_PHOTO_ADJUSTMENTS} {...h} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Highlights" }), { key: "ArrowRight" });
    expect(h.onPreview).toHaveBeenCalledWith({ highlights: 1 });
    fireEvent.keyDown(screen.getByRole("slider", { name: "Shadows" }), { key: "ArrowRight" });
    expect(h.onPreview).toHaveBeenCalledWith({ shadowsTone: 1 });
    fireEvent.keyDown(screen.getByRole("slider", { name: "Sharpness" }), { key: "ArrowRight" });
    expect(h.onPreview).toHaveBeenCalledWith({ sharpness: 1 });
  });

  it("resets the look", () => {
    const h = handlers();
    render(<PhotoPanel adjustments={DEFAULT_PHOTO_ADJUSTMENTS} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(h.onReset).toHaveBeenCalledTimes(1);
  });
});

describe("VideoPanel", () => {
  it("edits the video look", () => {
    const h = handlers();
    render(<VideoPanel adjustments={createDefaultVideoAdjustments(6)} {...h} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Saturation" }), { key: "ArrowRight" });
    expect(h.onPreview).toHaveBeenCalledWith({ saturation: 1 });
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
