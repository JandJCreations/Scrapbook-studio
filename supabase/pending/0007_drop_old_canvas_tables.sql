-- PENDING: not applied, and not in supabase/migrations on purpose.
--
-- The studio editor keeps a whole project in `projects.timeline` (0006). The old
-- editor's three tables below are no longer read or written by any code in the
-- app. Dropping them DELETES THEIR DATA for good (it was test data; nothing was
-- migrated to the new format).
--
-- Before you run this:
--   1. Run supabase/migrations/0006_project_timeline.sql (safe to run twice).
--   2. Open, edit and save a real project in the editor, reload it, and check it
--      is still there.
--   3. If any old project still matters, export it from a copy of the old app
--      first; this file cannot be undone.
-- Then paste this into the Supabase SQL Editor and run it.
--
-- Not touched here: project_versions (version history uses it with the new
-- snapshot format), custom_stickers (the old editor's uploaded stickers; the
-- studio does not offer them yet), and the custom fonts table.

drop table if exists public.audio_clips;
drop table if exists public.audio_tracks;
drop table if exists public.canvas_objects;
