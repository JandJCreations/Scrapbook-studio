import type { MediaType } from "@/types/media";

export function detectMediaType(file: File): MediaType | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

export const ACCEPTED_MEDIA_INPUT =
  "image/*,video/*,audio/*,.mp3,.wav,.aac,.m4a";
