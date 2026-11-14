/**
 * Whether the Edie panel is open, remembered for the browser session so it
 * stays open when moving between cases. A UI preference, not case data, so
 * sessionStorage is fine; access is wrapped because it can throw (privacy
 * mode, storage disabled).
 */
const SESSION_KEY = 'edamame.edieOpen';

export function loadEdieOpen(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveEdieOpen(open: boolean): void {
  try {
    sessionStorage.setItem(SESSION_KEY, open ? '1' : '0');
  } catch {
    // Not remembered; the panel still works for this page view.
  }
}
