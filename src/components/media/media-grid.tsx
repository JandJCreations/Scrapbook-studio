"use client";

import { AnimatePresence } from "framer-motion";

import { MediaCard } from "@/components/media/media-card";
import type { MediaItem } from "@/types/media";

export function MediaGrid({ items }: { items: MediaItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <MediaCard key={item.id} item={item} />
        ))}
      </AnimatePresence>
    </div>
  );
}
