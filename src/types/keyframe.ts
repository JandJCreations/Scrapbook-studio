export interface Keyframe {
  id: string;
  time: number;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
}

export interface InterpolatedTransform {
  x: number;
  y: number;
  rotation: number;
  opacity: number;
}
