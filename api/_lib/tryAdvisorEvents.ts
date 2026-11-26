import { serviceRoleRest } from "./firms";

// VA.3 daily counters for the public Visa Advisor trial (try_advisor_events,
// supabase/migrations/20261126000100_try_advisor_events.sql). Service role only.

/** Bumps one day + audience + kind counter. Never throws: a missed count isn't worth failing a request. */
export async function bumpTrialEvent(day: string, audience: string, kind: string): Promise<void> {
  try {
    const res = await serviceRoleRest("rpc/try_advisor_bump", {
      method: "POST",
      body: { p_day: day, p_audience: audience, p_kind: kind },
    });
    if (!res.ok) console.error("try-advisor: counting", kind, "failed:", res.status);
  } catch (error) {
    console.error("try-advisor: counting", kind, "failed:", error);
  }
}
