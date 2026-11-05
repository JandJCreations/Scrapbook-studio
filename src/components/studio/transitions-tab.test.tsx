// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TransitionsTab } from "@/components/studio/transitions-tab";
import { makeClip } from "@/lib/timeline/test-utils";

const clip = (transition: { type: "fade" | "dip" | "slide-left" | "slide-right"; duration: number } | null = null) =>
  makeClip({ kind: "image", sourceDuration: null, transition });

describe("TransitionsTab", () => {
  it("asks for a clip first when none is selected", () => {
    render(<TransitionsTab clip={null} hasPrevious={false} onPick={vi.fn()} onApplyToAll={vi.fn()} />);
    expect(screen.getByText(/select a clip/i)).toBeTruthy();
  });

  it("explains a first clip has nothing before it", () => {
    render(<TransitionsTab clip={clip()} hasPrevious={false} onPick={vi.fn()} onApplyToAll={vi.fn()} />);
    expect(screen.getByText(/no clip directly before/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Transition Fade" })).toBeNull();
  });

  it("shows a tile for each transition and none, and applies the one clicked", () => {
    const onPick = vi.fn();
    render(<TransitionsTab clip={clip()} hasPrevious onPick={onPick} onApplyToAll={vi.fn()} />);
    for (const name of ["None", "Fade", "Dip to black", "Slide left", "Slide right"]) {
      expect(screen.getByRole("button", { name: `Transition ${name}` })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Transition Slide left" }));
    expect(onPick).toHaveBeenCalledWith("slide-left");
    fireEvent.click(screen.getByRole("button", { name: "Transition None" }));
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it("marks the current one, and offers apply-to-all only once there is a transition", () => {
    const onApplyToAll = vi.fn();
    const view = render(<TransitionsTab clip={clip()} hasPrevious onPick={vi.fn()} onApplyToAll={onApplyToAll} />);
    expect(screen.getByRole("button", { name: "Transition None" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Apply to all slides" })).toBeNull();
    view.unmount();
    render(<TransitionsTab clip={clip({ type: "dip", duration: 1 })} hasPrevious onPick={vi.fn()} onApplyToAll={onApplyToAll} />);
    expect(screen.getByRole("button", { name: "Transition Dip to black" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Apply to all slides" }));
    expect(onApplyToAll).toHaveBeenCalledTimes(1);
  });
});
