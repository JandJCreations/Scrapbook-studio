import { create } from "zustand";

import { DEFAULT_OBJECT_SIZE, DEFAULT_TIMELINE_DURATION } from "@/lib/canvas/constants";
import { getInterpolatedTransform } from "@/lib/canvas/interpolate";
import type { CanvasObject, CanvasObjectType } from "@/types/canvas";
import type { Keyframe } from "@/types/keyframe";
import {
  DEFAULT_PHOTO_ADJUSTMENTS,
  type PhotoAdjustments,
} from "@/types/photo-adjustments";
import {
  DEFAULT_TEXT_ADJUSTMENTS,
  type TextAdjustments,
} from "@/types/text-adjustments";
import {
  createDefaultVideoAdjustments,
  type VideoAdjustments,
} from "@/types/video-adjustments";

const EMPTY_OBJECTS: CanvasObject[] = [];

function id() {
  return crypto.randomUUID();
}

type ReorderDirection = "front" | "back" | "forward" | "backward";

interface AddObjectInput {
  type: CanvasObjectType;
  mediaId?: string;
  src?: string;
  videoSrc?: string;
  duration?: number;
  name: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

interface CanvasStore {
  objectsByProject: Record<string, CanvasObject[]>;
  selectedIds: string[];
  snapToGrid: boolean;
  viewport: { x: number; y: number; scale: number };

  addObject: (projectId: string, input: AddObjectInput) => string;
  updateObject: (
    projectId: string,
    objectId: string,
    patch: Partial<CanvasObject>,
  ) => void;
  updateObjectsBulk: (
    projectId: string,
    patches: { id: string; patch: Partial<CanvasObject> }[],
  ) => void;
  removeObjects: (projectId: string, ids: string[]) => void;
  duplicateObjects: (projectId: string, ids: string[]) => string[];
  reorder: (
    projectId: string,
    ids: string[],
    direction: ReorderDirection,
  ) => void;
  toggleLock: (projectId: string, ids: string[]) => void;
  group: (projectId: string, ids: string[]) => void;
  ungroup: (projectId: string, ids: string[]) => void;

  updateAdjustments: (
    projectId: string,
    objectId: string,
    patch: Partial<PhotoAdjustments>,
  ) => void;
  resetAdjustments: (projectId: string, objectId: string) => void;

  updateVideoAdjustments: (
    projectId: string,
    objectId: string,
    patch: Partial<VideoAdjustments>,
  ) => void;
  resetVideoAdjustments: (projectId: string, objectId: string) => void;

  updateTextAdjustments: (
    projectId: string,
    objectId: string,
    patch: Partial<TextAdjustments>,
  ) => void;
  resetTextAdjustments: (projectId: string, objectId: string) => void;

  splitVideoObject: (
    projectId: string,
    objectId: string,
    atSeconds: number,
  ) => string | null;

  addKeyframeAtPlayhead: (
    projectId: string,
    objectId: string,
    time: number,
  ) => void;
  setKeyframeTransform: (
    projectId: string,
    objectId: string,
    time: number,
    transform: { x: number; y: number; rotation: number; opacity: number },
  ) => void;
  removeKeyframe: (
    projectId: string,
    objectId: string,
    keyframeId: string,
  ) => void;

  setSelectedIds: (ids: string[]) => void;
  toggleSnapToGrid: () => void;
  setViewport: (
    viewport: Partial<{ x: number; y: number; scale: number }>,
  ) => void;

  loadObjects: (projectId: string, objects: CanvasObject[]) => void;
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  objectsByProject: {},
  selectedIds: [],
  snapToGrid: true,
  viewport: { x: 0, y: 0, scale: 1 },

