import { findAssetByMediaId, isBundledAssetId } from "@/lib/assets/asset-keys";
import { findTrackByMediaId, isMusicMediaId } from "@/lib/audio/music-keys";
import type { MediaUrlSource } from "@/lib/sync/media-url-store";

const isBundled = (mediaId: string) => isBundledAssetId(mediaId) || isMusicMediaId(mediaId);

/**
 * A media URL source that answers bundled art (`asset:` ids) and the music
 * library (`music:` ids) itself, and hands every other id to `source`. These
 * have no signed URL, so the real source is never asked about them.
 */
export function withBundledAssets(source: MediaUrlSource): MediaUrlSource {
  return {
    urlFor: (mediaId) => {
      if (isBundledAssetId(mediaId)) return findAssetByMediaId(mediaId)?.src ?? null;
      if (isMusicMediaId(mediaId)) return findTrackByMediaId(mediaId)?.src ?? null;
      return source.urlFor(mediaId);
    },
    posterFor: (mediaId) => (isBundled(mediaId) ? null : source.posterFor(mediaId)),
    ensure: (ids) => source.ensure(ids.filter((id) => !isBundled(id))),
    subscribe: (listener) => source.subscribe(listener),
    getVersion: () => source.getVersion(),
  };
}
