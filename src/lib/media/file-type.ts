import type { MediaType } from "@/types/media";

// Some files come with no type at all (an iPhone's Files app often sends a
// .heic or .mov that way), so the name's ending decides when the type is blank.
const EXTENSION_TYPES: Record<string, MediaType> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  heic: "image",
  heif: "image",
  avif: "image",
  mov: "video",
  mp4: "video",
  m4v: "video",
  webm: "video",
  "3gp": "video",
  mp3: "audio",
  m4a: "audio",
  aac: "audio",
  wav: "audio",
  ogg: "audio",
  caf: "audio",
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function detectMediaType(file: File): MediaType | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "" || file.type === "application/octet-stream") return EXTENSION_TYPES[extensionOf(file.name)] ?? null;
  return null;
}

/** An iPhone's own photo format, which most browsers other than Safari can't show. */
export function isHeic(file: File): boolean {
  return /^image\/hei[cf](-sequence)?$/i.test(file.type) || /^hei[cf]$/.test(extensionOf(file.name));
}

/**
 * The MIME type to save a file with: its own, or one worked out from its name
 * when the browser gave none.
 */
export function mimeTypeFor(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = extensionOf(file.name);
  const known: Record<string, string> = {
    heic: "image/heic",
    heif: "image/heif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    mov: "video/quicktime",
    mp4: "video/mp4",
    m4v: "video/x-m4v",
    webm: "video/webm",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
  };
  return known[ext] ?? "application/octet-stream";
}

/**
 * iPhone's photo picker often names every file the same ("image.jpg", or
 * "trim.1F2E….MOV" for a trimmed clip), which makes a library of them
 * impossible to tell apart. Those get a number in the batch and the time they
 * were added, e.g. "Photo 3, Nov 26, 3:04 PM.jpg".
 */
export function friendlyMediaName(file: File, type: MediaType | null, position = 1): string {
  const generic = /^(image|photo|video|trim\.[0-9a-f-]+|fullsizerender)(\s*\(\d+\))?\.[a-z0-9]+$/i;
  if (!generic.test(file.name) || type === "audio" || type === null) return file.name;
  const when = new Date(file.lastModified || Date.now());
  const stamp = when.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${type === "video" ? "Video" : "Photo"} ${position}, ${stamp}${file.name.slice(file.name.lastIndexOf("."))}`;
}

// iOS Safari's native picker can misbehave (falling back to a generic
// "Browse" UI instead of Photos, or failing to return files at all) when an
// `accept` attribute mixes MIME wildcards with explicit file extensions —
// keep this to wildcards only. Files with an unrecognized MIME type are
// still caught gracefully by detectMediaType() and surfaced as an error.
export const ACCEPTED_MEDIA_INPUT = "image/*,video/*,audio/*";

// Actual upload/thumbnail work is already throttled to UPLOAD_CONCURRENCY
// (3) in use-media-store.ts regardless of batch size, so this isn't load
// protection — it's just a sanity ceiling so selecting an entire camera
// roll by accident doesn't queue thousands of files. A full event album
// (weddings, parties, trips) easily runs past the old cap of 20, forcing
// people to re-select in batches — raised well past typical album sizes.
// A bigger pick isn't refused: the first 200 are taken and the user is told
// how many were left (see plan-upload.ts).
export const MAX_FILES_PER_UPLOAD = 200;
