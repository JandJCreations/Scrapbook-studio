"use client";

import { motion } from "framer-motion";
import {
  Images,
  Layers,
  Music,
  Palette,
  Sparkles,
  Video,
} from "lucide-react";

const FEATURES = [
  {
    icon: Layers,
    title: "Infinite canvas",
    description:
      "Pan and zoom across an unlimited workspace. Layer photos, video, text, and stickers exactly where memories belong.",
  },
  {
    icon: Video,
    title: "Video editing built in",
    description:
      "Trim, crop, and layer video clips directly on the canvas — no need to leave the app to edit footage.",
  },
  {
    icon: Music,
    title: "Audio timelines",
    description:
      "Add narration and music with a multi-track timeline, complete with fades, trims, and waveform scrubbing.",
  },
  {
    icon: Images,
    title: "Powerful photo tools",
    description:
      "Crop, filter, and retouch images with a full editing panel — brightness, blend modes, borders, and more.",
  },
  {
    icon: Palette,
    title: "Stickers & decorations",
    description:
      "Washi tape, frames, torn paper, and textures to make every page feel handmade — or upload your own.",
  },
  {
    icon: Sparkles,
    title: "Cinematic export",
    description:
      "Export to PNG, PDF, GIF, or MP4 up to 4K, ready to share or print.",
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
          Scrapbook Studio combines a design canvas, video editor, and audio
          mixer into one focused creative tool.
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
