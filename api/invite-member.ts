import type { IncomingMessage, ServerResponse } from "http";
import { verifySupabaseUser } from "./_lib/auth";
import {
  serviceRoleConfigured,
  serviceRoleRest,
  userRest,
  generateInviteToken,
  hashInviteToken,
  sendAuthInviteEmail,
  requestOrigin,
} from "./_lib/firms";

interface VercelRequest extends IncomingMessage {
  method: string;
  body: any;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: any): VercelResponse;
}

const VALID_ROLES = ["owner", "admin", "member"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Step 1 · 1F — invites a person into the caller's firm. Only an active
// owner or admin of the target firm may call this (checked below via the
// caller's own RLS-scoped read of their firm_members row, not the service
// role — no need to bypass RLS just to read a row the caller is already
// allowed to see). Step 1 · 1G.2: an admin caller may only invite as Member
// — an owner can invite at any role, including owner/admin.
//
// Writing firm_invites and sending the Supabase Auth invite email both need
// the service role key: firm_invites has no insert policy for `authenticated`
// by design (see the firms migration), and only the service role can call
// Supabase Auth's admin invite endpoint. SUPABASE_SERVICE_ROLE_KEY is
// server-only (this file, under api/) and is never logged or returned to the
// client.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await verifySupabaseUser(req.headers);
  if (!auth) {
    return res.status(401).json({ error: "You must be signed in to invite a team member" });
  }

  const { firmId, email: rawEmail, role } = req.body || {};
  if (!firmId || typeof firmId !== "string") {
    return res.status(400).json({ error: "Missing firmId" });
  }
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!email || !EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  if (!serviceRoleConfigured()) {
    return res.status(500).json({ error: "Invites aren't configured yet" });
  }

  try {
    // Authorization: the caller must be an active owner of this firm.
    const membershipRes = await userRest(
      `firm_members?firm_id=eq.${encodeURIComponent(firmId)}&user_id=eq.${encodeURIComponent(auth.userId)}&select=role,status`,
      auth.accessToken
    );
    if (!membershipRes.ok) {
      throw new Error(`Membership check failed: ${membershipRes.status}`);
    }
    const membership = await membershipRes.json();
    const mine = Array.isArray(membership) ? membership[0] : null;
    if (!mine || mine.status !== "active" || (mine.role !== "owner" && mine.role !== "admin")) {
      return res.status(403).json({ error: "Only a firm owner or admin can invite team members" });
    }
    if (mine.role === "admin" && role !== "member") {
      return res.status(403).json({ error: "Admins can only invite new members as Member" });
    }

    // Step 1 · 1G.3 — check the firm before creating anything. Calls
    // firm_email_status as the CALLER (their own access token, not the
    // service role) — it re-checks the owner/admin bar itself and only ever
    // looks inside this one firm (see the migration's own comment).
    const statusRes = await userRest("rpc/firm_email_status", auth.accessToken, {
      method: "POST",
      body: { f: firmId, p_email: email },
    });
    if (!statusRes.ok) {
      const text = await statusRes.text().catch(() => "");
      throw new Error(`firm_email_status failed: ${statusRes.status} ${text}`);
    }
    const emailStatus = await statusRes.json();

    if (emailStatus === "active") {
      return res.status(409).json({ code: "already_member", error: "Already in your firm" });
    }
    if (emailStatus === "disabled") {
      return res.status(409).json({
        code: "disabled_member",
        error: "This person is disabled in your firm — re-enable them instead of inviting them again.",
      });
    }

    // A pending invite is treated as a resend: revoke the old open invite(s)
    // for this firm+email with the service role (authenticated callers may
    // only ever update firm_invites.revoked_at — see the 1G.2 migration's
    // column grant — but this endpoint already re-verified the caller's
    // owner/admin role above, so using the service role here is just to
    // avoid a second round trip, not a privilege escalation), then fall
    // through to create a fresh invite below exactly as for a new address.
    const isResend = emailStatus === "pending";
    if (isResend) {
      const revokeRes = await serviceRoleRest(
        `firm_invites?firm_id=eq.${encodeURIComponent(firmId)}&email=eq.${encodeURIComponent(email)}&accepted_at=is.null&revoked_at=is.null&declined_at=is.null`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: { revoked_at: new Date().toISOString() },
        }
      );
      if (!revokeRes.ok) {
        const text = await revokeRes.text().catch(() => "");
        throw new Error(`Failed to revoke the old invite before resending: ${revokeRes.status} ${text}`);
      }
    }

    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);

    const insertRes = await serviceRoleRest("firm_invites", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: {
        firm_id: firmId,
        email,
        role,
        token_hash: tokenHash,
        invited_by: auth.userId,
      },
    });
    if (!insertRes.ok) {
      const text = await insertRes.text().catch(() => "");
      // 23505 = unique_violation. Most likely the partial unique index on
      // (firm_id, lower(email)) for open invites — e.g. a concurrent request
      // created one between the firm_email_status check above and this
      // insert. Report it the same way as an already-pending invite rather
      // than a generic 500.
      if (/23505/.test(text)) {
        return res.status(409).json({
          code: "pending_invite_race",
          error: "An invite for this address was just created — refresh and try Resend instead.",
        });
      }
      throw new Error(`Failed to create invite: ${insertRes.status} ${text}`);
    }

    const origin = requestOrigin(req.headers);
    const inviteLink = `${origin}/invite/${token}`;

    let sent = false;
    try {
      sent = await sendAuthInviteEmail(email, inviteLink, { invited_to_firm: firmId, invited_role: role });
    } catch (err) {
      // The invite row exists either way — a copyable link still works even
      // if the email itself failed to send (e.g. Supabase email provider
      // hiccup), so this isn't fatal to the request.
      console.error("Failed to send invite email (invite record was still created):", err);
    }

    return res.status(200).json({
      ok: true,
      sent,
      // Always returned: lets the owner copy the link regardless of whether
      // the email send succeeded (sent: true still went out through
      // Supabase's own invite email; sent: false means the address is
      // already registered, so this is the way to reach them).
      inviteLink,
      resent: isResend,
    });
  } catch (err) {
    console.error("invite-member error:", err);
    return res.status(500).json({ error: "Could not create the invite" });
  }
}
