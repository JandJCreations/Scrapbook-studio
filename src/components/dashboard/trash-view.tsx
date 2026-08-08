"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, Trash2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectStore } from "@/store/use-project-store";
import { TRASH_RETENTION_DAYS } from "@/types/project";

function daysLeft(deletedAt: string): number {
  const elapsedMs = Date.now() - new Date(deletedAt).getTime();
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  return Math.max(0, TRASH_RETENTION_DAYS - elapsedDays);
}

export function TrashView() {
  const projects = useProjectStore((s) => s.projects);
  const loaded = useProjectStore((s) => s.loaded);
  const error = useProjectStore((s) => s.error);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const restoreProject = useProjectStore((s) => s.restoreProject);
  const permanentlyDeleteProject = useProjectStore(
    (s) => s.permanentlyDeleteProject,
  );
  const emptyTrash = useProjectStore((s) => s.emptyTrash);

  React.useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (!loaded) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Couldn't load trash"
        description={error}
        action={
          <Button variant="outline" onClick={() => fetchProjects()}>
            Try again
          </Button>
        }
      />
    );
  }

  const trashed = projects
    .filter((p) => p.deletedAt)
    .sort(
      (a, b) =>
        new Date(b.deletedAt as string).getTime() -
        new Date(a.deletedAt as string).getTime(),
    );

  if (trashed.length === 0) {
    return (
      <EmptyState
        icon={Trash2}
        title="Trash is empty"
        description="Deleted projects appear here for 30 days before they're permanently removed."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {trashed.length} project{trashed.length === 1 ? "" : "s"} in trash
          · permanently deleted after {TRASH_RETENTION_DAYS} days
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Trash2 className="size-4" />
              Empty trash
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Empty trash?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes all {trashed.length} project
                {trashed.length === 1 ? "" : "s"} in trash. This action
                can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  emptyTrash();
                  toast.success("Trash emptied");
                }}
              >
                Empty trash
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {trashed.map((project) => (
            <motion.div
              key={project.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25 }}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{project.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {daysLeft(project.deletedAt as string)} day
                  {daysLeft(project.deletedAt as string) === 1 ? "" : "s"}{" "}
                  left
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Restore ${project.name}`}
                  onClick={() => {
                    restoreProject(project.id);
                    toast.success(`"${project.name}" restored`);
                  }}
                >
                  <RotateCcw className="size-4" />
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      aria-label={`Delete ${project.name} forever`}
                    >
                      <X className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete &quot;{project.name}&quot; forever?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes the project and everything
                        in it. This action can&apos;t be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          permanentlyDeleteProject(project.id);
                          toast.success(`"${project.name}" deleted forever`);
                        }}
                      >
                        Delete forever
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
