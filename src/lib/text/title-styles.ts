import type { AnimationInType, AnimationOutType, AnimationSpec } from "@/types/object-extras";
import type { TextAdjustments } from "@/types/text-adjustments";

export interface TitleStyle {
  id: string;
  name: string;
  /** Applied on top of the text's current settings (content is kept). */
  text: Partial<TextAdjustments>;
  animIn?: AnimationSpec<AnimationInType>;
  animOut?: AnimationSpec<AnimationOutType>;
  /** CSS for the preview tile. */
  preview: { color: string; background: string; textShadow?: string };
}

const off = { enabled: false } as const;

export const TITLE_STYLES: TitleStyle[] = [
  {
    id: "big-bold",
    name: "Big & bold",
    text: {
      fontFamily: "Anton",
      fontWeight: 700,
      fontSize: 72,
      color: "#ffffff",
      gradient: { ...off, from: "#ffffff", to: "#ffffff" },
      stroke: { enabled: true, color: "#111827", width: 3 },
      shadow: { enabled: true, color: "#000000", blur: 10, offsetX: 0, offsetY: 4, opacity: 50 },
      glow: { ...off, color: "#ffffff", blur: 20, opacity: 60 },
      letterSpacing: 1,
    },
    animIn: { type: "pop", duration: 0.5 },
    animOut: { type: "fade", duration: 0.4 },
    preview: { color: "#ffffff", background: "#1f2937", textShadow: "0 2px 0 #111827" },
  },
  {
    id: "handwritten",
    name: "Handwritten note",
    text: {
      fontFamily: "Caveat",
      fontWeight: 700,
      fontSize: 52,
      color: "#374151",
      gradient: { ...off, from: "#374151", to: "#374151" },
      stroke: { ...off, color: "#ffffff", width: 2 },
      shadow: { ...off, color: "#000000", blur: 8, offsetX: 0, offsetY: 4, opacity: 40 },
      glow: { ...off, color: "#ffffff", blur: 20, opacity: 60 },
      letterSpacing: 0,
    },
    animIn: { type: "typewriter", duration: 1.5 },
    animOut: { type: "fade", duration: 0.4 },
    preview: { color: "#374151", background: "#fef9c3" },
  },
  {
    id: "neon",
    name: "Neon glow",
    text: {
      fontFamily: "Poppins",
      fontWeight: 700,
      fontSize: 56,
      color: "#fdf4ff",
      gradient: { ...off, from: "#fdf4ff", to: "#fdf4ff" },
      stroke: { ...off, color: "#ffffff", width: 2 },
      shadow: { ...off, color: "#000000", blur: 8, offsetX: 0, offsetY: 4, opacity: 40 },
      glow: { enabled: true, color: "#ec4899", blur: 28, opacity: 85 },
      letterSpacing: 2,
    },
    animIn: { type: "fade", duration: 0.8 },
    animOut: { type: "fade", duration: 0.5 },
    preview: { color: "#fdf4ff", background: "#1e1b4b", textShadow: "0 0 8px #ec4899" },
  },
  {
    id: "sunset",
    name: "Retro sunset",
    text: {
      fontFamily: "Abril Fatface",
      fontWeight: 400,
      fontSize: 64,
      color: "#f97316",
      gradient: { enabled: true, from: "#f97316", to: "#db2777" },
      stroke: { ...off, color: "#ffffff", width: 2 },
      shadow: { enabled: true, color: "#7c2d12", blur: 0, offsetX: 3, offsetY: 3, opacity: 60 },
      glow: { ...off, color: "#ffffff", blur: 20, opacity: 60 },
      letterSpacing: 0,
    },
    animIn: { type: "rise", duration: 0.7 },
    animOut: { type: "sink", duration: 0.5 },
    preview: { color: "#f97316", background: "#fff7ed" },
  },
  {
    id: "caption",
    name: "Typewriter caption",
    text: {
      fontFamily: "Space Mono",
      fontWeight: 400,
      fontSize: 30,
      color: "#111827",
      gradient: { ...off, from: "#111827", to: "#111827" },
      stroke: { ...off, color: "#ffffff", width: 2 },
      shadow: { ...off, color: "#000000", blur: 8, offsetX: 0, offsetY: 4, opacity: 40 },
      glow: { ...off, color: "#ffffff", blur: 20, opacity: 60 },
      letterSpacing: 0,
    },
    animIn: { type: "typewriter", duration: 1.2 },
    animOut: { type: "fade", duration: 0.3 },
    preview: { color: "#111827", background: "#f5f5f4" },
  },
  {
    id: "script",
    name: "Elegant script",
    text: {
      fontFamily: "Great Vibes",
      fontWeight: 400,
      fontSize: 68,
      color: "#92400e",
      gradient: { ...off, from: "#92400e", to: "#92400e" },
      stroke: { ...off, color: "#ffffff", width: 2 },
      shadow: { enabled: true, color: "#000000", blur: 6, offsetX: 0, offsetY: 2, opacity: 20 },
      glow: { ...off, color: "#ffffff", blur: 20, opacity: 60 },
      letterSpacing: 0,
    },
    animIn: { type: "fade", duration: 1 },
    animOut: { type: "fade", duration: 0.8 },
    preview: { color: "#92400e", background: "#fdf2f8" },
  },
  {
    id: "marker",
    name: "Marker scrawl",
    text: {
      fontFamily: "Permanent Marker",
      fontWeight: 400,
      fontSize: 54,
      color: "#dc2626",
      gradient: { ...off, from: "#dc2626", to: "#dc2626" },
      stroke: { ...off, color: "#ffffff", width: 2 },
      shadow: { ...off, color: "#000000", blur: 8, offsetX: 0, offsetY: 4, opacity: 40 },
      glow: { ...off, color: "#ffffff", blur: 20, opacity: 60 },
      letterSpacing: 0,
    },
    animIn: { type: "drop", duration: 0.8 },
    animOut: { type: "shrink", duration: 0.4 },
    preview: { color: "#dc2626", background: "#ffffff" },
  },
  {
    id: "headline",
    name: "Headline",
    text: {
      fontFamily: "Bebas Neue",
      fontWeight: 400,
      fontSize: 84,
      color: "#111827",
      gradient: { ...off, from: "#111827", to: "#111827" },
      stroke: { ...off, color: "#ffffff", width: 2 },
      shadow: { ...off, color: "#000000", blur: 8, offsetX: 0, offsetY: 4, opacity: 40 },
      glow: { ...off, color: "#ffffff", blur: 20, opacity: 60 },
      letterSpacing: 4,
    },
    animIn: { type: "slide-right", duration: 0.6 },
    animOut: { type: "slide-left", duration: 0.5 },
    preview: { color: "#111827", background: "#e0f2fe" },
  },
];
