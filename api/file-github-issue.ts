import type { IncomingMessage, ServerResponse } from "http";
import { createGithubIssue } from "./_lib/github";

interface VercelRequest extends IncomingMessage {
  method: string;
  body: any;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: any): VercelResponse;
}

// Per-session cap on how many issues the agent will file from a single Focus
// Mode conversation, to guard against runaway/spammy filings. The frontend
// tracks how many `issue-filed` messages already exist in the active
// conversation and sends that count along with the confirm request; this is
// the same rate-limit rule enforced client-side before showing the Confirm
// button, re-checked here since the confirm action is the one with a real
// side effect.
const MAX_ISSUES_PER_SESSION = 3;

// Explicit, user-confirmed action endpoint. This is the ONLY place in the
// codebase that actually calls POST /repos/{owner}/{repo}/issues — it must
// never be invoked as a side effect of a Gemini function-calling turn, only
// from the user's Confirm click in AgentPanel.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { title, body, issuesFiledInSession } = req.body || {};

  if (!title || typeof title !== "string" || !body || typeof body !== "string") {
    return res.status(400).json({ error: "Missing title or body" });
  }

  const filedCount = typeof issuesFiledInSession === "number" ? issuesFiledInSession : 0;
  if (filedCount >= MAX_ISSUES_PER_SESSION) {
    return res.status(429).json({
      error: `This conversation has already filed ${MAX_ISSUES_PER_SESSION} issues — that's the limit per chat session.`,
    });
  }

  if (!process.env.GITHUB_ISSUES_TOKEN) {
    return res.status(500).json({ error: "GitHub integration is not configured on the server" });
  }

  try {
    const issue = await createGithubIssue(title, body);
    return res.status(200).json({ number: issue.number, url: issue.url });
  } catch (error) {
    console.error("File GitHub issue error:", error);
    return res.status(502).json({ error: "Failed to create GitHub issue" });
  }
}
