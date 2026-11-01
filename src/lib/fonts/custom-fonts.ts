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

/** Resolves once the family is usable, or at once if it is unknown or failed: a font never blocks painting or export. */
export async function whenCustomFontReady(family: string): Promise<void> {
  await pending;
  await registered.get(family);
}

/** For tests. */
export function resetCustomFonts(): void {
  registered.clear();
  pending = Promise.resolve();
}
