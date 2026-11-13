# Editor Port: Scrapbook Features onto the Clip Timeline

Date: 2026-10-30. Continues `2026-10-14-clip-timeline-design.md` (section 10, steps 5 to 7). The model, editing core, persistence, playback engine and timeline UI exist and are merged; this document covers moving the real editor onto them.

## 1. Goal and why

The app today has two halves that do not meet. The **old editor** (`/editor/[id]`) edits "canvas objects" (photos, video, text, stickers) with a free-form Konva canvas, a separate audio store, and its own save path into `canvas_objects` / `audio_tracks` / `audio_clips` tables. The **new engine** has a unified clip and track model, a real timeline, frame-accurate playback, undo/redo, and one JSON column per project, but it is only reachable from a developer test page.

The goal is a single editor that does what the old one does (scrapbook layouts, text, stickers, templates, photo and video adjustments, audio, export) on the new model, so it also does what the old one could not: edit video properly (cut, trim, reorder, speed, reverse), mix music, and lay photos and clips over each other on a real timeline, with undo/redo and frame-accurate preview.

**Success** means the user can make the thing they described when this project began: photos and videos set to music, plus collages, in one editor, and the old editor, its stores and its tables can then be deleted.

## 2. Goals, non-goals, anti-goals

**Goals**
- Parity with the features that matter in the old editor (section 5), delivered in slices that each leave the app working.
- Direct manipulation stays direct: drag, resize and rotate on the canvas; the timeline controls *when*, the canvas controls *where* (spec 6, "Scrapbook behaviour").
- Everything edits the one clip store, so undo/redo, autosave, playback and export all see the same truth.

**Non-goals**
- Migrating old projects: the existing data is test data (decided at the start of the project). The new editor starts projects empty; old tables are dropped at the end.
- New creative features that the old editor lacked (transitions, effects library, captions). Out of scope until the port is finished.
- Pixel-identical rendering of every old filter. Equivalent looks are enough.

**Anti-goals (would make this a failure even if it technically works)**
- A cutover that loses a feature the user relies on without saying so.
- Two editors that drift: the old one is frozen, not maintained, from the first slice on.
- Slow editing: dragging or typing must never wait on thumbnails, saving or media loading.

## 3. Approach: build beside, cut over once

The new editor lives at **`/studio/[id]`**, built next to the old one. Dashboard links keep pointing at `/editor/[id]` until slice 7. This keeps `main` shippable at every step and lets each slice be tested on its own. Slice 7 switches the links, removes the old editor, stores and tables, and deletes `/studio`'s temporary name (the route becomes `/editor/[id]`).

A **developer harness** (`/dev/studio`, 404 in production) mounts the same editor view against in-memory storage and local files. It exists so each slice can be driven in a real browser without a login or a database, the way `/dev/playback` was for the engine. The real route is composition of tested parts and is checked end to end once the user has applied the Supabase migration and signed in.

## 4. Architecture of the new editor

```
/studio/[id]  (server page) -> StudioClient (dynamic, ssr:false) -> StudioView
StudioView
 ├─ Toolbar        name, undo/redo, save status, zoom, export, back
 ├─ Sidebar        tabs: Media | Assets | Layers      (slices 1, 4)
 ├─ Stage          painter (content) + interaction layer (select/move/resize/rotate)
 ├─ Inspector      contextual panel for the selected clip (text, photo, video, audio)
 └─ TimelineView   the timeline from plans 4a to 4c
```

- **State:** `useClipProjectStore` (timeline), `useTransportStore` (playhead), a `PlaybackSession` per mounted editor. A small `useStudioUiStore` holds only UI state (sidebar tab, panels open). Selection lives in the clip store (already does).
- **Persistence:** `useTimelineSync` (exists) loads and autosaves `projects.timeline`; the frame size travels with it.
- **Media URLs:** a hook resolves signed URLs for every Storage-backed `mediaId` in the project (`resolveMediaUrls`, exists), refreshes before they expire, and exposes `urlFor(mediaId)` to the playback session, the painter and the timeline thumbnails. Bundled stickers and template art use non-UUID ids (`asset:<id>`) resolved from the bundled catalog.
- **Stage rendering:** content keeps going through the existing Konva painter (video frames, pictures, later text and stickers). Interaction is a separate, non-drawing Konva layer: one transparent hit rectangle per visible clip plus a `Transformer`; dragging or transforming calls the store's gesture API (`previewApply` / `endGesture`) with the clip's new `transform`, so a drag is one undo step. This is the same pattern the timeline uses.
- **Editing operations** are pure functions in `src/lib/editor/` (add media as sequence or overlay, add text, add sticker, set transform, reorder layers, prune empty tracks), unit-tested, then wrapped by thin UI.

## 5. What the old editor does, and where each piece goes

