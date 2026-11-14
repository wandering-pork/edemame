-- Edie panel open/closed state, saved per user like sidebar_collapsed so it
-- follows the user across devices. Additive only; profiles' existing "own
-- row" RLS already covers it. Apply before deploying the frontend that
-- writes edie_open (PostgREST rejects updates to an unknown column).
alter table public.profiles
  add column if not exists edie_open boolean not null default false;
