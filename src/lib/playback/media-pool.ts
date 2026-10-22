import type { MediaSyncPlan, SlotCommand } from "@/lib/engine/media-sync";
import type { SlotState } from "@/lib/engine/slots";
import type { MediaElementKind } from "@/lib/engine/wanted";

/** The part of a media element the pool uses; a real HTMLMediaElement fits. */
export interface PoolElement {
  currentTime: number;
  playbackRate: number;
  readonly paused: boolean;
  /** True once playback reached the end; calling play() then would restart from 0. */
  readonly ended: boolean;
  src: string;
  play(): Promise<void> | void;
  pause(): void;
  /** Optional: when present the pool listens for load errors and decoded frames. */
  addEventListener?(type: "error" | "seeked" | "loadeddata", listener: () => void): void;
}

export interface GainControl {
  set(gain: number): void;
}

export type PoolProblem = {
  clipId: string;
  kind: "missing-media" | "play-blocked" | "load-error";
};

export interface MediaPoolDeps {
  createElement(kind: MediaElementKind): PoolElement;
  /** The playable URL for a media file, or null if it cannot be found. */
  urlFor(mediaId: string): string | null;
  /** Routes the element's sound through the audio graph; returns its volume control. */
  attachGain(element: PoolElement): GainControl;
  onProblem?(problem: PoolProblem): void;
  /** A frame became available (an element finished seeking or loading); the owner should redraw. */
  onElementReady?(): void;
}

export interface MediaPool {
  /** The real state of every element, for the next sync plan. */
  slots(): SlotState[];
  apply(plan: MediaSyncPlan): void;
  /** The element serving a clip, or undefined if it has none or no loaded file. */
  elementForClip(clipId: string): PoolElement | undefined;
  dispose(): void;
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

interface Slot {
  id: string;
  kind: MediaElementKind;
  element: PoolElement;
  gain: GainControl;
  mediaId: string | null;
  clipId: string | null;
}

export function createMediaPool(deps: MediaPoolDeps): MediaPool {
  const slots = new Map<string, Slot>();
  const missing = new Set<string>(); // clips already reported as missing media
  const blocked = new Set<string>(); // clips already reported as blocked
  const failed = new Set<string>(); // clips already reported as load errors
  let disposed = false;
  let counter = 0;

  function report(problem: PoolProblem, seen: Set<string>) {
    if (seen.has(problem.clipId)) return;
    seen.add(problem.clipId);
    deps.onProblem?.(problem);
  }

  function silence(slot: Slot) {
    slot.element.pause();
    slot.gain.set(0);
  }

  function create(kind: MediaElementKind): Slot {
    counter += 1;
    const element = deps.createElement(kind);
    const slot: Slot = {
      id: `slot-${counter}`,
      kind,
      element,
      gain: deps.attachGain(element),
      mediaId: null,
      clipId: null,
    };
    slots.set(slot.id, slot);

    element.addEventListener?.("error", () => {
      // Ignore errors caused by emptying the element on dispose, and errors from a
      // slot that serves no clip or holds no loaded file.
      if (disposed || slot.clipId === null || slot.mediaId === null) return;
      report({ clipId: slot.clipId, kind: "load-error" }, failed);
    });
    element.addEventListener?.("loadeddata", () => {
      if (disposed) return;
      if (slot.clipId !== null) failed.delete(slot.clipId);
      deps.onElementReady?.();
    });
    element.addEventListener?.("seeked", () => {
      if (!disposed) deps.onElementReady?.();
    });
    return slot;
  }

  function applyCommand(command: SlotCommand) {
    const known = command.slotId === null ? undefined : slots.get(command.slotId);
    const slot = known ?? create(command.kind);
    slot.clipId = command.clipId;

    if (command.load) {
      const url = deps.urlFor(command.mediaId);
      if (url === null) {
        silence(slot);
        slot.mediaId = null;
        report({ clipId: command.clipId, kind: "missing-media" }, missing);
        return;
      }
      slot.element.src = url;
      slot.mediaId = command.mediaId;
      missing.delete(command.clipId);
      failed.delete(command.clipId);
    }

    if (command.seekTo !== null) slot.element.currentTime = command.seekTo;
    if (slot.element.playbackRate !== command.playbackRate) {
      slot.element.playbackRate = command.playbackRate;
    }
    slot.gain.set(command.gain);

    if (command.play) {
      // An element that has played to its end stays put: play() would restart it from 0.
      if (slot.element.paused && !slot.element.ended) {
        Promise.resolve(slot.element.play()).then(
          () => {
            blocked.delete(command.clipId);
          },
          (error: unknown) => {
            // A play() interrupted by pause() or a new load is not a problem,
            // and neither is a rejection for a clip this slot no longer serves.
            if (isAbort(error) || slot.clipId !== command.clipId) return;
            report({ clipId: command.clipId, kind: "play-blocked" }, blocked);
          },
        );
      }
    } else if (!slot.element.paused) {
      slot.element.pause();
    }
  }

  return {
    slots() {
      return Array.from(slots.values(), (slot) => ({
        id: slot.id,
        kind: slot.kind,
        mediaId: slot.mediaId,
        clipId: slot.clipId,
        currentTime: slot.element.currentTime,
      }));
    },

    apply(plan) {
      // Released elements are silenced before anything else, so a clip that
      // ended can never keep making sound.
      for (const id of plan.releasedSlotIds) {
        const slot = slots.get(id);
        if (!slot) continue;
        silence(slot);
        if (slot.clipId !== null) {
          missing.delete(slot.clipId);
          blocked.delete(slot.clipId);
          failed.delete(slot.clipId);
        }
        slot.clipId = null;
      }
      for (const command of plan.commands) applyCommand(command);
    },

    elementForClip(clipId) {
      for (const slot of slots.values()) {
        if (slot.clipId === clipId && slot.mediaId !== null) return slot.element;
      }
      return undefined;
    },

    dispose() {
      disposed = true;
      for (const slot of slots.values()) {
        silence(slot);
        slot.element.src = "";
      }
      slots.clear();
      missing.clear();
      blocked.clear();
      failed.clear();
    },
  };
}
