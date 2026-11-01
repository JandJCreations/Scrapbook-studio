// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TextPanel } from "@/components/studio/text-panel";
import { DEFAULT_TEXT_ADJUSTMENTS } from "@/types/text-adjustments";

function setup(overrides = {}) {
  const handlers = {
    onPreview: vi.fn(),
    onCommit: vi.fn(),
    onApply: vi.fn(),
    onReset: vi.fn(),
  };
  render(<TextPanel adjustments={{ ...DEFAULT_TEXT_ADJUSTMENTS, ...overrides }} {...handlers} />);
  return handlers;
}

describe("TextPanel", () => {
  it("previews typed words and commits when the box loses focus", () => {
    const { onPreview, onCommit } = setup();
    const box = screen.getByLabelText("Text content");
    fireEvent.change(box, { target: { value: "Hello there" } });
    expect(onPreview).toHaveBeenCalledWith({ content: "Hello there" });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(box);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("applies a font choice at once", () => {
    const { onApply } = setup();
    fireEvent.change(screen.getByLabelText("Font"), { target: { value: "Lora" } });
    expect(onApply).toHaveBeenCalledWith({ fontFamily: "Lora" });
  });

  it("applies alignment and bold", () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Align left" }));
    expect(onApply).toHaveBeenCalledWith({ align: "left" });
    fireEvent.click(screen.getByRole("switch", { name: "Bold" }));
    expect(onApply).toHaveBeenCalledWith({ fontWeight: 400 });
  });

  it("previews a colour while choosing and commits on blur", () => {
    const { onPreview, onCommit } = setup();
    const color = screen.getByLabelText("Text colour");
    fireEvent.change(color, { target: { value: "#ff0000" } });
    expect(onPreview).toHaveBeenCalledWith({ color: "#ff0000" });
    fireEvent.blur(color);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("turns an effect on with its whole nested setting", () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByRole("switch", { name: "Stroke" }));
    expect(onApply).toHaveBeenCalledWith({
      stroke: { ...DEFAULT_TEXT_ADJUSTMENTS.stroke, enabled: true },
    });
  });

  it("shows an effect's controls only while it is on", () => {
    setup({ glow: { ...DEFAULT_TEXT_ADJUSTMENTS.glow, enabled: true } });
    expect(screen.getByLabelText("Glow colour")).toBeTruthy();
    expect(screen.queryByLabelText("Shadow colour")).toBeNull();
  });

  it("previews a slider move and commits when it is released", async () => {
    const { onPreview, onCommit } = setup();
    const thumb = screen.getByRole("slider", { name: "Size" });
    fireEvent.keyDown(thumb, { key: "ArrowRight" });
    expect(onPreview).toHaveBeenCalledWith({ fontSize: DEFAULT_TEXT_ADJUSTMENTS.fontSize + 1 });
    await vi.waitFor(() => expect(onCommit).toHaveBeenCalled());
  });

  it("resets", () => {
    const { onReset } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
