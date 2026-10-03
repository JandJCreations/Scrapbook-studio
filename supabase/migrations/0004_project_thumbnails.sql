-- Rename projects.thumbnail_url -> thumbnail_path.
-- The column is meant to store a private Storage path (like
-- media_items.thumbnail_path), not a signed URL — signed URLs expire after
-- 24h, so storing one directly would go stale. The app resolves this path to
-- a fresh signed URL on every fetch, same as it already does for media.
-- Run in the Supabase SQL Editor after 0001-0003.

alter table public.projects rename column thumbnail_url to thumbnail_path;
