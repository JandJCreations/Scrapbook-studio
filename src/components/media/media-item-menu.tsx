"use client";

import { Check, FolderInput, MoreVertical, Pencil, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useMediaStore } from "@/store/use-media-store";
import type { MediaItem } from "@/types/media";

interface MediaItemMenuProps {
  item: MediaItem;
  onRename: () => void;
  onDelete: () => void;
  triggerClassName?: string;
}

export function MediaItemMenu({
  item,
  onRename,
  onDelete,
  triggerClassName,
}: MediaItemMenuProps) {
  const folders = useMediaStore((s) => s.folders);
  const moveItem = useMediaStore((s) => s.moveItem);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={triggerClassName ?? "size-7 shrink-0"}
          aria-label="Media options"
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onRename}>
          <Pencil className="size-4" />
          Rename
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderInput className="size-4" />
            Move to folder
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => moveItem(item.id, null)}>
              {item.folderId === null && <Check className="size-4" />}
              All media
            </DropdownMenuItem>
            {folders.length > 0 && <DropdownMenuSeparator />}
            {folders.map((folder) => (
              <DropdownMenuItem
                key={folder.id}
                onSelect={() => moveItem(item.id, folder.id)}
              >
                {item.folderId === folder.id && <Check className="size-4" />}
                {folder.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
