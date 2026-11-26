// The api/ functions answer `503 { code: "ai_busy", error: "<plain words>" }` when Gemini is
// overloaded, slow, or unreachable (api/_lib/gemini.ts's geminiFailure()). These helpers let the UI
// show that message ("busy, try again in a minute") instead of a generic failure, so people can
// tell a temporary outage from something they did wrong.

export const AI_BUSY_FALLBACK_MESSAGE = 'The AI service is busy right now. Please try again in a minute.';

/** Thrown by services when the server reported the AI as busy. `message` is safe to show as-is. */
export class AiBusyError extends Error {
  constructor(message: string = AI_BUSY_FALLBACK_MESSAGE) {
    super(message);
    this.name = 'AiBusyError';
  }
}

export function isAiBusyError(error: unknown): error is AiBusyError {
  return error instanceof AiBusyError;
}

/** Reads a failed response's body: the server's "busy" message if that's what it was, else null. */
export async function readAiBusyMessage(response: Response): Promise<string | null> {
  try {
    const body = await response.json();
    if (body?.code === 'ai_busy') {
      return typeof body.error === 'string' && body.error ? body.error : AI_BUSY_FALLBACK_MESSAGE;
    }
  } catch {
    // Not JSON (e.g. Vercel's own timeout page): fall through.
  }
  // A gateway timeout from Vercel itself means the AI took too long, which is the same story.
  if (response.status === 504) return AI_BUSY_FALLBACK_MESSAGE;
  return null;
}

/** For a failed response: throws AiBusyError if the AI was busy, otherwise Error(fallback). */
export async function throwForAiResponse(response: Response, fallback: string): Promise<never> {
  const busy = await readAiBusyMessage(response);
  throw busy ? new AiBusyError(busy) : new Error(fallback);
}

/** The message to show for an error from an AI call: the busy message, or `fallback`. */
export function aiErrorMessage(error: unknown, fallback: string): string {
  return isAiBusyError(error) ? error.message : fallback;
}
