// Server-side Supabase REST helpers for firm invites (Step 1 · 1F,
// api/invite-member.ts / api/accept-invite.ts). Same minimal-client
// convention as api/_lib/github.ts / api/_lib/auth.ts — no
// @supabase/supabase-js dependency in the root-level api/ functions.
//
// The service role key bypasses RLS entirely and must never reach the
// client or a log line. It's used only for the handful of operations an
// authenticated-but-not-yet-a-member caller can't do under their own RLS
// policies: looking up an invite by its raw token before they're a firm
// member, writing firm_members/firm_invites rows that have no insert policy
// for `authenticated` by design, and sending the Supabase Auth invite email.
import { createHash, randomBytes } from 'crypto';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export function serviceRoleConfigured(): boolean {
  return !!SUPABASE_URL && !!SERVICE_ROLE_KEY;
}

export function generateInviteToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface RestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** PostgREST call using the service role key — bypasses RLS. Server-only. */
export async function serviceRoleRest(path: string, opts: RestOptions = {}): Promise<Response> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured on the server');
  }
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

/** PostgREST call using the caller's own access token — RLS-scoped to them, same as api/_lib/agentIssueRateLimit.ts. */
export async function userRest(path: string, accessToken: string, opts: RestOptions = {}): Promise<Response> {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error('Supabase env vars are not configured on the server');
  }
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

/**
 * Sends a Supabase Auth admin invite email. Returns true if sent, false if
 * the address already belongs to a registered user (an expected, non-fatal
 * outcome — the caller falls back to a copyable link instead). Throws on any
 * other failure.
 */
export async function sendAuthInviteEmail(email: string, redirectTo: string, data: Record<string, unknown>): Promise<boolean> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured on the server');
  }
  // GoTrue's admin invite endpoint (POST /auth/v1/invite) reads the redirect
  // target from a `redirect_to` QUERY PARAMETER, not the JSON body — same as
  // supabase-js's `auth.admin.inviteUserByEmail(email, { redirectTo })`,
  // which appends it via `_request`'s `options.redirectTo` (see
  // node_modules/@supabase/auth-js/dist/main/lib/fetch.js). Putting it in
  // the body (the old bug here) is silently ignored, so GoTrue falls back to
  // the project's Site URL and invitees never land on /invite/:token.
  const url = new URL(`${SUPABASE_URL}/auth/v1/invite`);
  url.searchParams.set('redirect_to', redirectTo);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, data }),
  });
  if (res.ok) return true;
  const text = await res.text().catch(() => '');
  // Supabase's admin invite endpoint returns a 4xx with a message like "User
  // already registered" when the address already has an account.
  if (/already registered|already exists/i.test(text)) return false;
  throw new Error(`Failed to send invite email: ${res.status} ${text}`);
}

export function requestOrigin(headers: Record<string, string | string[] | undefined>): string {
  const rawOrigin = headers['origin'];
  const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
  if (origin) return origin;
  const rawHost = headers['x-forwarded-host'] || headers['host'];
  const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
  const proto = (Array.isArray(headers['x-forwarded-proto']) ? headers['x-forwarded-proto']![0] : headers['x-forwarded-proto']) || 'https';
  return host ? `${proto}://${host}` : 'https://edemame.vercel.app';
}
