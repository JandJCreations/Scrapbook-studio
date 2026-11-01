import {
  customFontFamily,
  registerCustomFont,
  setCustomFontsPending,
  type CustomFont,
} from "@/lib/fonts/custom-fonts";

export const MAX_FONT_BYTES = 10 * 1024 * 1024;
const FONT_EXTENSIONS = /\.(ttf|otf|woff2?)$/i;

export interface FontRow {
  id: string;
  name: string;
  family: string;
  storage_path: string;
}

/** Where fonts are kept: Supabase in the app, memory in tests. */
export interface FontStore {
  userId(): Promise<string | null>;
  rows(): Promise<FontRow[]>;
  signedUrls(paths: string[]): Promise<Map<string, string>>;
  upload(path: string, file: File): Promise<void>;
  remove(path: string): Promise<void>;
  insert(row: FontRow & { owner_id: string }): Promise<void>;
}

interface Deps {
  store: FontStore;
  /** Makes the browser load a font: from file bytes, or from a URL. Rejects if it is not a usable font. */
  loadFace(family: string, source: ArrayBuffer | string): Promise<void>;
  newId(): string;
}

export interface CustomFontService {
  /** Fetches the user's fonts and makes each ready; one that will not load is left out. */
  list(): Promise<CustomFont[]>;
  /** Checks, keeps and registers a font file; rejects with a message fit to show. */
  add(file: File): Promise<CustomFont>;
}

export function createCustomFontService({ store, loadFace, newId }: Deps): CustomFontService {
  // The list is fetched (and its fonts loaded) once, however many times the caller asks.
  let listed: Promise<CustomFont[]> | null = null;
  return {
    list() {
      if (listed) return listed;
      const listing = (async () => {
        const rows = await store.rows();
        const urls = await store.signedUrls(rows.map((row) => row.storage_path));
        const fonts: CustomFont[] = [];
        await Promise.all(
          rows.map(async (row) => {
            const url = urls.get(row.storage_path);
            if (!url) return;
            const loaded = loadFace(row.family, url);
            registerCustomFont(row.family, loaded);
            try {
              await loaded;
              fonts.push({ id: row.id, name: row.name, family: row.family });
            } catch {
              // A font that will not load is skipped rather than failing the rest.
            }
          }),
        );
        // Keep the store's order (newest first), whatever order they finished loading in.
        const order = new Map(rows.map((row, index) => [row.id, index]));
        return fonts.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      })();
      // Painting asks whether a font is ready; until the list is in, it waits.
      setCustomFontsPending(listing.then(() => undefined));
      listed = listing;
      return listing;
    },

    async add(file) {
      if (!FONT_EXTENSIONS.test(file.name)) throw new Error("Choose a font file (.ttf, .otf, .woff or .woff2).");
      if (file.size > MAX_FONT_BYTES) throw new Error("That font file is too big (10 MB at most).");
      const userId = await store.userId();
      if (!userId) throw new Error("You must be signed in to add a font.");

      const id = newId();
      const family = customFontFamily(id);
      const name = file.name.replace(/\.[^.]+$/, "");
      try {
        await loadFace(family, await file.arrayBuffer());
      } catch {
        throw new Error("That file is not a usable font.");
      }

      // Named by id and extension only: the file's own name may hold characters storage refuses.
      const extension = (FONT_EXTENSIONS.exec(file.name)?.[1] ?? "ttf").toLowerCase();
      const path = `${userId}/fonts/${id}.${extension}`;
      try {
        await store.upload(path, file);
        try {
          await store.insert({ id, owner_id: userId, name, family, storage_path: path });
        } catch (error) {
          await store.remove(path).catch(() => undefined);
          throw error;
        }
      } catch {
        throw new Error("That font could not be saved. Try again.");
      }

      registerCustomFont(family, Promise.resolve());
      return { id, name, family };
    },
  };
}
