// Single source of truth for the Gemini model and the generateContent call, shared by every
// `api/` function that talks to Gemini. Google retires/renames Flash models regularly (and routes
// the old ID to the new one for a while, which can surface as 503s) — change the model here only.
export const GEMINI_MODEL = "gemini-3.6-flash";

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Transient upstream failures worth retrying. 4xx other than 429 (bad key, bad request, model
// not found) are ours to fix and won't change on retry.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [400, 1200];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POSTs `body` to Gemini's generateContent, retrying transient failures (429/5xx and network
 * errors) with a short backoff. Returns the final `Response` — the caller still checks `.ok`.
 * Failures are logged with Google's response body, so a log line says *why*, not just the status.
 */
export async function callGemini(apiKey: string, body: unknown): Promise<Response> {
  const payload = JSON.stringify(body);
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: payload,
      });

      if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) {
        if (!response.ok) {
          const errorBody = await response.clone().text().catch(() => "");
          console.error(`Gemini API error (${GEMINI_MODEL}, attempt ${attempt}):`, response.status, errorBody.slice(0, 500));
        }
        return response;
      }

      console.warn(`Gemini ${response.status} (${GEMINI_MODEL}), retrying (attempt ${attempt}/${MAX_ATTEMPTS})`);
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) throw error;
      console.warn(`Gemini request threw (${GEMINI_MODEL}), retrying (attempt ${attempt}/${MAX_ATTEMPTS}):`, error);
    }
    await sleep(BACKOFF_MS[attempt - 1] ?? 1200);
  }

  throw lastError ?? new Error("Gemini request failed");
}
