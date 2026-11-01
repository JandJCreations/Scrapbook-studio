// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CropSection } from "@/components/studio/crop-section";
import { KeyframesSection } from "@/components/studio/keyframes-section";
import { makeClip } from "@/lib/timeline/test-utils";

const kf = (id: string, time: number) => ({ id, time, x: 0, y: 0, rotation: 0, opacity: 1 });
const clip = (keyframes = [kf("a", 1.5), kf("b", 3)]) =>
  makeClip({ id: "c", kind: "image", sourceDuration: null, start: 10, sourceOut: 8, keyframes });

describe("KeyframesSection", () => {
  it("adds a keyframe at the playhead when it is inside the clip", () => {
    const onAdd = vi.fn();
    render(
      <KeyframesSection clip={clip([])} playhead={12} onSeek={vi.fn()} onAdd={onAdd} onRemove={vi.fn()} onClear={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add keyframe" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("will not add one when the playhead is outside the clip", () => {
    render(
      <KeyframesSection clip={clip([])} playhead={2} onSeek={vi.fn()} onAdd={vi.fn()} onRemove={vi.fn()} onClear={vi.fn()} />,
    );
    expect((screen.getByRole("button", { name: "Add keyframe" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lists keyframes in time order, jumps to one and deletes one", () => {
    const onSeek = vi.fn();
    const onRemove = vi.fn();
    render(
      <KeyframesSection
        clip={clip([kf("b", 3), kf("a", 1.5)])}
        playhead={11}
        onSeek={onSeek}
        onAdd={vi.fn()}
        onRemove={onRemove}
        onClear={vi.fn()}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows[0].textContent).toContain("1.5 s");
    expect(rows[1].textContent).toContain("3.0 s");
    fireEvent.click(screen.getByRole("button", { name: "Go to keyframe at 1.5 s" }));
    expect(onSeek).toHaveBeenCalledWith(11.5); // clip start 10 + 1.5
    fireEvent.click(screen.getByRole("button", { name: "Delete keyframe at 3.0 s" }));
    expect(onRemove).toHaveBeenCalledWith("b");
  });

  it("offers to remove them all once there are some", () => {
    const onClear = vi.fn();
    render(
      <KeyframesSection clip={clip()} playhead={11} onSeek={vi.fn()} onAdd={vi.fn()} onRemove={vi.fn()} onClear={onClear} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove all keyframes" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe("CropSection", () => {
  const controls = { aspect: "original", zoom: 1, panX: 50, panY: 50 };

  it("says it is waiting for the picture size", () => {
    render(<CropSection controls={controls} ready={false} onPreview={vi.fn()} onCommit={vi.fn()} onApply={vi.fn()} />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "1:1" })).toBeNull();
  });

  it("applies an aspect choice at once", () => {
    const onApply = vi.fn();
    render(<CropSection controls={controls} ready onPreview={vi.fn()} onCommit={vi.fn()} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "1:1" }));
    expect(onApply).toHaveBeenCalledWith({ ...controls, aspect: "1:1" });
  });

  it("previews zoom and position and commits them", async () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    render(<CropSection controls={controls} ready onPreview={onPreview} onCommit={onCommit} onApply={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Zoom" }), { key: "ArrowRight" });
    expect(onPreview).toHaveBeenCalledWith({ ...controls, zoom: 1.1 });
    fireEvent.keyDown(screen.getByRole("slider", { name: "Left-right" }), { key: "ArrowRight" });
    expect(onPreview).toHaveBeenCalledWith({ ...controls, panX: 51 });
    await vi.waitFor(() => expect(onCommit).toHaveBeenCalled());
  });

  it("marks the chosen aspect", () => {
    render(
      <CropSection controls={{ ...controls, aspect: "16:9" }} ready onPreview={vi.fn()} onCommit={vi.fn()} onApply={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "16:9" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "1:1" }).getAttribute("aria-pressed")).toBe("false");
  });
});
