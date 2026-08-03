// Minimal GitHub REST API client for the agent-driven issue filing feature
// (Case Manager Focus Mode chat — see docs/user-manual/case-manager/getting-started.md
// and GitHub issue #15). Every call is server-side only: the token never reaches
// the client bundle.

const GITHUB_API = "https://api.github.com";

// Target repository is fixed per the resolved technical decision for #15 —
// this feature only ever files issues against this repo.
export const GITHUB_OWNER = "wandering-pork";
export const GITHUB_REPO = "edemame";

// Label applied to every issue this agent files, so they're easy to triage/filter.
export const AGENT_REPORTED_LABEL = "agent-reported";

function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_ISSUES_TOKEN;
  if (!token) {
    throw new Error("GITHUB_ISSUES_TOKEN is not configured on the server");
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export interface GithubIssueSummary {
  number: number;
  title: string;
  url: string;
  state: string;
}

/**
 * Searches for existing issues in the target repo matching the given keywords,
 * via the GitHub Search API. Used for the duplicate-check step before drafting
 * a new issue.
 */
export async function searchGithubIssues(query: string): Promise<GithubIssueSummary[]> {
  const q = `repo:${GITHUB_OWNER}/${GITHUB_REPO} is:issue ${query}`;
  const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(q)}&per_page=5`;

  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub issue search failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];
  return items.map((it: any) => ({
    number: it.number,
    title: it.title,
    url: it.html_url,
    state: it.state,
  }));
}

/**
 * Files a new issue in the target repo, labeled `agent-reported`. Only ever
 * called from the explicit, user-confirmed action endpoint (api/file-github-issue.ts)
 * — never as a side effect of a function-calling turn.
 */
export async function createGithubIssue(
  title: string,
  body: string
): Promise<{ number: number; url: string }> {
  const url = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`;

  const res = await fetch(url, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ title, body, labels: [AGENT_REPORTED_LABEL] }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub issue creation failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return { number: data.number, url: data.html_url };
}
