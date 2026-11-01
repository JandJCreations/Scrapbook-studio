# Studio Keyframes and Crop (Editor Port, Slice 3b)

**Goal:** Animate a clip's position, rotation and opacity with keyframes (add and remove them at the playhead; once a clip has keyframes, dragging, rotating or changing opacity on it writes a keyframe at the playhead), and crop pictures and videos (aspect presets, zoom and pan) with the painter drawing only the cropped part.

**Spec:** `docs/superpowers/specs/2026-10-30-editor-port-design.md`, slice 3. Follows 3a (`2026-11-01-studio-appearance.md`).

**Builder's calls:**
- Keyframes hold x, y, rotation, opacity (the existing model). Size is not animated: resizing an animated clip changes its box for the whole clip.
- A new keyframe starts from what the clip looks like at that moment (interpolated), so adding one never makes a jump. Keyframe times are seconds from the clip's start. A keyframe within 0.04 s of the playhead is updated instead of duplicated.
- Removing the last keyframe makes the clip static again at that keyframe's values.
- Keyframes list lives in the panel (time, go-to, delete, remove all). Diamonds on the timeline chips are not in this slice.
- Crop is stored as a rectangle in the file's natural pixels (`adjustments.photo.crop` / `adjustments.video.crop`, as the old editor did). Cropping keeps the box's width and centre and changes its height to the crop's shape so nothing stretches; clearing the crop restores the file's own shape. The panel needs the file's natural size, which it reads from the media URL (cached per file).
- Crop UI: aspect buttons (Original, 1:1, 4:3, 16:9, 9:16, 3:4), Zoom (1x to 5x), and Left-right and Up-down position sliders; no drag handles in this slice.

## Global Constraints
- Branch `feature/studio-keyframes`; never commit to `main`; old editor untouched.
- CRLF files: use Edit/Write or node scripts that normalise `\r\n` and avoid `$&` in replacement strings.
- Pure files (`src/lib/editor/*`, `src/lib/appearance/*`) have no `document`, `window`, timers.
- jsdom component tests start with `// @vitest-environment jsdom` + `import "@/test/dom-setup";`.
- Run `npx vitest run`, `npx tsc --noEmit`, `npx eslint`; PATH needs `/c/Program Files/nodejs`. Before `npm run build`, delete `.next` entirely (OneDrive locks old files).
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus
- Stage gestures on an animated clip: one undo step per drag; a multi-select drag mixing animated and plain clips; rotation and resize; the playhead moving (playback) during a gesture; a clip whose keyframes sit before/after the playhead.
- Keyframe ops never produce unsorted/duplicate times or out-of-range times, and never break `clipDrawState`'s assumptions.
- Splitting, duplicating, trimming and speed changes of an animated clip keep keyframes sensible (existing split code handles keyframes; check duplicate and speed).
- Crop: painter draws exactly the crop for stills, video and filtered/rounded paths; selection box matches; changing crop mid-playback; natural size unknown or failing to load; cropped clips with flip, border radius, shadow.

## Tasks
1. **Keyframe ops (pure)** `src/lib/editor/keyframes.ts` + test: `upsertKeyframe`, `removeKeyframe`, `clearKeyframes`, `setOpacityAt`, `KEYFRAME_MERGE_SECONDS`.
2. **Stage patches (pure)** `applyStagePatches(project, patches, time)` in `src/lib/editor/stage-patches.ts` + test; `StageInteraction` uses it and animated clips become draggable and rotatable.
3. **Crop (pure)** `src/lib/appearance/crop.ts` (`cropFor`, `controlsFromCrop`, `CROP_ASPECTS`) + test; `setCrop` op in `ops.ts` (box reshape, photo and video) + test; `Look.crop`; painter draws the crop.
4. **UI** `KeyframesSection`, `CropSection`, natural-size hook; wire into `EditTab` and `TextTab`; opacity edits on animated clips write keyframes. jsdom tests.
5. **Browser verification.** 6. **Checks, review, fix pass, finish.**
