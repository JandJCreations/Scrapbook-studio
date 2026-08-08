import type Konva from "konva";

let currentStage: Konva.Stage | null = null;

export function registerStage(stage: Konva.Stage | null) {
  currentStage = stage;
}

export function getRegisteredStage(): Konva.Stage | null {
  return currentStage;
}
