import { ProjectFolderSidebar } from "@/components/dashboard/project-folder-sidebar";
import { ProjectGrid } from "@/components/dashboard/project-grid";

export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All your scrapbooks in one place.
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-6 sm:flex-row">
        <ProjectFolderSidebar />
        <div className="min-w-0 flex-1">
          <ProjectGrid />
        </div>
      </div>
    </div>
  );
}
