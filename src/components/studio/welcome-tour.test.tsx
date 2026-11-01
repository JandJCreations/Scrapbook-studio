// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WelcomeTour } from "@/components/studio/welcome-tour";
import { TOUR_STEPS } from "@/lib/onboarding/tour-steps";

describe("WelcomeTour", () => {
  it("keeps focus inside as the steps change and gives it back to where it came from", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const view = render(<WelcomeTour open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next" }));
    view.rerender(<WelcomeTour open={false} onOpenChange={vi.fn()} />);
    expect(document.activeElement).toBe(opener);
  });

  it("takes focus when it opens, so the keys do not reach the editor behind it", () => {
    render(<WelcomeTour open onOpenChange={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next" }));
  });

  it("shows nothing while closed", () => {
    render(<WelcomeTour open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("starts with the welcome step and walks through every step to the end", () => {
    const onOpenChange = vi.fn();
    render(<WelcomeTour open onOpenChange={onOpenChange} />);
    expect(screen.getByRole("dialog", { name: "Quick tour" })).toBeTruthy();
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeTruthy();
    for (let i = 1; i < TOUR_STEPS.length; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByText(TOUR_STEPS[i].title)).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start creating" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("goes back a step, and skips from the first", () => {
    const onOpenChange = vi.fn();
    render(<WelcomeTour open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on Escape and when the backdrop is clicked", () => {
    const onOpenChange = vi.fn();
    render(<WelcomeTour open onOpenChange={onOpenChange} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close tour" }));
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it("starts again from the first step when it is reopened", () => {
    const { rerender } = render(<WelcomeTour open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    rerender(<WelcomeTour open={false} onOpenChange={vi.fn()} />);
    rerender(<WelcomeTour open onOpenChange={vi.fn()} />);
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeTruthy();
  });

  it("has a step for each place it points at, which exist as data-tour targets in the view", () => {
    const targets = TOUR_STEPS.map((s) => s.targetSelector).filter(Boolean);
    expect(targets).toEqual(["tab-media", "tab-assets", "tab-text", "stage", "timeline", "export-button"]);
  });
});
