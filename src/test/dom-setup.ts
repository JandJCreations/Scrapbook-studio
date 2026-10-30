import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom has no layout engine and lacks a few browser APIs the timeline uses.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.hasPointerCapture = () => false;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
