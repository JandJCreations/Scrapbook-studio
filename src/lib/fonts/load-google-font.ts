const loadedFonts = new Set<string>();

/** Resolves when the stylesheet has loaded (or failed, or taken too long to matter). */
function stylesheetSettled(link: HTMLLinkElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => resolve();
    link.addEventListener("load", done, { once: true });
    link.addEventListener("error", done, { once: true });
    window.setTimeout(done, 5000);
  });
}

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
  const settled = stylesheetSettled(link);
  document.head.appendChild(link);

  if (typeof document.fonts?.load === "function") {
    // The font faces are only known once the stylesheet has arrived.
    return settled
      .then(() =>
        Promise.all([
          document.fonts.load(`400 16px "${family}"`),
          document.fonts.load(`700 16px "${family}"`),
        ]),
      )
      .then(() => undefined)
      .catch(() => undefined);
  }

  return settled;
}
