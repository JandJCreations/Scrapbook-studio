"use client";

import { AudioLines, Mic, Trash2, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AddAudioPopover } from "@/components/timeline/add-audio-popover";
import { TimelineClip } from "@/components/timeline/timeline-clip";
import { cn } from "@/lib/utils";
import { useAudioStore } from "@/store/use-audio-store";
import { isVoiceoverTrack, type AudioClip, type AudioTrack } from "@/types/audio";

const TRACK_HEIGHT = 56;

interface TimelineTrackProps {
  projectId: string;
  track: AudioTrack;
  clips: AudioClip[];
  pixelsPerSecond: number;
  selectedClipId: string | null;
  timelineWidth: number;
}

export function TimelineTrack({
  projectId,
  track,
  clips,
  pixelsPerSecond,
  selectedClipId,
  timelineWidth,
}: TimelineTrackProps) {
  const toggleTrackMute = useAudioStore((s) => s.toggleTrackMute);
  const toggleTrackSolo = useAudioStore((s) => s.toggleTrackSolo);
  const removeTrack = useAudioStore((s) => s.removeTrack);
  const updateTrack = useAudioStore((s) => s.updateTrack);
  const voiceover = isVoiceoverTrack(track);
  const ducking = voiceover && track.duckOthers !== false;

  return (
    <div className="flex border-b border-border" style={{ height: TRACK_HEIGHT }}>
      <div className="flex w-40 shrink-0 items-center gap-1 border-r border-border bg-background px-2">
        {voiceover && <Mic className="size-3.5 shrink-0 text-rose-500" />}
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {track.name}
        </span>
        {voiceover && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={ducking ? "secondary" : "ghost"}
                size="icon"
                className="size-6"
                aria-pressed={ducking}
                aria-label={ducking ? "Stop lowering music under voice" : "Lower music under voice"}
                onClick={() => updateTrack(projectId, track.id, { duckOthers: !ducking })}
              >
                <AudioLines className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {ducking ? "Music dips while you talk (on)" : "Music dips while you talk (off)"}
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={track.muted ? "secondary" : "ghost"}
              size="icon"
              className="size-6"
              onClick={() => toggleTrackMute(projectId, track.id)}
              aria-label={track.muted ? "Unmute track" : "Mute track"}
            >
              {track.muted ? (
                <VolumeX className="size-3.5" />
              ) : (
                <Volume2 className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{track.muted ? "Unmute" : "Mute"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={track.solo ? "secondary" : "ghost"}
              size="icon"
              className={cn("size-6 text-[10px] font-bold", track.solo && "text-primary")}
              onClick={() => toggleTrackSolo(projectId, track.id)}
              aria-label={track.solo ? "Unsolo track" : "Solo track"}
            >
              S
            </Button>
          </TooltipTrigger>
          <TooltipContent>{track.solo ? "Unsolo" : "Solo"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-destructive hover:text-destructive"
              onClick={() => removeTrack(projectId, track.id)}
              aria-label="Delete track"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete track</TooltipContent>
        </Tooltip>
      </div>

      <div
        className="relative flex-1 bg-muted/20"
        style={{ minWidth: timelineWidth }}
      >
        {clips.length === 0 ? (
          <div className="flex h-full items-center px-3">
            <AddAudioPopover projectId={projectId} trackId={track.id} />
          </div>
        ) : (
          <>
            {clips.map((clip) => (
              <TimelineClip
                key={clip.id}
                projectId={projectId}
                clip={clip}
                pixelsPerSecond={pixelsPerSecond}
                isSelected={selectedClipId === clip.id}
              />
            ))}
            <div className="absolute top-1 left-1">
              <AddAudioPopover projectId={projectId} trackId={track.id} compact />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
