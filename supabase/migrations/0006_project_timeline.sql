-- Stores the unified clip/track timeline as one JSON document per project.
-- Run in the Supabase SQL Editor after 0001-0005.
-- Additive: canvas_objects / audio_tracks / audio_clips are untouched and
-- keep working. The existing RLS policy on public.projects already covers
-- both new columns.

alter table public.projects
  add column if not exists timeline jsonb,
  add column if not exists timeline_rev integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_timeline_is_object'
  ) then
    alter table public.projects
      add constraint projects_timeline_is_object
      check (timeline is null or jsonb_typeof(timeline) = 'object');
  end if;
end $$;
