import { markProjectContentLoaded } from "@/hooks/use-project-content-sync";
import { MUSIC_LIBRARY } from "@/lib/audio/music-library-catalog";
import { storyEnd } from "@/lib/story/story";
import { saveProjectFrame } from "@/lib/sync/project-content-sync";
import { useAudioStore } from "@/store/use-audio-store";
import { useCanvasStore, type AddObjectInput } from "@/store/use-canvas-store";
import type { CanvasObject } from "@/types/canvas";
import type { ObjectExtras } from "@/types/object-extras";
import type { ScrapbookTemplate } from "@/types/template";
import type { TextAdjustments } from "@/types/text-adjustments";

interface ApplyTemplateActions {
  setFrame: (projectId: string, frame: { width: number; height: number }) => void;
  addObject: (projectId: string, input: AddObjectInput) => string;
  updateObject: (projectId: string, objectId: string, patch: Partial<CanvasObject>) => void;
  updateTextAdjustments: (
    projectId: string,
    objectId: string,
    patch: Partial<TextAdjustments>,
  ) => void;
}

/**
 * Applies a template's frame + pre-placed objects to an already-created
 * project. Shared by the Templates gallery and the "New project" dialog's
 * format picker so both paths build a project the exact same way.
 *
 * Video templates can also lay out story slots (tap-to-fill clips that play
 * in order, with transitions), timed animated titles, a background and a
 * song from the music library.
 */
export function applyTemplateToProject(
  projectId: string,
  template: ScrapbookTemplate,
  actions: ApplyTemplateActions,
) {
  const canvas = useCanvasStore.getState();
  // Templates always build the first page, whatever page another project
  // was left on.
  canvas.setCurrentPage(0);

  actions.setFrame(projectId, template.frame);
  saveProjectFrame(projectId, template.frame).catch((error) => {
    console.error("Failed to save canvas frame:", error);
  });

  if (template.background) {
    canvas.setPageBackground(projectId, template.background, template.frame);
  }

  // Story slots first, so titles can be timed against the finished story.
  const storyDefs = template.objects.filter((o) => o.story);
  const otherDefs = template.objects.filter((o) => !o.story);

  for (const obj of storyDefs) {
    const newId = actions.addObject(projectId, {
      type: obj.type,
      mediaId: obj.placeholder ? undefined : `template-${template.id}-${obj.name}`,
      src: obj.placeholder ? undefined : obj.src,
      name: obj.name,
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height,
      isPlaceholder: obj.placeholder,
      inStory: true,
    });
    const current = useCanvasStore
      .getState()
      .objectsByProject[projectId]?.find((o) => o.id === newId);
    if (obj.duration && current) {
      actions.updateObject(projectId, newId, {
        endTime: current.startTime + obj.duration,
      });
    }
    applyExtras(projectId, newId, {
      transitionIn: obj.transitionIn,
      motion: obj.motion,
      animIn: obj.animIn,
      animOut: obj.animOut,
    });
  }

  const storyLength = storyEnd(useCanvasStore.getState().objectsByProject[projectId] ?? []);

  for (const obj of otherDefs) {
    const newId = actions.addObject(projectId, {
      type: obj.type,
      mediaId: obj.placeholder ? undefined : `template-${template.id}-${obj.name}`,
      src: obj.placeholder ? undefined : obj.src,
      name: obj.name,
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height,
      isPlaceholder: obj.placeholder,
    });
    const patch: Partial<CanvasObject> = {};
    if (obj.rotation) patch.rotation = obj.rotation;
    if (obj.startTime !== undefined) {
      const start = obj.startTime < 0 ? Math.max(0, storyLength + obj.startTime) : obj.startTime;
      patch.startTime = start;
      patch.endTime = start + (obj.duration ?? 3);
    } else if (storyLength > 0) {
      // Decorations on a video template stay up for the whole story.
      patch.startTime = 0;
      patch.endTime = storyLength;
    }
    if (Object.keys(patch).length > 0) actions.updateObject(projectId, newId, patch);
    if (obj.text) {
      actions.updateTextAdjustments(projectId, newId, obj.text);
    }
    applyExtras(projectId, newId, {
      animIn: obj.animIn,
      animOut: obj.animOut,
      motion: obj.motion,
    });
  }

  if (template.musicId) {
    const song = MUSIC_LIBRARY.find((t) => t.id === template.musicId);
    if (song) {
      const audio = useAudioStore.getState();
      const trackId = audio.addTrack(projectId, "Music");
      const clipId = audio.addClip(projectId, {
        trackId,
        mediaId: `library-${song.id}`,
        src: song.src,
        name: song.name,
        startTime: 0,
        sourceDuration: song.duration,
      });
      // End with the story, with a gentle fade.
      const end = storyLength > 0 ? Math.min(song.duration, storyLength) : song.duration;
      audio.updateClip(projectId, clipId, { trimEnd: end, fadeIn: 0.5, fadeOut: 1.5 });
    }
  }

  // The editor's autosave will persist these objects shortly after mount;
  // mark content as already "loaded" so it doesn't fetch (still-empty) DB
  // rows and overwrite what we just built locally.
  markProjectContentLoaded(projectId);
}

function applyExtras(projectId: string, objectId: string, extras: ObjectExtras) {
  const defined = Object.fromEntries(
    Object.entries(extras).filter(([, v]) => v !== undefined),
  ) as ObjectExtras;
  if (Object.keys(defined).length === 0) return;
  useCanvasStore.getState().updateExtras(projectId, objectId, defined);
}
