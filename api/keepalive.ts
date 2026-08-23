import type { IncomingMessage, ServerResponse } from "http";

interface VercelRequest extends IncomingMessage {
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: any): VercelResponse;
}

/**
 * Pings Supabase so the free-tier project doesn't auto-pause after a week of
 * no API activity. Vercel Cron calls this on a schedule (see vercel.json).
 * Vercel signs cron requests with this header — reject anything else so the
 * endpoint can't be used as an open way to hammer the DB. Uses a plain REST
 * call (not the supabase-js SDK) since api/ has no npm deps of its own —
 * see generate-tasks.ts / scan-passport-gemini.ts for the same pattern.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers["x-vercel-cron"] === undefined && process.env.VERCEL_ENV === "production") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: "Supabase env vars not configured" });
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id&limit=1`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    return res.status(500).json({ ok: false, error: body });
  }

  return res.status(200).json({ ok: true, pingedAt: new Date().toISOString() });
}
