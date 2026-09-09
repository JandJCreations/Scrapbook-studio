import * as React from "react";

function findVisibleElement(tourId: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${tourId}"]`);
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    // The same tour target can exist twice at once (e.g. the media tab is
    // rendered both in the always-mounted desktop sidebar and inside the
    // mobile sheet) — one of them is CSS-hidden and reports a zero-size
    // rect, so skip those rather than accidentally pointing at nothing.
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return null;
}

function rectsEqual(a: DOMRect | null, b: DOMRect | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/**
 * Tracks the live position of the real DOM element a tour step should point
 * at, re-measuring every frame while active. Polling (rather than a single
 * measurement) is deliberate: the target can still be animating into place
 * (e.g. the mobile sheet sliding open) or the layout can shift under it, and
 * there's no single "it's ready now" event worth depending on here.
 */
export function useTourTargetRect(tourId: string | undefined): DOMRect | null {
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  React.useEffect(() => {
    // Nothing to track — don't start a polling loop, which would otherwise
    // run every frame for as long as this component stays mounted (for this
    // hook's one caller, that's the entire time the editor is open, tour
    // active or not).
    if (!tourId) return;
    const id = tourId;

    let frame: number;
    function measure() {
      const el = findVisibleElement(id);
      const next = el ? el.getBoundingClientRect() : null;
      setRect((prev) => (rectsEqual(prev, next) ? prev : next));
      frame = requestAnimationFrame(measure);
    }
    frame = requestAnimationFrame(measure);

    return () => cancelAnimationFrame(frame);
  }, [tourId]);

  // Masks whatever the last-tracked rect happened to be once tourId goes
  // away, without needing a setState call in the effect above to clear it.
  return tourId ? rect : null;
}
