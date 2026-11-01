/** Family names of uploaded fonts start with this, so they can never collide with a Google font. */
export const CUSTOM_FONT_PREFIX = "custom-";

export const customFontFamily = (fontId: string) => `${CUSTOM_FONT_PREFIX}${fontId}`;
export const isCustomFontFamily = (family: string) => family.startsWith(CUSTOM_FONT_PREFIX);

export interface CustomFont {
  id: string;
  /** What the user sees: the file's name. */
  name: string;
  /** What text clips store, and the painter draws with. */
  family: string;
}

// Fonts are registered by whoever fetches or uploads them (the environment); the
// painter, export and thumbnails only ever ask "is this family ready?".
const registered = new Map<string, Promise<void>>();
let pending: Promise<void> = Promise.resolve();

/** The (single) fetch of the user's font list: fonts that are not registered yet may be on their way. */
export function setCustomFontsPending(listing: Promise<void>): void {
  pending = listing.catch(() => undefined);
}

export function registerCustomFont(family: string, loaded: Promise<void>): void {
  registered.set(family, loaded.catch(() => undefined));
}

/** How long painting and export will wait for a font before drawing without it. */
const FONT_WAIT_MS = 4000;

/**
 * Resolves once the family is usable, or at once if it is unknown or failed, or
 * after a few seconds if it is still downloading: a font never holds up painting or export.
 */
export function whenCustomFontReady(family: string, timeoutMs = FONT_WAIT_MS): Promise<void> {
  const ready = (async () => {
    await pending;
    await registered.get(family);
  })();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    void ready.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** A CSS url() for a font address: quoted, with the characters that could end the quotes escaped. */
export function cssUrl(address: string): string {
  const safe = address
    .replace(/"/g, "%22")
    .replace(/\\/g, "%5C")
    .replace(/[\r\n]/g, "");
  return `url("${safe}")`;
}

/** For tests. */
export function resetCustomFonts(): void {
  registered.clear();
  pending = Promise.resolve();
}
