"use client";

import { motion } from "framer-motion";
import {
  Download,
  Mic,
  Palette,
  Scissors,
  Type,
  Wand2,
} from "lucide-react";

const FEATURES = [
  {
    icon: Wand2,
    title: "A video in one click",
    description:
      "Tick your photos and press Make a video: they're timed, gently animated and joined with transitions, with a title and a song underneath.",
  },
  {
    icon: Scissors,
    title: "A real timeline",
    description:
      "Trim, split, duplicate and reorder clips on video, overlay and audio lanes, with undo for every step.",
  },
  {
    icon: Type,
    title: "Titles and captions",
    description:
      "Ready-made text styles that fade in and out, placed at the top, middle or bottom of the picture.",
  },
  {
    icon: Palette,
    title: "Looks and filters",
    description:
      "Vivid, vintage, warm, noir and more, plus brightness, contrast and colour for every photo and clip.",
  },
  {
    icon: Mic,
    title: "Music and voiceover",
    description:
      "Pick a song from the library or bring your own, then record your voice over the top. The music dips while you talk.",
  },
  {
    icon: Download,
    title: "Landscape, portrait or square",
    description:
      "Switch the shape for any screen and everything moves with it. Export MP4, MOV, WebM or GIF with sound, up to 4K.",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Everything you need to tell your story
        </h2>
        <p className="mt-4 text-balance text-muted-foreground">
          Scrapbook Studio brings quick, friendly video editing, titles,
          music and voiceover together in one place.
        </p>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
            className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <feature.icon className="size-5" />
            </div>
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {feature.description}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
