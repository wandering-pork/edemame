/**
 * Case titles in lists. Most titles are built as "<visa> - <client>", and
 * Case Manager shows the client and subclass separately, so these trim the
 * repeats for display only. The stored title is never changed.
 */

/** "Skilled Independent (Subclass 189) - brad bird" → "Skilled Independent (Subclass 189)" when the name is shown underneath anyway. */
export function titleWithoutClient(title: string, clientName: string | undefined): string {
  const name = clientName?.trim();
  if (!name) return title;
  const m = title.match(new RegExp(`^(.*?)\\s*[,\\-\u2013\u2014:|]\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'));
  return m && m[1].trim() ? m[1].trim() : title;
}

/** True when the title already names the subclass ("... (Subclass 189)"), so the chip would repeat it. */
export const titleNamesSubclass = (title: string, subclass: string) =>
  new RegExp(`(^|[^0-9])${subclass.replace(/[^0-9a-z]/gi, '')}([^0-9]|$)`, 'i').test(title);
