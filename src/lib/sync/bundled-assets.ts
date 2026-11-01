import { findAssetByMediaId, isBundledAssetId } from "@/lib/assets/asset-keys";
import type { MediaUrlSource } from "@/lib/sync/media-url-store";

/**
 * A media URL source that answers bundled catalog art (`asset:` ids) itself and
 * hands every other id to `source`. Catalog art has no signed URL, so the real
 * source is never asked about it.
 */
export function withBundledAssets(source: MediaUrlSource): MediaUrlSource {
  return {
    urlFor: (mediaId) =>
      isBundledAssetId(mediaId) ? (findAssetByMediaId(mediaId)?.src ?? null) : source.urlFor(mediaId),
    posterFor: (mediaId) => (isBundledAssetId(mediaId) ? null : source.posterFor(mediaId)),
    ensure: (ids) => source.ensure(ids.filter((id) => !isBundledAssetId(id))),
    subscribe: (listener) => source.subscribe(listener),
    getVersion: () => source.getVersion(),
  };
}
