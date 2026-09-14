"use client";

import * as React from "react";
import { FolderInput, Trash2, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMediaStore } from "@/store/use-media-store";
import { useMediaUiStore } from "@/store/use-media-ui-store";

export function MediaBulkActionBar({ visibleItemIds }: { visibleItemIds: string[] }) {
  const selectedIds = useMediaUiStore((s) => s.selectedIds);
  const selectAll = useMediaUiStore((s) => s.selectAll);
  const clearSelection = useMediaUiStore((s) => s.clearSelection);
  const setSelectionMode = useMediaUiStore((s) => s.setSelectionMode);
  const folders = useMediaStore((s) => s.folders);
  const moveItems = useMediaStore((s) => s.moveItems);
  const deleteItems = useMediaStore((s) => s.deleteItems);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const ids = React.useMemo(() => Array.from(selectedIds), [selectedIds]);
  const count = ids.length;
  const allSelected =
    visibleItemIds.length > 0 && visibleItemIds.every((id) => selectedIds.has(id));

  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-lg">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setSelectionMode(false)}
          aria-label="Cancel selection"
        >
          <X className="size-4" />
        </Button>
        <span className="text-sm font-medium">{count} selected</span>
        <Button
          variant="link"
          size="sm"
          className="px-0"
          onClick={() => (allSelected ? clearSelection() : selectAll(visibleItemIds))}
        >
          {allSelected ? "Clear" : "Select all"}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2" disabled={count === 0}>
              <FolderInput className="size-4" />
              Move to folder
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                moveItems(ids, null);
                toast.success(`Moved ${count} item${count === 1 ? "" : "s"} to All media`);
                setSelectionMode(false);
              }}
            >
              All media
            </DropdownMenuItem>
            {folders.length > 0 && <DropdownMenuSeparator />}
            {folders.map((folder) => (
              <DropdownMenuItem
                key={folder.id}
                onSelect={() => {
                  moveItems(ids, folder.id);
                  toast.success(`Moved ${count} item${count === 1 ? "" : "s"} to "${folder.name}"`);
                  setSelectionMode(false);
                }}
              >
                {folder.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-destructive hover:text-destructive"
          disabled={count === 0}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count} item{count === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              These files will be permanently removed from your media library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteItems(ids);
                toast.success(`${count} item${count === 1 ? "" : "s"} deleted`);
                setSelectionMode(false);
                setConfirmDelete(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
