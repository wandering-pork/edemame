import type { IncomingMessage, ServerResponse } from "http";
import { createGithubIssue } from "./_lib/github";
import { verifySupabaseUser } from "./_lib/auth";
import { scrubPii } from "./_lib/pii";
import { MAX_ISSUES_PER_DAY, countIssuesFiledInLast24h, recordIssueFiling } from "./_lib/agentIssueRateLimit";

interface VercelRequest extends IncomingMessage {
  method: string;
  body: any;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: any): VercelResponse;
}

// NOTE on the request body: the frontend also sends an `issuesFiledInSession`
// field (how many `issue-filed` messages already exist in the active
// conversation) purely so the chat UI can grey out the Confirm button / show
// a friendly message client-side. It is UX-ONLY, NOT A SECURITY CONTROL --
// entirely client-supplied and trivially spoofable or omittable -- so this
// handler deliberately ignores it and never uses it for the real limit below.

// Real, server-enforced rate limit (MAX_ISSUES_PER_DAY, see
// api/_lib/agentIssueRateLimit.ts) — at most this many issues filed per
// authenticated user per rolling 24h, backed by the `agent_issue_filings`
// table (supabase/migrations/20260807000000_create_agent_issue_filings.sql).
// KNOWN GAP: it's a read-then-insert check, not an atomic transaction, so two
// concurrent requests from the same user could both pass the count check
// before either insert lands (a narrow race, not closed by this change). It
// is still a real, persisted, server-side limit -- a large improvement over
// trusting the client-supplied counter, just not airtight against a
// determined concurrent-request attacker.

// Explicit, user-confirmed action endpoint. This is the ONLY place in the
// codebase that actually calls POST /repos/{owner}/{repo}/issues — it must
// never be invoked as a side effect of a Gemini function-calling turn, only
// from the user's Confirm click in AgentPanel.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await verifySupabaseUser(req.headers);
  if (!auth) {
    return res.status(401).json({ error: "You must be signed in to file a GitHub issue" });
  }

  const { title, body } = req.body || {};

  if (!title || typeof title !== "string" || !body || typeof body !== "string") {
    return res.status(400).json({ error: "Missing title or body" });
  }

  if (!process.env.GITHUB_ISSUES_TOKEN) {
    return res.status(500).json({ error: "GitHub integration is not configured on the server" });
  }

  try {
    let filedToday: number;
    try {
      filedToday = await countIssuesFiledInLast24h(auth.userId, auth.accessToken);
    } catch (error) {
      console.error("Rate limit check failed:", error);
      return res.status(500).json({ error: "Could not verify rate limit — please try again" });
    }

    if (filedToday >= MAX_ISSUES_PER_DAY) {
      return res.status(429).json({
        error: `You've reached the limit of ${MAX_ISSUES_PER_DAY} agent-filed issues per day. Please file this one manually on GitHub if it still needs tracking.`,
      });
    }

    // Defense-in-depth PII scrub before anything is posted to the public
    // wandering-pork/edemame repo — on top of the prompt instruction in
    // api/focus-chat.ts asking the model not to include client-identifying
    // details in the first place.
    const scrubbedTitle = scrubPii(title);
    const scrubbedBody = scrubPii(body);
    if (scrubbedTitle.redactionCount > 0 || scrubbedBody.redactionCount > 0) {
      console.warn(
        `Redacted ${scrubbedTitle.redactionCount + scrubbedBody.redactionCount} likely-PII match(es) from a drafted issue before filing (user ${auth.userId})`
      );
    }

    const issue = await createGithubIssue(scrubbedTitle.text, scrubbedBody.text);

    try {
      await recordIssueFiling(auth.userId, auth.accessToken);
    } catch (error) {
      // The issue was already filed successfully -- don't fail the request
      // over a bookkeeping write, just log so the gap is visible.
      console.error("Failed to record issue filing for rate limiting:", error);
    }

    return res.status(200).json({ number: issue.number, url: issue.url });
  } catch (error) {
    console.error("File GitHub issue error:", error);
    return res.status(502).json({ error: "Failed to create GitHub issue" });
  }
}
