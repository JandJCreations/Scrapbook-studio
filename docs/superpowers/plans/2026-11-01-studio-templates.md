# Studio Templates and Placeholders (Editor Port, Slice 5)

**Goal:** Start a project from one of the eight templates inside the studio, and fill a template's "tap to add" slots with your own photos and videos. A template becomes ordinary clips (text, stickers, empty slots) plus a frame size, so everything stays editable, animatable and undoable.

**Spec:** `docs/superpowers/specs/2026-10-30-editor-port-design.md`, slice 5 (decision 6: templates produce overlay clips plus the template's frame; an unfilled slot is a clip with `isPlaceholder: true`).

**Moved to slice 7 (cutover), on purpose:** the "new project" dialog, template cards on the dashboard, duplicate project and project thumbnails. They sit in the dashboard and its stores (`use-project-store`, the old canvas stores), which the cutover rewrites; building them twice would be waste. This slice builds what they will call: `templateToProject` and `fillPlaceholder`.

**Builder's calls:**
- A template's objects become overlay clips, first object at the back, each on its own track, all starting at 0 for 5 seconds. The main video track and an audio track are present and empty.
- Text objects become text clips (template text settings over the defaults, with the template's box and rotation). Image objects with catalog art become sticker clips (the art is found by its picture in the catalog). Slots become clips of kind `image` with `isPlaceholder: true`, no media, drawn as a labelled stand-in.
- Applying a template inside the studio replaces the project's contents and sets the frame, as one undo step for the contents; the frame is saved the same way as a frame-size change. If the project is not empty the user must confirm first.
- Filling a slot keeps its box and position: the chosen photo or video is fitted inside the box and centred, the clip becomes a normal picture or video clip, and it lasts 5 s for a photo or the video's length.
- Slots can be filled from the media library list shown in the Edit tab for the selected slot.

## Global Constraints
- Branch `feature/studio-templates`; never commit to `main`; old editor and dashboard untouched.
- CRLF files: Edit/Write, or node scripts that normalise `\r\n`; no apostrophes inside single-quoted `node -e`; avoid `$&` in replacement strings.
- Pure files (`src/lib/*`) have no `document`, `window`, timers.
- jsdom tests start with `// @vitest-environment jsdom` + `import "@/test/dom-setup";`.
- `npx vitest run`, `npx tsc --noEmit`, `npx eslint`; PATH needs `/c/Program Files/nodejs`. Before `npm run build` delete `.next` entirely.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus
- Every template converts without throwing and draws: all eight, text defaults, rotation, stacking order, frame size.
- Slots: drawn and selectable but never played or looked up (no media id), survive save/reload (`isPlaceholder`, empty `mediaId` must pass the timeline document parser), and cannot be exported as if filled (note for slice 6).
- Applying a template: one undo step, selection and playhead sensible, frame change saved once and reverted on failure, confirmation when the project has content.
- Filling: kind change image to video, durations, transform fit, `justAdded`-style tab behaviour, locked slot, undo.

## Tasks
1. **Template to project (pure)** `src/lib/templates/template-to-project.ts` + test over every template.
2. **Placeholders**: scene draws a slot as a stand-in; `fillPlaceholder` op; tests; check the saved-document parser accepts slots.
3. **UI**: Templates section in the Assets tab with confirm; slot fill panel in the Edit tab; wiring in `StudioView`; jsdom tests.
4. Browser verification. 5. Checks, review, fix pass, finish.
