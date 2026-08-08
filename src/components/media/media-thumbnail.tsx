import { AlertCircle } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { formatDuration } from "@/lib/media/format";
import { MediaTypeIcon } from "@/components/media/media-type-icon";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types/media";

const AUDIO_GRADIENT = "from-emerald-400/30 to-teal-400/20";

export function MediaThumbnail({
  item,
  className,
}: {
  item: MediaItem;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-muted",
        className,
      )}
    >
      {item.status === "ready" && item.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnailUrl}
          alt={item.name}
          className="size-full object-cover"
        />
      ) : item.status === "ready" && item.type === "audio" ? (
        <div
          className={cn(
            "flex size-full items-center justify-center bg-gradient-to-br",
            AUDIO_GRADIENT,
          )}
        >
          <MediaTypeIcon type="audio" className="size-8 text-foreground/40" />
        </div>
      ) : item.status === "error" ? (
        <div className="flex flex-col items-center gap-1.5 p-3 text-center">
          <AlertCircle className="size-6 text-destructive" />
          <span className="text-xs text-muted-foreground">
            {item.error ?? "Failed"}
          </span>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-2 p-4">
          <MediaTypeIcon
            type={item.type}
            className="size-6 text-muted-foreground"
          />
          <Progress value={item.progress} className="h-1.5 w-full max-w-24" />
        </div>
      )}

      {item.status === "ready" && item.type === "video" && (
        <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {formatDuration(item.duration ?? 0)}
        </span>
      )}
      {item.status === "ready" && item.type === "audio" && item.duration && (
        <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {formatDuration(item.duration)}
        </span>
      )}
    </div>
  );
}
