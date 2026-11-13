import { create } from "zustand";

import { DEFAULT_OBJECT_SIZE, DEFAULT_TIMELINE_DURATION } from "@/lib/canvas/constants";
import { getInterpolatedTransform } from "@/lib/canvas/interpolate";
import {
  DEFAULT_STORY_PHOTO_SECONDS,
  fitInsideFrame,
  isStoryClip,
  normalizeStory,
  storyClips as storyClipsInOrder,
  storyEnd,
} from "@/lib/story/story";
import type { CanvasObject, CanvasObjectType } from "@/types/canvas";
import type { Keyframe } from "@/types/keyframe";
import type { ObjectExtras, TransitionSpec } from "@/types/object-extras";
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

export interface AddObjectInput {
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
  isPlaceholder?: boolean;
  /** Append to the end of the story track (timing is set automatically). */
  inStory?: boolean;
}

interface FillPlaceholderInput {
  mediaId: string;
  src: string;
  videoSrc?: string;
  duration?: number;
  name: string;
}

interface CanvasStore {
  objectsByProject: Record<string, CanvasObject[]>;
  selectedIds: string[];
  snapToGrid: boolean;
  viewport: { x: number; y: number; scale: number };

  addObject: (projectId: string, input: AddObjectInput) => string;
  fillPlaceholder: (
    projectId: string,
    objectId: string,
    input: FillPlaceholderInput,
  ) => void;
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

  /**
   * Put objects on (or take them off) the story track. Added clips go to the
   * end of the story in the order given and are fitted inside `frame`.
   */
  setInStory: (
    projectId: string,
    ids: string[],
    inStory: boolean,
    frame: { width: number; height: number },
  ) => void;

  /** Merge settings into an object's extras (animations etc.). */
  updateExtras: (projectId: string, objectId: string, patch: Partial<ObjectExtras>) => void;

  /** Set (or clear, with null) how a story clip transitions in. */
  setTransitionIn: (
    projectId: string,
    objectId: string,
    transition: TransitionSpec | null,
  ) => void;
  /** Use the same transition between every pair of story clips. */
  setTransitionForAll: (projectId: string, transition: TransitionSpec | null) => void;

  setSelectedIds: (ids: string[]) => void;
  toggleSnapToGrid: () => void;
  setViewport: (
    viewport: Partial<{ x: number; y: number; scale: number }>,
  ) => void;

  loadObjects: (projectId: string, objects: CanvasObject[]) => void;
}

// Every write to a project's objects goes through here so the story track
// stays packed end to end no matter which action changed it (delete, trim,
// split, drag, duplicate, undo...). normalizeStory returns the same array
// when nothing moved, so this is free for projects without a story.
function withNormalizedStory(
  next: Partial<CanvasStore>,
  prev: CanvasStore,
): Partial<CanvasStore> {
  const byProject = next.objectsByProject;
  if (!byProject || byProject === prev.objectsByProject) return next;
  let changed = false;
  const normalized: Record<string, CanvasObject[]> = { ...byProject };
  for (const key of Object.keys(byProject)) {
    if (byProject[key] === prev.objectsByProject[key]) continue;
    const packed = normalizeStory(byProject[key]);
    if (packed !== byProject[key]) {
      normalized[key] = packed;
      changed = true;
    }
  }
  return changed ? { ...next, objectsByProject: normalized } : next;
}

