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
