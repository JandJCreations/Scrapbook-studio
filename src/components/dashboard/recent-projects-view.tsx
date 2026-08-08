"use client";

import * as React from "react";
import { AnimatePresence } from "framer-motion";
import { Clock, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ProjectCard } from "@/components/dashboard/project-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectStore } from "@/store/use-project-store";

const RECENT_LIMIT = 12;

export function RecentProjectsView() {
  const projects = useProjectStore((s) => s.projects);
  const loaded = useProjectStore((s) => s.loaded);
  const error = useProjectStore((s) => s.error);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);

  React.useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

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

  const recent = projects
    .filter((p) => !p.deletedAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, RECENT_LIMIT);

  if (recent.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="No recent activity"
        description="Projects you create or edit will show up here."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <AnimatePresence mode="popLayout">
        {recent.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </AnimatePresence>
    </div>
  );
}
