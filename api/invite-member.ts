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

const VALID_ROLES = ["owner", "agent", "paralegal"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Step 1 · 1F — invites a person into the caller's firm. Only an active
// owner of the target firm may call this (checked below via the caller's own
// RLS-scoped read of their firm_members row, not the service role — no need
// to bypass RLS just to read a row the caller is already allowed to see).
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
    if (!mine || mine.role !== "owner" || mine.status !== "active") {
      return res.status(403).json({ error: "Only a firm owner can invite team members" });
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
    });
  } catch (err) {
    console.error("invite-member error:", err);
    return res.status(500).json({ error: "Could not create the invite" });
  }
}
