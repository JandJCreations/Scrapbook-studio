// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TextSection } from "@/components/studio/text-section";
import { DEFAULT_TEXT_ADJUSTMENTS } from "@/types/text-adjustments";

const setup = (overrides = {}) => {
  const h = { onPreview: vi.fn(), onCommit: vi.fn(), onApply: vi.fn(), onPosition: vi.fn() };
  render(<TextSection adjustments={{ ...DEFAULT_TEXT_ADJUSTMENTS, content: "Hello", ...overrides }} {...h} />);
  return h;
};

describe("TextSection", () => {
  it("previews the words as they are typed and commits when the box loses focus", () => {
    const h = setup();
    const box = screen.getByLabelText("Text");
    expect((box as HTMLTextAreaElement).value).toBe("Hello");
    fireEvent.change(box, { target: { value: "Hello there" } });
    expect(h.onPreview).toHaveBeenCalledWith({ content: "Hello there" });
    expect(h.onCommit).not.toHaveBeenCalled();
    fireEvent.blur(box);
    expect(h.onCommit).toHaveBeenCalledTimes(1);
  });

  it("changes the font at once, and shows a font that is not in the list", () => {
    const h = setup();
    fireEvent.change(screen.getByLabelText("Font"), { target: { value: "Playfair Display" } });
    expect(h.onApply).toHaveBeenCalledWith({ fontFamily: "Playfair Display" });
  });

  it("previews the size and the colour while they change", () => {
    const h = setup();
    fireEvent.keyDown(screen.getByRole("slider", { name: "Size" }), { key: "ArrowRight" });
    expect(h.onPreview).toHaveBeenCalledWith({ fontSize: DEFAULT_TEXT_ADJUSTMENTS.fontSize + 1 });
    fireEvent.change(screen.getByLabelText("Text colour"), { target: { value: "#ff0000" } });
    expect(h.onPreview).toHaveBeenCalledWith({ color: "#ff0000" });
  });

  it("has bold, outline and shadow switches, and alignment buttons", () => {
    const h = setup({ fontWeight: 700 });
    fireEvent.click(screen.getByRole("switch", { name: "Bold" }));
    expect(h.onApply).toHaveBeenCalledWith({ fontWeight: 400 });
    fireEvent.click(screen.getByRole("switch", { name: "Outline" }));
    expect(h.onApply).toHaveBeenCalledWith({ stroke: { ...DEFAULT_TEXT_ADJUSTMENTS.stroke, enabled: true } });
    fireEvent.click(screen.getByRole("switch", { name: "Shadow" }));
    expect(h.onApply).toHaveBeenCalledWith({ shadow: { ...DEFAULT_TEXT_ADJUSTMENTS.shadow, enabled: true } });
    fireEvent.click(screen.getByRole("button", { name: "Align left" }));
    expect(h.onApply).toHaveBeenCalledWith({ align: "left" });
  });

  it("moves the text to the top, middle or bottom", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Position top" }));
    fireEvent.click(screen.getByRole("button", { name: "Position middle" }));
    fireEvent.click(screen.getByRole("button", { name: "Position bottom" }));
    expect(h.onPosition.mock.calls.map((c) => c[0])).toEqual(["top", "middle", "bottom"]);
  });
});
