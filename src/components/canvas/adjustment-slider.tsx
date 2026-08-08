"use client";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface AdjustmentSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

export function AdjustmentSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: AdjustmentSliderProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-normal text-muted-foreground">
          {label}
        </Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}
