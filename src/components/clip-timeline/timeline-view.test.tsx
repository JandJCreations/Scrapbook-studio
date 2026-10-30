// @vitest-environment jsdom
import "@/test/dom-setup";

import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimelineView } from "@/components/clip-timeline/timeline-view";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import { useClipProjectStore } from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";
import type { TimelineProject } from "@/types/timeline";

export function mount(project: TimelineProject) {
  act(() => {
    useClipProjectStore.getState().load(project);
    useTransportStore.getState().reset();
  });
  const handlers = { onSeek: vi.fn(), onToggle: vi.fn(), onStep: vi.fn() };
  render(<TimelineView fps={30} {...handlers} />);
  return handlers;
}

describe("TimelineView (jsdom)", () => {
  it("renders a chip for every clip", () => {
    mount(
      makeProject(makeStandardTracks(), [
        makeClip({ id: "a", name: "First", sourceOut: 4 }),
        makeClip({ id: "b", name: "Second", start: 4, sourceOut: 4 }),
      ]),
    );
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
  });
});
