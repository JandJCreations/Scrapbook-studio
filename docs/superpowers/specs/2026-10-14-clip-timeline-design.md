# Clip Timeline: Unified Clip/Track Editor

Date: 2026-10-14
Status: Draft for review
Branch: `feature/clip-timeline`

## 1. Goal and scope

Turn Scrapbook Studio into a CapCut/iMovie-style video editor by replacing the
layer-based editing model with one unified **track and clip** model that serves
both scrapbook and video projects.

**This spec covers sub-project 1: core clip editing.** That means a multi-track
timeline with split, trim, ripple delete, reorder, snapping, speed, volume,
undo/redo, and the playback, persistence and export work needed to support it.

**Decisions already made**
- Extend Scrapbook Studio rather than build a separate app.
- Build one unified model for scrapbook and video projects (not a separate
  video mode, and not in-place tweaks to the layer timeline).
- Existing projects are test data. No migration is needed; the old schema is
  replaced outright.
- Web app only.

**Out of scope (later sub-projects):** transitions and effects, animated
text/stickers beyond what exists, WebCodecs/faster export, proxy files for 4K
preview, AI features (auto-captions, background removal, beat-sync), and a
phone-first layout. Touch input keeps working at the current touch-target size.

## 2. Current state (what is being replaced)

- Timeline shows one row per canvas object (`timeline-panel.tsx`); each object
  has `startTime`/`endTime`. There are no tracks and no sequential clips.
- Audio has real tracks and clips (`use-audio-store.ts`, `AudioClip`).
- Video trim, speed, reverse and volume live in `VideoAdjustments` and are set
  from a side panel, not on the timeline.
- Every video object runs its own playback loop; audio runs on a separate
  `requestAnimationFrame` loop (`use-timeline-playback.ts`).
- Persistence is relational Supabase tables: `canvas_objects`, `audio_tracks`,
  `audio_clips`, `project_versions`.
- Export captures frames from the Konva stage and encodes with FFmpeg-WASM.
- No general undo/redo was found in the timeline code.

## 3. Data model

A project is an ordered list of **tracks**; each track holds **clips**.

**Track**
- `id`, `projectId`, `type` (`video` | `overlay` | `audio`), `order`
- flags: `muted`, `locked`, `hidden`, `solo`

**Clip**
- `id`, `trackId`, `kind` (`video` | `image` | `text` | `audio` | `sticker`)
- `mediaId` (stable reference; signed URLs are resolved at load)
- `start`: position on the timeline, in seconds
- `sourceIn`, `sourceOut`: trim points in the source media
- `speed` (default 1), `reversed`, `loop`
- `volume`, `muted`, `fadeIn`, `fadeOut`
- `transform`: x, y, width, height, rotation, opacity
- `adjustments`: photo, video or text adjustments (existing types, moved onto
  the clip)
- `keyframes` (existing `Keyframe` type)
- `groupId`, `locked`, `isPlaceholder` (unfilled template slot)

**Derived, never stored:** `duration = (sourceOut - sourceIn) / speed`,
`end = start + duration`. There is no separate end-time field to keep in sync.

**Main-track behaviour.** The main `video` track is magnetic: clips sit end to
end with no gaps. Deleting or trimming a clip closes the gap (ripple).
`overlay` and `audio` tracks allow free placement and overlap.

**Mapping from today:** canvas image/text objects become `overlay` clips with a
transform; video objects become `video` or `overlay` clips; `AudioTrack` and
`AudioClip` map directly to `audio` tracks and clips.

## 4. Editing core

All edits are **pure functions** in `src/lib/timeline/`: they take a project and
return a new project, with no store or UI access.

Operations: `splitClip(at)`, `trimClip(edge, to)`, `moveClip(to, snap)`,
`rippleDelete`, `deleteClip`, `reorderMainTrack`, `duplicateClip`,
`setSpeed`, `addTrack`, `insertClip`.

**Snapping** targets: the playhead, other clips' edges, and time 0. Snap
threshold is expressed in pixels and converted using the current zoom.

**Undo/redo.** A single timeline store holds the project and a history stack.
Each operation is one undo step; a drag is recorded as one step on release,
not one per mouse move. Undo/redo is bound to `Ctrl+Z` and `Ctrl+Shift+Z`.

**Replaces:** `use-canvas-store.ts` and `use-audio-store.ts` (and the object
rows in the timeline). **Keeps:** the Media panel, text/photo/video/audio edit
panels, Konva rendering, and the dashboard.

