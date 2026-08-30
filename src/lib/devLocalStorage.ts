/**
 * Shared read/write helpers for the dev-offline auth/profile tooling
 * (AuthContext.tsx, ProfileContext.tsx). Both persist a small validated JSON
 * record to localStorage, gated behind `import.meta.env.DEV` so none of this
 * runs in a production build — see the DEV_OFFLINE_AUTH comment in
 * AuthContext.tsx for the full rationale. This is the one place that pattern
 * (parse → shape-validate → clear-on-invalid) lives; don't reimplement it.
 */

/**
 * Reads and JSON-parses `key` from localStorage, validating its shape with
 * `isValid`. Returns `null` (and clears the bad entry) if the key is absent,
 * unparsable, or fails validation.
 */
export function readValidatedJson<T>(key: string, isValid: (value: unknown) => value is T): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isValid(parsed)) return parsed;
    console.error(`Invalid payload for localStorage key "${key}".`);
    localStorage.removeItem(key);
    return null;
  } catch (error) {
    console.error(`Failed to parse localStorage key "${key}".`, error);
    localStorage.removeItem(key);
    return null;
  }
}

/** Serializes `value` as JSON and writes it to localStorage under `key`. */
export function writeLocalJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}
