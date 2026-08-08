import { RecentProjectsView } from "@/components/dashboard/recent-projects-view";

export default function RecentPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Recent</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your most recently edited scrapbooks.
        </p>
      </div>

      <RecentProjectsView />
    </div>
  );
}
