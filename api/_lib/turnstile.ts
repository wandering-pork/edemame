// Cloudflare Turnstile server-side check for the public Visa Advisor trial
// (docs/plans/public-visa-advisor-trial.md, VA.1). TURNSTILE_SECRET_KEY is server-only.
//
// For local dev and Vercel Preview, Cloudflare publishes test keys that always pass:
//   site key   1x00000000000000000000AA
//   secret     1x0000000000000000000000000000000AA
// so no Cloudflare account is needed until launch.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const turnstileConfigured = () => !!process.env.TURNSTILE_SECRET_KEY;

/** True only when Cloudflare confirms the token. Any error (network, bad response) counts as a fail. */
export async function verifyTurnstile(token: unknown, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || typeof token !== "string" || !token || token.length > 2048) return false;

  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (error) {
    console.error("try-eligibility: Turnstile verification failed:", error);
    return false;
  }
}
