import {
  Clapperboard,
  Download,
  ImagePlus,
  type LucideIcon,
  Music,
  Play,
  Sparkles,
  Type,
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
    title: "Your video is on its way",
    description:
      "Here's a quick, skippable look at how to change it: add more photos, swap the music, add words, then export.",
  },
  {
    icon: ImagePlus,
    title: "Add your photos and videos",
    description:
      "Press Import to bring in more, then Add to put one at the end. Tap several pictures to tick them and add them all at once.",
    targetSelector: "tab-media",
    mobileTargetSelector: "tools-button",
  },
  {
    icon: Music,
    title: "Choose your music",
    description:
      "Pick a song from the built-in library or your own. Picking another one swaps it, and it is cut to fit your video.",
    targetSelector: "tab-audio",
    mobileTargetSelector: "tools-button",
  },
  {
    icon: Type,
    title: "Add text and captions",
    description:
      "The Text tab adds titles and captions in ready-made styles. A caption for the selected slide lasts exactly as long as that slide.",
    targetSelector: "tab-text",
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
      "Drag clips to reorder them and drag their edges to trim. Tap a clip to change how long it shows, its look or its sound.",
    targetSelector: "timeline",
  },
  {
    icon: Download,
    title: "Export when you're ready",
    description: "When you like it, press Export to save it to your phone or computer, ready to share.",
    targetSelector: "export-button",
  },
];

export const TOUR_SEEN_STORAGE_KEY = "scrapbook-studio:tour-seen";
