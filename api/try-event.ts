import type { IncomingMessage, ServerResponse } from "http";
import { serviceRoleConfigured } from "./_lib/firms";
import { parseAudience, parsePageEventKind, utcDay } from "./_lib/tryAdvisor";
import { bumpTrialEvent } from "./_lib/tryAdvisorEvents";

// Counts the two trial moments only the page can see (docs/plans/public-visa-advisor-trial.md,
// VA.3): "started" (the visitor chose who the check is for) and "register_click" (an applicant
// opened the register of migration agents). Nothing about the visitor is stored: only a daily count
// per audience. Answers 204 either way, so the page never waits on it or shows an error.
//
// Known gap, accepted: there's no Turnstile or per-IP limit here, so someone could inflate these
// two counters. They're owner-facing numbers with no cost attached; the expensive endpoint
// (try-eligibility) is the one that's locked down.

interface VercelRequest extends IncomingMessage {
  method: string;
  body: any;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: any): VercelResponse;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (process.env.TRY_ADVISOR_ENABLED !== "true" || !serviceRoleConfigured()) {
    return res.status(204).end();
  }

  // sendBeacon posts text/plain, so the body may arrive as a string.
  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  const kind = parsePageEventKind(body?.kind);
  const audience = parseAudience(body?.audience);
  if (!kind || !audience) {
    return res.status(400).json({ error: "Invalid event" });
  }

  await bumpTrialEvent(utcDay(), audience, kind);
  return res.status(204).end();
}
