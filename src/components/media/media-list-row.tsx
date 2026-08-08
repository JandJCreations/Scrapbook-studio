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
import { formatBytes, formatDuration } from "@/lib/media/format";
import { useMediaStore } from "@/store/use-media-store";
import type { MediaItem } from "@/types/media";

export function MediaListRow({ item }: { item: MediaItem }) {
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-accent/40"
    >
      <MediaThumbnail item={item} className="size-11 shrink-0 rounded-md" />

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
            className="h-7 max-w-xs px-1.5 text-sm"
          />
        ) : (
          <p className="truncate text-sm font-medium">{item.name}</p>
        )}
      </div>

      <span className="hidden w-16 shrink-0 text-xs text-muted-foreground capitalize sm:block">
        {item.type}
      </span>

      <span className="hidden w-16 shrink-0 text-xs text-muted-foreground sm:block">
        {item.duration ? formatDuration(item.duration) : "—"}
      </span>

      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
        {formatBytes(item.size)}
      </span>

      <MediaItemMenu
        item={item}
        onRename={() => {
          setNameDraft(item.name);
          setIsRenaming(true);
        }}
        onDelete={() => setConfirmDelete(true)}
      />

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
