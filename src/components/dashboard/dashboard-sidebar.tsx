import Link from "next/link";
import { Plus } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { NewProjectDialog } from "@/components/dashboard/new-project-dialog";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { Button } from "@/components/ui/button";

export function DashboardSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <Link href="/" aria-label="Scrapbook Studio home">
          <Logo />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <NewProjectDialog>
          <Button className="mb-4 w-full justify-start gap-2" size="sm">
            <Plus className="size-4" />
            New project
          </Button>
        </NewProjectDialog>

        <SidebarNav />
      </div>
    </aside>
  );
}
