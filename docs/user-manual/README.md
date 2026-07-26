# Edamame User Manual

This folder is the source of truth the **Case Manager Agent** (Focus Mode chat) reads from to
answer "how do I…" / training questions, and to judge whether the product is behaving as
documented. Content here is maintained by the product/support team — no code changes are needed
to update what the agent knows, just edit or add markdown files and redeploy.

## Conventions

- One markdown file per topic or feature (e.g. one file for "Generating tasks", one for
  "Uploading documents").
- Start every file with a single top-level heading (`# Topic Title`) — the agent uses this as the
  page's title when citing it in an answer.
- Organize files into subfolders that mirror the product's modules (e.g. `case-manager/`,
  `clients/`, `visa-advisor/`). Subfolders are just for your own organization — the agent reads
  every `.md` file in this tree recursively regardless of nesting.
- Write for the end user (immigration lawyer / agency staff), not for developers. Describe what a
  feature does, where to find it, and step-by-step how to use it. Avoid internal implementation
  detail.
- Keep pages reasonably short and focused. The full contents of this folder are loaded into the
  agent's context on every chat request, so avoid pasting huge unrelated reference material into a
  single page.

## Keep it in sync with the product

Every time the app's user-facing behavior changes — a flow, a button, a new or removed feature —
update the relevant page(s) here in the same change/PR. Stale docs make the Case Manager Agent
confidently answer with outdated instructions, which is worse than having no docs at all. See the
root `CLAUDE.md`'s "Keeping the User Manual in Sync" section, which instructs AI coding agents
working in this repo to check this folder on every user-facing change.

## How this is wired up

`api/_lib/userManual.ts` reads every `.md` file under this folder and concatenates them into a
single context block that gets injected into the system prompt sent to Gemini in
[`api/focus-chat.ts`](../../api/focus-chat.ts). There is no separate build step — files are picked
up at request time (cached per warm serverless instance), so a normal deploy is enough to pick up
edits made here.
