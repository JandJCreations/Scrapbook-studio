# Studio extras (slice 10)

Brings back what the cutover dropped, in three parts, each test-first.

**A. Multi-select add + tour focus.** Media panel gets a Select mode: tick several items, "Add N to the sequence" / "as overlays" adds them one after another. The welcome tour keeps focus inside (refocus Next on every step, give focus back to the opener on close).

**B. Group/ungroup + snap to grid.** `Clip.groupId` already exists in the model. Selecting any clip of a group selects the whole group (done in the store's `setSelectedClipIds`, so stage, timeline and layers all agree); `groupClips` / `ungroupClips` ops; duplicate keeps groups (copies get a fresh group id); Group/Ungroup buttons in the selection toolbar. Grid: a toggle in the stage's corner controls draws a grid and snaps dragged clips to it (alignment guides take priority when they apply); `snapToGrid` already exists in `lib/canvas/alignment.ts`.

**C. Custom fonts + own pictures as stickers.**
- Fonts: a font registry (`lib/fonts/custom-fonts.ts`) that `loadGoogleFont` consults first, so the painter, export and thumbnails all find an uploaded font by its family name; Supabase env fetches the user's `custom_fonts` rows (table already exists), registers them, and uploads new ones; the Text tab's font picker lists them and has an upload button. Optional `StudioEnv.customFonts`.
- Stickers: rather than reviving the separate `custom_stickers` table and its URL plumbing, a picture from the user's media library can be added as a sticker clip ("Sticker" button on image rows in the Media tab). Same upload flow, same URL resolution, no migration. Old `custom_stickers` rows are not shown (test data).

**Review focus:** selection expansion cannot loop or trap (shift-click to deselect a grouped clip), locked clips in groups, duplicate/delete of groups; grid snap does not fight guides and never snaps when off; multi-add failure of one item does not stop the rest and errors are visible; custom font family names cannot break the CSS font strings, a font that fails to load never blocks painting or export; no secrets or signed URLs persisted in the project.