export const useCanvasStore = create<CanvasStore>((rawSet, get) => {
  const set = (
    partial:
      | Partial<CanvasStore>
      | ((state: CanvasStore) => Partial<CanvasStore>),
  ) =>
    rawSet((state) =>
      withNormalizedStory(
        typeof partial === "function" ? partial(state) : partial,
        state,
      ),
    );

  return {
    objectsByProject: {},
    selectedIds: [],
    snapToGrid: true,
    viewport: { x: 0, y: 0, scale: 1 },

    addObject: (projectId, input) => {
      const newId = id();
      const length =
        input.type === "video"
          ? (input.duration ?? DEFAULT_TIMELINE_DURATION)
          : input.inStory
            ? DEFAULT_STORY_PHOTO_SECONDS
            : DEFAULT_TIMELINE_DURATION;
      const start = input.inStory
        ? storyEnd(get().objectsByProject[projectId] ?? [])
        : 0;
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
        isPlaceholder: input.isPlaceholder ?? false,
        startTime: start,
        endTime: start + length,
        fadeIn: 0,
        fadeOut: 0,
        keyframes: [],
        extras: input.inStory
        ? {
            inStory: true,
            // Photos in a story get a slow zoom by default (alternating in
            // and out) so a slideshow never feels like a frozen frame.
            ...(input.type === "image"
              ? { motion: storyPhotoMotion(get().objectsByProject[projectId] ?? []) }
              : {}),
          }
        : {},
      };
      set((state) => ({
        objectsByProject: {
          ...state.objectsByProject,
          [projectId]: [...(state.objectsByProject[projectId] ?? []), object],
        },
      }));
      return newId;
    },

    // Fills an existing placeholder slot with real media in place — keeps the
    // slot's position/size/rotation (that's the whole point of a template
    // layout) while rebuilding its content-dependent fields the same way
    // addObject defaults them for a brand new object of that type.
    fillPlaceholder: (projectId, objectId, input) =>
      set((state) => ({
        objectsByProject: {
          ...state.objectsByProject,
          [projectId]: (state.objectsByProject[projectId] ?? []).map((o) => {
            if (o.id !== objectId) return o;
            return {
              ...o,
              mediaId: input.mediaId,
              src: input.src,
              videoSrc: o.type === "video" ? (input.videoSrc ?? null) : null,
              name: input.name,
              isPlaceholder: false,
              adjustments: o.type === "image" ? { ...DEFAULT_PHOTO_ADJUSTMENTS } : o.adjustments,
              videoAdjustments:
                o.type === "video"
                  ? createDefaultVideoAdjustments(input.duration ?? 0)
                  : o.videoAdjustments,
              endTime:
                o.type === "video"
                  ? (input.duration ?? DEFAULT_TIMELINE_DURATION)
                  : o.endTime,
            };
          }),
        },
      })),

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
          // A story clip's copy sits right after it in the story, filling the
          // frame the same way — nudging it sideways would just look broken.
          x: isStoryClip(o) ? o.x : o.x + 24,
          y: isStoryClip(o) ? o.y : o.y + 24,
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
      // Where the cut lands on the timeline: the left half now ends there and
      // the right half picks up from it, so the two play back to back.
      const rate = source.videoAdjustments.playbackRate || 1;
      const cutTime = Math.min(
        source.endTime,
        source.startTime + (atSeconds - source.videoAdjustments.trimStart) / rate,
      );
      const story = isStoryClip(source);
      const rightPart: CanvasObject = {
        ...source,
        id: newId,
        x: story ? source.x : source.x + 24,
        y: story ? source.y : source.y + 24,
        startTime: cutTime,
        endTime: source.endTime,
        videoAdjustments: { ...source.videoAdjustments, trimStart: atSeconds },
        keyframes: source.keyframes.filter((k) => k.time >= cutTime),
      };

      set((state) => ({
        objectsByProject: {
          ...state.objectsByProject,
          [projectId]: (state.objectsByProject[projectId] ?? []).flatMap((o) =>
            o.id === objectId
              ? [
                  {
                    ...o,
                    endTime: cutTime,
                    keyframes: o.keyframes.filter((k) => k.time <= cutTime),
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
        objectsByProject: {
          ...state.objectsByProject,
          // Older saves and version snapshots predate `extras`.
          [projectId]: objects.map((o) => (o.extras ? o : { ...o, extras: {} })),
        },
      })),

    updateExtras: (projectId, objectId, patch) =>
      set((state) => ({
        objectsByProject: {
          ...state.objectsByProject,
          [projectId]: (state.objectsByProject[projectId] ?? []).map((o) => {
            if (o.id !== objectId) return o;
            const extras: ObjectExtras = { ...o.extras, ...patch };
            // `undefined` in the patch means "remove".
            for (const key of Object.keys(patch) as (keyof ObjectExtras)[]) {
              if (patch[key] === undefined) delete extras[key];
            }
            return { ...o, extras };
          }),
        },
      })),

    setTransitionIn: (projectId, objectId, transition) =>
      set((state) => ({
        objectsByProject: {
          ...state.objectsByProject,
          [projectId]: (state.objectsByProject[projectId] ?? []).map((o) =>
            o.id === objectId ? { ...o, extras: withTransition(o.extras, transition) } : o,
          ),
        },
      })),

    setTransitionForAll: (projectId, transition) =>
      set((state) => {
        const objects = state.objectsByProject[projectId] ?? [];
        const first = storyClipsInOrder(objects)[0]?.id;
        return {
          objectsByProject: {
            ...state.objectsByProject,
            [projectId]: objects.map((o) =>
              isStoryClip(o) && o.id !== first
                ? { ...o, extras: withTransition(o.extras, transition) }
                : o,
            ),
          },
        };
      }),

    setInStory: (projectId, ids, inStory, frame) =>
      set((state) => {
        const objects = state.objectsByProject[projectId] ?? [];
        const idOrder = new Map(ids.map((objectId, i) => [objectId, i]));
        let cursor = storyEnd(objects);
        const appended = new Map<string, Partial<CanvasObject>>();
        if (inStory) {
          // In the order the caller listed them, not canvas stacking order.
          const toAdd = objects
            .filter((o) => idOrder.has(o.id) && !isStoryClip(o) && o.type !== "text")
            .sort((a, b) => idOrder.get(a.id)! - idOrder.get(b.id)!);
          for (const o of toAdd) {
            const length =
              o.type === "video" && o.videoAdjustments
                ? (o.videoAdjustments.trimEnd - o.videoAdjustments.trimStart) /
                  (o.videoAdjustments.playbackRate || 1)
                : DEFAULT_STORY_PHOTO_SECONDS;
            appended.set(o.id, {
              ...fitInsideFrame({ width: o.width, height: o.height }, frame),
              rotation: 0,
              startTime: cursor,
              endTime: cursor + Math.max(0.5, length || DEFAULT_STORY_PHOTO_SECONDS),
            });
            cursor += Math.max(0.5, length || DEFAULT_STORY_PHOTO_SECONDS);
          }
        }
        return {
          objectsByProject: {
            ...state.objectsByProject,
            [projectId]: objects.map((o) => {
              if (!idOrder.has(o.id)) return o;
              if (inStory) {
                const patch = appended.get(o.id);
                return patch ? { ...o, ...patch, extras: { ...o.extras, inStory: true } } : o;
              }
              if (!isStoryClip(o)) return o;
              const rest = { ...o.extras };
              delete rest.inStory;
              delete rest.transitionIn;
              return { ...o, extras: rest };
            }),
          },
        };
      }),
    };
  });

  export function useCanvasObjects(projectId: string): CanvasObject[] {
    return useCanvasStore((s) => s.objectsByProject[projectId] ?? EMPTY_OBJECTS);
  }

  function storyPhotoMotion(objects: CanvasObject[]): "zoom-in" | "zoom-out" {
  const photos = objects.filter((o) => isStoryClip(o) && o.type === "image").length;
  return photos % 2 === 0 ? "zoom-in" : "zoom-out";
}

function withTransition(
  extras: ObjectExtras,
  transition: TransitionSpec | null,
): ObjectExtras {
  const next = { ...extras };
  if (transition) next.transitionIn = transition;
  else delete next.transitionIn;
  return next;
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
