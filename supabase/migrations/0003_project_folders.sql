-- Project folders — organize scrapbook projects into folders on the dashboard
-- (separate from media_folders, which organize the media library).
-- Run in the Supabase SQL Editor after 0001_init.sql and 0002_grants.sql.

create table public.project_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.project_folders enable row level security;

create policy "project_folders: owner all" on public.project_folders
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

grant select, insert, update, delete on public.project_folders to authenticated;

alter table public.projects
  add column folder_id uuid references public.project_folders (id) on delete set null;

create index projects_folder_idx on public.projects (folder_id);
