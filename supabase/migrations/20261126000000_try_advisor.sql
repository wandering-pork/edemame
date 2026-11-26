-- Public Visa Advisor trial (docs/plans/public-visa-advisor-trial.md, VA.1).
--
-- Anonymous visitors can run a small number of free eligibility checks from the homepage. These
-- tables back the abuse limits and the applicant teaser; none of them holds a name, a date of birth
-- or a raw IP address.
--
-- Every table has RLS on and NO policies, and anon/authenticated lose their default grants: only
-- the service role (server-side api/try-eligibility.ts) reads or writes them. That's the right
-- shape here because the caller is anonymous, so there is no user for RLS to scope to.

-- Per-visitor daily counter. ip_hash = sha256(ip:day:salt), so it can't be reversed to an IP and
-- doesn't link the same visitor across days.
create table if not exists public.try_advisor_usage (
  ip_hash text not null,
  day date not null,
  count integer not null default 0,
  primary key (ip_hash, day)
);

-- Global daily counter: the cost ceiling across all anonymous visitors.
create table if not exists public.try_advisor_daily (
  day date primary key,
  count integer not null default 0
);

-- Applicant ('Myself') teaser ranking, kept for 24 hours so a paid full report (VA.5) names the
-- same best match whose verdict the visitor saw. Only the three subclasses and verdicts, never the
-- answers. token_hash = sha256 of the random token the visitor holds.
create table if not exists public.try_advisor_rankings (
  token_hash text primary key,
  ranking jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.try_advisor_usage enable row level security;
alter table public.try_advisor_daily enable row level security;
alter table public.try_advisor_rankings enable row level security;

revoke all on table public.try_advisor_usage from anon, authenticated;
revoke all on table public.try_advisor_daily from anon, authenticated;
revoke all on table public.try_advisor_rankings from anon, authenticated;

-- Read both counters for one visitor and day, before calling Gemini.
create or replace function public.try_advisor_check(p_ip_hash text, p_day date)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'ip_count', coalesce((select u.count from public.try_advisor_usage u where u.ip_hash = p_ip_hash and u.day = p_day), 0),
    'global_count', coalesce((select d.count from public.try_advisor_daily d where d.day = p_day), 0)
  );
$$;

-- Count one successful check (a failed Gemini call never gets here), and prune old rows.
create or replace function public.try_advisor_record(p_ip_hash text, p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.try_advisor_usage (ip_hash, day, count)
  values (p_ip_hash, p_day, 1)
  on conflict (ip_hash, day) do update set count = public.try_advisor_usage.count + 1;

  insert into public.try_advisor_daily (day, count)
  values (p_day, 1)
  on conflict (day) do update set count = public.try_advisor_daily.count + 1;

  delete from public.try_advisor_usage where day < p_day - 7;
  delete from public.try_advisor_rankings where expires_at < now();
end;
$$;

revoke execute on function public.try_advisor_check(text, date) from public, anon, authenticated;
revoke execute on function public.try_advisor_record(text, date) from public, anon, authenticated;
grant execute on function public.try_advisor_check(text, date) to service_role;
grant execute on function public.try_advisor_record(text, date) to service_role;
