import { Logo } from "@/components/layout/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <Logo />
            <p className="mt-3 text-sm text-muted-foreground">
              The creative studio for turning memories into living
              scrapbooks.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Scrapbook Studio. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
