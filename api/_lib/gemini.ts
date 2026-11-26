// Single source of truth for the Gemini models and the generateContent call, shared by every
// `api/` function that talks to Gemini. Google retires/renames Flash models regularly, and a
// model can be overloaded for a while (503 "high demand") — so there's a primary and a fallback,
// both overridable from the Vercel dashboard (GEMINI_MODEL / GEMINI_FALLBACK_MODEL) without a deploy.
//
// Gemini 3.8 doesn't accept temperature/top_p/top_k, so callers must not send them.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash";

// Gemini 3.x thinks at "high" by default, which made ordinary calls take ~70s in production. "low"
// is accepted by both 3.8 and 3.6 ("minimal" is rejected by 3.8). Override with GEMINI_THINKING_LEVEL
// (low | medium | high), or "off" to send no thinkingConfig at all. A caller that sets its own
// generationConfig.thinkingConfig keeps it.
const THINKING_LEVEL = (process.env.GEMINI_THINKING_LEVEL || "low").trim().toLowerCase();

// Without a timeout a single hung request ran until Vercel killed the function at 300s, so the user
// waited five minutes for nothing and the fallback model never got a turn. Each attempt is cut off
// after GEMINI_TIMEOUT_MS, and the whole call (every attempt, both models) after GEMINI_BUDGET_MS.
const ATTEMPT_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 45_000;
const TOTAL_BUDGET_MS = Number(process.env.GEMINI_BUDGET_MS) || 100_000;
// Don't start an attempt with less than this left: it couldn't realistically finish.
const MIN_ATTEMPT_MS = 5_000;

const urlFor = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Transient upstream failures worth retrying. 4xx other than 429 (bad key, bad request) are ours
// to fix and won't change on retry.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
// Switching model also helps when the primary ID has been retired.
const FALLBACK_STATUSES = new Set([...RETRYABLE_STATUSES, 404]);

const ATTEMPTS_PER_MODEL = 2;
const BACKOFF_MS = 500;

/** Shown to people when Gemini is overloaded, slow, or unreachable. */
export const AI_BUSY_MESSAGE =
  "The AI service is busy right now. Please try again in a minute.";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A synthetic response for failures that never got an HTTP answer (timeout, network error). */
function syntheticFailure(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { code: status, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function withThinkingLevel(body: unknown): unknown {
  if (THINKING_LEVEL === "off" || !body || typeof body !== "object") return body;
  const b = body as Record<string, any>;
  if (b.generationConfig?.thinkingConfig) return body;
  return {
    ...b,
    generationConfig: { ...(b.generationConfig ?? {}), thinkingConfig: { thinkingLevel: THINKING_LEVEL } },
  };
}

// If a model ever rejects the thinking setting (400 naming it), resend without it rather than fail
// every call — a 400 isn't retried, so a bad setting would otherwise take the AI down entirely.
const isThinkingRejection = (status: number, body: string) => status === 400 && /thinking/i.test(body);

type Outcome = { response: Response; timedOut: boolean };

/** One HTTP attempt, aborted after `timeoutMs`. Never throws. */
async function attempt(model: string, apiKey: string, payload: string, timeoutMs: number): Promise<Outcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(urlFor(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: payload,
      signal: controller.signal,
    });
    // Read the body inside the timeout too: a stalled stream would otherwise hang just the same.
    const text = await response.text();
    return { response: new Response(text, { status: response.status, headers: response.headers }), timedOut: false };
  } catch (error) {
    if (controller.signal.aborted) {
      return { response: syntheticFailure(504, `Gemini ${model} timed out after ${timeoutMs}ms`), timedOut: true };
    }
    console.error(`Gemini request threw (${model}):`, error);
    return { response: syntheticFailure(503, `Gemini ${model} request failed: ${String(error)}`), timedOut: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tries one model, retrying transient failures, within the overall deadline. A timeout isn't
 * retried on the same model: a model that just hung is likely to hang again, and the time is
 * better spent on the fallback.
 */
async function tryModel(model: string, apiKey: string, body: unknown, deadline: number): Promise<Response> {
  let payload = JSON.stringify(withThinkingLevel(body));
  let strippedThinking = false;
  let last: Response = syntheticFailure(504, `Gemini ${model}: no time left to try`);

  for (let n = 1; n <= ATTEMPTS_PER_MODEL; n++) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;

    const { response, timedOut } = await attempt(model, apiKey, payload, Math.min(ATTEMPT_TIMEOUT_MS, remaining));
    if (response.ok) return response;
    last = response;

    const errorBody = await response.clone().text().catch(() => "");
    console.error(`Gemini API error (${model}, attempt ${n}):`, response.status, errorBody.slice(0, 500));

    if (!strippedThinking && isThinkingRejection(response.status, errorBody)) {
      console.warn(`Gemini ${model} rejected thinkingConfig; retrying without it. Check GEMINI_THINKING_LEVEL.`);
      payload = JSON.stringify(body);
      strippedThinking = true;
      n--; // this retry doesn't count against the model's attempts
      continue;
    }
    if (timedOut || !RETRYABLE_STATUSES.has(response.status)) break;
    if (n < ATTEMPTS_PER_MODEL) await sleep(BACKOFF_MS);
  }
  return last;
}

/**
 * POSTs `body` to Gemini's generateContent. Retries transient failures on the primary model, then
 * falls back to GEMINI_FALLBACK_MODEL if the primary is overloaded/slow/unavailable/retired. Always
 * resolves (never throws) with the final `Response` — the caller still checks `.ok`, and can hand a
 * failure to `geminiFailure()` for the status and message to send back. Every failure is logged with
 * Google's error body, so a log line says *why*, not just the status.
 */
export async function callGemini(
  apiKey: string,
  body: unknown,
  options: { deadline?: number } = {},
): Promise<Response> {
  // A caller that makes several calls in one request (focus-chat's tool loop) passes one shared
  // deadline, so the calls together still finish well inside Vercel's function limit.
  const deadline = Math.min(options.deadline ?? Infinity, Date.now() + TOTAL_BUDGET_MS);

  const primary = await tryModel(GEMINI_MODEL, apiKey, body, deadline);
  if (primary.ok || !FALLBACK_STATUSES.has(primary.status) || GEMINI_FALLBACK_MODEL === GEMINI_MODEL) {
    return primary;
  }

  console.warn(`Gemini ${GEMINI_MODEL} unavailable (${primary.status}), falling back to ${GEMINI_FALLBACK_MODEL}`);
  const fallback = await tryModel(GEMINI_FALLBACK_MODEL, apiKey, body, deadline);
  // Both failed: surface the primary's response if the fallback never got a real answer.
  return fallback.ok || fallback.status !== 504 ? fallback : primary;
}

/** A fresh deadline for a caller that will make several `callGemini` calls in one request. */
export const geminiDeadline = () => Date.now() + TOTAL_BUDGET_MS;

/**
 * What an endpoint should send back when `callGemini` didn't succeed: overload/timeout/outage
 * becomes a 503 with a plain-words message and `code: "ai_busy"` the UI can show as-is; anything
 * else (a bad request, a bad key) stays a 502 since retrying won't help.
 */
export function geminiFailure(status: number): { status: number; body: { error: string; code: string } } {
  if (FALLBACK_STATUSES.has(status)) {
    return { status: 503, body: { error: AI_BUSY_MESSAGE, code: "ai_busy" } };
  }
  return { status: 502, body: { error: "The AI service couldn't handle this request.", code: "ai_error" } };
}
