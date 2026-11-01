// @vitest-environment jsdom
import "@/test/dom-setup";

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THUMBNAIL_DELAY_MS, useStudioThumbnail } from "@/components/studio/use-studio-thumbnail";
import type { ThumbnailRequest } from "@/lib/export/studio-thumbnail";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import { useClipProjectStore } from "@/store/use-clip-project-store";

const frame = { width: 1920, height: 1080 };
const withContent = () =>
  makeProject(makeStandardTracks(), [makeClip({ id: "a", trackId: "t1", start: 1 })]);

beforeEach(() => {
  vi.useFakeTimers();
  act(() => useClipProjectStore.getState().load({ id: "", tracks: [], clips: [] }));
});
afterEach(() => vi.useRealTimers());

type Options = Parameters<typeof useStudioThumbnail>[0];

function setup(overrides: Partial<Options> = {}) {
  const saveThumbnail = vi.fn<(dataUrl: string) => Promise<void>>(async () => {});
  const renderThumbnail = vi.fn<(request: ThumbnailRequest) => Promise<string>>(
    async () => "data:image/jpeg;base64,xx",
  );
  const view = renderHook(() =>
    useStudioThumbnail({
      enabled: true,
      frame,
      urlFor: () => null,
      saveThumbnail,
      renderThumbnail,
      ...overrides,
    }),
  );
  return { saveThumbnail, renderThumbnail, ...view };
}

const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(THUMBNAIL_DELAY_MS + 10);
  });
};

describe("useStudioThumbnail", () => {
  it("saves a picture of the first visible moment once edits have stopped for a while", async () => {
    const { saveThumbnail, renderThumbnail } = setup();
    act(() => useClipProjectStore.getState().load(withContent()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(THUMBNAIL_DELAY_MS - 100);
    });
    expect(saveThumbnail).not.toHaveBeenCalled();
    await settle();
    expect(renderThumbnail).toHaveBeenCalledTimes(1);
    expect(renderThumbnail.mock.calls[0][0].time).toBe(1);
    expect(saveThumbnail).toHaveBeenCalledWith("data:image/jpeg;base64,xx");
  });

  it("starts the wait over with each edit, so a burst of edits makes one thumbnail", async () => {
    const { saveThumbnail } = setup();
    act(() => useClipProjectStore.getState().load(withContent()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(THUMBNAIL_DELAY_MS - 100);
    });
    act(() => useClipProjectStore.getState().apply((p) => ({ ...p, clips: [...p.clips, makeClip({ id: "b", trackId: "t1", start: 9 })] })));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(THUMBNAIL_DELAY_MS - 100);
    });
    expect(saveThumbnail).not.toHaveBeenCalled();
    await settle();
    expect(saveThumbnail).toHaveBeenCalledTimes(1);
  });

  it("does nothing while disabled, with no way to save, or with nothing to show", async () => {
    const off = setup({ enabled: false });
    act(() => useClipProjectStore.getState().load(withContent()));
    await settle();
    expect(off.renderThumbnail).not.toHaveBeenCalled();
    off.unmount();

    const none = setup({ saveThumbnail: undefined });
    await settle();
    expect(none.renderThumbnail).not.toHaveBeenCalled();
    none.unmount();

    const empty = setup();
    act(() => useClipProjectStore.getState().load({ id: "", tracks: [], clips: [] }));
    await settle();
    expect(empty.renderThumbnail).not.toHaveBeenCalled();
  });

  it("never lets a failure out: a failed render or save is ignored", async () => {
    const failing = vi.fn<(request: ThumbnailRequest) => Promise<string>>(async () => {
      throw new Error("tainted canvas");
    });
    const { saveThumbnail } = setup({ renderThumbnail: failing });
    act(() => useClipProjectStore.getState().load(withContent()));
    await settle();
    expect(failing).toHaveBeenCalled();
    expect(saveThumbnail).not.toHaveBeenCalled();
  });

  it("does not save when the editor is left while the picture is being made", async () => {
    let finish: (url: string) => void = () => {};
    const slow = vi.fn<(request: ThumbnailRequest) => Promise<string>>(
      () => new Promise<string>((resolve) => (finish = resolve)),
    );
    const { saveThumbnail, unmount } = setup({ renderThumbnail: slow });
    act(() => useClipProjectStore.getState().load(withContent()));
    await settle();
    unmount();
    finish("data:image/jpeg;base64,late");
    await act(async () => {
      await Promise.resolve();
    });
    expect(saveThumbnail).not.toHaveBeenCalled();
  });
});
