import type { IncomingMessage, ServerResponse } from "http";
import { verifySupabaseUser } from "./_lib/auth";
import { serviceRoleConfigured, serviceRoleRest, hashInviteToken } from "./_lib/firms";

interface VercelRequest extends IncomingMessage {
  method: string;
  body: any;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: any): VercelResponse;
}

// Step 1 · 1F — accepts a firm invite (the /invite/:token link from the
// email api/invite-member.ts sends). Needs the service role key because:
//   - looking up an invite by its raw token has to work before the caller is
//     a firm member (firm_invites has no select policy that would let them),
//   - firm_members has no insert policy for `authenticated` (only
//     create_firm() and this endpoint write membership rows), and
//   - this does three related writes (firm_members insert, profiles update,
//     firm_invites accepted_at) that aren't one Postgres transaction over
//     plain REST — see the KNOWN GAP note below.
//
// KNOWN GAP: not atomic. If the process dies between the firm_members
// upsert and the firm_invites accepted_at update, a retry of this same
// request re-runs cleanly (the upsert is idempotent — see on_conflict
// below), but the invite could theoretically be accepted a second time by
// someone else racing the same token in that narrow window. Acceptable for
// this data scale/abuse profile: invite acceptance is a one-time,
// user-initiated action, not a hot path.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await verifySupabaseUser(req.headers);
  if (!auth) {
    return res.status(401).json({ error: "You must be signed in to accept an invite" });
  }
  if (!auth.email) {
    return res.status(400).json({ error: "Your account has no email on file — cannot verify this invite" });
  }

  const { token } = req.body || {};
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Missing invite token" });
  }

  if (!serviceRoleConfigured()) {
    return res.status(500).json({ error: "Invites aren't configured yet" });
  }

  try {
    const tokenHash = hashInviteToken(token);
    const lookupRes = await serviceRoleRest(
      `firm_invites?token_hash=eq.${encodeURIComponent(tokenHash)}&select=id,firm_id,email,role,expires_at,accepted_at,revoked_at`
    );
    if (!lookupRes.ok) {
      throw new Error(`Invite lookup failed: ${lookupRes.status}`);
    }
    const rows = await lookupRes.json();
    const invite = Array.isArray(rows) ? rows[0] : null;
    if (!invite) {
      return res.status(404).json({ error: "This invite link is invalid." });
    }
    if (invite.revoked_at) {
      return res.status(410).json({ error: "This invite has been revoked." });
    }
    if (invite.accepted_at) {
      return res.status(409).json({ error: "This invite has already been accepted." });
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: "This invite has expired. Ask the firm owner to send a new one." });
    }
    if (invite.email.toLowerCase() !== auth.email.toLowerCase()) {
      return res.status(403).json({ error: "This invite was sent to a different email address than the one you're signed in with." });
    }

    // PostgREST upsert: on_conflict is a query param, resolution=merge-duplicates
    // is the Prefer directive — a retried request (e.g. the user double-clicks,
    // or a network blip causes a resend) lands as a no-op update instead of a
    // rejected duplicate-key insert.
    const memberRes = await serviceRoleRest("firm_members?on_conflict=firm_id,user_id", {
      method: "POST",
      headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
      body: {
        firm_id: invite.firm_id,
        user_id: auth.userId,
        role: invite.role,
      },
    });
    if (!memberRes.ok) {
      const text = await memberRes.text().catch(() => "");
      throw new Error(`Failed to add firm member: ${memberRes.status} ${text}`);
    }

    const profileRes = await serviceRoleRest(`profiles?user_id=eq.${encodeURIComponent(auth.userId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { current_firm_id: invite.firm_id },
    });
    if (!profileRes.ok) {
      // Not fatal: the membership row is what matters for access; current_firm_id
      // has a client-side self-heal fallback (contexts/FirmContext.tsx) if this
      // update didn't land (e.g. the user has no profiles row yet).
      console.error(`Failed to set current_firm_id after accepting invite: ${profileRes.status}`);
    }

    const acceptRes = await serviceRoleRest(`firm_invites?id=eq.${encodeURIComponent(invite.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { accepted_at: new Date().toISOString() },
    });
    if (!acceptRes.ok) {
      console.error(`Failed to mark invite accepted: ${acceptRes.status}`);
    }

    const firmRes = await serviceRoleRest(`firms?id=eq.${encodeURIComponent(invite.firm_id)}&select=name`);
    const firmRows = firmRes.ok ? await firmRes.json().catch(() => []) : [];
    const firmName = Array.isArray(firmRows) && firmRows[0] ? firmRows[0].name : null;

    return res.status(200).json({ ok: true, firmId: invite.firm_id, firmName });
  } catch (err) {
    console.error("accept-invite error:", err);
    return res.status(500).json({ error: "Could not accept this invite" });
  }
}
