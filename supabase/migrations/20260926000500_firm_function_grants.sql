-- Tighten EXECUTE on the 1F firm functions (Supabase advisor 0028).
--
-- 20260926000300_create_firms.sql revoked these from PUBLIC, but Supabase's
-- default privileges also grant EXECUTE to anon/authenticated explicitly, so
-- signed-out visitors could still call them via /rest/v1/rpc/*. None of them
-- leaked anything (auth.uid() is null for anon, so they return false/nothing
-- or raise "Not signed in"), but there's no reason to expose them.
--
-- - is_firm_member / has_firm_role / firm_member_directory / create_firm:
--   signed-in users still need these (RLS policies and the app call them).
-- - firm_members_guard: a trigger function. Postgres only checks EXECUTE when
--   the trigger is created, not when it fires, so nobody needs to call it.

revoke execute on function public.is_firm_member(uuid) from anon;
revoke execute on function public.has_firm_role(uuid, text[]) from anon;
revoke execute on function public.firm_member_directory(uuid) from anon;
revoke execute on function public.create_firm(text) from anon;
revoke execute on function public.firm_members_guard() from public, anon, authenticated;
