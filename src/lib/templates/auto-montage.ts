import { MUSIC_LIBRARY } from "@/lib/audio/music-library-catalog";
import { loadGoogleFont } from "@/lib/fonts/load-google-font";
import { fitInsideFrame, storyEnd } from "@/lib/story/story";
import { TITLE_STYLES } from "@/lib/text/title-styles";
import { useAudioStore } from "@/store/use-audio-store";
import { useCanvasStore } from "@/store/use-canvas-store";
import type { MediaItem } from "@/types/media";
import type { TransitionType } from "@/types/object-extras";

const TRANSITION_CYCLE: TransitionType[] = ["crossfade", "slide-left", "zoom", "crossfade", "page-flip"];
const PHOTO_SECONDS = 3;
const MAX_VIDEO_SECONDS = 6;

function loadSize(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * "Make a video" from a handful of photos and clips: adds them to the end of
 * the story with varied transitions and gentle motion, keeps videos short,
 * puts an animated title on the first clip and (if the project has no audio
 * yet) an upbeat song underneath. Everything it adds is ordinary and
 * editable afterwards — it's a head start, not a black box.
 */
export async function buildAutoMontage(
  projectId: string,
  items: MediaItem[],
  frame: { width: number; height: number },
  title = "Our memories",
): Promise<string[]> {
  const canvas = useCanvasStore.getState();
  const page = canvas.currentPage;
  const before = canvas.objectsByProject[projectId] ?? [];
  const hadStory = storyEnd(before, page) > 0;
  const ids: string[] = [];

  items.forEach((item, i) => {
    const isVideo = item.type === "video";
    const newId = useCanvasStore.getState().addObject(projectId, {
      type: isVideo ? "video" : "image",
      mediaId: item.id,
      src: isVideo ? (item.thumbnailUrl ?? item.url) : item.url,
      videoSrc: isVideo ? item.url : undefined,
      duration: item.duration ?? undefined,
      name: item.name,
      ...fitInsideFrame({ width: 1, height: 1 }, frame),
      inStory: true,
    });
    ids.push(newId);
    const store = useCanvasStore.getState();
    const obj = store.objectsByProject[projectId]?.find((o) => o.id === newId);
    if (!obj) return;
    if (isVideo && obj.videoAdjustments && obj.videoAdjustments.trimEnd > MAX_VIDEO_SECONDS) {
      // Keep each video to its first few seconds; trim it back out in the panel.
      store.updateVideoAdjustments(projectId, newId, { trimEnd: MAX_VIDEO_SECONDS });
    } else if (!isVideo) {
      store.updateObject(projectId, newId, { endTime: obj.startTime + PHOTO_SECONDS });
    }
    if (i > 0 || hadStory) {
      store.setTransitionIn(projectId, newId, {
        type: TRANSITION_CYCLE[i % TRANSITION_CYCLE.length],
        duration: 0.6,
      });
    }
  });

  // Correct sizes as real aspect ratios arrive.
  void Promise.all(
    items.map(async (item, i) => {
      const size = await loadSize(item.thumbnailUrl ?? item.url);
      if (size && size.width > 0) {
        useCanvasStore.getState().updateObject(projectId, ids[i], fitInsideFrame(size, frame));
      }
    }),
  );

  const after = useCanvasStore.getState().objectsByProject[projectId] ?? [];
  const firstNew = after.find((o) => o.id === ids[0]);

  if (!hadStory && firstNew) {
    const style = TITLE_STYLES.find((s) => s.id === "big-bold")!;
    if (style.text.fontFamily) await loadGoogleFont(style.text.fontFamily);
    const store = useCanvasStore.getState();
    const width = Math.round(frame.width * 0.8);
    const height = Math.round(Math.min(frame.height * 0.18, 220));
    const titleId = store.addObject(projectId, {
      type: "text",
      name: "Title",
      x: Math.round((frame.width - width) / 2),
      y: Math.round(frame.height * 0.12),
      width,
      height,
    });
    store.updateTextAdjustments(projectId, titleId, {
      ...style.text,
      content: title,
      fontSize: Math.round(Math.min(frame.width, frame.height) * 0.09),
    });
    store.updateObject(projectId, titleId, {
      startTime: firstNew.startTime,
      endTime: firstNew.startTime + Math.min(3, firstNew.endTime - firstNew.startTime),
    });
    store.updateExtras(projectId, titleId, { animIn: style.animIn, animOut: style.animOut });
  }

  const audio = useAudioStore.getState();
  const hasAudio = (audio.clipsByProject[projectId] ?? []).length > 0;
  if (!hasAudio) {
    const song = MUSIC_LIBRARY.find((t) => t.mood === "Upbeat") ?? MUSIC_LIBRARY[0];
    const length = storyEnd(useCanvasStore.getState().objectsByProject[projectId] ?? [], page);
    if (song && length > 0) {
      const trackId = audio.addTrack(projectId, "Music");
      const clipId = audio.addClip(projectId, {
        trackId,
        mediaId: `library-${song.id}`,
        src: song.src,
        name: song.name,
        startTime: 0,
        sourceDuration: song.duration,
      });
      audio.updateClip(projectId, clipId, {
        trimEnd: Math.min(song.duration, length),
        fadeIn: 0.5,
        fadeOut: 1.5,
      });
    }
  }

  return ids;
}
