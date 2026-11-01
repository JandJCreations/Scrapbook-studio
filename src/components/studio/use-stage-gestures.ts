"use client";

import * as React from "react";

import { panBy, type ViewGeometry, zoomAt } from "@/lib/editor/view";
import { useStageViewStore } from "@/store/use-stage-view-store";

/** How much one wheel notch (or a pinch on a trackpad) zooms: exponential, so in and out cancel out. */
const WHEEL_ZOOM_RATE = 0.0015;

/**
 * Zoom and pan for the stage element: ctrl/cmd+wheel (also a trackpad pinch)
 * zooms about the cursor; a plain wheel pans, but only once zoomed in, so the
 * page still scrolls otherwise; a middle-button drag pans; two fingers pinch
 * and pan. Left-button drags are left alone for moving clips.
 */
export function useStageGestures(
  elementRef: React.RefObject<HTMLElement | null>,
  geometry: ViewGeometry,
): void {
  // Read at event time, so the listeners are attached once.
  const geometryRef = React.useRef(geometry);
  React.useEffect(() => {
    geometryRef.current = geometry;
  });

  React.useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const store = useStageViewStore;
    const local = (clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    function onWheel(event: WheelEvent) {
      const { view, setView } = store.getState();
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_RATE);
        setView(zoomAt(geometryRef.current, view, factor, local(event.clientX, event.clientY)));
      } else if (view.zoom > 1) {
        event.preventDefault();
        setView(panBy(geometryRef.current, view, -event.deltaX, -event.deltaY));
      }
    }

    const pointers = new Map<number, { x: number; y: number }>();
    let panning: number | null = null; // pointer id of a middle-button drag

    function onPointerDown(event: PointerEvent) {
      if (event.button === 1) {
        event.preventDefault();
        event.stopPropagation();
        panning = event.pointerId;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        return;
      }
      if (event.pointerType === "touch") {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        // The second finger turns the touch into a pinch: the first one must not also move a clip.
        if (pointers.size === 2) event.stopPropagation();
      }
    }

    function onPointerMove(event: PointerEvent) {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const current = { x: event.clientX, y: event.clientY };
      const { view, setView } = store.getState();
      if (panning === event.pointerId) {
        pointers.set(event.pointerId, current);
        setView(panBy(geometryRef.current, view, current.x - previous.x, current.y - previous.y));
      } else if (pointers.size === 2) {
        const others = Array.from(pointers.entries()).filter(([id]) => id !== event.pointerId);
        const other = others[0][1];
        const before = Math.hypot(previous.x - other.x, previous.y - other.y);
        const after = Math.hypot(current.x - other.x, current.y - other.y);
        const centreBefore = { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 };
        const centreAfter = { x: (current.x + other.x) / 2, y: (current.y + other.y) / 2 };
        pointers.set(event.pointerId, current);
        let next = view;
        if (before > 0 && after > 0) {
          next = zoomAt(geometryRef.current, next, after / before, local(centreAfter.x, centreAfter.y));
        }
        next = panBy(geometryRef.current, next, centreAfter.x - centreBefore.x, centreAfter.y - centreBefore.y);
        setView(next);
      } else {
        pointers.set(event.pointerId, current);
      }
    }

    function onPointerEnd(event: PointerEvent) {
      pointers.delete(event.pointerId);
      if (panning === event.pointerId) panning = null;
    }

    // Capture phase, so these see events before the clip hit-testing does.
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("pointerdown", onPointerDown, true);
    element.addEventListener("pointermove", onPointerMove, true);
    element.addEventListener("pointerup", onPointerEnd, true);
    element.addEventListener("pointercancel", onPointerEnd, true);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onPointerDown, true);
      element.removeEventListener("pointermove", onPointerMove, true);
      element.removeEventListener("pointerup", onPointerEnd, true);
      element.removeEventListener("pointercancel", onPointerEnd, true);
    };
  }, [elementRef]);
}
