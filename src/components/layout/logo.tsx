import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground shadow-sm">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="size-4"
          aria-hidden="true"
        >
          <path
            d="M4 6a2 2 0 0 1 2-2h9l5 5v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"
            fill="currentColor"
            fillOpacity="0.9"
          />
          <path
            d="M15 4v4a1 1 0 0 0 1 1h4"
            stroke="var(--card)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span className="font-semibold tracking-tight">Scrapbook Studio</span>
    </div>
  );
}
