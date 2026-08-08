"use client";

import * as React from "react";
import { FolderPlus, Images, MoreVertical, Pencil, Trash2 } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NewFolderDialog } from "@/components/media/new-folder-dialog";
import { cn } from "@/lib/utils";
import { useMediaStore } from "@/store/use-media-store";
import { useMediaUiStore } from "@/store/use-media-ui-store";

export function FolderSidebar() {
  const folders = useMediaStore((s) => s.folders);
  const items = useMediaStore((s) => s.items);
  const renameFolder = useMediaStore((s) => s.renameFolder);
  const deleteFolder = useMediaStore((s) => s.deleteFolder);
  const activeFolderId = useMediaUiStore((s) => s.activeFolderId);
  const setActiveFolderId = useMediaUiStore((s) => s.setActiveFolderId);

  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [nameDraft, setNameDraft] = React.useState("");
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(
    null,
  );

  function commitRename(folderId: string) {
    const trimmed = nameDraft.trim();
    if (trimmed) renameFolder(folderId, trimmed);
    setRenamingId(null);
  }

  return (
    <div className="w-full shrink-0 sm:w-56">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Folders
        </h2>
        <NewFolderDialog>
          <Button size="icon" variant="ghost" className="size-7">
            <FolderPlus className="size-4" />
            <span className="sr-only">New folder</span>
          </Button>
        </NewFolderDialog>
      </div>

      <nav className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible">
        <button
          type="button"
          onClick={() => setActiveFolderId(null)}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            activeFolderId === null
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          <Images className="size-4" />
          All media
          <span className="ml-auto text-xs text-muted-foreground">
            {items.length}
          </span>
        </button>

        {folders.map((folder) => {
          const count = items.filter((i) => i.folderId === folder.id).length;
          const isActive = activeFolderId === folder.id;
          const isRenaming = renamingId === folder.id;

          return (
            <div
              key={folder.id}
              className={cn(
                "group flex shrink-0 items-center gap-1 rounded-lg pr-1 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {isRenaming ? (
                <Input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => commitRename(folder.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(folder.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="mx-1 h-7 px-1.5 text-sm"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveFolderId(folder.id)}
                  className="min-w-0 flex-1 truncate px-3 py-2 text-left"
                >
                  {folder.name}
                </button>
              )}

              {!isRenaming && (
                <>
                  <span className="text-xs text-muted-foreground">
                    {count}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6 opacity-0 group-hover:opacity-100"
                        aria-label="Folder options"
                      >
                        <MoreVertical className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          setNameDraft(folder.name);
                          setRenamingId(folder.id);
                        }}
                      >
                        <Pencil className="size-4" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setPendingDeleteId(folder.id)}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          );
        })}
      </nav>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              Media inside this folder will move back to All media. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDeleteId) return;
                deleteFolder(pendingDeleteId);
                if (activeFolderId === pendingDeleteId) setActiveFolderId(null);
                toast.success("Folder deleted");
                setPendingDeleteId(null);
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
