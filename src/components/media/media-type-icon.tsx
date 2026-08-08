import { FileImage, Music, Video } from "lucide-react";

import type { MediaType } from "@/types/media";

export function MediaTypeIcon({
  type,
  className,
}: {
  type: MediaType;
  className?: string;
}) {
  if (type === "video") return <Video className={className} />;
  if (type === "audio") return <Music className={className} />;
  return <FileImage className={className} />;
}
