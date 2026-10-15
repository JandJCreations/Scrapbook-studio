export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  /** State before an in-progress drag began, or null when no drag is open. */
  gestureBase: T | null;
}

export const MAX_HISTORY = 100;

export function createHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [], gestureBase: null };
}

function pushPast<T>(past: T[], value: T): T[] {
  const next = [...past, value];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

/** Turns an open gesture into a single undo step (or none if nothing changed). */
export function endGesture<T>(h: HistoryState<T>): HistoryState<T> {
  if (h.gestureBase === null) return h;
  if (Object.is(h.gestureBase, h.present)) return { ...h, gestureBase: null };
  return {
    past: pushPast(h.past, h.gestureBase),
    present: h.present,
    future: [],
    gestureBase: null,
  };
}

export function commit<T>(h: HistoryState<T>, next: T): HistoryState<T> {
  const base = endGesture(h);
  if (Object.is(next, base.present)) return base;
  return {
    past: pushPast(base.past, base.present),
    present: next,
    future: [],
    gestureBase: null,
  };
}

/** Updates the present for live feedback during a drag, without an undo step. */
export function preview<T>(h: HistoryState<T>, next: T): HistoryState<T> {
  if (Object.is(next, h.present)) return h;
  return { ...h, present: next, gestureBase: h.gestureBase ?? h.present };
}

/**
 * Abandons an open gesture: the present returns to the pre-drag state and
 * neither past nor future is touched.
 */
export function cancelGesture<T>(h: HistoryState<T>): HistoryState<T> {
  if (h.gestureBase === null) return h;
  return { ...h, present: h.gestureBase, gestureBase: null };
}

/** Undo while a drag is open only cancels the drag; it does not undo a step. */
export function undo<T>(h: HistoryState<T>): HistoryState<T> {
  if (h.gestureBase !== null) return cancelGesture(h);
  if (h.past.length === 0) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
    gestureBase: null,
  };
}

/** Redo while a drag is open only cancels the drag. */
export function redo<T>(h: HistoryState<T>): HistoryState<T> {
  if (h.gestureBase !== null) return cancelGesture(h);
  if (h.future.length === 0) return h;
  return {
    past: pushPast(h.past, h.present),
    present: h.future[0],
    future: h.future.slice(1),
    gestureBase: null,
  };
}
