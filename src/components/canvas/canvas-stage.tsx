"use client";

import * as React from "react";
import Konva from "konva";
import { Layer, Stage, Transformer } from "react-konva";

import { AlignmentGuidesLayer } from "@/components/canvas/alignment-guides-layer";
import { CanvasFrameOutline } from "@/components/canvas/canvas-frame-outline";
import { CanvasObjectRenderer } from "@/components/canvas/canvas-object-renderer";
import { GridBackground } from "@/components/canvas/grid-background";
import { computeSnap, snapToGrid, type GuideLine } from "@/lib/canvas/alignment";
import { GRID_SIZE, SNAP_THRESHOLD } from "@/lib/canvas/constants";
import { getInterpolatedTransform } from "@/lib/canvas/interpolate";
import { registerStage } from "@/lib/canvas/stage-registry";
import { zoomAtPoint } from "@/lib/canvas/zoom";
import { useCanvasFrame } from "@/store/use-canvas-frame-store";
import { useCanvasObjects, useCanvasStore } from "@/store/use-canvas-store";
import { useTimelineStore } from "@/store/use-timeline-store";
import type { CanvasObject } from "@/types/canvas";

interface CanvasStageProps {
  projectId: string;
  width: number;
  height: number;
}

// Konva defaults to rendering at the full device pixel ratio (3 on most
// phones), so every pan/zoom/drag repaint composites up to 9x more pixels
// than a ratio-1 screen — a major, well-documented source of mobile canvas
// lag. Capped here for interactive editing only; export (capture-frame.ts)
// sets its own explicit pixelRatio for the final render, independent of this.
const EDIT_PIXEL_RATIO =
  typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

