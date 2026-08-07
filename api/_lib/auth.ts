// Server-side Supabase session verification, shared by any api/ route that
// needs to know a real authenticated user is behind the request (see PR #21
// code review on GitHub issue #15's agentic issue-filing endpoints — neither
// api/file-github-issue.ts nor api/focus-chat.ts checked auth before this).
//
// There is no existing server-side auth pattern elsewhere in api/ to follow,
// and no root-level package.json/node_modules for these Vercel functions
// (only src/ has one — see vercel.json's buildCommand), so this deliberately
// avoids adding @supabase/supabase-js as a dependency here and instead talks
// to Supabase's REST APIs directly with plain fetch, same minimal-client
// pattern as api/_lib/github.ts.
//
// Verification: GET {SUPABASE_URL}/auth/v1/user with the caller's bearer
// token — this is Supabase Auth's (GoTrue) documented way to resolve a JWT
// to a user server-side using only the anon key, no service role key needed.

// Vercel exposes all configured project env vars to serverless functions
// regardless of the `VITE_` prefix (that prefix only controls what Vite
// inlines into the client bundle) -- so the same values already set for the
// frontend (see CLAUDE.md's Auth setup) work here without extra config.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export interface VerifiedUser {
  userId: string;
  /** The caller's own verified access token, for making RLS-scoped REST calls on their behalf. */
  accessToken: string;
}

function extractBearerToken(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headers["authorization"] ?? headers["Authorization"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Verifies the Authorization: Bearer <token> header against Supabase Auth.
 * Returns null if the header is missing/malformed, Supabase isn't
 * configured, or the token doesn't resolve to a real session -- callers
 * should respond 401 in that case.
 */
export async function verifySupabaseUser(headers: Record<string, string | string[] | undefined>): Promise<VerifiedUser | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Supabase env vars are not configured on the server -- cannot verify auth");
    return null;
  }

  const token = extractBearerToken(headers);
  if (!token) return null;

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data?.id || typeof data.id !== "string") return null;

    return { userId: data.id, accessToken: token };
  } catch (error) {
    console.error("Supabase auth verification failed:", error);
    return null;
  }
}
