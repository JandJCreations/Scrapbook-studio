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
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 180;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        cleanup();
        reject(new Error("Canvas context unavailable"));
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.8);
      const duration = video.duration || 0;
      cleanup();
      resolve({ thumbnailUrl, duration });
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
    img.onload = () => {
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
