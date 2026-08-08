"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, Plus, Search } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NewProjectDialog } from "@/components/dashboard/new-project-dialog";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useDashboardUiStore } from "@/store/use-dashboard-ui-store";

interface DashboardTopbarProps {
  email: string;
  displayName: string | null;
}

export function DashboardTopbar({ email, displayName }: DashboardTopbarProps) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const search = useDashboardUiStore((s) => s.search);
  const setSearch = useDashboardUiStore((s) => s.setSearch);

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-4 sm:px-6">
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="size-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="h-16 justify-center border-b border-border px-5">
            <SheetTitle asChild>
              <Link href="/" onClick={() => setMobileNavOpen(false)}>
                <Logo />
              </Link>
            </SheetTitle>
          </SheetHeader>
          <div className="p-4">
            <NewProjectDialog>
              <Button className="mb-4 w-full justify-start gap-2" size="sm">
                <Plus className="size-4" />
                New project
              </Button>
            </NewProjectDialog>
            <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects..."
          className="pl-9"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <NewProjectDialog>
          <Button size="sm" className="hidden gap-2 sm:inline-flex">
            <Plus className="size-4" />
            New project
          </Button>
        </NewProjectDialog>
        <ThemeToggle />
        <UserMenu email={email} displayName={displayName} />
      </div>
    </header>
  );
}
