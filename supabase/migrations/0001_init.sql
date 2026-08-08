-- Scrapbook Studio — initial schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- Helper: keep updated_at fresh
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- profiles — one row per auth user
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profile + default settings row whenever a new user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.user_settings (owner_id) values (new.id);
  return new;
end;
$$;

-- ============================================================
-- user_settings — one row per user, editor defaults
-- ============================================================
create table public.user_settings (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  default_export_format text not null default 'png',
  default_resolution_id text not null default '1080p',
  default_frame_preset_id text not null default 'landscape',
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings: owner all" on public.user_settings
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create trigger set_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

-- Trigger on auth.users must be created after user_settings exists.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- projects
-- ============================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  thumbnail_url text,
  favorite boolean not null default false,
  deleted_at timestamptz,
  frame_width integer not null default 1920,
  frame_height integer not null default 1080,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "projects: owner all" on public.projects
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index projects_owner_idx on public.projects (owner_id);

create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- ============================================================
-- project_versions — version history snapshots
-- ============================================================
create table public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  label text,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.project_versions enable row level security;

create policy "project_versions: owner all" on public.project_versions
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  );

create index project_versions_project_idx on public.project_versions (project_id, created_at desc);

-- ============================================================
-- media_folders
-- ============================================================
create table public.media_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.media_folders enable row level security;

create policy "media_folders: owner all" on public.media_folders
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ============================================================
-- media_items
-- ============================================================
create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  folder_id uuid references public.media_folders (id) on delete set null,
  name text not null,
  type text not null check (type in ('image', 'video', 'audio')),
  mime_type text not null,
  size bigint not null default 0,
  storage_path text not null,
  thumbnail_path text,
  duration double precision,
  status text not null default 'ready' check (status in ('processing', 'ready', 'error')),
  created_at timestamptz not null default now()
);

alter table public.media_items enable row level security;

create policy "media_items: owner all" on public.media_items
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index media_items_owner_idx on public.media_items (owner_id);
create index media_items_folder_idx on public.media_items (folder_id);

-- ============================================================
-- canvas_objects
-- ============================================================
create table public.canvas_objects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  type text not null check (type in ('image', 'video', 'text')),
  name text not null,
  media_id text,
  src text not null default '',
  video_src text,
  x double precision not null default 0,
  y double precision not null default 0,
  width double precision not null default 0,
  height double precision not null default 0,
  rotation double precision not null default 0,
  locked boolean not null default false,
  group_id text,
  adjustments jsonb,
  video_adjustments jsonb,
  text_adjustments jsonb,
  start_time double precision not null default 0,
  end_time double precision not null default 0,
  fade_in double precision not null default 0,
  fade_out double precision not null default 0,
  keyframes jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.canvas_objects enable row level security;

create policy "canvas_objects: owner all" on public.canvas_objects
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  );

create index canvas_objects_project_idx on public.canvas_objects (project_id, sort_order);

create trigger set_updated_at before update on public.canvas_objects
  for each row execute function public.set_updated_at();

-- ============================================================
-- audio_tracks
-- ============================================================
create table public.audio_tracks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  muted boolean not null default false,
  solo boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.audio_tracks enable row level security;

create policy "audio_tracks: owner all" on public.audio_tracks
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  );

create index audio_tracks_project_idx on public.audio_tracks (project_id, sort_order);

-- ============================================================
-- audio_clips
-- ============================================================
create table public.audio_clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  track_id uuid not null references public.audio_tracks (id) on delete cascade,
  media_id text,
  src text not null default '',
  name text not null,
  start_time double precision not null default 0,
  trim_start double precision not null default 0,
  trim_end double precision not null default 0,
  source_duration double precision not null default 0,
  volume double precision not null default 100,
  fade_in double precision not null default 0,
  fade_out double precision not null default 0,
  loop boolean not null default false,
  muted boolean not null default false,
  waveform_peaks jsonb,
  created_at timestamptz not null default now()
);

alter table public.audio_clips enable row level security;

create policy "audio_clips: owner all" on public.audio_clips
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  );

create index audio_clips_project_idx on public.audio_clips (project_id);
create index audio_clips_track_idx on public.audio_clips (track_id);

-- ============================================================
-- custom_stickers / custom_fonts
-- ============================================================
create table public.custom_stickers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.custom_stickers enable row level security;

create policy "custom_stickers: owner all" on public.custom_stickers
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create table public.custom_fonts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  family text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.custom_fonts enable row level security;

create policy "custom_fonts: owner all" on public.custom_fonts
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ============================================================
-- Storage — single private bucket, path-prefixed by user id:
--   {user_id}/media/...      user-uploaded photos/video/audio
--   {user_id}/thumbnails/... generated thumbnails
--   {user_id}/fonts/...      uploaded font files
--   {user_id}/stickers/...   uploaded sticker PNGs
-- ============================================================
insert into storage.buckets (id, name, public)
values ('user-content', 'user-content', false)
on conflict (id) do nothing;

create policy "user-content: owner select" on storage.objects
  for select using (
    bucket_id = 'user-content' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "user-content: owner insert" on storage.objects
  for insert with check (
    bucket_id = 'user-content' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "user-content: owner update" on storage.objects
  for update using (
    bucket_id = 'user-content' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "user-content: owner delete" on storage.objects
  for delete using (
    bucket_id = 'user-content' and (storage.foldername(name))[1] = auth.uid()::text
  );
