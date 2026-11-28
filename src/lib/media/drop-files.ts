/**
 * The files in a drop, with any dropped folders opened up (and their folders
 * too), so dragging a whole album folder from the desktop brings in every
 * photo in it. `dataTransfer.files` alone lists a folder as one empty file.
 *
 * Must be called during the drop event: the browser empties the
 * DataTransfer once the event handler returns.
 */
export async function filesFromDrop(dataTransfer: DataTransfer): Promise<DroppedFiles> {
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  // A browser without entries: the plain list, as before.
  if (entries.length === 0) return { files: Array.from(dataTransfer.files ?? []), folderName: null };
  const folders = entries.filter((entry) => entry.isDirectory);
  const lists = await Promise.all(entries.map((entry) => filesIn(entry)));
  return {
    files: lists.flat(),
    // One folder dropped on its own is an album: its name can name a folder in the library.
    folderName: folders.length === 1 && entries.length === 1 ? folders[0].name : null,
  };
}

export interface DroppedFiles {
  files: File[];
  /** The folder's name when exactly one folder was dropped. */
  folderName: string | null;
}

/** True when the drag carries files (or folders) from outside the page. */
export function dragHasFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types ?? []).includes("Files");
}

/** The name of the folder picked with a folder picker (`webkitdirectory`), from its files' paths. */
export function pickedFolderName(files: File[]): string | null {
  const path = (files[0] as File & { webkitRelativePath?: string })?.webkitRelativePath;
  if (!path || !path.includes("/")) return null;
  return path.split("/")[0] || null;
}

async function filesIn(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await new Promise<File | null>((resolve) =>
      (entry as FileSystemFileEntry).file(resolve, () => resolve(null)),
    );
    return file ? [file] : [];
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  // readEntries hands them over in batches (100 at a time in Chrome) until it returns none.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
    if (batch.length === 0) break;
    children.push(...batch);
  }
  // Sorted by name, so an album's photos (IMG_0001, IMG_0002…) keep their order.
  children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const lists = await Promise.all(children.map((child) => filesIn(child)));
  return lists.flat();
}

/** Files from a folder picker, sorted by their path so an album keeps its order. */
export function sortByPath(files: File[]): File[] {
  const path = (file: File) => (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  return [...files].sort((a, b) => path(a).localeCompare(path(b), undefined, { numeric: true }));
}