| Old feature | New home | Slice |
|---|---|---|
| Open project, load/save, error and retry states | `useTimelineSync` + `StudioView` states | 1 |
| Media library panel; add to canvas | Media tab; add as sequence clip or overlay clip | 1 |
| Select, drag, resize, rotate on canvas | Interaction layer with `Transformer` | 1 |
| Frame size presets | Frame in the timeline snapshot; toolbar picker | 1 |
| Playback, scrubbing | Transport + timeline (exists) | 1 |
| Add and edit text; text panel (font, colour, shadow, curve) | Text clips; in-place editor; inspector panel | 2 |
| Photo adjustments, crop; video adjustments | `Clip.adjustments`; inspector panels; painter filters | 3 |
| Audio clips, volume, fades, loop | Audio clips on audio tracks; inspector panel | 3 |
| Keyframes (animate position, rotation, opacity) | `Clip.keyframes` (exists in the model); inspector UI | 3 |
| Selection toolbar (duplicate, delete, lock, group, order) | Selection toolbar over the stage | 3 |
| Stickers, frames, washi tape, textures (assets) | Sticker clips from the bundled catalog | 4 |
| Layers panel | Layers tab: overlay tracks top to bottom | 4 |
| Templates; new-project format picker; placeholder fill | Template to clips; placeholder clips | 5 |
| Duplicate project, project thumbnails | Copy the timeline; capture from the painter | 5 |
| Export: PNG/JPG/PDF; GIF/MP4/WebM/MOV with audio | Painter capture at target size + FFmpeg; `planMixdown` for sound | 6 |
| Version history | Timeline snapshots (`serializeSnapshot`, exists) | 6 |
| Welcome tour, mobile create bar, mobile layout | Ported to the new view | 7 |
| Old stores, tables, components | Deleted | 7 |

## 6. Decisions made (the builder's calls, not the user's)

1. **Layer order is track order.** Every scrapbook element (photo, text, sticker) is added on its own new overlay track at the top, so "in front of" means "on a track above". No per-clip z-order is added to the model. The timeline already scrolls vertically; a layers panel lists overlay tracks top to bottom and reorders tracks. A "tidy" operation (merge non-overlapping elements onto shared tracks) can come later. *Cost if wrong:* a scrapbook with 40 elements has 40 tracks; acceptable, and the same as how CapCut treats overlays.
2. **Empty tracks are removed** (except the main video track) when their last clip is deleted or moved away, so deleting an element does not leave clutter.
3. **Add button defaults.** From the Media tab, a video or photo is appended to the main sequence (the common case: a film or slideshow); a second "Overlay" action places it on its own overlay track at the playhead, centred at 40% of the frame (the collage case). Audio goes on the audio track at the playhead. Text and stickers are always overlays.
4. **Static elements are 5 seconds long** at the playhead, as in the old editor (`DEFAULT_TIMELINE_DURATION`); the user stretches them on the timeline.
5. **Stickers are clips of kind `sticker`** with a synthetic `mediaId` (`asset:<id>`); their picture comes from the bundled catalog, never from Storage.
6. **Templates** produce overlay clips plus the template's frame size; an unfilled slot is a clip with `isPlaceholder: true`, drawn dashed, filled by the existing tap-to-fill flow.
7. **Export reuses the existing building blocks** (stage capture, FFmpeg, mixdown) pointed at the new painter and the new model; no new codec work.
8. **The old editor is frozen** once slice 1 merges: bug fixes only for data loss.

## 7. Slices

Each slice gets its own plan, branch, real-browser check, fresh review and merge, like the engine and timeline work. Order is chosen so the user can make a real project as early as possible.

1. **Studio shell.** Route, harness, load/save, media URLs, stage with selection/move/resize/rotate, media panel (add as sequence/overlay/audio), toolbar basics, timeline mounted. *Outcome: photos and videos to music, positioned and edited, saved.*
2. **Text.** Text clips rendered by the painter, add text, in-place editing, text panel.
3. **Appearance and audio.** Photo/video adjustment panels and crop, audio panel, keyframes UI, selection toolbar.
4. **Assets and layers.** Sticker clips, asset panel, layers panel.
5. **Templates and dashboard.** Templates to clips, new-project dialog, placeholder fill, duplicate project, thumbnails.
6. **Export and history.** Export dialog on the new model, version history dialog.
7. **Cutover and cleanup.** Switch routes, port tour and mobile layout, delete old editor, stores, tables, and the 0001-era canvas tables.

## 8. Risks

- **Rewrite breadth.** About 11,000 lines of old editor code touch canvas, panels, templates, export and sync. Each slice keeps the build type-clean; a missed consumer is a compile error.
- **Interaction on the new stage.** Hit testing and the transformer must not fight the painter or playback; they are kept in a separate layer, and the gesture API keeps undo clean.
- **Real data and login.** End-to-end checks of `/studio/[id]` need the user's Supabase migration applied and a signed-in session; until then the harness is the proof, and the real route is flagged "composition tested, not yet driven end to end".
- **Mobile.** The old editor invested in phone behaviour (collapsed timeline, create bar). Slice 7 ports it; until then the studio is desktop-first.
- **Browser limits.** Playback, drag feel and frame rate can only be judged in a real Chrome with the window in front (a covered window throttles animation to 2 fps).

## 9. Left to the builder

Exact component names and folder layout (under `src/components/studio/` and `src/lib/editor/`), the inspector's visual design, keyboard shortcuts beyond those already in the timeline, and the details of each slice's operations. Each slice's plan states its own interfaces.