## 5. Playback and rendering

**One clock.** A single master playhead in the store, advanced by one loop.
While audio plays it follows the Web Audio clock, the only clock that stays in
sync with sound.

**`activeClipsAt(project, t)`** is a pure function returning the clip playing on
each track at time `t` and its source position:
`sourceIn + (t - start) * speed` (reversed clips count backward). The engine
reads everything from this function.

**Video.** `HTMLVideoElement`s are pooled by media file, not one per clip. The
next clip is preloaded about one second before a cut. During playback the
engine seeks only when drift from the expected position exceeds a threshold;
scrubbing sets time directly.

**Audio.** Replace `HTMLAudioElement` with a Web Audio graph: clip source,
then a gain node (volume and fades), then a track gain node (mute and solo),
then the master output. The export mixdown reuses the same graph.

**Compositor.** The Konva stage draws active clips in track order. A rendered
frame is a pure function of `(project, t)`; export calls the same function, so
preview and export cannot diverge.

## 6. Timeline UI

**Layout.** Preview on top, Media panel on the left, inspector on the right
(reusing the existing panels, shown for the selected clip), resizable timeline
along the bottom.

**Timeline.**
- Overlay tracks above the main track, audio tracks below. Track headers have
  mute, lock, hide and solo. Dragging a clip into empty space creates a track.
- Video clips show a thumbnail strip; audio clips show waveforms (existing
  `waveform.ts`); text and sticker clips show a labelled chip.
- Draggable playhead; clicking the ruler seeks.

**Interactions**
- Drag to move; drag clip edges to trim; everything snaps (section 4).
- Main track: drag shows an insertion marker and reorders.
- `S` / `Ctrl+B` split at the playhead; `Delete` removes; `Shift+Delete` ripple
  deletes; duplicate; shift-click and marquee multi-select.
- Drag from the Media panel onto the timeline; existing multi-select placement
  keeps working.
- `Space` play/pause; arrow keys step one frame; `Ctrl`+wheel zooms.

**Scrapbook behaviour.** Photos and text are overlay clips with a transform.
They are still dragged, resized and rotated directly on the canvas; the
timeline controls only when they appear.

## 7. Persistence

- New tables `tracks` and `clips`. `transform`, `adjustments` and `keyframes`
  are JSON columns on `clips`. Row-level security follows the existing tables'
  pattern (rows belong to the project owner).
- Drop `canvas_objects`, `audio_tracks`, `audio_clips`. No data migration.
- Rewrite `src/lib/sync/project-content-sync.ts`: same debounced autosave, new
  tables, and signed URLs still re-resolved from `mediaId` on every load.
- Update `project_versions` (version history) and the template system
  (`apply-template.ts`, `template-catalog.ts`) to produce and consume clips.
- Regenerate `src/lib/supabase/database.types.ts`.

## 8. Export

Render frame by frame with the shared pure render function, encode with
FFmpeg-WASM as today, and rebuild the audio mixdown from the Web Audio graph.
Faster export is a later sub-project.

## 9. Testing

- Add Vitest as a dev dependency (no test runner exists today).
- Unit tests for every operation in `src/lib/timeline/` (split, trim, move,
  ripple, reorder, snap, speed, undo/redo) and for `activeClipsAt`, including
  edge cases: split at a clip boundary, zero-length results, reversed and
  sped-up clips, overlapping overlays.
- The in-app Browser pane cannot paint frames or run animation frames, so logic
  is verified through these unit tests. Anything needing real canvas rendering
  (drag feel, playback smoothness, export output) is checked manually on a real
  browser.

## 10. Build order

Each step is testable before the next starts. Work happens on
`feature/clip-timeline`; `main` stays working until the branch is ready.

1. Model, editing operations, history store, unit tests.
2. Supabase schema and sync.
3. Playback engine, Web Audio graph, compositor.
4. Timeline UI.
5. Port scrapbook features (text, photos, stickers, templates) onto clips.
6. Export.
7. Remove the old stores and tables.

The app is not usable between steps 2 and 7 on this branch.

## 11. Risks

- **Rewrite breadth.** The old model touches the canvas, panels, templates,
  export and sync; missing a consumer shows up as a type error, so the build
  must stay type-clean at each step.
- **Playback sync.** Audio/video drift and cut stutter are the likeliest
  quality problems and need manual testing on a real browser.
- **Hard to verify here.** Rendering and timing cannot be verified in the
  in-app browser (see section 9).
