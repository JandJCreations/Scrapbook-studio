// @vitest-environment jsdom
import "@/test/dom-setup";

import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { StageViewControls } from "@/components/studio/stage-view-controls";
import { useStageGestures } from "@/components/studio/use-stage-gestures";
import { viewFit } from "@/lib/editor/view";
import { useStageViewStore } from "@/store/use-stage-view-store";

const geometry = { width: 1000, height: 500, frameWidth: 1000, frameHeight: 500 };

beforeEach(() => act(() => useStageViewStore.getState().reset()));

describe("StageViewControls", () => {
  it("zooms in and out about the centre and shows the percentage", () => {
    render(<StageViewControls geometry={geometry} />);
    expect(screen.getByText("100%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("125%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByText("80%")).toBeTruthy();
  });

  it("returns to the fit with one click, and says so by disabling itself", () => {
    render(<StageViewControls geometry={geometry} />);
    const fit = screen.getByRole("button", { name: "Fit to screen" }) as HTMLButtonElement;
    expect(fit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(fit.disabled).toBe(false);
    fireEvent.click(fit);
    expect(useStageViewStore.getState().view).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });
});

describe("useStageGestures", () => {
  function setup() {
    const element = document.createElement("div");
    document.body.appendChild(element);
    element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON() {} });
    renderHook(() => useStageGestures({ current: element }, geometry));
    return element;
  }

  it("zooms about the cursor on ctrl+wheel, and stops the page from zooming", () => {
    const element = setup();
    const event = new WheelEvent("wheel", { ctrlKey: true, deltaY: -100, clientX: 800, clientY: 100, cancelable: true, bubbles: true });
    act(() => {
      element.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    const { view } = useStageViewStore.getState();
    expect(view.zoom).toBeGreaterThan(1);
    // The frame point that was under the cursor still is.
    const fit = viewFit(geometry, view);
    expect(fit.x + 800 * fit.scale).toBeCloseTo(800);
    expect(fit.y + 100 * fit.scale).toBeCloseTo(100);
  });

  it("pans on a plain wheel only while zoomed in, and otherwise leaves the wheel alone", () => {
    const element = setup();
    const plain = new WheelEvent("wheel", { deltaY: 40, cancelable: true, bubbles: true });
    act(() => {
      element.dispatchEvent(plain);
    });
    expect(plain.defaultPrevented).toBe(false);

    act(() => useStageViewStore.getState().setView({ zoom: 2, panX: 0, panY: 0 }));
    const zoomed = new WheelEvent("wheel", { deltaX: 10, deltaY: 40, cancelable: true, bubbles: true });
    act(() => {
      element.dispatchEvent(zoomed);
    });
    expect(zoomed.defaultPrevented).toBe(true);
    expect(useStageViewStore.getState().view).toMatchObject({ panX: -10, panY: -40 });
  });

  it("pans by dragging with the middle button", () => {
    const element = setup();
    act(() => useStageViewStore.getState().setView({ zoom: 2, panX: 0, panY: 0 }));
    const down = new PointerEvent("pointerdown", { button: 1, pointerId: 1, clientX: 100, clientY: 100, bubbles: true, cancelable: true });
    act(() => {
      element.dispatchEvent(down);
      element.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 130, clientY: 90, bubbles: true }));
      element.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 130, clientY: 90, bubbles: true }));
    });
    expect(useStageViewStore.getState().view).toMatchObject({ panX: 30, panY: -10 });
  });
});
