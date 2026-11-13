import { beforeEach, describe, expect, it } from "vitest";

import { useTransportStore } from "@/store/use-transport-store";

const state = () => useTransportStore.getState();

beforeEach(() => {
  state().reset();
});

describe("useTransportStore", () => {
  it("starts paused at 0", () => {
    expect(state().time).toBe(0);
    expect(state().playing).toBe(false);
  });

  it("records the latest frame", () => {
    state().setFrame(2.5, true);
    expect(state().time).toBe(2.5);
    expect(state().playing).toBe(true);
  });

  it("does not notify subscribers when nothing changed", () => {
    let notifications = 0;
    const unsubscribe = useTransportStore.subscribe(() => {
      notifications += 1;
    });
    state().setFrame(1, true);
    state().setFrame(1, true);
    state().setFrame(1, false);
    unsubscribe();
    expect(notifications).toBe(2);
  });

  it("resets to the start", () => {
    state().setFrame(9, true);
    state().reset();
    expect(state().time).toBe(0);
    expect(state().playing).toBe(false);
  });
});