export function CanvasStage({ projectId, width, height }: CanvasStageProps) {
  const objects = useCanvasObjects(projectId);
  const frame = useCanvasFrame(projectId);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const viewport = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const snapToGridEnabled = useCanvasStore((s) => s.snapToGrid);
  const updateObjectsBulk = useCanvasStore((s) => s.updateObjectsBulk);
  const setKeyframeTransform = useCanvasStore((s) => s.setKeyframeTransform);
  const playheadTime = useTimelineStore((s) => s.playheadTime);

  const stageRef = React.useRef<Konva.Stage>(null);
  const transformerRef = React.useRef<Konva.Transformer>(null);
  const nodeMapRef = React.useRef(new Map<string, Konva.Node>());
  const dragStartPositionsRef = React.useRef(new Map<string, { x: number; y: number }>());
  const [guides, setGuides] = React.useState<GuideLine[]>([]);
  const pinchRef = React.useRef<{ distance: number } | null>(null);

  React.useEffect(() => {
    registerStage(stageRef.current);
    return () => registerStage(null);
  }, []);

  const registerNode = React.useCallback((id: string, node: Konva.Node | null) => {
    if (node) nodeMapRef.current.set(id, node);
    else nodeMapRef.current.delete(id);
  }, []);

  React.useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const nodes = selectedIds
      .map((id) => nodeMapRef.current.get(id))
      .filter((n): n is Konva.Node => Boolean(n));
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedIds, objects]);

  const handleSelect = React.useCallback(
    (object: CanvasObject, shiftKey: boolean) => {
      const groupMembers = object.groupId
        ? objects.filter((o) => o.groupId === object.groupId).map((o) => o.id)
        : [object.id];

      if (shiftKey) {
        const allSelected = groupMembers.every((id) => selectedIds.includes(id));
        if (allSelected) {
          setSelectedIds(selectedIds.filter((id) => !groupMembers.includes(id)));
        } else {
          setSelectedIds([...new Set([...selectedIds, ...groupMembers])]);
        }
      } else {
        setSelectedIds(groupMembers);
      }
    },
    [objects, selectedIds, setSelectedIds],
  );

  const handleStageClick = React.useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (e.target === stageRef.current) {
        setSelectedIds([]);
      }
    },
    [setSelectedIds],
  );

  const handleWheel = React.useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      if (e.evt.ctrlKey || e.evt.metaKey) {
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const factor = e.evt.deltaY > 0 ? 1 / 1.08 : 1.08;
        setViewport(zoomAtPoint(viewport, pointer, factor));
      } else {
        setViewport({ x: viewport.x - e.evt.deltaX, y: viewport.y - e.evt.deltaY });
      }
    },
    [viewport, setViewport],
  );

  const handleTouchMove = React.useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      const touches = e.evt.touches;
      if (touches.length !== 2) {
        pinchRef.current = null;
        return;
      }
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      stage.stopDrag();

      const [t1, t2] = [touches[0], touches[1]];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const distance = Math.hypot(dx, dy);
      const rect = stage.container().getBoundingClientRect();
      const center = {
        x: (t1.clientX + t2.clientX) / 2 - rect.left,
        y: (t1.clientY + t2.clientY) / 2 - rect.top,
      };

      if (pinchRef.current) {
        const factor = distance / pinchRef.current.distance;
        setViewport(zoomAtPoint(viewport, center, factor));
      }
      pinchRef.current = { distance };
    },
    [viewport, setViewport],
  );

  const handleTouchEnd = React.useCallback(() => {
    pinchRef.current = null;
  }, []);

  const handleObjectDragStart = React.useCallback(
    (object: CanvasObject) => {
      dragStartPositionsRef.current.clear();
      const idsToTrack = selectedIds.includes(object.id) ? selectedIds : [object.id];
      idsToTrack.forEach((id) => {
        const obj = objects.find((o) => o.id === id);
        if (obj) dragStartPositionsRef.current.set(id, { x: obj.x, y: obj.y });
      });
    },
    [selectedIds, objects],
  );

  const handleObjectDragMove = React.useCallback(
    (object: CanvasObject, node: Konva.Node) => {
      const idsToMove = selectedIds.includes(object.id) ? selectedIds : [object.id];
      const start = dragStartPositionsRef.current.get(object.id);
      if (!start) return;

      const rawX = node.x();
      const rawY = node.y();

      const others = objects.filter((o) => !idsToMove.includes(o.id));
      const snapResult = computeSnap(
        { id: object.id, x: rawX, y: rawY, width: object.width, height: object.height },
        others,
        SNAP_THRESHOLD / viewport.scale,
      );

      let finalX = snapResult.x;
      let finalY = snapResult.y;
      let nextGuides = snapResult.guides;

      if (snapToGridEnabled && snapResult.guides.length === 0) {
        finalX = snapToGrid(rawX, GRID_SIZE);
        finalY = snapToGrid(rawY, GRID_SIZE);
        nextGuides = [];
      }

      setGuides(nextGuides);

      const deltaX = finalX - start.x;
      const deltaY = finalY - start.y;

      idsToMove.forEach((id) => {
        const objStart = dragStartPositionsRef.current.get(id);
        const targetNode = nodeMapRef.current.get(id);
        if (!objStart || !targetNode) return;
        targetNode.position({ x: objStart.x + deltaX, y: objStart.y + deltaY });
      });
    },
    [selectedIds, objects, viewport.scale, snapToGridEnabled],
  );

  const handleObjectDragEnd = React.useCallback(
    (object: CanvasObject) => {
      setGuides([]);
      const idsToMove = selectedIds.includes(object.id) ? selectedIds : [object.id];
      const plainPatches: { id: string; patch: { x: number; y: number } }[] = [];

      idsToMove.forEach((id) => {
        const node = nodeMapRef.current.get(id);
        const obj = objects.find((o) => o.id === id);
        if (!node || !obj) return;

        if (obj.keyframes.length > 0) {
          const current = getInterpolatedTransform(obj, playheadTime);
          setKeyframeTransform(projectId, id, playheadTime, {
            x: node.x(),
            y: node.y(),
            rotation: current.rotation,
            opacity: current.opacity,
          });
        } else {
          plainPatches.push({ id, patch: { x: node.x(), y: node.y() } });
        }
      });

      if (plainPatches.length > 0) updateObjectsBulk(projectId, plainPatches);
    },
    [selectedIds, objects, projectId, updateObjectsBulk, setKeyframeTransform, playheadTime],
  );

  const handleTransformEnd = React.useCallback(() => {
    type Patch = { id: string; patch: Partial<CanvasObject> };
    const patches: Patch[] = [];

    selectedIds.forEach((id) => {
      const node = nodeMapRef.current.get(id);
      const obj = objects.find((o) => o.id === id);
      if (!node || !obj) return;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const newX = node.x();
      const newY = node.y();
      const newWidth = Math.max(20, node.width() * scaleX);
      const newHeight = Math.max(20, node.height() * scaleY);
      const newRotation = node.rotation();

      if (obj.keyframes.length > 0) {
        const current = getInterpolatedTransform(obj, playheadTime);
        setKeyframeTransform(projectId, id, playheadTime, {
          x: newX,
          y: newY,
          rotation: newRotation,
          opacity: current.opacity,
        });
        patches.push({ id, patch: { width: newWidth, height: newHeight } });
      } else {
        patches.push({
          id,
          patch: { x: newX, y: newY, width: newWidth, height: newHeight, rotation: newRotation },
        });
      }

      node.scaleX(1);
      node.scaleY(1);
    });

    updateObjectsBulk(projectId, patches);
  }, [selectedIds, objects, projectId, updateObjectsBulk, setKeyframeTransform, playheadTime]);

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      x={viewport.x}
      y={viewport.y}
      scaleX={viewport.scale}
      scaleY={viewport.scale}
      pixelRatio={EDIT_PIXEL_RATIO}
      draggable
      onDragEnd={(e) => {
        if (e.target === stageRef.current) {
          setViewport({ x: e.target.x(), y: e.target.y() });
        }
      }}
      onWheel={handleWheel}
      onClick={handleStageClick}
      onTap={handleStageClick}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="touch-none"
    >
      <Layer listening={false}>
        <GridBackground viewport={viewport} width={width} height={height} />
        <CanvasFrameOutline width={frame.width} height={frame.height} />
      </Layer>

      <Layer>
        {objects.map((object) => (
          <CanvasObjectRenderer
            key={object.id}
            object={object}
            isSelected={selectedIds.includes(object.id)}
            onSelect={handleSelect}
            onDragStart={handleObjectDragStart}
            onDragMove={handleObjectDragMove}
            onDragEnd={handleObjectDragEnd}
            registerNode={registerNode}
          />
        ))}
        <Transformer
          ref={transformerRef}
          onTransformEnd={handleTransformEnd}
          rotateAnchorOffset={24}
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < 20 || newBox.height < 20 ? oldBox : newBox
          }
        />
        <AlignmentGuidesLayer guides={guides} viewport={viewport} width={width} height={height} />
      </Layer>
    </Stage>
  );
}
