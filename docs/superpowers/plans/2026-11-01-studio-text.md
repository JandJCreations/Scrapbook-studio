# Studio Text (Editor Port, Slice 2)

**Goal:** Add text to a studio project: a text clip that is drawn on the stage with the same look the old editor had (font, size, colour, alignment, gradient, stroke, glow, shadow, letter spacing, line height, curve, opacity), an "Add text" button, a text panel for the selected text clip, and double-click editing on the stage. Text is a normal clip on its own overlay track, so it moves, resizes, rotates, trims, undoes and saves like everything else.

**Spec:** `docs/superpowers/specs/2026-10-30-editor-port-design.md` (slice 2). Builds on slice 1 (`2026-10-30-studio-shell.md`).

**Not in this slice:** uploading custom fonts (needs Supabase; later), keyframes, text animation presets, bulleted/rich text.

**Builder's calls:**
- Default text: 60% of the frame wide, font size 7% of the frame height, 5 seconds, placed at the playhead on its own new top overlay track, selected, with the sidebar switching to the Text tab.
- The clip's `name` follows its content (first 24 characters, `Text` when empty) so the timeline chip reads well.
- Opacity: `adjustments.text.opacity` (0 to 100) multiplies the clip's own opacity.
- Fonts come from the existing Google fonts catalog; the painter asks for a font when a text clip uses it and redraws once it has loaded.
- Panel slider and colour changes preview live and commit as one undo step; switches, buttons and the font list apply at once.
- Studio gets its own small panel controls (not imports from the old editor, which is deleted in slice 7).

## Global Constraints
- Branch `feature/studio-text` (created). Never commit to `main`. Old editor files untouched.
- Files are CRLF: use the Edit/Write tools, not node string replace.
- Pure files (`src/lib/text/*`, `src/lib/editor/*`) must not touch `document`, `window`, timers or clocks.
- Component tests: `// @vitest-environment jsdom` + `import "@/test/dom-setup";`. Konva painter code is verified in the browser (`/dev/studio`).
- Run: `npx vitest run <file>`, `npx tsc --noEmit`, `npx eslint <paths>`; PATH needs `/c/Program Files/nodejs`.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus
- Text drawn by the painter matches the selection box and survives resize/rotate; curved text and glow/shadow/stroke/gradient render; no per-frame re-layout cost for static text.
- Panel edits are one undo step each; typing in the panel or the stage editor never triggers timeline keys; Escape cancels stage editing without a change.
- A font that has not loaded yet falls back and then redraws; an unknown font never crashes.
- Editing text while playing, locked text clips, text on a hidden track.

## Tasks

1. **Text node specs (pure)** — `src/lib/text/text-nodes.ts` + test. `buildTextNodes(adj, size, curved)` returns Konva attribute specs: optional glow nodes first (listening false, shadow = glow), then the text nodes; straight text is one node (width/height from the box, align, verticalAlign middle, fontStyle bold at weight >= 700, letterSpacing, lineHeight, gradient via fillLinearGradient* when enabled else `fill`, stroke only when enabled, shadow props, opacity = adj.opacity/100); curved text is one node per character at `size.width/2 + c.x`, `size.height/2 + c.y`, rotation `c.rotation` (no gradient, as the old editor). Also `textKey(adj, size)` a stable string for change detection. Tests: straight defaults; gradient has no `fill`; stroke off gives `strokeWidth 0` and no stroke colour; shadow enabled flag; glow adds a leading node; curved gives one node per char with offsets; opacity scaling; `textKey` changes when content or size changes and not otherwise.
2. **Scene text content (pure)** — `scene.ts`: `SceneContent` gains `{ type: "text"; adjustments: TextAdjustments }`; a text clip with `adjustments.text` yields it, without it falls back to the placeholder. Update `scene.test.ts` (the text case) and add the fallback case.
3. **Painter draws text** — `scene-painter.ts`: per clip a text group holding pooled `Konva.Text` nodes; on a `text` content apply `buildTextNodes(...)` (curved layout via `layoutCurvedText`, memoised by `textKey`), hide image/placeholder; new options `requestFont(family)` (called each render for text clips; idempotent) and `invalidateText()` on the returned painter to force a redraw after a font loads. `useStudioPlayback` passes `requestFont = loadGoogleFont(f).then(() => { painter.invalidateText(); session.wake(); })`.
4. **Text ops (pure)** — `ops.ts`: `TEXT_SECONDS = 5`, `addText(project, frame, at, newId?) -> AddResult` (new top overlay track, kind `text`, `mediaId ""`, `sourceDuration null`, 5 s, centred box, default adjustments with scaled font size), `patchTextAdjustments(project, clipId, patch) -> project` (merges into `adjustments.text`, updates `name`, returns the same project for unknown/non-text/locked/no-change), `resetTextAdjustments(project, clipId, frame)`. Tests for each, including name sync, locked clip, nested patch merge, and that content "" becomes name "Text".
5. **Panel controls + TextPanel** — `src/components/studio/panel-controls.tsx` (`PanelSlider` with live `onChange` and `onCommit`, `PanelColor`, `PanelToggleSection`) and `text-panel.tsx` (`TextPanel({ clip, onPreview(patch), onCommit(), onApply(patch), onReset() })`): content textarea, font select (Google catalog, load on change), align buttons, bold switch, colour, size, letter spacing, line height, curve, opacity, and gradient / stroke / glow / shadow sections. jsdom tests: changing a switch calls `onApply` with the right nested patch; a slider change calls `onPreview` and release calls `onCommit` (use the controls' own callbacks directly, since Radix sliders do not drag in jsdom); font choice calls `onApply({ fontFamily })`; align buttons.
6. **Sidebar tabs, Add text, panel wiring** — `StudioView`: sidebar `Tabs` Media | Text; Text tab has an "Add text" button and, when exactly one selected clip is text, the `TextPanel` wired to the store (`previewApply`/`endGesture`/`apply`); selecting a text clip switches to the Text tab. Extend `studio-view.test.tsx`: Add text creates a selected text clip on a new overlay track and shows the panel; a panel switch edit changes `adjustments.text` and is one history entry.
7. **Stage editing** — `StageInteraction` gets `onEditText(clipId)` (double-click on a text box, only text clips) and `StudioStage` renders `TextEditOverlay` (textarea positioned from the stage fit and the clip's box, rotated about its top-left; Enter without Shift or blur commits via `apply(patchTextAdjustments)`, Escape cancels). jsdom test for the overlay's commit/cancel/empty->"Text" behaviour.
8. **Browser verification** — `/dev/studio`: add text; drawn with default look; resize/rotate/move; edit content on stage (double-click) and in panel; change font (loads), colour, curve, glow, shadow, stroke, gradient; undo each as one step; text timeline chip shows the content; play through the text clip's range; delete and undo. Console clean.
9. **Whole-branch checks, review, fixes, finish.**
