-- Usage tracking events (GitHub #39) — append-only metering log, sibling to
-- activity_events. No admin/billing dashboard reads this yet; instrumentation only.

create table if not exists usage_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  metadata jsonb,
  created_at text not null
);

create index if not exists usage_events_user_id_created_at_idx on usage_events(user_id, created_at);

alter table usage_events enable row level security;

create policy "own rows select" on usage_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows insert" on usage_events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows delete" on usage_events for delete to authenticated using ((select auth.uid()) = user_id);
