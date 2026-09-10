import { useCanvasStore } from "@/store/use-canvas-store";
import { useTextEditingStore } from "@/store/use-text-editing-store";

interface UseAddTextOptions {
  projectId: string;
  stageWidth: number;
  stageHeight: number;
}

/** Adds a text object centered in the current viewport and starts editing it immediately. Shared by the desktop toolbar and the mobile create bar. */
export function useAddText({ projectId, stageWidth, stageHeight }: UseAddTextOptions) {
  const viewport = useCanvasStore((s) => s.viewport);
  const addObject = useCanvasStore((s) => s.addObject);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const startEditing = useTextEditingStore((s) => s.startEditing);

  return function addText() {
    const worldCenterX = (-viewport.x + stageWidth / 2) / viewport.scale;
    const worldCenterY = (-viewport.y + stageHeight / 2) / viewport.scale;
    const width = 260;
    const height = 80;
    const newId = addObject(projectId, {
      type: "text",
      name: "Text",
      x: worldCenterX - width / 2,
      y: worldCenterY - height / 2,
      width,
      height,
    });
    setSelectedIds([newId]);
    startEditing(newId);
  };
}
