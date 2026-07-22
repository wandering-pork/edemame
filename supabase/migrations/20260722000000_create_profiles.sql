-- Account-level settings that must follow the user regardless of device:
-- which storage mode they're in, UI prefs, and display metadata for their
-- linked local folder (the actual FileSystemDirectoryHandle can't live here —
-- it's a browser-native object — this just tracks what to show in Settings).
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  storage_mode text not null check (storage_mode in ('local', 'cloud')),
  theme text not null default 'classic' check (theme in ('classic', 'dark')),
  sidebar_collapsed boolean not null default false,
  linked_folder_name text,
  linked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "own profile select" on profiles
  for select using (auth.uid() = user_id);

create policy "own profile insert" on profiles
  for insert with check (auth.uid() = user_id);

create policy "own profile update" on profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
