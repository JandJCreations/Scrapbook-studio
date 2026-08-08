"use client";

import { Copy, Scissors, Trash2, Volume2, VolumeX } from "lucide-react";

import { AdjustmentSlider } from "@/components/canvas/adjustment-slider";
import { Button } from "@/components/ui/button";
import { EditPanelShell } from "@/components/canvas/edit-panel-shell";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { formatDuration } from "@/lib/media/format";
import { useAudioStore } from "@/store/use-audio-store";
import { useTimelineStore } from "@/store/use-timeline-store";
import type { AudioClip } from "@/types/audio";

export function AudioClipPanel({
  projectId,
  clip,
}: {
  projectId: string;
  clip: AudioClip;
}) {
  const updateClip = useAudioStore((s) => s.updateClip);
  const removeClip = useAudioStore((s) => s.removeClip);
  const duplicateClip = useAudioStore((s) => s.duplicateClip);
  const splitClip = useAudioStore((s) => s.splitClip);
  const setSelectedClipId = useAudioStore((s) => s.setSelectedClipId);
  const playheadTime = useTimelineStore((s) => s.playheadTime);

  const duration = clip.trimEnd - clip.trimStart;

  function patch(update: Partial<AudioClip>) {
    updateClip(projectId, clip.id, update);
  }

  return (
    <EditPanelShell title={clip.name} onClose={() => setSelectedClipId(null)}>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-3">
          <p className="text-xs text-muted-foreground">
            Duration {formatDuration(duration)}
          </p>

          <AdjustmentSlider
            label="Volume"
            value={clip.volume}
            min={0}
            max={100}
            onChange={(v) => patch({ volume: v })}
          />

          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
              {clip.muted ? (
                <VolumeX className="size-3.5" />
              ) : (
                <Volume2 className="size-3.5" />
              )}
              Mute
            </Label>
            <Switch
              checked={clip.muted}
              onCheckedChange={(checked) => patch({ muted: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs font-normal text-muted-foreground">
              Loop
            </Label>
            <Switch
              checked={clip.loop}
              onCheckedChange={(checked) => patch({ loop: checked })}
            />
          </div>

          <AdjustmentSlider
            label="Fade in"
            value={Math.round(clip.fadeIn * 10) / 10}
            min={0}
            max={Math.max(0.1, Math.min(duration / 2, 10))}
            step={0.1}
            onChange={(v) => patch({ fadeIn: v })}
          />

          <AdjustmentSlider
            label="Fade out"
            value={Math.round(clip.fadeOut * 10) / 10}
            min={0}
            max={Math.max(0.1, Math.min(duration / 2, 10))}
            step={0.1}
            onChange={(v) => patch({ fadeOut: v })}
          />

          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => {
                const newId = splitClip(projectId, clip.id, playheadTime);
                if (newId) setSelectedClipId(newId);
              }}
            >
              <Scissors className="size-3.5" />
              Split at playhead
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => {
                const newId = duplicateClip(projectId, clip.id);
                if (newId) setSelectedClipId(newId);
              }}
            >
              <Copy className="size-3.5" />
              Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-destructive hover:text-destructive"
              onClick={() => removeClip(projectId, clip.id)}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </ScrollArea>
    </EditPanelShell>
  );
}
