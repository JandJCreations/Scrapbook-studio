/** The drag type the media panels use, so the timeline can tell their drags from any other. */
export const MEDIA_DRAG_TYPE = "application/x-studio-media";

/** What is being dragged: one of the user's files, or a track of the built-in music library. */
export type MediaDragPayload = { source: "library" | "music"; id: string };

/** The part of a DataTransfer these helpers use. */
interface Transfer {
  readonly types: readonly string[];
  effectAllowed: string;
  setData(type: string, value: string): void;
  getData(type: string): string;
}

/** What is being dragged, in the drag's types so a lane can see it while the pointer is still over it: pictures and videos, or sound. */
export type MediaDragKind = "visual" | "audio";
const KIND_PREFIX = "application/x-studio-media-kind-";

export function writeMediaDrag(transfer: Transfer, payload: MediaDragPayload, kind: MediaDragKind): void {
  transfer.setData(MEDIA_DRAG_TYPE, JSON.stringify(payload));
  transfer.setData(KIND_PREFIX + kind, kind);
  transfer.effectAllowed = "copy";
}

/** The kind of a media drag of ours, or null for any other drag. */
export function mediaDragKind(transfer: Pick<Transfer, "types">): MediaDragKind | null {
  const types = Array.from(transfer.types);
  if (types.includes(KIND_PREFIX + "visual")) return "visual";
  if (types.includes(KIND_PREFIX + "audio")) return "audio";
  return null;
}

/** True while the drag is one of ours (usable during dragover, when the data itself cannot be read). */
export function hasMediaDrag(transfer: Pick<Transfer, "types">): boolean {
  return Array.from(transfer.types).includes(MEDIA_DRAG_TYPE);
}

/** The dragged item, or null for any other drag or a payload that is not ours. */
export function readMediaDrag(transfer: Pick<Transfer, "getData">): MediaDragPayload | null {
  const raw = transfer.getData(MEDIA_DRAG_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MediaDragPayload>;
    if ((parsed.source === "library" || parsed.source === "music") && typeof parsed.id === "string" && parsed.id !== "") {
      return { source: parsed.source, id: parsed.id };
    }
  } catch {
    // Not ours.
  }
  return null;
}
