-- Public Visa Advisor trial: daily counts for the owner (docs/plans/public-visa-advisor-trial.md, VA.3).
--
-- One row per day + audience + kind, holding only a count: no per-visitor data at all.
--   started         chose who the check is for (api/try-event.ts)
--   completed       saw a teaser result (api/try-eligibility.ts)
--   limited         hit a daily limit (api/try-eligibility.ts)
--   register_click  applicant opened the register of migration agents (api/try-event.ts)
-- "Converted" (a full check run from a carried-over scenario) is a usage_events row of type
-- trial_converted on the new account instead, since there's a user by then.
--
-- Same shape as 20261126000000_try_advisor.sql: RLS on, no policies, service role only.

create table if not exists public.try_advisor_events (
  day date not null,
  audience text not null check (audience in ('client', 'self')),
  kind text not null check (kind in ('started', 'completed', 'limited', 'register_click')),
  count integer not null default 0,
  primary key (day, audience, kind)
);

alter table public.try_advisor_events enable row level security;
revoke all on table public.try_advisor_events from anon, authenticated;

create or replace function public.try_advisor_bump(p_day date, p_audience text, p_kind text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.try_advisor_events (day, audience, kind, count)
  values (p_day, p_audience, p_kind, 1)
  on conflict (day, audience, kind) do update set count = public.try_advisor_events.count + 1;
$$;

revoke execute on function public.try_advisor_bump(date, text, text) from public, anon, authenticated;
grant execute on function public.try_advisor_bump(date, text, text) to service_role;
