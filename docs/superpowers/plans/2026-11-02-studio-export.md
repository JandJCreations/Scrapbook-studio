# Studio Export and Version History (Editor Port, Slice 6)

**Goal:** Export a studio project as a picture (PNG, JPG, PDF) or an animation or video (GIF, MP4, MOV, WebM) with its mixed sound, and keep named versions of a project that can be restored. Both work on the clip model and the same painter that draws the stage, so what is exported is what is seen.

**Spec:** `docs/superpowers/specs/2026-10-30-editor-port-design.md`, slice 6 (decision 7: reuse the capture, FFmpeg and mixdown building blocks, pointed at the new painter and model; no new codec work).

**Builder's calls:**
- A separate off-screen painter renders each export frame at the project's frame size and the chosen resolution, so the editor's stage, zoom and playhead are never touched during an export.
- Video clips are drawn from their own hidden video elements, seeked to each frame's source time and waited for (frame-exact, not real time). Pictures are loaded and waited for. Text fonts are loaded before rendering.
- Empty template slots are left out of an export (they are stand-ins, not content); the dialog says how many.
- Sound is mixed offline from `planMixdown` (volume, mute, fades, speed, solo), including the sound of video clips, then handed to FFmpeg as a WAV, as the old export did. Reversed clips follow the plan (reversed samples).
- Stills export the frame at the playhead. Animated formats export from 0 to the project's end at 15, 24, 30 or 60 fps (default 30). Resolution presets and the transparency switch (PNG, GIF, WebM) are the existing ones; transparency removes the black page behind the picture.
- The FFmpeg command line is rebuilt in a new tested module; the old export files are not edited.
- Version history: manual only. Save with an optional label, restore (as one undoable edit that also restores the frame size), delete. It uses the storage interface the editor already has (`saveVersion`, `listVersions`, `loadVersion`, `deleteVersion`), so it works against Supabase and the harness's memory storage alike.

## Global Constraints
- Branch `feature/studio-export`; never commit to `main`; old editor, old export files and dashboard untouched.
- CRLF files: Edit/Write, or node scripts that normalise `\r\n`; no apostrophes inside single-quoted `node -e`; avoid `$&` in replacement strings.
- Pure files (`src/lib/export/studio-*`, `encode-args`, `export-plan`) have no `document`, `window`, timers.
- jsdom component tests start with `// @vitest-environment jsdom` + `import "@/test/dom-setup";`.
- `npx vitest run`, `npx tsc --noEmit`, `npx eslint`; PATH needs `/c/Program Files/nodejs`. Before `npm run build` delete `.next` entirely.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus
- Exported frames match the stage: crop, look (filters, rounded corners, border, shadow), text, stickers, keyframes and fades at each time; hidden tracks and placeholders excluded; frame times exact (no off-by-one at the last frame, 0 length projects).
- Video seeking: waits for `seeked`, handles clips that start mid-source, speed, reversed (silent live, but pictures?), a video that fails to load, two clips from one file, memory (frames written to FFmpeg's in-memory disk one at a time; very long projects).
- Audio: gain envelopes, speed, reversed, trims, solo/mute, clips that fail to decode, silence (no audio track passed to FFmpeg).
- Cancel and failure: abort mid-render leaves no leaked elements, object URLs, FFmpeg files or an open dialog state; errors reach the user.
- Version restore: one undo step, frame restored, selection cleared, project id kept; labels; list order; failure messages.

## Tasks
1. **Version history**: dialog + toolbar button; restore op; tests with memory storage.
2. **Pure export pieces** (tested): `export-plan.ts` (frame times, exportable project without slots, stills time), `encode-args.ts` (FFmpeg arguments), `audio-schedule.ts` (offline mix scheduling math).
3. **Painter**: `capture()` at a size, optional transparent page.
4. **Browser renderer and mixdown**: `studio-frame-renderer.ts`, `studio-audio-render.ts`, `studio-export.ts` orchestrator.
5. **Export dialog** and toolbar button; jsdom tests with a fake exporter.
6. Browser verification (PNG, a short MP4 or GIF with sound), checks, review, fix pass, finish.
