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
}

export const TOUR_STEPS: TourStep[] = [
  {
    icon: Sparkles,
    title: "Welcome to Scrapbook Studio",
    description:
      "Here's a quick, skippable look around before you start building.",
  },
  {
    icon: ImagePlus,
    title: "Add your photos and video",
    description:
      "Open the Media tab on the left, then tap any photo or video to drop it onto the canvas.",
  },
  {
    icon: Type,
    title: "Add text",
    description:
      "Tap \"Add text\" in the top bar to drop in a caption or title. Double-tap it on the canvas anytime to edit the words.",
  },
  {
    icon: MousePointerClick,
    title: "Arrange and style anything",
    description:
      "Tap something on the canvas to select it and drag to move it. The panel that opens lets you resize, crop, add filters, and more.",
  },
  {
    icon: Music,
    title: "Add music",
    description:
      "Open the timeline at the bottom and add an audio track — choose from the built-in music library or upload your own.",
  },
  {
    icon: Download,
    title: "Export when you're ready",
    description:
      "Tap Export to save your scrapbook as an image, GIF, or video, in whatever size fits where you're sharing it.",
  },
];

export const TOUR_SEEN_STORAGE_KEY = "scrapbook-studio:tour-seen";
