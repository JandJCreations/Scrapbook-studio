-- Per-track settings for newer audio features (voiceover tracks and
-- automatic music ducking). Run in the Supabase SQL Editor after 0006.

alter table public.audio_tracks
  add column if not exists extras jsonb not null default '{}'::jsonb;
