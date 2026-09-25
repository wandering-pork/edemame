import type { IncomingMessage, ServerResponse } from "http";
import { verifySupabaseUser } from "./_lib/auth";
import { userRest, hashInviteToken } from "./_lib/firms";

interface VercelRequest extends IncomingMessage {
  method: string;
  body: any;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: any): VercelResponse;
}

// Step 1 · 1G.4 — accepts a firm invite (the /invite/:token link from the
// email api/invite-member.ts sends). This is a thin wrapper around the
// `accept_invite_by_token` SQL function (supabase/migrations/
// 20260927000200_invitations.sql), called as the *signed-in user* over their
// own access token — no service role needed any more. That function does
// the whole lock-invite / validate / insert-membership / upsert-profile /
// stamp-accepted sequence in ONE Postgres transaction, which is what closes
// the "not atomic" gap this file used to carry as a KNOWN GAP comment: the
// old version ran three separate service-role PostgREST calls with no
// transaction wrapping them. The in-app PendingInvitationsBanner and
// CreateFirmGate (Step 1 · 1G.4) call the same RPC directly via
// `supabase.rpc('accept_invite', ...)`, so both entry points share this one
// implementation.
const ERROR_STATUS: Array<[RegExp, number]> = [
  [/no longer exists|invalid/i, 404],
  [/already been accepted/i, 409],
  [/has been revoked/i, 410],
  [/has expired/i, 410],
  [/different email address/i, 403],
  [/confirm your email/i, 403],
  [/not signed in/i, 401],
];

function statusForMessage(message: string): number {
  for (const [pattern, status] of ERROR_STATUS) {
    if (pattern.test(message)) return status;
  }
  return 500;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await verifySupabaseUser(req.headers);
  if (!auth) {
    return res.status(401).json({ error: "You must be signed in to accept an invite" });
  }

  const { token } = req.body || {};
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Missing invite token" });
  }

  try {
    const tokenHash = hashInviteToken(token);
    const rpcRes = await userRest("rpc/accept_invite_by_token", auth.accessToken, {
      method: "POST",
      body: { p_token_hash: tokenHash },
    });

    if (!rpcRes.ok) {
      let message = "Could not accept this invite";
      try {
        const body = await rpcRes.json();
        if (typeof body?.message === "string" && body.message) message = body.message;
      } catch {
        // fall through to the generic message
      }
      return res.status(statusForMessage(message)).json({ error: message });
    }

    const result = await rpcRes.json();
    return res.status(200).json({ ok: true, firmId: result?.firm_id ?? null, firmName: result?.firm_name ?? null });
  } catch (err) {
    console.error("accept-invite error:", err);
    return res.status(500).json({ error: "Could not accept this invite" });
  }
}
