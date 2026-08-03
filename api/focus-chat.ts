import type { IncomingMessage, ServerResponse } from "http";
import { getUserManualContext } from "./_lib/userManual";
import { searchGithubIssues } from "./_lib/github";

interface VercelRequest extends IncomingMessage {
  method: string;
  body: any;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: any): VercelResponse;
}

const GEMINI_MODEL = "gemini-3.5-flash";

// Per-session cap on how many issues the agent will offer to file from a
// single Focus Mode conversation (see api/file-github-issue.ts, which
// re-enforces the same limit at the point the issue is actually created).
const MAX_ISSUES_PER_SESSION = 3;

// Safety valve on the search -> draft function-calling loop so a confused
// model can't spin forever burning Gemini calls on one chat turn.
const MAX_TOOL_TURNS = 4;

// ---------------------------------------------------------------------------
// Gemini function-calling tool declarations. The model decides for itself
// (per the system prompt below) when a chat turn looks like a defect or
// feature request rather than a normal product question, and calls these
// tools accordingly. The backend executes them; `draft_github_issue` never
// results in an actual GitHub write here — filing only happens from the
// separate, user-confirmed api/file-github-issue.ts endpoint.
// ---------------------------------------------------------------------------
const tools = [
  {
    functionDeclarations: [
      {
        name: "search_github_issues",
        description:
          "Search existing GitHub issues in this project's repo for a possible duplicate of the defect or feature request the user just described. Call this BEFORE drafting a new issue, using a few keywords from the user's description.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "Short keyword search query describing the defect or feature (e.g. 'passport scanner crash upload').",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "draft_github_issue",
        description:
          "Draft a new GitHub issue for a defect or feature request that was NOT found by search_github_issues. This does not file the issue — it only prepares a draft for the user to review and confirm.",
        parameters: {
          type: "OBJECT",
          properties: {
            title: {
              type: "STRING",
              description: "Issue title, formatted as 'Potential defect: [summary]' or 'New feature request: [summary]'.",
            },
            body: {
              type: "STRING",
              description: "Issue body in markdown: what the user described, why it looks like a defect/feature gap against the User Manual, and any relevant case-context details (no client-identifying details).",
            },
          },
          required: ["title", "body"],
        },
      },
    ],
  },
];

function buildSystemPrompt(caseContext: string | undefined, userManualContext: string, issuesFiledInSession: number): string {
  const remaining = Math.max(0, MAX_ISSUES_PER_SESSION - issuesFiledInSession);
  return `You are Edamame Agent, an expert AI assistant for Australian immigration lawyers and migration agents.

You are working inside Focus Mode on a specific case. Your role is to:
- Answer questions about visa requirements, processes, and timelines
- Help draft correspondence and document checklists
- Analyse case circumstances and flag risks or opportunities
- Reference Australian Department of Home Affairs policy accurately
- Suggest next steps based on case progress
- Answer "how do I…" / training questions about the Edamame product itself using the USER MANUAL below

${caseContext ? `ACTIVE CASE CONTEXT:\n${caseContext}\n` : ''}
${userManualContext ? `USER MANUAL (authoritative reference for how Edamame is meant to work — use this to answer product training questions and to judge whether described behaviour matches what is documented):\n${userManualContext}\n` : ''}
When asked how to use a feature, base your answer on the USER MANUAL content above. If the manual does not cover something, say so honestly instead of guessing.

## Defect / feature-request reporting

On every user turn, silently classify it against the USER MANUAL into exactly one of:
- **Normal Question** — covered by the manual, or general legal/product Q&A. Just answer normally. Do not call any tool.
- **Defect** — the user describes Edamame product behaviour that directly contradicts what the USER MANUAL says should happen.
- **Feature Request** — the user describes a product capability that is not covered by the USER MANUAL at all.
- **None** — unrelated chatter. Just answer normally. Do not call any tool.

If you classify the turn as Defect or Feature Request:
1. Call \`search_github_issues\` with a few keywords from the user's description to check for an existing issue.
2. If the search results contain a clear match, DO NOT draft a new issue. Instead reply in plain text telling the user the item is already tracked (for a defect: something like "This is in the queue and will be fixed."; for a feature: "This has already been requested.") and include the existing issue's markdown link, e.g. [#42](https://github.com/wandering-pork/edemame/issues/42).
3. If there is no match, call \`draft_github_issue\` with a title formatted as "Potential defect: [summary]" or "New feature request: [summary]" and a clear markdown body summarising what the user described and why it looks like a gap against the manual. Do not include any client-identifying details in the body.
4. Never call \`draft_github_issue\` if you were not able to call \`search_github_issues\` first for the same turn.
5. This chat session has ${remaining} of ${MAX_ISSUES_PER_SESSION} agent-filed issue slots remaining. If 0 remain, do not call \`draft_github_issue\` — instead tell the user the per-session limit for agent-filed issues has been reached and suggest they file the issue manually.

Keep responses concise but complete. Use markdown formatting for lists and headings. When referencing specific policy, cite the relevant legislative instrument or policy guidance.`;
}

