"use client";

import * as React from "react";
import type Konva from "konva";
import { Layer, Rect, Stage, Transformer } from "react-konva";

import { AlignmentGuidesLayer } from "@/components/canvas/alignment-guides-layer";
import type { GuideLine } from "@/lib/canvas/alignment";
import { applyStagePatches } from "@/lib/editor/stage-patches";
import { MIN_BOX_SIZE, nodeToTransform, snapMove, type StageBox } from "@/lib/editor/stage";
import { viewFit } from "@/lib/editor/view";
import { useStageViewStore } from "@/store/use-stage-view-store";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { nextSelection } from "@/lib/timeline-ui/interactions";
import { useClipProjectStore } from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";
import type { ClipTransform } from "@/types/timeline";

interface StageInteractionProps {
  width: number;
  height: number;
  frame: FrameSize;
  boxes: StageBox[];
  selectedIds: string[];
  /** A text clip was double-clicked: edit its words in place. */
  onEditText(clipId: string): void;
  /** A drag or resize is starting; playback stops so the picture stays under the pointer. */
  onGestureStart(): void;
}

type Patches = Record<string, Partial<ClipTransform>>;

/**
 * A Konva layer that draws nothing of its own: one invisible hit rectangle per
 * clip on the stage plus a transformer. Every change goes through the clip
 * store's gesture API, so a drag or resize is one undo step.
 */
