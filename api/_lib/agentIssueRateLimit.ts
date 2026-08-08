// Real, server-enforced per-user rate limit for the agentic GitHub issue
// filing feature (api/file-github-issue.ts, GitHub issue #15 / PR #21 code
// review). Backed by the `agent_issue_filings` Postgres table
// (supabase/migrations/20260807000000_create_agent_issue_filings.sql),
// accessed directly via Supabase's PostgREST REST API (no @supabase/supabase-js
// dependency — see api/_lib/auth.ts for why) using the caller's own verified
// access token, so RLS (`auth.uid() = user_id`) scopes every read/write to
// that user automatically.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export const MAX_ISSUES_PER_DAY = 5;

/**
 * Counts how many issues this user has filed in the last 24h.
 * Throws if the count can't be determined (caller should treat that as a
 * hard failure, not silently allow the request through).
 */
export async function countIssuesFiledInLast24h(userId: string, accessToken: string): Promise<number> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase env vars are not configured on the server");
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const url = `${SUPABASE_URL}/rest/v1/agent_issue_filings?select=id&user_id=eq.${encodeURIComponent(
    userId
  )}&filed_at=gte.${encodeURIComponent(since)}`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Rate limit count query failed: ${res.status} ${text}`);
  }

  // PostgREST returns the total in the Content-Range header when
  // Prefer: count=exact is set, e.g. "0-0/3" or "*/0".
  const contentRange = res.headers.get("content-range");
  const total = contentRange ? Number(contentRange.split("/")[1]) : NaN;
  return Number.isFinite(total) ? total : 0;
}

/**
 * Records that this user just filed an issue, for future rate-limit checks.
 * KNOWN GAP: this is a separate call from countIssuesFiledInLast24h, not one
 * atomic transaction, so two concurrent requests from the same user could
 * both read a count just under the cap before either insert lands. Accepted
 * as a narrow race for this abuse scenario (a single chatty/adversarial
 * account), not closed by this change — see api/file-github-issue.ts.
 */
export async function recordIssueFiling(userId: string, accessToken: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase env vars are not configured on the server");
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_issue_filings`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ user_id: userId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to record issue filing: ${res.status} ${text}`);
  }
}
