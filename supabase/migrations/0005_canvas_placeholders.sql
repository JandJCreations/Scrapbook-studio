-- Adds support for empty "tap to fill" template slots (image or video).
-- Run in the Supabase SQL Editor after 0001-0004.

alter table public.canvas_objects
  add column is_placeholder boolean not null default false;
