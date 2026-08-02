-- Cloud storage mode: one table per entity in src/repositories/types.ts,
-- mirroring the per-record-JSON-file layout of the filesystem repositories
-- but flattened (Postgres doesn't need per-record files to scope sync
-- conflicts the way a Dropbox-synced folder does). Same ownership pattern
-- as the profiles table: one row per record, user_id -> auth.uid() RLS.
--
-- Entity ids are `text`, not `uuid`: src/types.ts types every `id` as a plain
-- string. Most are uuidv4() at runtime, but not all -- src/lib/seedData.ts
-- seeds team members with ids like 'tm-eliza-chen', which a uuid column
-- rejects with 22P02. Only user_id is a real Supabase Auth uuid.

create table if not exists clients (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dob text not null,
  phone text not null,
  email text not null,
  address text not null,
  passport_number text,
  passport_expiry text,
  nationality text,
  gender text,
  passport_data jsonb,
  role text,
  notes text
);
create index if not exists clients_user_id_idx on clients(user_id);

create table if not exists cases (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null references clients(id) on delete cascade,
  title text not null,
  description text not null,
  template_id text not null,
  status text not null,
  start_date text not null,
  created_at text not null,
  case_owner text,
  assignment_history jsonb,
  applicant_id text
);
create index if not exists cases_user_id_idx on cases(user_id);
create index if not exists cases_client_id_idx on cases(client_id);

create table if not exists tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  date text not null,
  is_completed boolean not null default false,
  priority_order integer not null default 0,
  case_id text references cases(id) on delete cascade,
  generated_by_ai boolean,
  assigned_to text
);
create index if not exists tasks_user_id_idx on tasks(user_id);
create index if not exists tasks_case_id_idx on tasks(case_id);

create table if not exists workflow_templates (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  visa_subclass text,
  steps jsonb
);
create index if not exists workflow_templates_user_id_idx on workflow_templates(user_id);

create table if not exists case_notes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id text not null references cases(id) on delete cascade,
  content text not null,
  created_at text not null
);
create index if not exists case_notes_user_id_idx on case_notes(user_id);
create index if not exists case_notes_case_id_idx on case_notes(case_id);

-- NOTE: deleting a case cascades away the documents ROW, but Postgres cannot
-- reach into Supabase Storage -- the object at file_path still needs an
-- app-level delete or a scheduled sweep to avoid orphaned passport scans
-- lingering past their retention window (Privacy Act). Known follow-up gap.
create table if not exists documents (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id text not null references cases(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text not null,
  file_size bigint not null,
  uploaded_at text not null,
  aspect_tag text,
  evidence_note text
);
create index if not exists documents_user_id_idx on documents(user_id);
create index if not exists documents_case_id_idx on documents(case_id);

create table if not exists notifications (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null,
  read boolean not null default false,
  created_at text not null
);
create index if not exists notifications_user_id_idx on notifications(user_id);

create table if not exists team_members (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  avatar text,
  role text not null,
  case_count integer not null default 0,
  active_task_count integer not null default 0,
  status text not null,
  joined_at text
);
create index if not exists team_members_user_id_idx on team_members(user_id);

create table if not exists activity_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  actor_id text,
  subject_id text,
  summary text not null,
  created_at text not null
);
create index if not exists activity_events_user_id_idx on activity_events(user_id);

create table if not exists checklist_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id text not null references cases(id) on delete cascade,
  label text not null,
  description text,
  status text not null,
  -- intentionally no FK: a checklist item may name a document slot that has
  -- not been uploaded yet, and clearing the link is the app's decision.
  linked_document_id text,
  required_for_subclass jsonb
);
create index if not exists checklist_items_user_id_idx on checklist_items(user_id);
create index if not exists checklist_items_case_id_idx on checklist_items(case_id);

create table if not exists focus_conversations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id text not null references cases(id) on delete cascade,
  title text not null,
  messages jsonb not null default '[]',
  created_at text not null
);
create index if not exists focus_conversations_user_id_idx on focus_conversations(user_id);
create index if not exists focus_conversations_case_id_idx on focus_conversations(case_id);

-- RLS: same "own rows" pattern as profiles for every table above.
-- `(select auth.uid())` (not bare `auth.uid()`) so the predicate is evaluated
-- once per query instead of once per row (Supabase auth_rls_initplan lint),
-- and `to authenticated` so anon requests skip policy evaluation entirely.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'cases', 'tasks', 'workflow_templates', 'case_notes', 'documents',
    'notifications', 'team_members', 'activity_events', 'checklist_items', 'focus_conversations'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "own rows select" on %I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows insert" on %I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows update" on %I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows delete" on %I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Document blobs: private bucket, path convention {userId}/{caseId}/{fileName}
-- (set by CloudDocumentRepository.create in src/repositories/cloud/index.ts).
-- Capped at 25MB with an image/PDF allowlist -- scanned passports, PDFs and
-- evidence bundles fit comfortably; an uncapped bucket is an uncapped bill.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "own document objects select" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "own document objects insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "own document objects update" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "own document objects delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (select auth.uid())::text = (storage.foldername(name))[1]);
