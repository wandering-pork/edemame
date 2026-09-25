/**
 * Maps raw Supabase Auth error messages to plain, user-facing copy. Supabase
 * surfaces GoTrue's own wording verbatim (e.g. "email rate limit exceeded",
 * "For security purposes, you can only request this after 57 seconds.") —
 * accurate for a developer, confusing for an end user who just clicked
 * "Create account" or "Send reset link".
 *
 * Used wherever an auth-related error reaches the UI: the sign-up and
 * sign-in forms and "Send reset link" action in pages/LandingPage.tsx,
 * pages/ResetPassword.tsx, and contexts/AuthContext.tsx's own returned error
 * strings (updatePassword, called directly by ResetPassword and by the
 * shared account-setup form on /invite/:token and the app-wide
 * AccountSetupGate).
 *
 * Supabase's built-in email sender is rate-limited to a small number of
 * emails per hour per project (invite/confirm/reset all share the same
 * limiter) — see docs/user-manual/faq (password & sign-up errors) for the
 * user-facing explanation this mirrors.
 */

export type AuthErrorContext = 'sign-up' | 'sign-in' | 'reset' | 'default';

const RATE_LIMIT_PATTERN = /email rate limit exceeded|over_email_send_rate_limit/i;
const COOLDOWN_PATTERN = /only request this after|you can only request this/i;

const RATE_LIMIT_MESSAGE =
  "We couldn't send the email right now — too many emails were sent recently. Please try again in about an hour.";
const COOLDOWN_MESSAGE = 'Please wait a few seconds and try again.';
const INVITE_HINT = ' If you were invited to a firm, use the link in your invite email instead of creating an account.';

/** Capitalizes the first letter and ensures exactly one trailing full stop. */
function toSentenceCase(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;
  const capitalized = trimmed[0].toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

/**
 * Maps a raw Supabase Auth error message (or any error string) to friendly,
 * sentence-cased copy. `context` selects extra guidance that only makes
 * sense for that specific flow — currently only sign-up's "use your invite
 * link instead" addendum on the rate-limit message.
 */
export function mapAuthError(raw: string | null | undefined, context: AuthErrorContext = 'default'): string | null {
  if (raw == null) return raw ?? null;
  const message = raw.trim();
  if (!message) return message;

  if (RATE_LIMIT_PATTERN.test(message)) {
    return context === 'sign-up' ? `${RATE_LIMIT_MESSAGE}${INVITE_HINT}` : RATE_LIMIT_MESSAGE;
  }
  if (COOLDOWN_PATTERN.test(message)) {
    return COOLDOWN_MESSAGE;
  }
  return toSentenceCase(message);
}
