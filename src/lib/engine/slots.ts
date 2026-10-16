import type { MediaElementKind, WantedMedia } from "@/lib/engine/wanted";

export const MAX_VIDEO_SLOTS = 6;

/** An existing media element: what it holds, which clip uses it, and where it is. */
export interface SlotState {
  id: string;
  kind: MediaElementKind;
  mediaId: string | null;
  clipId: string | null;
  currentTime: number;
}

export interface Assignment {
  wanted: WantedMedia;
  /** null = create a new element. */
  slotId: string | null;
}

export interface SlotAssignment {
  assignments: Assignment[];
  releasedSlotIds: string[];
  droppedClipIds: string[];
}

/**
 * Maps wanted clips onto reusable media elements. Active clips are placed
 * first, so at the cap they win over preloads. A clip that continues a
 * finished clip inherits that clip's element and needs no seek.
 */
export function assignSlots(
  wanted: WantedMedia[],
  slots: SlotState[],
  maxVideoSlots: number = MAX_VIDEO_SLOTS,
): SlotAssignment {
  const wantedIds = new Set(wanted.map((item) => item.clipId));
  const ordered = [...wanted.filter((item) => item.active), ...wanted.filter((item) => !item.active)];
  const taken = new Set<string>();
  const slotFor = new Map<string, string | null>();
  const dropped: string[] = [];
  const created: Record<MediaElementKind, number> = { video: 0, audio: 0 };

  const ownSlot = (item: WantedMedia) =>
    slots.find((s) => s.clipId === item.clipId && s.kind === item.kind && !taken.has(s.id));
  const isFree = (s: SlotState) =>
    !taken.has(s.id) && (s.clipId === null || !wantedIds.has(s.clipId));
  const canCreate = (kind: MediaElementKind) =>
    kind === "audio" ||
    slots.filter((s) => s.kind === "video").length + created.video < maxVideoSlots;

  // Active clips that already own a slot keep it before anyone else looks.
  for (const item of ordered) {
    if (!item.active) continue;
    const own = ownSlot(item);
    if (own) {
      taken.add(own.id);
      slotFor.set(item.clipId, own.id);
    }
  }

  for (const item of ordered) {
    if (slotFor.has(item.clipId)) continue;

    let slot = ownSlot(item);
    if (!slot) {
      const free = slots.filter((s) => s.kind === item.kind && isFree(s));
      const sameFile = free
        .filter((s) => s.mediaId === item.mediaId)
        .sort(
          (a, b) =>
            Math.abs(a.currentTime - item.targetTime) - Math.abs(b.currentTime - item.targetTime),
        );
      slot = sameFile[0] ?? free.find((s) => s.mediaId === null) ?? free[0];
    }

    if (!slot && canCreate(item.kind)) {
      created[item.kind] += 1;
      slotFor.set(item.clipId, null);
      continue;
    }

    if (!slot && item.active) {
      // At the cap: an active clip takes the slot of the lowest-priority preload.
      for (let i = ordered.length - 1; i >= 0 && !slot; i--) {
        const candidate = ordered[i];
        if (candidate.active || candidate.kind !== item.kind) continue;
        slot = ownSlot(candidate);
      }
    }

    if (slot) {
      taken.add(slot.id);
      slotFor.set(item.clipId, slot.id);
    } else {
      dropped.push(item.clipId);
    }
  }

  return {
    assignments: ordered
      .filter((item) => slotFor.has(item.clipId))
      .map((item) => ({ wanted: item, slotId: slotFor.get(item.clipId) ?? null })),
    releasedSlotIds: slots.filter((s) => !taken.has(s.id)).map((s) => s.id),
    droppedClipIds: dropped,
  };
}
