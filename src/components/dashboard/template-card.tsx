"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScrapbookTemplate } from "@/types/template";

interface TemplateCardProps {
  template: ScrapbookTemplate;
  onUse: (template: ScrapbookTemplate) => void;
}

export function TemplateCard({ template, onUse }: TemplateCardProps) {
  const isPortrait = template.frame.height > template.frame.width;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      <div
        className={cn(
          "relative flex w-full items-center justify-center bg-gradient-to-br",
          template.swatch,
          isPortrait ? "aspect-[3/4]" : "aspect-[4/3]",
        )}
      >
        <Sparkles className="size-8 text-foreground/20" />
        <Button
          size="sm"
          onClick={() => onUse(template)}
          className="absolute inset-x-4 bottom-4 gap-2 opacity-0 transition-opacity group-hover:opacity-100"
        >
          Use template
        </Button>
      </div>

      <div className="p-3">
        <p className="text-sm font-medium">{template.name}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {template.description}
        </p>
      </div>
    </motion.div>
  );
}
