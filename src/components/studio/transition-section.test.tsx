// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TransitionSection } from "@/components/studio/transition-section";

const handlers = () => ({ onType: vi.fn(), onDurationPreview: vi.fn(), onCommit: vi.fn(), onApplyToAll: vi.fn() });

describe("TransitionSection", () => {
  it("explains there is nothing to transition from for the first clip", () => {
    render(<TransitionSection transition={null} hasPrevious={false} {...handlers()} />);
    expect(screen.getByText(/no clip directly before/i)).toBeTruthy();
    expect(screen.queryByLabelText("Transition")).toBeNull();
  });

  it("offers every kind, plus none, and reports the one picked", () => {
    const h = handlers();
    render(<TransitionSection transition={null} hasPrevious {...h} />);
    const select = screen.getByLabelText("Transition") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "None (cut)",
      "Fade",
      "Dip to black",
      "Slide left",
      "Slide right",
    ]);
    fireEvent.change(select, { target: { value: "slide-left" } });
    expect(h.onType).toHaveBeenCalledWith("slide-left");
    expect(screen.queryByRole("slider", { name: "Transition length (seconds)" })).toBeNull();
  });

  it("goes back to a plain cut with None", () => {
    const h = handlers();
    render(<TransitionSection transition={{ type: "fade", duration: 1 }} hasPrevious {...h} />);
    fireEvent.change(screen.getByLabelText("Transition"), { target: { value: "none" } });
    expect(h.onType).toHaveBeenCalledWith(null);
  });

  it("shows the length once there is a transition, and previews and commits its changes", async () => {
    const h = handlers();
    render(<TransitionSection transition={{ type: "fade", duration: 1 }} hasPrevious {...h} />);
    expect((screen.getByLabelText("Transition") as HTMLSelectElement).value).toBe("fade");
    fireEvent.keyDown(screen.getByRole("slider", { name: "Transition length (seconds)" }), { key: "ArrowRight" });
    expect(h.onDurationPreview).toHaveBeenCalledWith(1.1);
    await vi.waitFor(() => expect(h.onCommit).toHaveBeenCalled());
  });

  it("offers to use the transition for every slide, only once there is one", () => {
    const none = handlers();
    const view = render(<TransitionSection transition={null} hasPrevious {...none} />);
    expect(screen.queryByRole("button", { name: "Apply to all slides" })).toBeNull();
    view.unmount();
    const h = handlers();
    render(<TransitionSection transition={{ type: "fade", duration: 1 }} hasPrevious {...h} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply to all slides" }));
    expect(h.onApplyToAll).toHaveBeenCalledTimes(1);
  });

  it("lets a stale transition (nothing directly before the clip now) be removed", () => {
    const h = handlers();
    render(<TransitionSection transition={{ type: "fade", duration: 1 }} hasPrevious={false} {...h} />);
    expect(screen.getByText(/does nothing/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove transition" }));
    expect(h.onType).toHaveBeenCalledWith(null);
  });
});
