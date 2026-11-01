# Studio Cutover (Editor Port, Slice 7)

**Goal:** The studio becomes the editor. Projects, new projects and templates from the dashboard open in it; the old canvas editor, its stores, hooks and export code are deleted; the dashboard pieces moved here from earlier slices (new project and template creation, duplicate project, project thumbnails) work on the clip model; and the studio gets the welcome tour and a phone layout the old editor had.

**Spec:** `docs/superpowers/specs/2026-10-30-editor-port-design.md`, slice 7 and section 3 ("Slice 7 switches the links, removes the old editor, stores and tables, and the route becomes /editor/[id]").

**Safety rules for this slice:**
- Everything is on branch `feature/studio-cutover`; deletions are ordinary git deletions and can be undone by reverting the commit.
- No database change is run. Dropping the old canvas tables is written as `supabase/pending/0007_drop_old_canvas_tables.sql` for the user to read and apply themselves, after they have opened real projects in the studio.
- Old data is test data (decided at the start): old projects open as empty timelines in the studio and nothing is migrated.

**Builder's calls:**
- The studio's route files move to `src/app/editor/[id]/`; `/studio/[id]` stays as a redirect to `/editor/[id]` so links made during development keep working. Dashboard links already point at `/editor/[id]`.
- New project from the dialog: blank (frame from settings) or a template, written straight into the project row as a timeline (`save` at revision 0) plus the frame size. Both now open the editor (blank used to return to the dashboard; opening the editor is what a user wants).
- Duplicate project copies the row's timeline, frame size and thumbnail path in one insert.
- Thumbnails: the studio renders the project's first visible moment off screen (same renderer as export), 480 px JPEG, about 5 s after edits stop, and saves it through the environment; failures are ignored (a thumbnail is never worth an error).
- Features of the old editor that are **not** ported and disappear with it: the user's own uploaded stickers (`use-sticker-store`, Supabase `custom_stickers`), custom font upload (`use-custom-font-store`), highlights/shadows-tone/sharpness filters, AI background/object removal flags. They are listed in the final report. Their stores and tables are left in place (not needed to delete).
- The welcome tour is rewritten for the studio's own layout (steps pointing at the toolbar, tabs, stage and timeline). The phone layout opens the sidebar as a bottom sheet from a "Tools" button; the timeline stays below the stage.

## Global Constraints
- CRLF files: Edit/Write, or node scripts that normalise `\r\n`; no apostrophes inside single-quoted `node -e`; avoid `$&` in replacement strings.
- Pure files (`src/lib/*`) have no `document`, `window`, timers.
- jsdom tests start with `// @vitest-environment jsdom` + `import "@/test/dom-setup";`.
- `npx vitest run`, `npx tsc --noEmit`, `npx eslint`; PATH needs `/c/Program Files/nodejs`. Before `npm run build` delete `.next` entirely.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus
- After the deletions nothing imports a deleted module (tsc, build), nothing in the studio lost a helper it needed (alignment, curved text, ...), and dead test files are gone with their code, not skipped.
- Creating a project from a template writes a loadable timeline (revision 0 matches the column default; the studio then loads it with `parseTimeline`) and the frame; a failure leaves no half-made project the user cannot open or an error they cannot see.
- Duplicate: the copy has its own id, a name with "(Copy)", the same timeline and frame; unfilled slots and `asset:` ids survive; the original is untouched.
- Thumbnails: never throws into the UI, never runs before load or during a gesture, cleans up its renderer, does not hammer the server (debounce), tainted-canvas failure (signed URLs without CORS) is swallowed.
- Redirects and protected routes: `/editor/[id]` and the `/studio/[id]` redirect require login; middleware prefixes still right.
- Tour and mobile layout do not steal keyboard shortcuts or focus, the tour's targets exist, and the sheet closes after an add.

## Tasks
1. Project creation on the clip model (`write-template-project`, `thumbnailTime`, `copyProjectFields`; pure and tested), then the dialog, template gallery and `duplicateProject`.
2. Thumbnails in the studio (hook + env).
3. Route move and redirect.
4. Delete the old editor; make tsc green; delete dead tests; keep what the studio uses.
5. The pending database migration file.
6. Welcome tour and phone layout.
7. Browser verification, checks, review, fix pass, finish.
