const loadedFonts = new Set<string>();

export function loadGoogleFont(family: string): Promise<void> {
  if (family === "Inter" || loadedFonts.has(family)) {
    return Promise.resolve();
  }

  loadedFonts.add(family);
  const encoded = family.replace(/ /g, "+");
  const href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;700&display=swap`;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);

  if (typeof document.fonts?.load === "function") {
    return document.fonts
      .load(`700 16px "${family}"`)
      .then(() => undefined)
      .catch(() => undefined);
  }

  return Promise.resolve();
}
