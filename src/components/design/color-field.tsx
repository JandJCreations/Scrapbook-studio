"use client";

import { Plus, X } from "lucide-react";

import { useBrandColors } from "@/hooks/use-brand-colors";

/**
 * A colour picker with your brand colours underneath: tap a swatch to use
 * it, "+" to save the current colour to the palette.
 */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  const brand = useBrandColors();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {brand.colors.map((c) => (
          <span key={c} className="group relative">
            <button
              type="button"
              onClick={() => onChange(c)}
              className="size-5 rounded-full border border-border shadow-sm"
              style={{ background: c }}
              aria-label={`Use brand colour ${c}`}
              title={c}
            />
            <button
              type="button"
              onClick={() => brand.remove(c)}
              className="absolute -top-1 -right-1 hidden size-3 items-center justify-center rounded-full bg-foreground text-background group-hover:flex"
              aria-label={`Remove ${c} from brand colours`}
            >
              <X className="size-2" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => brand.add(value)}
          className="flex size-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground hover:text-foreground"
          aria-label="Save this colour to brand colours"
          title="Save to brand colours"
        >
          <Plus className="size-3" />
        </button>
        {brand.colors.length === 0 && (
          <span className="text-[10px] text-muted-foreground">Save brand colours</span>
        )}
      </div>
    </div>
  );
}
