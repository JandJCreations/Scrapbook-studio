"use client";

import { AnimatePresence } from "framer-motion";

import { MediaListRow } from "@/components/media/media-list-row";
import type { MediaItem } from "@/types/media";

export function MediaList({ items }: { items: MediaItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
        <span className="w-11 shrink-0" />
        <span className="min-w-0 flex-1">Name</span>
        <span className="hidden w-16 shrink-0 sm:block">Type</span>
        <span className="hidden w-16 shrink-0 sm:block">Duration</span>
        <span className="w-16 shrink-0 text-right">Size</span>
        <span className="w-7 shrink-0" />
      </div>
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <MediaListRow key={item.id} item={item} />
        ))}
      </AnimatePresence>
    </div>
  );
}
