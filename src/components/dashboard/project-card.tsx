"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Copy, FolderInput, Heart, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/use-project-store";
import type { Project } from "@/types/project";

function formatRelativeDate(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  const months = Math.floor(diffDays / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}

const THUMBNAIL_GRADIENTS = [
  "from-violet-400/40 to-fuchsia-400/30",
  "from-orange-300/40 to-rose-300/30",
  "from-sky-300/40 to-violet-300/30",
  "from-emerald-300/40 to-teal-300/30",
];

function gradientFor(id: string) {
  const index =
    Math.abs(
      id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0),
    ) % THUMBNAIL_GRADIENTS.length;
  return THUMBNAIL_GRADIENTS[index];
}

export function ProjectCard({ project }: { project: Project }) {
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState(project.name);
  const renameProject = useProjectStore((s) => s.renameProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const restoreProject = useProjectStore((s) => s.restoreProject);
  const duplicateProject = useProjectStore((s) => s.duplicateProject);
  const toggleFavorite = useProjectStore((s) => s.toggleFavorite);
  const moveProject = useProjectStore((s) => s.moveProject);
  const folders = useProjectStore((s) => s.folders);

  function commitRename() {
    const trimmed = nameDraft.trim();
    renameProject(project.id, trimmed.length > 0 ? trimmed : project.name);
    setIsRenaming(false);
  }

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25 }}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      <Link
        href={`/editor/${project.id}`}
        className="block"
        aria-label={`Open ${project.name}`}
      >
        <div
          className={cn(
            "relative aspect-[4/3] w-full bg-gradient-to-br",
            gradientFor(project.id),
          )}
        >
          <div className="absolute inset-0 flex items-center justify-center text-4xl font-semibold text-foreground/10">
            {project.name.slice(0, 1).toUpperCase()}
          </div>
        </div>
      </Link>

      <button
        type="button"
        onClick={() => toggleFavorite(project.id)}
        aria-label={
          project.favorite ? "Remove from favorites" : "Add to favorites"
        }
        aria-pressed={project.favorite}
        className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-background/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 data-[active=true]:opacity-100"
        data-active={project.favorite}
      >
        <Heart
          className={cn(
            "size-4",
            project.favorite
              ? "fill-destructive text-destructive"
              : "text-foreground",
          )}
        />
      </button>

      <div className="flex items-start justify-between gap-2 p-3">
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
                  setNameDraft(project.name);
                  setIsRenaming(false);
                }
              }}
              className="h-7 px-1.5 text-sm"
            />
          ) : (
            <p className="truncate text-sm font-medium">{project.name}</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            Edited {formatRelativeDate(project.updatedAt)}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label="Project options"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setNameDraft(project.name);
                setIsRenaming(true);
              }}
            >
              <Pencil className="size-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => duplicateProject(project.id)}>
              <Copy className="size-4" />
              Duplicate
            </DropdownMenuItem>
            {folders.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInput className="size-4" />
                  Move to folder
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    disabled={project.folderId === null}
                    onSelect={() => moveProject(project.id, null)}
                  >
                    No folder
                  </DropdownMenuItem>
                  {folders.map((folder) => (
                    <DropdownMenuItem
                      key={folder.id}
                      disabled={project.folderId === folder.id}
                      onSelect={() => moveProject(project.id, folder.id)}
                    >
                      {folder.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                deleteProject(project.id);
                toast(`"${project.name}" moved to trash`, {
                  action: {
                    label: "Undo",
                    onClick: () => restoreProject(project.id),
                  },
                });
              }}
            >
              <Trash2 className="size-4" />
              Move to trash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}
