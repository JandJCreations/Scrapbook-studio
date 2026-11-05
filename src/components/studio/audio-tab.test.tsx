// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AudioTab } from "@/components/studio/audio-tab";
import { MUSIC_LIBRARY } from "@/lib/audio/music-library-catalog";
import type { MediaItem } from "@/types/media";

const item = (overrides: Partial<MediaItem>): MediaItem => ({
  id: "s1",
  name: "My song",
  type: "audio",
  mimeType: "audio/mpeg",
  size: 1,
  url: "https://example.com/a.mp3",
  thumbnailUrl: null,
  duration: 120,
  folderId: null,
  createdAt: "2026-01-01T00:00:00Z",
  status: "ready",
  progress: 100,
  ...overrides,
});

describe("AudioTab", () => {
  it("lists only the user's audio, and adds one", () => {
    const onAddAudio = vi.fn();
    const song = item({});
    render(
      <AudioTab
        items={[song, item({ id: "p", name: "Beach", type: "image" })]}
        loading={false}
        onAddAudio={onAddAudio}
        onAddMusic={vi.fn()}
      />,
    );
    expect(screen.queryByText("Beach")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add My song as music" }));
    expect(onAddAudio).toHaveBeenCalledWith(song);
  });

  it("points to the Media tab when there is no audio yet", () => {
    render(<AudioTab items={[]} loading={false} onAddAudio={vi.fn()} onAddMusic={vi.fn()} />);
    expect(screen.getByText(/upload a song/i)).toBeTruthy();
  });

  it("adds a library track", () => {
    const onAddMusic = vi.fn();
    render(<AudioTab items={[]} loading={false} onAddAudio={vi.fn()} onAddMusic={onAddMusic} />);
    const track = MUSIC_LIBRARY[0];
    fireEvent.click(screen.getByRole("button", { name: `Add ${track.name} as music` }));
    expect(onAddMusic).toHaveBeenCalledWith(track);
  });

  it("lets a song, or a library track, be dragged out to the music track", () => {
    const song = item({});
    render(<AudioTab items={[song]} loading={false} onAddAudio={vi.fn()} onAddMusic={vi.fn()} />);
    const dragged = (row: HTMLElement) => {
      const data: Record<string, string> = {};
      fireEvent.dragStart(row, {
        dataTransfer: { types: [], effectAllowed: "none", setData: (t: string, v: string) => (data[t] = v), getData: (t: string) => data[t] ?? "" },
      });
      return JSON.parse(data["application/x-studio-media"]);
    };
    expect(dragged(screen.getByText("My song").closest("li")!)).toEqual({ source: "library", id: "s1" });
    expect(dragged(screen.getByText(MUSIC_LIBRARY[0].name).closest("li")!)).toEqual({ source: "music", id: MUSIC_LIBRARY[0].id });
  });
});
