-- Keep-alive ping target for the free-tier auto-pause guard (.github/workflows/supabase-keepalive.yml).
-- A plain anon select on a table returns [] under RLS; this does a real read inside Postgres and
-- exposes nothing but a timestamp and a boolean.
create or replace function public.keepalive()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'firms_exist', exists (select 1 from public.firms),
    'at', now()
  );
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
