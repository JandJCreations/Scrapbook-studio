"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { MediaItemMenu } from "@/components/media/media-item-menu";
import { MediaThumbnail } from "@/components/media/media-thumbnail";
import { formatBytes } from "@/lib/media/format";
import { useMediaStore } from "@/store/use-media-store";
import type { MediaItem } from "@/types/media";

export function MediaCard({ item }: { item: MediaItem }) {
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState(item.name);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const renameItem = useMediaStore((s) => s.renameItem);
  const deleteItem = useMediaStore((s) => s.deleteItem);

  function commitRename() {
    const trimmed = nameDraft.trim();
    renameItem(item.id, trimmed.length > 0 ? trimmed : item.name);
    setIsRenaming(false);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      <MediaThumbnail item={item} className="aspect-square w-full" />

      <div className="flex items-start justify-between gap-2 p-2.5">
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <Input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setNameDraft(item.name);
                  setIsRenaming(false);
                }
              }}
              className="h-7 px-1.5 text-xs"
            />
          ) : (
            <p className="truncate text-xs font-medium">{item.name}</p>
          )}
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {formatBytes(item.size)}
          </p>
        </div>

        <MediaItemMenu
          item={item}
          onRename={() => {
            setNameDraft(item.name);
            setIsRenaming(true);
          }}
          onDelete={() => setConfirmDelete(true)}
        />
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{item.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This file will be permanently removed from your media library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteItem(item.id);
                toast.success(`"${item.name}" deleted`);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
