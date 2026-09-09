import {
  Download,
  ImagePlus,
  type LucideIcon,
  MousePointerClick,
  Music,
  Sparkles,
  Type,
} from "lucide-react";

export interface TourStep {
  icon: LucideIcon;
  title: string;
  description: string;
  /** data-tour attribute value of the real element this step should point at. Omit for a centered, untargeted step (e.g. the welcome step). */
  targetSelector?: string;
  /** Use this selector instead, on narrow viewports where targetSelector's element is hidden inside a closed sheet/drawer. */
  mobileTargetSelector?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    icon: Sparkles,
    title: "Welcome to Scrapbook Studio",
    description:
      "Here's a quick, skippable look around before you start building. Each step points at the real button.",
  },
  {
    icon: ImagePlus,
    title: "Add your photos and video",
    description:
      "Tap here to open your Media tab, then tap any photo or video to drop it onto the canvas.",
    targetSelector: "media-tab",
    mobileTargetSelector: "panels-button",
  },
  {
    icon: Type,
    title: "Add text",
    description:
      "Tap this to drop a text box onto the canvas. Double-tap it on the canvas anytime to edit the words.",
    targetSelector: "add-text-button",
  },
  {
    icon: MousePointerClick,
    title: "Arrange and style anything",
    description:
      "Tap anything here to select it and drag to move it. The panel that opens lets you resize, crop, add filters, and more.",
    targetSelector: "canvas-area",
  },
  {
    icon: Music,
    title: "Add music",
    description:
      "Tap this to create an audio track, then add a clip from the built-in music library or upload your own.",
    targetSelector: "add-audio-track-button",
  },
  {
    icon: Download,
    title: "Export when you're ready",
    description:
      "Tap this to save your scrapbook as an image, GIF, or video, in whatever size fits where you're sharing it.",
    targetSelector: "export-button",
  },
];

export const TOUR_SEEN_STORAGE_KEY = "scrapbook-studio:tour-seen";
