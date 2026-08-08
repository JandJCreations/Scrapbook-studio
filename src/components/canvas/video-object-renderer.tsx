import * as React from "react";
import Konva from "konva";
import { Group, Image as KonvaImage, Rect } from "react-konva";

import { useVideoElement } from "@/hooks/use-video-element";
import { roundedRectClip } from "@/lib/canvas/rounded-rect-clip";
import { useVideoPlaybackStore } from "@/store/use-video-playback-store";
import type { CanvasObject } from "@/types/canvas";
import type { VideoAdjustments } from "@/types/video-adjustments";

interface VideoObjectRendererProps {
  object: CanvasObject;
  isSelected: boolean;
  commonProps: Record<string, unknown>;
}

const RADIUS = 0;

export function VideoObjectRenderer({
  object,
  isSelected,
  commonProps,
}: VideoObjectRendererProps) {
  const { videoRef, ready } = useVideoElement(object.videoSrc);
  const imageRef = React.useRef<Konva.Image>(null);
  const isPlaying = useVideoPlaybackStore((s) => s.isPlaying(object.id));
  const adjustments = object.videoAdjustments as VideoAdjustments;
  const rafRef = React.useRef<number | null>(null);
  const lastTimeRef = React.useRef<number>(0);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready) return;
    if (video.currentTime < adjustments.trimStart || video.currentTime > adjustments.trimEnd) {
      video.currentTime = adjustments.reversed
        ? adjustments.trimEnd
        : adjustments.trimStart;
    }
  }, [videoRef, ready, object.id, adjustments.trimStart, adjustments.trimEnd, adjustments.reversed]);

  React.useEffect(() => {
    const video = videoRef.current;
    const node = imageRef.current;
    if (!video || !node || !ready) return;
    node.image(video);
    node.getLayer()?.batchDraw();
  }, [videoRef, ready]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = adjustments.muted ? 0 : Math.max(0, Math.min(1, adjustments.volume / 100));
    video.muted = adjustments.muted;
    video.playbackRate = adjustments.reversed ? 1 : adjustments.playbackRate;
    video.loop = false;
  }, [videoRef, adjustments.volume, adjustments.muted, adjustments.playbackRate, adjustments.reversed]);

  const hasFilters =
    adjustments.brightness !== 0 ||
    adjustments.contrast !== 0 ||
    adjustments.saturation !== 0 ||
    adjustments.blur > 0;

  React.useEffect(() => {
    const node = imageRef.current;
    if (!node) return;
    node.brightness(adjustments.brightness / 100);
    node.contrast(adjustments.contrast);
    node.saturation(adjustments.saturation / 100);
    node.blurRadius(adjustments.blur);
    if (hasFilters) {
      node.filters([Konva.Filters.Brighten, Konva.Filters.Contrast, Konva.Filters.HSL, Konva.Filters.Blur]);
    } else {
      node.filters([]);
    }
  }, [
    adjustments.brightness,
    adjustments.contrast,
    adjustments.saturation,
    adjustments.blur,
    hasFilters,
  ]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready) return;

    function tick() {
      const currentVideo = videoRef.current;
      if (!currentVideo) return;
      const node = imageRef.current;

      if (adjustments.reversed) {
        const now = performance.now();
        const dt = lastTimeRef.current ? (now - lastTimeRef.current) / 1000 : 0;
        lastTimeRef.current = now;
        let next = currentVideo.currentTime - dt * adjustments.playbackRate;
        if (next <= adjustments.trimStart) {
          next = adjustments.loop ? adjustments.trimEnd : adjustments.trimStart;
          if (!adjustments.loop) useVideoPlaybackStore.getState().pause(object.id);
        }
        currentVideo.currentTime = next;
      } else if (currentVideo.currentTime >= adjustments.trimEnd) {
        if (adjustments.loop) {
          currentVideo.currentTime = adjustments.trimStart;
        } else {
          currentVideo.pause();
          useVideoPlaybackStore.getState().pause(object.id);
        }
      }

      if (hasFilters && node) node.cache();
      node?.getLayer()?.batchDraw();
      rafRef.current = requestAnimationFrame(tick);
    }

    if (isPlaying) {
      lastTimeRef.current = 0;
      if (adjustments.reversed) {
        video.pause();
      } else {
        void video.play().catch(() => {});
      }
      rafRef.current = requestAnimationFrame(tick);
    } else {
      video.pause();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [
    videoRef,
    isPlaying,
    ready,
    hasFilters,
    object.id,
    adjustments.reversed,
    adjustments.playbackRate,
    adjustments.trimStart,
    adjustments.trimEnd,
    adjustments.loop,
  ]);

  const radius = Math.min(RADIUS, object.width / 2, object.height / 2);

  return (
    <Group {...commonProps}>
      {adjustments.shadow.enabled && (
        <Rect
          width={object.width}
          height={object.height}
          fill={adjustments.shadow.color}
          listening={false}
          shadowEnabled
          shadowColor={adjustments.shadow.color}
          shadowBlur={adjustments.shadow.blur}
          shadowOffsetX={adjustments.shadow.offsetX}
          shadowOffsetY={adjustments.shadow.offsetY}
          shadowOpacity={adjustments.shadow.opacity / 100}
        />
      )}
      <Group
        clipFunc={
          radius > 0
            ? (ctx) => roundedRectClip(ctx, object.width, object.height, radius)
            : undefined
        }
      >
        <KonvaImage
          ref={imageRef}
          image={undefined}
          width={object.width}
          height={object.height}
          crop={adjustments.crop ?? undefined}
          opacity={(ready ? 1 : 0.3) * (adjustments.opacity / 100)}
        />
      </Group>
      {isSelected && (
        <Rect
          width={object.width}
          height={object.height}
          stroke="#8b5cf6"
          strokeWidth={2}
          strokeScaleEnabled={false}
          listening={false}
        />
      )}
    </Group>
  );
}
