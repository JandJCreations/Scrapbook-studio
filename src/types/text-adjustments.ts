import type { GlowEffect, ShadowEffect } from "@/types/photo-adjustments";

export type TextAlign = "left" | "center" | "right";

export interface GradientFill {
  enabled: boolean;
  from: string;
  to: string;
}

export interface StrokeEffect {
  enabled: boolean;
  color: string;
  width: number;
}

export interface TextAdjustments {
  content: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  color: string;
  align: TextAlign;

  gradient: GradientFill;
  stroke: StrokeEffect;
  glow: GlowEffect;
  shadow: ShadowEffect;

  curve: number;
  letterSpacing: number;
  lineHeight: number;
  opacity: number;
}

export const DEFAULT_TEXT_ADJUSTMENTS: TextAdjustments = {
  content: "Double-click to edit",
  fontFamily: "Inter",
  fontWeight: 700,
  fontSize: 42,
  color: "#1f2937",
  align: "center",

  gradient: { enabled: false, from: "#8b5cf6", to: "#ec4899" },
  stroke: { enabled: false, color: "#ffffff", width: 2 },
  glow: { enabled: false, color: "#8b5cf6", blur: 20, opacity: 60 },
  shadow: {
    enabled: false,
    color: "#000000",
    blur: 8,
    offsetX: 0,
    offsetY: 4,
    opacity: 40,
  },

  curve: 0,
  letterSpacing: 0,
  lineHeight: 1.2,
  opacity: 100,
};
