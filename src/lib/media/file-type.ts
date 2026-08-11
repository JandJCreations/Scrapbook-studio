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

// Even with upload concurrency capped, adding a huge batch in one go still
// means creating that many optimistic items in a single state update (a
// large, janky re-render) and a long queue behind it. Cap it and let people
// upload the rest as a follow-up batch instead.
export const MAX_FILES_PER_UPLOAD = 20;
