import { MUSIC_LIBRARY, type MusicLibraryTrack } from "@/lib/audio/music-library-catalog";

const PREFIX = "music:";

/** The media id a clip stores for a library track: stable, and never mistaken for a file in Storage. */
export function musicMediaId(track: MusicLibraryTrack): string {
  return `${PREFIX}${track.id}`;
}

export function isMusicMediaId(mediaId: string): boolean {
  return mediaId.startsWith(PREFIX);
}

export function findTrackByMediaId(mediaId: string): MusicLibraryTrack | undefined {
  if (!isMusicMediaId(mediaId)) return undefined;
  return MUSIC_LIBRARY.find((track) => musicMediaId(track) === mediaId);
}
