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
  function setup(enabled = true) {
    const element = document.createElement("div");
    document.body.appendChild(element);
    element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON() {} });
    renderHook(() => useStageGestures({ current: element }, geometry, enabled));
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
    const down = new PointerEvent("pointerdown", { button: 1, buttons: 4, pointerId: 1, clientX: 100, clientY: 100, bubbles: true, cancelable: true });
    act(() => {
      element.dispatchEvent(down);
      element.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, buttons: 4, clientX: 130, clientY: 90, bubbles: true }));
      element.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 130, clientY: 90, bubbles: true }));
    });
    expect(useStageViewStore.getState().view).toMatchObject({ panX: 30, panY: -10 });
  });

  const pointer = (type: string, init: PointerEventInit) =>
    new PointerEvent(type, { bubbles: true, cancelable: true, ...init });

  it("pinches: two fingers moving apart zoom in", () => {
    const element = setup();
    act(() => {
      element.dispatchEvent(pointer("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 400, clientY: 250 }));
      element.dispatchEvent(pointer("pointerdown", { pointerId: 2, pointerType: "touch", clientX: 600, clientY: 250 }));
      element.dispatchEvent(pointer("pointermove", { pointerId: 2, pointerType: "touch", clientX: 800, clientY: 250 }));
    });
    expect(useStageViewStore.getState().view.zoom).toBeGreaterThan(1);
  });

  it("keeps the touches from reaching clip dragging while two fingers are down", () => {
    const element = setup();
    const child = document.createElement("div");
    element.appendChild(child);
    let reached = 0;
    document.body.addEventListener("touchstart", () => (reached += 1));
    act(() => {
      element.dispatchEvent(pointer("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 400, clientY: 250 }));
    });
    child.dispatchEvent(new Event("touchstart", { bubbles: true, cancelable: true }));
    expect(reached).toBe(1); // one finger still moves a clip
    act(() => {
      element.dispatchEvent(pointer("pointerdown", { pointerId: 2, pointerType: "touch", clientX: 600, clientY: 250 }));
    });
    child.dispatchEvent(new Event("touchstart", { bubbles: true, cancelable: true }));
    child.dispatchEvent(new Event("touchmove", { bubbles: true, cancelable: true }));
    expect(reached).toBe(1);
  });

  it("stops panning when the pointer is cancelled or the button is let go elsewhere", () => {
    const element = setup();
    act(() => useStageViewStore.getState().setView({ zoom: 2, panX: 0, panY: 0 }));
    act(() => {
      element.dispatchEvent(pointer("pointerdown", { button: 1, buttons: 4, pointerId: 1, clientX: 100, clientY: 100 }));
      element.dispatchEvent(pointer("pointercancel", { pointerId: 1 }));
      element.dispatchEvent(pointer("pointermove", { pointerId: 1, buttons: 0, clientX: 160, clientY: 100 }));
    });
    expect(useStageViewStore.getState().view.panX).toBe(0);
    act(() => {
      element.dispatchEvent(pointer("pointerdown", { button: 1, buttons: 4, pointerId: 2, clientX: 100, clientY: 100 }));
      element.dispatchEvent(pointer("pointermove", { pointerId: 2, buttons: 0, clientX: 160, clientY: 100 }));
    });
    expect(useStageViewStore.getState().view.panX).toBe(0);
  });

  it("does nothing while disabled (no frame yet)", () => {
    const element = setup(false);
    const event = new WheelEvent("wheel", { ctrlKey: true, deltaY: -100, cancelable: true, bubbles: true });
    act(() => {
      element.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(useStageViewStore.getState().view.zoom).toBe(1);
  });
});
