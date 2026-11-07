// @vitest-environment jsdom
import "@/test/dom-setup";

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useUploadGuard } from "@/components/studio/use-upload-guard";

const leave = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("useUploadGuard", () => {
  it("asks before the page is closed while a file the video uses is still uploading", () => {
    renderHook(() => useUploadGuard(true));
    expect(leave()).toBe(true);
  });

  it("lets the page close when nothing is waiting, and stops asking once the upload is done or the editor closes", () => {
    const view = renderHook(({ on }: { on: boolean }) => useUploadGuard(on), { initialProps: { on: true } });
    view.rerender({ on: false });
    expect(leave()).toBe(false);
    view.rerender({ on: true });
    view.unmount();
    expect(leave()).toBe(false);
  });
});
