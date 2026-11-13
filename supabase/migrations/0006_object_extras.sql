-- One flexible column for newer per-object settings (story track membership,
-- transitions, text animations, effects, page number...). Keeping them in a
-- single jsonb column means later features don't each need a migration.
-- Run in the Supabase SQL Editor after 0001-0005.

alter table public.canvas_objects
  add column if not exists extras jsonb not null default '{}'::jsonb;
