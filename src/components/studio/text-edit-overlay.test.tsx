// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TextEditOverlay } from "@/components/studio/text-edit-overlay";
import { DEFAULT_TEXT_ADJUSTMENTS } from "@/types/text-adjustments";

const box = { x: 100, y: 50, width: 400, height: 80, rotation: 10 };
const fit = { scale: 0.5, x: 20, y: 10 };

function setup() {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  render(
    <TextEditOverlay
      box={box}
      fit={fit}
      adjustments={{ ...DEFAULT_TEXT_ADJUSTMENTS, content: "Hello", fontSize: 40 }}
      onCommit={onCommit}
      onCancel={onCancel}
    />,
  );
  return { onCommit, onCancel, area: screen.getByLabelText("Edit text on the stage") as HTMLTextAreaElement };
}

describe("TextEditOverlay", () => {
  it("starts with the current words, focused, placed over the clip at the stage scale", () => {
    const { area } = setup();
    expect(area.value).toBe("Hello");
    expect(document.activeElement).toBe(area);
    expect(area.style.left).toBe("70px"); // 20 + 100 * 0.5
    expect(area.style.top).toBe("35px"); // 10 + 50 * 0.5
    expect(area.style.width).toBe("200px");
    expect(area.style.height).toBe("40px");
    expect(area.style.fontSize).toBe("20px");
    expect(area.style.transform).toBe("rotate(10deg)");
  });

  it("commits the typed words on Enter, but Shift+Enter makes a new line", () => {
    const { area, onCommit } = setup();
    fireEvent.change(area, { target: { value: "Line" } });
    fireEvent.keyDown(area, { key: "Enter", shiftKey: true });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(area, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("Line");
  });

  it("commits when the box loses focus, and only once", () => {
    const { area, onCommit } = setup();
    fireEvent.change(area, { target: { value: "Changed" } });
    fireEvent.blur(area);
    fireEvent.blur(area);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("Changed");
  });

  it("cancels on Escape without committing, even though the box then loses focus", () => {
    const { area, onCommit, onCancel } = setup();
    fireEvent.change(area, { target: { value: "Nope" } });
    fireEvent.keyDown(area, { key: "Escape" });
    fireEvent.blur(area);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("picks a dark backing for light text and a light one for dark text", () => {
    const { rerender } = render(
      <TextEditOverlay
        box={box}
        fit={fit}
        adjustments={{ ...DEFAULT_TEXT_ADJUSTMENTS, color: "#ffffff" }}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const light = screen.getAllByLabelText("Edit text on the stage").pop() as HTMLTextAreaElement;
    expect(light.style.backgroundColor).toBe("rgba(0, 0, 0, 0.75)");
    rerender(
      <TextEditOverlay
        box={box}
        fit={fit}
        adjustments={{ ...DEFAULT_TEXT_ADJUSTMENTS, color: "#111111" }}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dark = screen.getAllByLabelText("Edit text on the stage").pop() as HTMLTextAreaElement;
    expect(dark.style.backgroundColor).toBe("rgba(255, 255, 255, 0.9)");
  });

  it("reads short #fff colours too", () => {
    render(
      <TextEditOverlay
        box={box}
        fit={fit}
        adjustments={{ ...DEFAULT_TEXT_ADJUSTMENTS, color: "#fff" }}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const area = screen.getByLabelText("Edit text on the stage") as HTMLTextAreaElement;
    expect(area.style.backgroundColor).toBe("rgba(0, 0, 0, 0.75)");
  });

  it("never commits empty words", () => {
    const { area, onCommit } = setup();
    fireEvent.change(area, { target: { value: "   " } });
    fireEvent.keyDown(area, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("Text");
  });
});