async function callGemini(apiKey: string, systemPrompt: string, contents: any[]) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools,
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.text();
    console.error("Gemini API error:", response.status, errorData);
    throw new Error("Gemini API request failed");
  }

  return response.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages, caseContext, issuesFiledInSession } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing messages array" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const filedCount = typeof issuesFiledInSession === "number" ? issuesFiledInSession : 0;
  const userManualContext = getUserManualContext();
  const systemPrompt = buildSystemPrompt(caseContext, userManualContext, filedCount);

  // Convert chat history to Gemini `contents` format.
  const contents: any[] = messages.map((m: { role: string; content: string }) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  try {
    let turn = 0;
    let finalReply: string | null = null;
    let draft: { title: string; body: string } | null = null;

    while (turn < MAX_TOOL_TURNS) {
      turn++;
      const data = await callGemini(apiKey, systemPrompt, contents);
      const candidate = data.candidates?.[0];
      const parts: any[] = candidate?.content?.parts || [];
      const functionCallPart = parts.find((p: any) => p.functionCall);

      if (!functionCallPart) {
        const textPart = parts.find((p: any) => typeof p.text === "string");
        finalReply = textPart?.text || null;
        break;
      }

      const { name, args } = functionCallPart.functionCall;
      // Record the model's function-call turn so the follow-up function
      // response is grounded in the same conversation.
      contents.push({ role: "model", parts: [{ functionCall: { name, args } }] });

      if (name === "draft_github_issue" && typeof args?.title === "string" && typeof args?.body === "string") {
        if (filedCount >= MAX_ISSUES_PER_SESSION) {
          // Hard-enforced even if the model ignored the instruction.
          finalReply = `This conversation has already filed ${MAX_ISSUES_PER_SESSION} issues — that's the limit per chat session. Please file this one manually on GitHub if it still needs tracking.`;
        } else {
          draft = { title: args.title, body: args.body };
        }
        break;
      }

      if (name === "search_github_issues" && typeof args?.query === "string") {
        let results: unknown;
        try {
          results = await searchGithubIssues(args.query);
        } catch (error) {
          console.error("GitHub search error:", error);
          results = { error: "search_failed" };
        }
        contents.push({
          role: "function",
          parts: [{ functionResponse: { name, response: { results } } }],
        });
        continue;
      }

      // Unknown/unsupported function call — stop the loop gracefully.
      finalReply = "Sorry, I couldn't generate a response.";
      break;
    }

    if (draft) {
      return res.status(200).json({ kind: "issue-draft", draft });
    }

    return res.status(200).json({
      kind: "text",
      reply: finalReply || "Sorry, I couldn't generate a response.",
    });
  } catch (error) {
    console.error("Focus chat error:", error);
    return res.status(500).json({ error: "Failed to generate response" });
  }
}
