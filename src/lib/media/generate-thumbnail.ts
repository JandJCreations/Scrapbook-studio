interface VideoThumbnailResult {
  thumbnailUrl: string;
  duration: number;
}

export function generateVideoThumbnail(
  objectUrl: string,
): Promise<VideoThumbnailResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      const seekTo = Math.min(1, video.duration / 2 || 0);
      video.currentTime = seekTo;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Canvas context unavailable"));
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.8);
        const duration = video.duration || 0;
        resolve({ thumbnailUrl, duration });
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Failed to generate video thumbnail"));
      } finally {
        cleanup();
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Failed to load video"));
    };
  });
}

const MAX_THUMBNAIL_DIMENSION = 480;

/**
 * Media libraries are commonly phone-camera photos (3000-4000px, several MB
 * each). Loading those at full resolution just to show an 80px grid square
 * is what makes the media panel feel slow/laggy on mobile — downscale once
 * at upload time instead.
 */
export function generateImageThumbnail(objectUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    // Required for cross-origin sources (e.g. a Supabase signed URL, as
    // opposed to a same-origin blob: URL from a local upload) — without
    // this, drawing the image to canvas taints it and canvas.toDataURL()
    // below throws. That throw happens inside this onload callback, not in
    // this Promise executor's own synchronous scope, so without the
    // try/catch this promise would never resolve OR reject — it would just
    // hang forever, along with anything awaiting it in a loop.
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const scale = Math.min(
          1,
          MAX_THUMBNAIL_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Canvas context unavailable"));
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Failed to generate thumbnail"));
      }
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = objectUrl;
  });
}

export function getAudioDuration(objectUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    audio.src = objectUrl;
    audio.preload = "metadata";

    audio.onloadedmetadata = () => {
      resolve(audio.duration || 0);
      audio.removeAttribute("src");
    };

    audio.onerror = () => {
      reject(new Error("Failed to load audio"));
    };
  });
}

/**
 * A small JPEG of a photo file, made without holding up the page: the browser
 * decodes the photo off the main thread (createImageBitmap), which keeps the
 * editor responsive while a batch of 12-megapixel phone photos comes in.
 * Falls back to the <img> route where that is not supported.
 */
export async function generateImageThumbnailFromFile(file: Blob, objectUrl: string): Promise<Blob> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const scale = Math.min(1, MAX_THUMBNAIL_DIMENSION / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas context unavailable");
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
        if (blob) return blob;
      } finally {
        bitmap.close();
      }
    } catch {
      // Some formats (or browsers) can't be decoded this way: try the <img> route.
    }
  }
  const dataUrl = await generateImageThumbnail(objectUrl);
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);base64/)?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
