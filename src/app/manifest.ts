import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Scrapbook Studio",
    short_name: "Scrapbook",
    description:
      "Turn your photos and clips into a video with music.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fbf9f2",
    theme_color: "#7c3aed",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
