// @vitest-environment jsdom
import "@/test/dom-setup";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssetsTab } from "@/components/studio/assets-tab";
import { LayersTab } from "@/components/studio/layers-tab";
import { ASSET_CATALOG } from "@/lib/assets/asset-catalog";
import { MUSIC_LIBRARY } from "@/lib/audio/music-library-catalog";
import { makeClip, makeProject, makeTrack } from "@/lib/timeline/test-utils";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";

describe("AssetsTab", () => {
  it("shows the catalog by category and adds the asset that is clicked", () => {
    const onAdd = vi.fn();
    render(<AssetsTab onAdd={onAdd} onTemplate={vi.fn()} onAddMusic={vi.fn()} />);
    expect(screen.getByText("Stickers")).toBeTruthy();
    expect(screen.getByText("Washi tape")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Star, Stickers" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toBe(ASSET_CATALOG.find((a) => a.category === "stickers" && a.name === "Star"));
  });

  it("offers every asset in the catalog", () => {
    render(<AssetsTab onAdd={vi.fn()} onTemplate={vi.fn()} onAddMusic={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /^Add .+, / }).length).toBe(ASSET_CATALOG.length);
  });
});

const store = () => useClipProjectStore.getState();
const orderOf = () =>
  [...selectProject(store()).tracks].sort((a, b) => a.order - b.order).map((t) => t.id);

beforeEach(() => {
  act(() => {
    store().load(
      makeProject(
        [
          makeTrack({ id: "o2", type: "overlay", order: 0 }),
          makeTrack({ id: "o1", type: "overlay", order: 1 }),
          makeTrack({ id: "v", type: "video", order: 2 }),
          makeTrack({ id: "a", type: "audio", order: 3 }),
        ],
        [
          makeClip({ id: "s", trackId: "o2", kind: "sticker", name: "Star", sourceDuration: null }),
          makeClip({ id: "p", trackId: "o1", kind: "image", name: "Beach", sourceDuration: null }),
          makeClip({ id: "m", trackId: "v", name: "Clip one" }),
        ],
      ),
    );
    store().setSelectedClipIds([]);
  });
});

describe("LayersTab", () => {
  it("lists the tracks front to back with their clips", () => {
    render(<LayersTab />);
    const rows = screen.getAllByRole("listitem").map((r) => r.textContent ?? "");
    expect(rows[0]).toContain("Star");
    expect(rows[1]).toContain("Beach");
    expect(rows[2]).toContain("Clip one");
  });

  it("selects a clip from its row", () => {
    render(<LayersTab />);
    fireEvent.click(screen.getByRole("button", { name: "Select Beach" }));
    expect(store().selectedClipIds).toEqual(["p"]);
  });

  it("brings a layer forward and sends it backward as one undo step each", () => {
    render(<LayersTab />);
    const before = store().history.past.length;
    fireEvent.click(screen.getByRole("button", { name: "Bring Beach forward" }));
    expect(orderOf()).toEqual(["o1", "o2", "v", "a"]);
    expect(store().history.past.length).toBe(before + 1);
    fireEvent.click(screen.getByRole("button", { name: "Send Beach backward" }));
    expect(orderOf()).toEqual(["o2", "o1", "v", "a"]);
  });

  it("disables moving the front layer forward and the back overlay backward", () => {
    render(<LayersTab />);
    expect((screen.getByRole("button", { name: "Bring Star forward" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Send Beach backward" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("hides and locks a layer", () => {
    render(<LayersTab />);
    fireEvent.click(screen.getByRole("button", { name: "Hide Star" }));
    expect(selectProject(store()).tracks.find((t) => t.id === "o2")?.hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Show Star" }));
    expect(selectProject(store()).tracks.find((t) => t.id === "o2")?.hidden).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Lock Star" }));
    expect(selectProject(store()).tracks.find((t) => t.id === "o2")?.locked).toBe(true);
  });

  it("says so when there is nothing yet", () => {
    act(() => store().load({ id: "", tracks: [], clips: [] }));
    render(<LayersTab />);
    expect(screen.getByText(/nothing here yet/i)).toBeTruthy();
  });

  it("marks the selected clip", () => {
    act(() => store().setSelectedClipIds(["s"]));
    render(<LayersTab />);
    expect(screen.getByRole("button", { name: "Select Star" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("AssetsTab music", () => {
  beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn(async () => {});
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  it("lists the library tracks and adds the one chosen", () => {
    const onAddMusic = vi.fn();
    render(<AssetsTab onAdd={vi.fn()} onTemplate={vi.fn()} onAddMusic={onAddMusic} />);
    for (const track of MUSIC_LIBRARY) {
      expect(screen.getByRole("button", { name: `Add ${track.name} as music` })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: `Add ${MUSIC_LIBRARY[0].name} as music` }));
    expect(onAddMusic).toHaveBeenCalledWith(MUSIC_LIBRARY[0]);
  });

  it("previews a track, and pauses it when it is pressed again", () => {
    render(<AssetsTab onAdd={vi.fn()} onTemplate={vi.fn()} onAddMusic={vi.fn()} />);
    const name = MUSIC_LIBRARY[0].name;
    fireEvent.click(screen.getByRole("button", { name: `Preview ${name}` }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: `Pause ${name}` }));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
});
