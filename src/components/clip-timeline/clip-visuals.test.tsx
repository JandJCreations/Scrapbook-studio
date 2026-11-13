// @vitest-environment jsdom
import "@/test/dom-setup";

import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ClipVisuals, type MediaVisuals } from "@/components/clip-timeline/clip-visuals";
import type { ThumbnailService } from "@/lib/timeline-ui/thumbnail-service";
import type { WaveformService } from "@/lib/timeline-ui/waveform-service";
import { makeClip } from "@/lib/timeline/test-utils";

function fakeVisuals(options: { frames?: Record<string, string>; peaks?: number[] | null } = {}) {
  const asked: Array<[string, number]> = [];
  const listeners = new Set<() => void>();
  const version = { n: 0 };
  const thumbnails: ThumbnailService = {
    get: (mediaId, time) => {
      asked.push([mediaId, time]);
      return options.frames?.[String(time)] ?? null;
    },
    failed: () => false,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getVersion: () => version.n,
    invalidate: () => {},
    dispose: () => {},
  };
  const waveforms: WaveformService = {
    get: () => options.peaks ?? null,
    failed: () => false,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getVersion: () => version.n,
    invalidate: () => {},
    dispose: () => {},
  };
  const visuals: MediaVisuals = {
    thumbnails,
    waveforms,
    urlFor: (id) => (id === "pic" ? "blob:picture" : null),
  };
  const arrive = (frames: Record<string, string>) => {
    Object.assign((options.frames ??= {}), frames);
    version.n += 1;
    for (const l of Array.from(listeners)) l();
  };
  return { visuals, asked, arrive };
}

const videoClip = makeClip({
  id: "v",
  kind: "video",
  mediaId: "vid",
  start: 0,
  sourceIn: 2,
  sourceOut: 8,
  sourceDuration: 10,
});

describe("ClipVisuals: video", () => {
  it("shows a tile per visible slot using the frame for its source time", () => {
    // 6 s at 60 px/s = 360 px; tiles x 0, 90, 180, 270 with source times 2.75, 4.25, 5.75, 7.25.
    const { visuals } = fakeVisuals({
      frames: { "2.75": "data:a", "4.25": "data:b", "5.75": "data:c", "7.25": "data:d" },
    });
    render(
      <ClipVisuals clip={videoClip} width={360} height={60} pps={60} visuals={visuals} viewFrom={0} viewTo={5000} />,
    );
    const tiles = screen.getAllByTestId("thumb-tile");
    expect(tiles).toHaveLength(4);
    // jsdom may or may not keep the quotes inside url(...), so match on the content.
    ["data:a", "data:b", "data:c", "data:d"].forEach((frame, i) => {
      expect(tiles[i].style.backgroundImage).toContain(frame);
    });
  });

  it("asks only for tiles inside the visible range", () => {
    const { visuals, asked } = fakeVisuals();
    render(
      <ClipVisuals clip={videoClip} width={360} height={60} pps={60} visuals={visuals} viewFrom={100} viewTo={200} />,
    );
    expect(asked.map(([, t]) => t)).toEqual([4.25, 5.75]);
  });

  it("draws nothing for a frame that has not arrived and fills it in when it does", () => {
    const { visuals, arrive } = fakeVisuals();
    render(
      <ClipVisuals clip={videoClip} width={360} height={60} pps={60} visuals={visuals} viewFrom={0} viewTo={5000} />,
    );
    expect(screen.queryAllByTestId("thumb-tile").filter((t) => t.style.backgroundImage)).toHaveLength(0);
    act(() => arrive({ "2.75": "data:late" }));
    expect(screen.getAllByTestId("thumb-tile")[0].style.backgroundImage).toContain("data:late");
  });
});

describe("ClipVisuals: picture and audio", () => {
  it("shows a picture clip's image", () => {
    const { visuals } = fakeVisuals();
    const picture = makeClip({ id: "p", kind: "image", mediaId: "pic", sourceDuration: null, sourceIn: 0, sourceOut: 5 });
    render(<ClipVisuals clip={picture} width={300} height={40} pps={60} visuals={visuals} viewFrom={0} viewTo={5000} />);
    expect(screen.getByTestId("clip-picture").style.backgroundImage).toContain("blob:picture");
  });

  it("shows nothing for a picture without a URL", () => {
    const { visuals } = fakeVisuals();
    const picture = makeClip({ id: "p", kind: "image", mediaId: "missing", sourceDuration: null, sourceOut: 5 });
    render(<ClipVisuals clip={picture} width={300} height={40} pps={60} visuals={visuals} viewFrom={0} viewTo={5000} />);
    expect(screen.queryByTestId("clip-picture")).toBeNull();
  });

  it("draws a waveform once peaks exist, none before", () => {
    const sound = makeClip({ id: "a", kind: "audio", mediaId: "snd", sourceIn: 0, sourceOut: 10, sourceDuration: 10 });
    const empty = fakeVisuals({ peaks: null });
    const { unmount } = render(
      <ClipVisuals clip={sound} width={200} height={40} pps={20} visuals={empty.visuals} viewFrom={0} viewTo={5000} />,
    );
    expect(screen.queryByTestId("clip-waveform")).toBeNull();
    unmount();

    const loaded = fakeVisuals({ peaks: [0.2, 0.9, 0.5, 0.1] });
    render(
      <ClipVisuals clip={sound} width={200} height={40} pps={20} visuals={loaded.visuals} viewFrom={0} viewTo={5000} />,
    );
    const svg = screen.getByTestId("clip-waveform");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("none");
    expect(svg.querySelector("path")?.getAttribute("d")).toMatch(/^M0\.5 /);
  });

  it("draws nothing for text clips", () => {
    const { visuals } = fakeVisuals();
    const title = makeClip({ id: "t", kind: "text", sourceDuration: null, sourceOut: 3 });
    const { container } = render(
      <ClipVisuals clip={title} width={180} height={40} pps={60} visuals={visuals} viewFrom={0} viewTo={5000} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
