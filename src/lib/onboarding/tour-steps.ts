import {
  Clapperboard,
  Download,
  ImagePlus,
  type LucideIcon,
  MousePointerClick,
  Sparkles,
  Sticker,
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
    title: "Welcome to Scrapbook Studio",
    description:
      "Here's a quick, skippable look around before you start. Each step points at the real button.",
  },
  {
    icon: ImagePlus,
    title: "Add your photos and video",
    description:
      "Your uploads live in the Media tab. Add puts a photo or video on the main track; Overlay lays it on top, like a collage piece.",
    targetSelector: "tab-media",
    mobileTargetSelector: "tools-button",
  },
  {
    icon: Sticker,
    title: "Stickers, music and templates",
    description:
      "The Assets tab has stickers, frames, washi tape, papers, a music library, and templates to start from.",
    targetSelector: "tab-assets",
    mobileTargetSelector: "tools-button",
  },
  {
    icon: Type,
    title: "Add text",
    description:
      "Add text from the Text tab, then double-click it on the stage to type. The panel changes the font, colour, curve and more.",
    targetSelector: "tab-text",
    mobileTargetSelector: "tools-button",
  },
  {
    icon: MousePointerClick,
    title: "Arrange anything",
    description:
      "Click something on the stage to select it, then drag to move it, pull the corners to resize, or use the handle above to turn it.",
    targetSelector: "stage",
  },
  {
    icon: Clapperboard,
    title: "Your timeline",
    description:
      "Every layer is a row. Drag clips to move them, drag their edges to trim, and press Space to play. Undo is always there.",
    targetSelector: "timeline",
  },
  {
    icon: Download,
    title: "Export when you're ready",
    description:
      "Save your project as a picture, GIF or video, in whatever size fits where you're sharing it.",
    targetSelector: "export-button",
  },
];

export const TOUR_SEEN_STORAGE_KEY = "scrapbook-studio:tour-seen";
