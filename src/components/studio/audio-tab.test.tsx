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
});
