"use client";

import { Clapperboard, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TransitionPicker } from "@/components/timeline/transition-picker";
import { VisualTimelineClip } from "@/components/timeline/visual-timeline-clip";
import { useEditorUiStore } from "@/store/use-editor-ui-store";
import type { CanvasObject } from "@/types/canvas";

const ROW_HEIGHT = 56;

interface StoryTrackProps {
  projectId: string;
  clips: CanvasObject[];
  pixelsPerSecond: number;
  selectedIds: string[];
  timelineWidth: number;
}

/**
 * The main story row: photos and videos that play one after another, like a
 * film strip. Clips sit end to end automatically — drag one to reorder, drag
 * its right edge to make it shorter or longer, delete it and the gap closes.
 */
export function StoryTrack({
  projectId,
  clips,
  pixelsPerSecond,
  selectedIds,
  timelineWidth,
}: StoryTrackProps) {
  const openMediaForStory = useEditorUiStore((s) => s.openMediaForStory);

  return (
    <div
      className="flex border-b border-border bg-amber-500/5"
      style={{ height: ROW_HEIGHT }}
      data-tour="story-track"
    >
      <div className="flex w-40 shrink-0 items-center gap-1.5 border-r border-border bg-background px-2">
        <Clapperboard className="size-3.5 shrink-0 text-amber-600" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">Story</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => openMediaForStory()}
          aria-label="Add photos or videos to the story"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <div className="relative flex-1" style={{ minWidth: timelineWidth }}>
        {clips.length === 0 ? (
          <button
            type="button"
            onClick={() => openMediaForStory()}
            className="absolute inset-y-2 left-2 flex items-center gap-1.5 rounded-md border border-dashed border-amber-500/50 px-3 text-xs text-muted-foreground hover:bg-amber-500/10"
          >
            <Plus className="size-3.5" />
            Add photos and videos to play them in order
          </button>
        ) : (
          <>
            {clips.map((clip) => (
              <VisualTimelineClip
                key={clip.id}
                projectId={projectId}
                object={clip}
                pixelsPerSecond={pixelsPerSecond}
                isSelected={selectedIds.includes(clip.id)}
                story
              />
            ))}
            {clips.slice(1).map((clip, i) => (
              <TransitionPicker
                key={`t-${clip.id}`}
                projectId={projectId}
                clip={clip}
                // Middle of the overlap (or the cut point when there's none).
                left={((clip.startTime + clips[i].endTime) / 2) * pixelsPerSecond}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
