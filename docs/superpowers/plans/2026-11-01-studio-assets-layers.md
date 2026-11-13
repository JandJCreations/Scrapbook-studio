# Studio Assets and Layers (Editor Port, Slice 4)

**Goal:** Add the bundled stickers, frames, washi tape, textures and other catalog art to a project as clips, and manage stacking order in a Layers tab. A sticker is a normal clip: it moves, resizes, rotates, fades, animates, trims and undoes like everything else.

**Spec:** `docs/superpowers/specs/2026-10-30-editor-port-design.md`, slice 4 (decision 1: layer order is track order; decision 5: stickers are clips of kind `sticker` with a synthetic `asset:` media id resolved from the bundled catalog, never from Storage).

**Not in this slice:** the user's own uploaded stickers (they live in Supabase `custom_stickers`; needs an env seam, later), groups.

**Builder's calls:**
- A sticker's media id is `asset:<category>/<name>` (stable across catalog edits, unlike the catalog's counter ids).
- Catalog art is drawn through the same picture path as photos, so it needs no network: the media URL source the editor uses is wrapped so `asset:` ids resolve to the catalog's data URLs and everything else goes to the real source.
- A new sticker goes on its own new top overlay track at the playhead, 5 seconds, sized to fit inside 30% of the frame and centred. Textures and papers are the same size; the user stretches them and sends them backward.
- Layers tab lists tracks top to bottom. Overlay tracks can move up or down among overlays (never below the main video track or the audio track); every track can be hidden or locked; clicking a clip row selects it. "Bring forward" / "Send backward" act on a track.
- Selecting a sticker opens the Edit tab, which shows opacity and animation for it.
- Sidebar tabs: Media, Assets, Text, Edit, Layers (smaller labels to fit).

## Global Constraints
- Branch `feature/studio-assets-layers`; never commit to `main`; old editor untouched.
- CRLF files: Edit/Write, or node scripts that normalise `\r\n`; no apostrophes inside single-quoted `node -e` (use a file or the Write tool); avoid `$&` in replacement strings.
- Pure files (`src/lib/*`) have no `document`, `window`, timers.
- jsdom component tests start with `// @vitest-environment jsdom` + `import "@/test/dom-setup";`.
- `npx vitest run`, `npx tsc --noEmit`, `npx eslint`; PATH needs `/c/Program Files/nodejs`. Before `npm run build` delete `.next` entirely.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus
- `asset:` ids never reach Supabase lookups (`isStorageMediaId`, `collectMediaIds`, the URL store, natural-size reads, thumbnails, waveforms) and never crash the media pool for kind `sticker`.
- Track reordering keeps the overlay/video/audio ordering invariant, renumbers `order`, leaves clips alone, is one undo step, refuses locked tracks as designed, and the timeline shows the same order.
- The sticker draws on stage exactly in its box (hit box, selection box), at any size, with opacity/keyframes; sticker clips in split, duplicate, delete, save and reload (the saved document must keep `asset:` ids).
- Layers panel: selection sync with the stage and timeline, hidden tracks, locked tracks, long names, many tracks.

## Tasks
1. **Bundled assets (pure)** `src/lib/assets/asset-keys.ts` + `src/lib/sync/bundled-assets.ts`: `assetMediaId`, `findAssetByMediaId`, `withBundledAssets(source)`; tests.
2. **Scene**: a sticker with an `asset:` id is drawn as a picture; tests.
3. **Ops (pure)**: `addSticker` (ops.ts) and `moveTrack` (tracks.ts); tests.
4. **UI**: Assets tab, Layers tab, sticker Edit panel, tab bar of five, wiring in `StudioView` (media source wrapped once); jsdom tests.
5. Browser verification. 6. Checks, review, fix pass, finish.