  addObject: (projectId, input) => {
    const newId = id();
    const object: CanvasObject = {
      id: newId,
      type: input.type,
      name: input.name,
      mediaId: input.mediaId ?? "",
      src: input.src ?? "",
      videoSrc: input.type === "video" ? (input.videoSrc ?? null) : null,
      x: input.x,
      y: input.y,
      width: input.width ?? DEFAULT_OBJECT_SIZE,
      height: input.height ?? DEFAULT_OBJECT_SIZE,
      rotation: 0,
      locked: false,
      groupId: null,
      adjustments:
        input.type === "image" ? { ...DEFAULT_PHOTO_ADJUSTMENTS } : null,
      videoAdjustments:
        input.type === "video"
          ? createDefaultVideoAdjustments(input.duration ?? 0)
          : null,
      textAdjustments:
        input.type === "text" ? { ...DEFAULT_TEXT_ADJUSTMENTS } : null,
      startTime: 0,
      endTime:
        input.type === "video"
          ? (input.duration ?? DEFAULT_TIMELINE_DURATION)
          : DEFAULT_TIMELINE_DURATION,
      fadeIn: 0,
      fadeOut: 0,
      keyframes: [],
    };
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: [...(state.objectsByProject[projectId] ?? []), object],
      },
    }));
    return newId;
  },

  updateObject: (projectId, objectId, patch) =>
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: (state.objectsByProject[projectId] ?? []).map((o) =>
          o.id === objectId ? { ...o, ...patch } : o,
        ),
      },
    })),

  updateObjectsBulk: (projectId, patches) =>
    set((state) => {
      const patchMap = new Map(patches.map((p) => [p.id, p.patch]));
      return {
        objectsByProject: {
          ...state.objectsByProject,
          [projectId]: (state.objectsByProject[projectId] ?? []).map((o) =>
            patchMap.has(o.id) ? { ...o, ...patchMap.get(o.id) } : o,
          ),
        },
      };
    }),

  removeObjects: (projectId, ids) =>
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: (state.objectsByProject[projectId] ?? []).filter(
          (o) => !ids.includes(o.id),
        ),
      },
      selectedIds: state.selectedIds.filter((sid) => !ids.includes(sid)),
    })),

  duplicateObjects: (projectId, ids) => {
    const objects = get().objectsByProject[projectId] ?? [];
    const toDuplicate = objects.filter((o) => ids.includes(o.id));
    const groupIdMap = new Map<string, string>();
    const newObjects: CanvasObject[] = toDuplicate.map((o) => {
      let newGroupId: string | null = null;
      if (o.groupId) {
        if (!groupIdMap.has(o.groupId)) groupIdMap.set(o.groupId, id());
        newGroupId = groupIdMap.get(o.groupId)!;
      }
      return {
        ...o,
        id: id(),
        x: o.x + 24,
        y: o.y + 24,
        groupId: newGroupId,
      };
    });
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: [...(state.objectsByProject[projectId] ?? []), ...newObjects],
      },
    }));
    return newObjects.map((o) => o.id);
  },

  reorder: (projectId, ids, direction) =>
    set((state) => {
      const objects = state.objectsByProject[projectId] ?? [];
      const idSet = new Set(ids);
      const selected = objects.filter((o) => idSet.has(o.id));
      const rest = objects.filter((o) => !idSet.has(o.id));

      let next: CanvasObject[];
      if (direction === "front") {
        next = [...rest, ...selected];
      } else if (direction === "back") {
        next = [...selected, ...rest];
      } else if (direction === "forward") {
        next = mergeOrderedByOriginal(objects, selected, "forward");
      } else {
        next = mergeOrderedByOriginal(objects, selected, "backward");
      }

      return {
        objectsByProject: { ...state.objectsByProject, [projectId]: next },
      };
    }),

  toggleLock: (projectId, ids) =>
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: (state.objectsByProject[projectId] ?? []).map((o) =>
          ids.includes(o.id) ? { ...o, locked: !o.locked } : o,
        ),
      },
    })),

  group: (projectId, ids) => {
    if (ids.length < 2) return;
    const groupId = id();
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: (state.objectsByProject[projectId] ?? []).map((o) =>
          ids.includes(o.id) ? { ...o, groupId } : o,
        ),
      },
    }));
  },

  ungroup: (projectId, ids) => {
    const objects = get().objectsByProject[projectId] ?? [];
    const groupIds = new Set(
      objects
        .filter((o) => ids.includes(o.id) && o.groupId)
        .map((o) => o.groupId),
    );
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: (state.objectsByProject[projectId] ?? []).map((o) =>
          o.groupId && groupIds.has(o.groupId) ? { ...o, groupId: null } : o,
        ),
      },
    }));
  },

  updateAdjustments: (projectId, objectId, patch) =>
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: (state.objectsByProject[projectId] ?? []).map((o) =>
          o.id === objectId && o.adjustments
            ? { ...o, adjustments: { ...o.adjustments, ...patch } }
            : o,
        ),
      },
    })),

  resetAdjustments: (projectId, objectId) =>
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: (state.objectsByProject[projectId] ?? []).map((o) =>
          o.id === objectId && o.adjustments
            ? { ...o, adjustments: { ...DEFAULT_PHOTO_ADJUSTMENTS } }
            : o,
        ),
      },
    })),

  updateVideoAdjustments: (projectId, objectId, patch) =>
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: (state.objectsByProject[projectId] ?? []).map((o) =>
          o.id === objectId && o.videoAdjustments
            ? { ...o, videoAdjustments: { ...o.videoAdjustments, ...patch } }
            : o,
        ),
      },
    })),

  resetVideoAdjustments: (projectId, objectId) =>
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: (state.objectsByProject[projectId] ?? []).map((o) =>
          o.id === objectId && o.videoAdjustments
            ? {
                ...o,
                videoAdjustments: createDefaultVideoAdjustments(
                  o.videoAdjustments.duration,
                ),
              }
            : o,
        ),
      },
    })),

  updateTextAdjustments: (projectId, objectId, patch) =>
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: (state.objectsByProject[projectId] ?? []).map((o) =>
          o.id === objectId && o.textAdjustments
            ? { ...o, textAdjustments: { ...o.textAdjustments, ...patch } }
            : o,
        ),
      },
    })),

  resetTextAdjustments: (projectId, objectId) =>
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: (state.objectsByProject[projectId] ?? []).map((o) =>
          o.id === objectId && o.textAdjustments
            ? {
                ...o,
                textAdjustments: {
                  ...DEFAULT_TEXT_ADJUSTMENTS,
                  content: o.textAdjustments.content,
                },
              }
            : o,
        ),
      },
    })),

  splitVideoObject: (projectId, objectId, atSeconds) => {
    const objects = get().objectsByProject[projectId] ?? [];
    const source = objects.find((o) => o.id === objectId);
    if (!source || !source.videoAdjustments) return null;
    if (
      atSeconds <= source.videoAdjustments.trimStart ||
      atSeconds >= source.videoAdjustments.trimEnd
    ) {
      return null;
    }

    const newId = id();
    const rightPart: CanvasObject = {
      ...source,
      id: newId,
      x: source.x + 24,
      y: source.y + 24,
      videoAdjustments: { ...source.videoAdjustments, trimStart: atSeconds },
    };

    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: (state.objectsByProject[projectId] ?? []).flatMap((o) =>
          o.id === objectId
            ? [
                {
                  ...o,
                  videoAdjustments: {
                    ...o.videoAdjustments!,
                    trimEnd: atSeconds,
                  },
                },
                rightPart,
              ]
            : [o],
        ),
      },
    }));

    return newId;
  },

  addKeyframeAtPlayhead: (projectId, objectId, time) =>
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: (state.objectsByProject[projectId] ?? []).map((o) =>
          o.id === objectId
            ? upsertKeyframe(o, time, getInterpolatedTransform(o, time))
            : o,
        ),
      },
    })),

  setKeyframeTransform: (projectId, objectId, time, transform) =>
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: (state.objectsByProject[projectId] ?? []).map((o) =>
          o.id === objectId ? upsertKeyframe(o, time, transform) : o,
        ),
      },
    })),

  removeKeyframe: (projectId, objectId, keyframeId) =>
    set((state) => ({
      objectsByProject: {
        ...state.objectsByProject,
        [projectId]: (state.objectsByProject[projectId] ?? []).map((o) =>
          o.id === objectId
            ? { ...o, keyframes: o.keyframes.filter((k) => k.id !== keyframeId) }
            : o,
        ),
      },
    })),

  setSelectedIds: (ids) => set({ selectedIds: ids }),
  toggleSnapToGrid: () => set((state) => ({ snapToGrid: !state.snapToGrid })),
  setViewport: (viewport) =>
    set((state) => ({ viewport: { ...state.viewport, ...viewport } })),

  loadObjects: (projectId, objects) =>
    set((state) => ({
      objectsByProject: { ...state.objectsByProject, [projectId]: objects },
    })),
}));

