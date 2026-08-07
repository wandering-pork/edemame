-- Server-side rate limit counter for the agentic GitHub issue filing feature
-- (api/file-github-issue.ts, GitHub issue #15 / PR #21 code review).
--
-- The client sends an `issuesFiledInSession` counter, but that's a UX nicety
-- only -- it can't be trusted as a security control, and serverless functions
-- have no shared in-memory state across invocations to enforce a real limit
-- with. This table gives file-github-issue.ts a persisted, per-user counter
-- it can query and insert into using the caller's own verified JWT (RLS scopes
-- every row to auth.uid(), same "own rows" pattern as `profiles`).
--
-- Known gap: this is a simple insert-then-count check, not a transactionally
-- atomic rate limiter -- two concurrent requests from the same user could both
-- read a count just under the cap and both pass. Acceptable for the abuse
-- scenario this defends against (a chatty/adversarial single user or script),
-- not a guarantee against a determined concurrent-request attacker. See the
-- comment in api/file-github-issue.ts for the same disclosure.
create table if not exists agent_issue_filings (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  filed_at timestamptz not null default now()
);

create index if not exists agent_issue_filings_user_filed_at_idx
  on agent_issue_filings (user_id, filed_at);

alter table agent_issue_filings enable row level security;

create policy "own filings select" on agent_issue_filings
  for select using (auth.uid() = user_id);

create policy "own filings insert" on agent_issue_filings
  for insert with check (auth.uid() = user_id);
