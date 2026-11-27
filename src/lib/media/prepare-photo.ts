import { isHeic } from "@/lib/media/file-type";

/**
 * The longest side a saved photo keeps. A video is at most 4K wide, so a
 * 24 or 48 megapixel iPhone photo (5712 or 8064 px) only costs upload time
 * and memory. A 12 megapixel photo (4032 px) is left as it is.
 */
export const MAX_PHOTO_EDGE = 4096;

/** iPhone Safari can't draw a canvas bigger than this many pixels. */
const MAX_CANVAS_PIXELS = 16_000_000;

export class PhotoFormatError extends Error {}

/** The size to draw a photo at so it fits MAX_PHOTO_EDGE and iPhone's canvas limit; null when it already fits. */
export function fittedSize(width: number, height: number): { width: number; height: number } | null {
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(width, height), Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
  if (scale >= 1) return null;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function renamed(name: string, extension: string): string {
  const dot = name.lastIndexOf(".");
  return (dot === -1 ? name : name.slice(0, dot)) + "." + extension;
}

/**
 * Gets a photo ready to save: an iPhone HEIC photo becomes a JPEG (so it shows
 * on every computer and in the export), and a very large JPEG is made smaller
 * so it uploads quickly on a phone connection. Anything else, or anything this
 * browser can't read, comes back as it was, except a HEIC that can't be read,
 * which throws a PhotoFormatError with a message for the user.
 */
export async function preparePhoto(file: File): Promise<File> {
  const heic = isHeic(file);
  const jpeg = /^image\/jpe?g$/i.test(file.type);
  if (!heic && !jpeg) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (heic) {
      throw new PhotoFormatError(
        "This browser can't open iPhone HEIC photos. Add it from your iPhone, or save it as a JPEG first.",
      );
    }
    return file;
  }

  try {
    const target = fittedSize(bitmap.width, bitmap.height);
    if (!heic && !target) return file;
    const size = target ?? { width: bitmap.width, height: bitmap.height };
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    // Let the phone have the memory back straight away.
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) {
      if (heic) throw new PhotoFormatError("Couldn't turn this HEIC photo into a JPEG. Try saving it as a JPEG first.");
      return file;
    }
    // A JPEG that didn't get any smaller is kept as it was.
    if (!heic && blob.size >= file.size) return file;
    return new File([blob], renamed(file.name, "jpg"), { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
