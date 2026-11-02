import {
  Clapperboard,
  Download,
  ImagePlus,
  type LucideIcon,
  Music,
  Play,
  Sparkles,
} from "lucide-react";

export interface TourStep {
  icon: LucideIcon;
  title: string;
  description: string;
  /** data-tour attribute value of the real element this step should point at. Omit for a centered, untargeted step (e.g. the welcome step). */
  targetSelector?: string;
  /** Use this selector instead on narrow screens, where targetSelector's element is inside a closed sheet. */
  mobileTargetSelector?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    icon: Sparkles,
    title: "Make a video from your photos and clips",
    description:
      "Here's a quick, skippable look around. Pick your photos and videos, choose some music, and export a finished video.",
  },
  {
    icon: ImagePlus,
    title: "Add your photos and videos",
    description:
      "Import your files in the Media tab, then press Add. Tick several to add them all at once. They play one after another, in order.",
    targetSelector: "tab-media",
    mobileTargetSelector: "tools-button",
  },
  {
    icon: Music,
    title: "Choose your music",
    description:
      "The Audio tab has your own songs and a built-in music library. Preview a track, then add it. It is cut to fit the length of your video.",
    targetSelector: "tab-audio",
    mobileTargetSelector: "tools-button",
  },
  {
    icon: Play,
    title: "Watch it play",
    description: "The preview shows your video exactly as it will export. Press Space or the play button to watch it through.",
    targetSelector: "stage",
  },
  {
    icon: Clapperboard,
    title: "Your timeline",
    description:
      "Drag clips to reorder them, drag their edges to trim, and use Split, Duplicate and Delete above it. Click a clip to change how long it shows, its colours or its sound.",
    targetSelector: "timeline",
  },
  {
    icon: Download,
    title: "Export when you're ready",
    description: "Save your video in the size that fits where you're sharing it.",
    targetSelector: "export-button",
  },
];

export const TOUR_SEEN_STORAGE_KEY = "scrapbook-studio:tour-seen";
