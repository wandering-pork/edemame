-- Whether the user has dismissed the one-time "Ask Edie" tip shown on a case.
-- Saved per user (like edie_open) so it isn't shown again on another device.
-- Additive only; profiles' existing "own row" RLS covers it. Apply before
-- deploying the frontend that writes edie_hint_seen.
alter table public.profiles
  add column if not exists edie_hint_seen boolean not null default false;
