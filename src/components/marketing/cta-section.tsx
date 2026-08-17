import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-fuchsia-300/10 px-8 py-16 text-center shadow-sm sm:py-20">
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Start your first scrapbook today
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
          Free to start. No credit card required. Your memories, beautifully
          arranged in minutes.
        </p>
        <div className="mt-8 flex justify-center">
          <Button size="lg" className="group" asChild>
            <Link href="/signup">
              Create your scrapbook
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
