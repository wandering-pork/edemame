// Single source of truth for the Gemini models and the generateContent call, shared by every
// `api/` function that talks to Gemini. Google retires/renames Flash models regularly, and a
// model can be overloaded for a while (503 "high demand") — so there's a primary and a fallback,
// both overridable from the Vercel dashboard (GEMINI_MODEL / GEMINI_FALLBACK_MODEL) without a deploy.
//
// Gemini 3.8 doesn't accept temperature/top_p/top_k, so callers must not send them.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash";

const urlFor = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Transient upstream failures worth retrying. 4xx other than 429 (bad key, bad request) are ours
// to fix and won't change on retry.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
// Switching model also helps when the primary ID has been retired.
const FALLBACK_STATUSES = new Set([...RETRYABLE_STATUSES, 404]);

// Kept small: Vercel's default function limit is 10s, and the fallback needs time too.
const ATTEMPTS_PER_MODEL = 2;
const BACKOFF_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Tries one model, retrying transient failures. Returns the final Response (caller checks .ok). */
async function tryModel(model: string, apiKey: string, payload: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const last = attempt === ATTEMPTS_PER_MODEL;
    try {
      const response = await fetch(urlFor(model), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: payload,
      });
      if (response.ok) return response;

      const errorBody = await response.clone().text().catch(() => "");
      console.error(`Gemini API error (${model}, attempt ${attempt}):`, response.status, errorBody.slice(0, 500));
      if (last || !RETRYABLE_STATUSES.has(response.status)) return response;
    } catch (error) {
      console.error(`Gemini request threw (${model}, attempt ${attempt}):`, error);
      if (last) throw error;
    }
    await sleep(BACKOFF_MS);
  }
}

/**
 * POSTs `body` to Gemini's generateContent. Retries transient failures on the primary model, then
 * falls back to GEMINI_FALLBACK_MODEL if the primary is overloaded/unavailable/retired. Returns the
 * final `Response` — the caller still checks `.ok`. Every failure is logged with Google's error
 * body, so a log line says *why*, not just the status.
 */
export async function callGemini(apiKey: string, body: unknown): Promise<Response> {
  const payload = JSON.stringify(body);

  let primary: Response | undefined;
  let primaryError: unknown;
  try {
    primary = await tryModel(GEMINI_MODEL, apiKey, payload);
    if (primary.ok || !FALLBACK_STATUSES.has(primary.status)) return primary;
  } catch (error) {
    primaryError = error;
  }

  if (GEMINI_FALLBACK_MODEL === GEMINI_MODEL) {
    if (primary) return primary;
    throw primaryError;
  }

  console.warn(`Gemini ${GEMINI_MODEL} unavailable, falling back to ${GEMINI_FALLBACK_MODEL}`);
  try {
    return await tryModel(GEMINI_FALLBACK_MODEL, apiKey, payload);
  } catch (error) {
    // Both failed: surface the primary's response if we have one, since that's the real model.
    if (primary) return primary;
    throw error;
  }
}
