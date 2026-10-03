import type { MediaType } from "@/types/media";

export function detectMediaType(file: File): MediaType | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
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
export const MAX_FILES_PER_UPLOAD = 150;