export function StageInteraction({
  width,
  height,
  frame,
  boxes,
  selectedIds,
  onEditText,
  onGestureStart,
}: StageInteractionProps) {
  const view = useStageViewStore((s) => s.view);
  const fit = viewFit({ width, height, frameWidth: frame.width, frameHeight: frame.height }, view);
  const transformerRef = React.useRef<Konva.Transformer>(null);
  const nodes = React.useRef(new Map<string, Konva.Rect>());
  // Patches for every clip in the gesture. previewApply recomputes from the
  // pre-gesture project each call, so they must always be sent together.
  const patches = React.useRef<Patches>({});
  const dragStarts = React.useRef(new Map<string, { x: number; y: number }>());
  const [guides, setGuides] = React.useState<GuideLine[]>([]);

  const boxById = React.useMemo(() => new Map(boxes.map((box) => [box.clipId, box])), [boxes]);
  const editable = React.useCallback(
    (id: string) => {
      const box = boxById.get(id);
      return box !== undefined && !box.locked;
    },
    [boxById],
  );

  // The transformer handles the selected clips that may be edited.
  React.useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const attached = selectedIds
      .filter(editable)
      .map((id) => nodes.current.get(id))
      .filter((node): node is Konva.Rect => node !== undefined);
    transformer.nodes(attached);
    transformer.getLayer()?.batchDraw();
  }, [selectedIds, editable]);

  // The playhead when the gesture began: an animated clip gets its keyframe there,
  // even if playback moves on while the pointer is down.
  const gestureTime = React.useRef(0);

  const preview = () => {
    const snapshot = { ...patches.current };
    const time = gestureTime.current;
    useClipProjectStore.getState().previewApply((project) => applyStagePatches(project, snapshot, time));
  };

  const finish = React.useCallback(() => {
    const had = Object.keys(patches.current).length > 0;
    patches.current = {};
    dragStarts.current.clear();
    setGuides([]);
    if (had) useClipProjectStore.getState().endGesture();
  }, []);

  // Konva reports the end of a resize only for nodes still attached to the
  // transformer, so Escape (which clears the selection) or a clip leaving the
  // scene mid-resize would leave the gesture open and the edit unsaved. Any
  // pointer release anywhere, and unmounting, close an open gesture.
  React.useEffect(() => {
    const events = ["pointerup", "mouseup", "touchend", "blur"] as const;
    for (const name of events) window.addEventListener(name, finish);
    return () => {
      for (const name of events) window.removeEventListener(name, finish);
      finish();
    };
  }, [finish]);

  const select = (id: string, additive: boolean) => {
    const store = useClipProjectStore.getState();
    const current = store.selectedClipIds;
    if (additive) {
      store.setSelectedClipIds(nextSelection(current, id, { shift: true, ctrl: false }));
    } else if (!current.includes(id)) {
      store.setSelectedClipIds([id]);
    }
  };

  const onDragStart = (id: string) => {
    onGestureStart();
    patches.current = {};
    gestureTime.current = useTransportStore.getState().time;
    dragStarts.current.clear();
    const moving = selectedIds.includes(id) ? selectedIds.filter(editable) : [id];
    for (const clipId of moving) {
      const node = nodes.current.get(clipId);
      if (node) dragStarts.current.set(clipId, { x: node.x(), y: node.y() });
    }
  };

  const onDragMove = (id: string, node: Konva.Rect) => {
    const start = dragStarts.current.get(id);
    if (!start) return;
    const moving = Array.from(dragStarts.current.keys());
    const snapped = snapMove(
      { id, x: node.x(), y: node.y(), width: node.width(), height: node.height() },
      boxes,
      frame,
      fit.scale,
      moving,
    );
    node.position({ x: snapped.x, y: snapped.y });
    setGuides(snapped.guides);

    const dx = snapped.x - start.x;
    const dy = snapped.y - start.y;
    for (const [clipId, origin] of dragStarts.current) {
      const x = origin.x + dx;
      const y = origin.y + dy;
      // The other selected nodes are moved by the transformer itself while one
      // of them is dragged; repositioning them here would count the move twice.
      patches.current[clipId] = { x, y };
    }
    preview();
  };

  const onTransform = (id: string, node: Konva.Rect) => {
    const t = nodeToTransform({
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      width: node.width(),
      height: node.height(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
    });
    node.setAttrs({ width: t.width, height: t.height, scaleX: 1, scaleY: 1 });
    patches.current[id] = t;
    preview();
  };

  const clearSelectionOnEmpty = (event: Konva.KonvaEventObject<Event>) => {
    if (event.target === event.target.getStage()) {
      useClipProjectStore.getState().setSelectedClipIds([]);
    }
  };

  return (
    <Stage
      width={width}
      height={height}
      x={fit.x}
      y={fit.y}
      scaleX={fit.scale}
      scaleY={fit.scale}
      className="touch-none"
      onMouseDown={clearSelectionOnEmpty}
      onTouchStart={clearSelectionOnEmpty}
    >
      <Layer>
        {boxes.map((box) => (
          <Rect
            key={box.clipId}
            ref={(node: Konva.Rect | null) => {
              if (node) nodes.current.set(box.clipId, node);
              else nodes.current.delete(box.clipId);
            }}
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            rotation={box.rotation}
            fill="rgba(0,0,0,0.001)"
            // A locked clip is left alone by the pointer: clicks go through to what is behind it.
            listening={!box.locked}
            draggable={!box.locked}
            onMouseDown={(event) => select(box.clipId, event.evt.shiftKey)}
            onTouchStart={() => select(box.clipId, false)}
            onDblClick={() => box.isText && !box.locked && onEditText(box.clipId)}
            onDblTap={() => box.isText && !box.locked && onEditText(box.clipId)}
            onDragStart={() => onDragStart(box.clipId)}
            onDragMove={(event) => onDragMove(box.clipId, event.target as Konva.Rect)}
            onDragEnd={finish}
            onTransformStart={() => {
              onGestureStart();
              patches.current = {};
              gestureTime.current = useTransportStore.getState().time;
            }}
            onTransform={(event) => onTransform(box.clipId, event.target as Konva.Rect)}
            onTransformEnd={finish}
          />
        ))}
        <Transformer
          ref={transformerRef}
          rotateAnchorOffset={24}
          anchorSize={10}
          borderStroke="#8b5cf6"
          anchorStroke="#8b5cf6"
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < MIN_BOX_SIZE || newBox.height < MIN_BOX_SIZE ? oldBox : newBox
          }
        />
        <AlignmentGuidesLayer
          guides={guides}
          viewport={{ x: fit.x, y: fit.y, scale: fit.scale }}
          width={width}
          height={height}
        />
      </Layer>
    </Stage>
  );
}
