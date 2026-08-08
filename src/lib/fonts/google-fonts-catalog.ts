export interface GoogleFontEntry {
  family: string;
  category: "sans-serif" | "serif" | "display" | "handwriting" | "monospace";
}

export const GOOGLE_FONTS: GoogleFontEntry[] = [
  { family: "Inter", category: "sans-serif" },
  { family: "Roboto", category: "sans-serif" },
  { family: "Open Sans", category: "sans-serif" },
  { family: "Poppins", category: "sans-serif" },
  { family: "Montserrat", category: "sans-serif" },
  { family: "Nunito", category: "sans-serif" },
  { family: "Playfair Display", category: "serif" },
  { family: "Merriweather", category: "serif" },
  { family: "Lora", category: "serif" },
  { family: "PT Serif", category: "serif" },
  { family: "Bebas Neue", category: "display" },
  { family: "Anton", category: "display" },
  { family: "Oswald", category: "display" },
  { family: "Abril Fatface", category: "display" },
  { family: "Pacifico", category: "handwriting" },
  { family: "Dancing Script", category: "handwriting" },
  { family: "Caveat", category: "handwriting" },
  { family: "Great Vibes", category: "handwriting" },
  { family: "Shadows Into Light", category: "handwriting" },
  { family: "Permanent Marker", category: "handwriting" },
  { family: "JetBrains Mono", category: "monospace" },
  { family: "Space Mono", category: "monospace" },
];
