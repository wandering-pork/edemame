import type { IncomingMessage, ServerResponse } from "http";
import { validateEligibilityInput } from "./_lib/eligibilityInput";
import { serviceRoleConfigured, serviceRoleRest } from "./_lib/firms";
import { callGemini, geminiFailure } from "./_lib/gemini";
import {
  buildTrialResponse,
  cleanMatches,
  clientIp,
  hashIp,
  hashToken,
  newRankingToken,
  parseAudience,
  trialLimits,
  trialPrompt,
  trialResponseSchema,
  utcDay,
} from "./_lib/tryAdvisor";
import { turnstileConfigured, verifyTurnstile } from "./_lib/turnstile";

// The public, signed-out Visa Advisor trial (docs/plans/public-visa-advisor-trial.md, VA.1).
//
// A separate endpoint from check-eligibility on purpose: smaller, locked down, and unable to leak
// the full report even by mistake. It returns only the teaser (api/_lib/tryAdvisor.ts):
//   - agents ('client'): the single best match's subclass, name and verdict;
//   - applicants ('self'): the top three. With TRY_ADVISOR_HIDE_BEST=true (once the paid report,
//     VA.5, exists) the best match's subclass/name stay on the server, in try_advisor_rankings,
//     and only its verdict is sent.
//
// Order of checks: kill switch, input, config, Turnstile, limits, and only then Gemini. A check is
// counted only after a usable answer, so a Gemini failure never uses up one of a visitor's checks.
//
// Known gap, accepted: check-then-record isn't atomic, so a burst of parallel requests from one IP
// can slightly exceed its daily limit. Turnstile tokens are single-use, which bounds the burst, and
// the global cap still holds the cost ceiling.

interface VercelRequest extends IncomingMessage {
  method: string;
  body: any;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: any): VercelResponse;
}

// An anonymous visitor won't wait as long as a signed-in agent: a shorter total budget than the
// default 100s in api/_lib/gemini.ts.
const TRIAL_BUDGET_MS = 40_000;

const PAUSED = { error: "The free trial is paused right now. Create an account to use the Visa Advisor.", code: "trial_paused" };

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await serviceRoleRest(`rpc/${name}`, { method: "POST", body: args });
  if (!res.ok) throw new Error(`${name} failed: ${res.status} ${await res.text().catch(() => "")}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Kill switch: off unless explicitly turned on, so merging this doesn't launch it.
  if (process.env.TRY_ADVISOR_ENABLED !== "true") {
    return res.status(503).json(PAUSED);
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const audience = parseAudience(body.audience);
  if (!audience) {
    return res.status(400).json({ error: "Missing or invalid audience" });
  }
  const input = validateEligibilityInput(body.answers);
  if (!input.ok) {
    return res.status(400).json({ error: input.error });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const salt = process.env.TRY_ADVISOR_IP_SALT;
  if (!apiKey || !salt || !serviceRoleConfigured() || !turnstileConfigured()) {
    console.error("try-eligibility: missing configuration (GEMINI_API_KEY, TRY_ADVISOR_IP_SALT, SUPABASE_SERVICE_ROLE_KEY or TURNSTILE_SECRET_KEY)");
    return res.status(503).json(PAUSED);
  }

  const ip = clientIp(req.headers);
  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    return res.status(403).json({ error: "We couldn't verify you're human. Please try again.", code: "challenge_failed" });
  }

  const day = utcDay();
  // Without an IP (local dev), every request shares one bucket; the global cap still applies.
  const ipHash = hashIp(ip ?? "unknown", day, salt);
  const limits = trialLimits();

  let ipCount = 0;
  try {
    const counts = await rpc<{ ip_count: number; global_count: number }>("try_advisor_check", { p_ip_hash: ipHash, p_day: day });
    ipCount = counts?.ip_count ?? 0;
    if (ipCount >= limits.perIp || (counts?.global_count ?? 0) >= limits.global) {
      return res.status(429).json({
        error: "You've used today's free checks. Create a free account to keep going.",
        code: "trial_limit",
      });
    }
  } catch (error) {
    // Fail closed: without a working counter there's no cost ceiling.
    console.error("try-eligibility: limit check failed:", error);
    return res.status(503).json(PAUSED);
  }

  try {
    const response = await callGemini(
      apiKey,
      {
        contents: [{ role: "user", parts: [{ text: trialPrompt(input.value, audience) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: trialResponseSchema(audience),
        },
      },
      { deadline: Date.now() + TRIAL_BUDGET_MS },
    );

    if (!response.ok) {
      const failure = geminiFailure(response.status);
      return res.status(failure.status).json(failure.body);
    }

    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.find((p: any) => typeof p.text === "string")?.text ?? "";
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const matches = cleanMatches(parsed, audience);
    if (!matches) {
      console.error("try-eligibility: unusable Gemini response:", text.slice(0, 300));
      return res.status(502).json({ error: "The AI returned an unusable answer. Please try again.", code: "ai_error" });
    }

    const hideBest = audience === "self" && process.env.TRY_ADVISOR_HIDE_BEST === "true";
    let rankingToken: string | undefined;
    if (hideBest) {
      rankingToken = newRankingToken();
      const stored = await serviceRoleRest("try_advisor_rankings", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: {
          token_hash: hashToken(rankingToken),
          ranking: matches.map((m) => ({ visaSubclass: m.visaSubclass, verdict: m.verdict })),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      if (!stored.ok) {
        console.error("try-eligibility: storing the ranking failed:", stored.status, await stored.text().catch(() => ""));
        return res.status(503).json(PAUSED);
      }
    }

    await rpc("try_advisor_record", { p_ip_hash: ipHash, p_day: day }).catch((error) => {
      // The visitor already has a good answer; a missed count isn't worth failing it.
      console.error("try-eligibility: recording the check failed:", error);
    });

    const remainingToday = Math.max(0, limits.perIp - (ipCount + 1));
    return res.status(200).json(buildTrialResponse(audience, matches, remainingToday, rankingToken, hideBest));
  } catch (error) {
    console.error("try-eligibility: error:", error);
    return res.status(500).json({ error: "Failed to check eligibility" });
  }
}
