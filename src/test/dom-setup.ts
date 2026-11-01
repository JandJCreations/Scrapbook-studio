import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// The component tests are slow when the whole suite runs in parallel; plain unit tests keep the short default.
vi.setConfig({ testTimeout: 20000 });

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