export function useCanvasObjects(projectId: string): CanvasObject[] {
  return useCanvasStore((s) => s.objectsByProject[projectId] ?? EMPTY_OBJECTS);
}

function upsertKeyframe(
  object: CanvasObject,
  time: number,
  transform: { x: number; y: number; rotation: number; opacity: number },
): CanvasObject {
  const existingIdx = object.keyframes.findIndex(
    (k) => Math.abs(k.time - time) < 0.05,
  );
  const newKeyframe: Keyframe = {
    id: existingIdx >= 0 ? object.keyframes[existingIdx].id : id(),
    time,
    ...transform,
  };
  const keyframes =
    existingIdx >= 0
      ? object.keyframes.map((k, i) => (i === existingIdx ? newKeyframe : k))
      : [...object.keyframes, newKeyframe];
  return { ...object, keyframes };
}

function mergeOrderedByOriginal(
  original: CanvasObject[],
  selected: CanvasObject[],
  direction: "forward" | "backward",
): CanvasObject[] {
  const selectedIds = new Set(selected.map((o) => o.id));
  const result = [...original];

  const indices = result
    .map((o, i) => (selectedIds.has(o.id) ? i : -1))
    .filter((i) => i !== -1);

  const step = direction === "forward" ? 1 : -1;
  const ordered = direction === "forward" ? [...indices].reverse() : indices;

  for (const idx of ordered) {
    const swapWith = idx + step;
    if (swapWith < 0 || swapWith >= result.length) continue;
    if (selectedIds.has(result[swapWith].id)) continue;
    [result[idx], result[swapWith]] = [result[swapWith], result[idx]];
  }

  return result;
}
