// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioToolbar } from "@/components/studio/studio-toolbar";
import type { SyncStatus } from "@/lib/sync/timeline-sync";

const base = {
  projectName: "My trip",
  backHref: "/dashboard",
  status: { phase: "ready", error: null } as SyncStatus,
  canUndo: true,
  canRedo: false,
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  frame: { width: 1920, height: 1080 },
  onFrameChange: vi.fn(),
};

describe("StudioToolbar", () => {
  it("shows the name, a back link and the save state", () => {
    render(<StudioToolbar {...base} />);
    expect(screen.getByText("My trip")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href")).toBe(
      "/dashboard",
    );
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("reports each sync state in words", () => {
    const { rerender } = render(
      <StudioToolbar {...base} status={{ phase: "loading", error: null }} />,
    );
    expect(screen.getByText("Loading…")).toBeTruthy();
    rerender(<StudioToolbar {...base} status={{ phase: "error", error: "offline" }} />);
    expect(screen.getByText(/couldn.t save/i)).toBeTruthy();
    expect(screen.getByText(/offline/)).toBeTruthy();
    rerender(<StudioToolbar {...base} status={{ phase: "conflict", error: null }} />);
    expect(screen.getByText(/changed elsewhere/i)).toBeTruthy();
  });

  it("enables undo and redo only when there is something to do, and calls back", () => {
    const onUndo = vi.fn();
    render(<StudioToolbar {...base} onUndo={onUndo} />);
    const undo = screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement;
    const redo = screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    expect(redo.disabled).toBe(true);
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("changes the frame size from the presets", () => {
    const onFrameChange = vi.fn();
    render(<StudioToolbar {...base} onFrameChange={onFrameChange} />);
    const select = screen.getByLabelText("Frame size") as HTMLSelectElement;
    expect(select.value).toBe("landscape");
    fireEvent.change(select, { target: { value: "portrait" } });
    expect(onFrameChange).toHaveBeenCalledWith({ width: 1080, height: 1920 });
  });

  it("offers a Custom entry when the frame matches no preset", () => {
    render(<StudioToolbar {...base} frame={{ width: 777, height: 555 }} />);
    expect((screen.getByLabelText("Frame size") as HTMLSelectElement).value).toBe("custom");
  });
});
