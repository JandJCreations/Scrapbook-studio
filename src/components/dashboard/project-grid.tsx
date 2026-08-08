"use client";

import * as React from "react";
import { AnimatePresence } from "framer-motion";
import { Plus, Search, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { NewProjectDialog } from "@/components/dashboard/new-project-dialog";
import { ProjectCard } from "@/components/dashboard/project-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardUiStore } from "@/store/use-dashboard-ui-store";
import { useProjectStore } from "@/store/use-project-store";

export function ProjectGrid() {
  const projects = useProjectStore((s) => s.projects);
  const loaded = useProjectStore((s) => s.loaded);
  const error = useProjectStore((s) => s.error);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const search = useDashboardUiStore((s) => s.search);
  const activeFolderId = useDashboardUiStore((s) => s.activeFolderId);

  React.useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const active = projects.filter((p) => !p.deletedAt);
  const scoped = active.filter((p) => p.folderId === activeFolderId);
  const filtered = scoped.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  if (!loaded) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Couldn't load your projects"
        description={error}
        action={
          <Button variant="outline" onClick={() => fetchProjects()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (active.length === 0) {
    return (
      <EmptyState
        title="Create your first scrapbook"
        description="Bring together photos, video, and audio on an infinite canvas. It only takes a minute to get started."
        action={
          <NewProjectDialog>
            <Button className="gap-2">
              <Plus className="size-4" />
              New project
            </Button>
          </NewProjectDialog>
        }
      />
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title={search ? "No projects found" : "This folder is empty"}
        description={
          search
            ? `Nothing matches "${search}". Try a different search.`
            : "Move a project in, or create a new one."
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <AnimatePresence mode="popLayout">
        {filtered.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </AnimatePresence>
    </div>
  );
}
