export type MusicMood =
  | "Romantic"
  | "Nostalgic"
  | "Upbeat"
  | "Calm"
  | "Cinematic"
  | "Dreamy";

export interface MusicLibraryTrack {
  id: string;
  name: string;
  mood: MusicMood;
  duration: number;
  src: string;
}

export const MUSIC_LIBRARY: MusicLibraryTrack[] = [
  {
    id: "golden-hour",
    name: "Golden Hour",
    mood: "Romantic",
    duration: 26,
    src: "/audio/library/golden-hour.wav",
  },
  {
    id: "sunday-morning",
    name: "Sunday Morning",
    mood: "Nostalgic",
    duration: 26.5,
    src: "/audio/library/sunday-morning.wav",
  },
  {
    id: "confetti",
    name: "Confetti",
    mood: "Upbeat",
    duration: 27.5,
    src: "/audio/library/confetti.wav",
  },
  {
    id: "quiet-moments",
    name: "Quiet Moments",
    mood: "Calm",
    duration: 31,
    src: "/audio/library/quiet-moments.wav",
  },
  {
    id: "wide-skies",
    name: "Wide Skies",
    mood: "Cinematic",
    duration: 31,
    src: "/audio/library/wide-skies.wav",
  },
  {
    id: "first-snow",
    name: "First Snow",
    mood: "Dreamy",
    duration: 28,
    src: "/audio/library/first-snow.wav",
  },
];

export const MUSIC_MOODS: MusicMood[] = [
  "Romantic",
  "Nostalgic",
  "Upbeat",
  "Calm",
  "Cinematic",
  "Dreamy",
];
