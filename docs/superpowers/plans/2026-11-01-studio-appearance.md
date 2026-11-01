# Studio Appearance and Audio (Editor Port, Slice 3a)

**Goal:** Photos and videos can be adjusted (brightness, contrast, saturation, exposure, blur, filter presets, flip, border and rounded corners, shadow, glow, opacity), music and video sound can be mixed (volume, mute, fades, speed), and a small toolbar over the stage offers duplicate, lock and delete. Everything is a normal undoable edit on the clip.

**Slice 3 is split.** 3a (this plan): the look and sound panels and the selection toolbar. 3b (next): keyframes (add, remove, drag-to-animate on the stage) and crop.

**Spec:** `docs/superpowers/specs/2026-10-30-editor-port-design.md`, slice 3.

**Builder's calls:**
- The look is drawn with the browser's canvas filter (`ctx.filter`: brightness, contrast, saturate, blur), for images and video alike. Exposure is folded into brightness. Highlights, shadows tone and sharpness (the old editor's pixel filters) are not ported: they cannot run on live video and the old editor froze them to stills. Safari without canvas filters shows pictures unadjusted.
- Opacity edits `transform.opacity` (0 to 1) for every clip kind; `adjustments.photo.opacity` and `adjustments.video.opacity` are ignored.
- Photo adjustments exist only on image clips and video adjustments on video clips; the panel creates the defaults the first time a control is used.
- Shadow is a drop shadow of the picture; glow is a coloured shadow of a backing rectangle the size of the clip. If both are on, the shadow draws on the picture and the glow behind it.
- Selection toolbar: duplicate, lock/unlock, delete (delete prunes empty tracks). Layer ordering and grouping belong to slice 4 (layers).
- New "Edit" tab in the sidebar; selecting an image, video or audio clip opens it (text clips still open Text).
- Reverse and loop are not exposed (the engine does not play reversed or looped clips yet).

## Global Constraints
- Branch `feature/studio-appearance`; never commit to `main`; old editor files untouched.
- CRLF files: use Edit/Write, or node scripts that normalise `\r\n` and avoid `$` in replacement strings.
- Pure files (`src/lib/appearance/*`, `src/lib/editor/*`) have no `document`, `window`, timers.
- jsdom component tests start with `// @vitest-environment jsdom` + `import "@/test/dom-setup";`.
- Run `npx vitest run`, `npx tsc --noEmit`, `npx eslint`; PATH needs `/c/Program Files/nodejs`.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus
- Look drawn on stage matches the panel; neutral clips take the fast path (no filter, no extra nodes); border, radius, flip, shadow and glow do not misalign the selection box or leak after being turned off.
- Panel edits are one undo step each; an open panel edit is closed by any other gesture (same rule as the text tab); selection change never applies one clip's pending patch to another.
- Volume, mute, fades and speed actually reach the engine (check the pool/graph read `clip.volume`, `muted`, fades, `speed`) and a speed change keeps the timeline consistent.
- Locked clips: panels and toolbar do nothing harmful.
- Toolbar actions on multi-selection; delete leaves a sensible selection.

## Tasks
1. **Look (pure)** `src/lib/appearance/look.ts` + test: `Look` = `{ filter: string, flipX, flipY, border: {width,color,radius}, shadow: ShadowEffect | null, glow: GlowEffect | null }`; `lookFor(clip): Look | null` (null for kinds without a look and for neutral looks). Mapping: factor = (1+brightness/100)*(1+exposure/100) with the preset's deltas added first (`FILTER_PRESETS`); contrast `1+c/100`; saturation `1+s/100` (floored at 0); blur px; `"none"` when nothing applies. Video uses brightness/contrast/saturation/blur/shadow only.
2. **Scene carries the look** `scene.ts`: `SceneItem.look: Look | null`. Test.
3. **Painter draws the look** `scene-painter.ts`: image node `sceneFunc` wrapper setting `ctx.filter` for the draw; flip via scale/offset; rounded clip; border rectangle on top; shadow on the image; glow backing rectangle. Fast path when `look` is null (remove extras, `filter none`). Verified in browser.
4. **Edit ops (pure)** `ops.ts`: `patchPhotoAdjustments`, `patchVideoAdjustments` (create defaults on first use, no-change returns same project, locked refused), `setClipOpacity`, `patchAudio(project, clipId, {volume, muted, fadeIn, fadeOut})` via `updateClip`, plus re-export of `setSpeed` use. Tests.
5. **Edit panels** `look-panel.tsx` (photo and video controls), `audio-panel.tsx` (volume, mute, fades, speed), `edit-tab.tsx` wiring (preview/commit/apply, same pending-patch + pointerdown rule as `TextTab`). jsdom tests for panels' callbacks and for the tab's wiring in `studio-view.test.tsx`.
6. **Sidebar tab Edit + auto-switch** in `StudioView`.
7. **Selection toolbar** `selection-toolbar.tsx` over the stage: duplicate, lock/unlock, delete; jsdom tests; mounted in `StudioStage`.
8. **Browser verification**, **9. checks, review, fix pass, finish.**
