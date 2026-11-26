// Supabase fires onAuthStateChange for things that don't change who is signed in: every token
// refresh (TOKEN_REFRESHED, roughly hourly) and, in supabase-js v2, a SIGNED_IN when the tab
// becomes visible again. Each one carries a brand-new `user` object. Anything that depends on that
// object (an effect, a memo) then re-runs as if the user had changed — which used to make
// FirmContext reload with a full-screen spinner, unmounting the whole app shell and throwing away
// whatever the person was in the middle of. AuthContext keeps the previous object when this says
// nothing meaningful changed.

type ComparableUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

/** JSON.stringify with object keys sorted, so key order alone never counts as a change. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(',')}}`;
}

/**
 * True when two auth users are the same person with the same details the app reads (id, email,
 * user_metadata). A real profile change — e.g. AccountSetupForm setting full_name/password_set —
 * still counts as different, so it still propagates.
 */
export function isSameAuthUser(a: ComparableUser | null | undefined, b: ComparableUser | null | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.id === b.id &&
    (a.email ?? null) === (b.email ?? null) &&
    stableStringify(a.user_metadata ?? {}) === stableStringify(b.user_metadata ?? {})
  );
}
