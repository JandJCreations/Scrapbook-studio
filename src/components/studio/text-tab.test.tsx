// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TextTab } from "@/components/studio/text-tab";
import { TEXT_STYLES } from "@/lib/editor/text-ops";

const props = () => ({ selectedIsText: false, canCaption: false, onAddText: vi.fn(), onPickStyle: vi.fn(), onAddCaption: vi.fn() });

describe("TextTab", () => {
  it("adds plain text with one button", () => {
    const p = props();
    render(<TextTab {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Add text" }));
    expect(p.onAddText).toHaveBeenCalledTimes(1);
  });

  it("shows every style as a tile and hands over the one picked", () => {
    const p = props();
    render(<TextTab {...p} />);
    for (const style of TEXT_STYLES) expect(screen.getByRole("button", { name: `Text style ${style.label}` })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Text style Neon" }));
    expect(p.onPickStyle).toHaveBeenCalledWith(TEXT_STYLES.find((s) => s.id === "neon"));
  });

  it("says what a style tile will do: add new text, or restyle the text that is selected", () => {
    const view = render(<TextTab {...props()} />);
    expect(screen.getByText(/pick a style to add text/i)).toBeTruthy();
    view.unmount();
    render(<TextTab {...props()} selectedIsText />);
    expect(screen.getByText(/restyle the selected text/i)).toBeTruthy();
  });

  it("offers a caption for the selected slide only when a photo or video is selected", () => {
    const none = props();
    const view = render(<TextTab {...none} />);
    expect((screen.getByRole("button", { name: "Caption for selected slide" }) as HTMLButtonElement).disabled).toBe(true);
    view.unmount();
    const p = { ...props(), canCaption: true };
    render(<TextTab {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Caption for selected slide" }));
    expect(p.onAddCaption).toHaveBeenCalledTimes(1);
  });
});
