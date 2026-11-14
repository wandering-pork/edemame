import { v4 as uuidv4 } from 'uuid';
import { NOT_CONFIRMED_SUBCLASS, type VisaType } from '../types';

/**
 * Visa Types — the firm's subclass + substream list (Configuration → Work
 * Plans → Visa Types). Feeds the Subclass/Substream pickers on Work Plans and
 * cases. Same per-firm, seed-on-load pattern as `lib/documentTypes.ts`.
 */

export const NOT_CONFIRMED_LABEL = 'Not Confirmed';

interface SystemVisaType {
  systemKey: string;
  subclass: string;
  name: string;
  substream: string;
  note: string;
}

const sys = (subclass: string, name: string, substreams: string[], note = ''): SystemVisaType[] =>
  (substreams.length ? substreams : ['']).map(substream => ({
    systemKey: `${subclass}:${substream ? substream.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'none'}`,
    subclass,
    name,
    substream,
    note,
  }));

/**
 * Shipped defaults, one row per subclass + substream. Never reorder or rekey
 * an existing entry — `systemKey` is how seeding recognises rows a firm
 * already has (including hidden or edited ones) and how Reset finds the
 * original. Append new defaults freely: they appear for every firm on next
 * load without touching anyone's edits.
 */
export const SYSTEM_VISA_TYPES: SystemVisaType[] = [
  ...sys('189', 'Skilled Independent', ['Points-tested', 'New Zealand']),
  ...sys('190', 'Skilled Nominated', []),
  ...sys('186', 'Employer Nomination Scheme', ['Direct Entry', 'Temporary Residence Transition', 'Labour Agreement']),
  ...sys('482', 'Skills in Demand', ['Core Skills', 'Specialist Skills', 'Labour Agreement']),
  ...sys('491', 'Skilled Work Regional (Provisional)', ['State/Territory Nominated', 'Family Sponsored']),
  ...sys('500', 'Student', [], 'Sectors: Schools, VET, Higher Education, Postgraduate Research, ELICOS, Non-Award, AusAID/Defence'),
  ...sys('485', 'Temporary Graduate', ['Post-Higher Education Work', 'Post-Vocational Education Work', 'Second Post-Higher Education Work']),
  ...sys('600', 'Visitor', ['Tourist', 'Sponsored Family', 'Business Visitor', 'Approved Destination Status', 'Frequent Traveller']),
  ...sys('417', 'Working Holiday', [], 'Track 1st/2nd/3rd year separately'),
  ...sys('820', 'Partner (Temporary/Residence)', []),
];

/** Subclasses shown with a different code than the one stored (cases store "820" for the 820/801 pair). */
const DISPLAY_CODES: Record<string, string> = { '820': '820/801' };

export const displaySubclassCode = (code: string): string => DISPLAY_CODES[code] ?? code;

/** True for a real, decided subclass — not blank and not Not Confirmed. */
export const isConfirmedSubclass = (subclass: string | undefined | null): subclass is string =>
  !!subclass && subclass !== NOT_CONFIRMED_SUBCLASS;

/**
 * Seeds any shipped default the firm doesn't have yet (matched by
 * `systemKey`, so hidden/edited rows are never re-added) and returns the full
 * list. Idempotent.
 */
export async function ensureSystemVisaTypes(repo: {
  getAll(): Promise<VisaType[]>;
  createMany(items: VisaType[]): Promise<VisaType[]>;
}): Promise<VisaType[]> {
  const existing = await repo.getAll();
  const known = new Set(existing.map(t => t.systemKey).filter(Boolean));
  const missing: VisaType[] = SYSTEM_VISA_TYPES.filter(s => !known.has(s.systemKey)).map(s => ({
    id: uuidv4(),
    subclass: s.subclass,
    name: s.name,
    substream: s.substream,
    note: s.note,
    isSystemDefault: true,
    systemKey: s.systemKey,
    hidden: false,
  }));
  if (missing.length === 0) return existing;
  await repo.createMany(missing);
  return [...existing, ...missing];
}

const systemIndex = new Map(SYSTEM_VISA_TYPES.map((s, i) => [s.systemKey, i]));
const subclassRank = new Map<string, number>();
SYSTEM_VISA_TYPES.forEach((s, i) => { if (!subclassRank.has(s.subclass)) subclassRank.set(s.subclass, i); });

/** Shipped subclasses in their shipped order, then firm-added ones by code; within a subclass, shipped rows first. */
export function sortVisaTypes(types: VisaType[]): VisaType[] {
  const rank = (t: VisaType) => subclassRank.get(t.subclass) ?? Number.MAX_SAFE_INTEGER;
  const within = (t: VisaType) => (t.systemKey ? systemIndex.get(t.systemKey) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER);
  return [...types].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.subclass.localeCompare(b.subclass, undefined, { numeric: true }) ||
      within(a) - within(b) ||
      a.substream.localeCompare(b.substream),
  );
}

export interface SubclassOption {
  code: string;
  label: string;
}

/** e.g. "189 Skilled Independent", "820/801 Partner (Temporary/Residence)", "Not Confirmed". */
export function formatSubclass(code: string | undefined | null, types: VisaType[] = []): string {
  if (!code) return '';
  if (code === NOT_CONFIRMED_SUBCLASS) return NOT_CONFIRMED_LABEL;
  const name =
    types.find(t => t.subclass === code && !t.hidden)?.name ??
    types.find(t => t.subclass === code)?.name ??
    SYSTEM_VISA_TYPES.find(s => s.subclass === code)?.name;
  return name ? `${displaySubclassCode(code)} ${name}` : `Subclass ${displaySubclassCode(code)}`;
}

/**
 * Unique, visible subclasses for a picker, in list order. Not Confirmed is
 * NOT included — pickers render it themselves as a fixed option. `keep` is a
 * value already saved on the record being edited: it's kept in the list even
 * if its Visa Type has since been hidden or removed, so opening an old record
 * never silently drops its subclass.
 */
export function subclassOptions(types: VisaType[], keep?: string): SubclassOption[] {
  const seen = new Set<string>();
  const out: SubclassOption[] = [];
  for (const t of sortVisaTypes(types)) {
    if (t.hidden || seen.has(t.subclass)) continue;
    seen.add(t.subclass);
    out.push({ code: t.subclass, label: formatSubclass(t.subclass, types) });
  }
  if (isConfirmedSubclass(keep) && !seen.has(keep)) out.push({ code: keep, label: formatSubclass(keep, types) });
  return out;
}

/**
 * Visible substreams for a subclass, in list order. Empty for blank / Not
 * Confirmed, and for a subclass whose only row has no substream. `keep` works
 * as in `subclassOptions()`.
 */
export function substreamsFor(types: VisaType[], subclass: string | undefined | null, keep?: string): string[] {
  if (!isConfirmedSubclass(subclass)) return [];
  const out: string[] = [];
  for (const t of sortVisaTypes(types)) {
    if (t.subclass !== subclass || t.hidden || !t.substream || out.includes(t.substream)) continue;
    out.push(t.substream);
  }
  if (keep && !out.includes(keep)) out.push(keep);
  return out;
}

/**
 * The substream to keep after the subclass changes: the old one if the new
 * subclass still offers it, otherwise none. Not Confirmed / blank always clears it.
 */
export function substreamAfterSubclassChange(
  types: VisaType[],
  newSubclass: string | undefined | null,
  currentSubstream: string | undefined,
): string | undefined {
  if (!currentSubstream || !isConfirmedSubclass(newSubclass)) return undefined;
  return substreamsFor(types, newSubclass).includes(currentSubstream) ? currentSubstream : undefined;
}

/** The shipped default a system row came from, if any. */
export const systemDefaultFor = (t: VisaType): SystemVisaType | undefined =>
  t.systemKey ? SYSTEM_VISA_TYPES.find(s => s.systemKey === t.systemKey) : undefined;

/** A system row whose subclass/name/substream/note no longer match what shipped. */
export function isEditedDefault(t: VisaType): boolean {
  const d = systemDefaultFor(t);
  if (!d) return false;
  return t.subclass !== d.subclass || t.name !== d.name || t.substream !== d.substream || t.note !== d.note;
}

/** Restores a system row's shipped values (keeps its id and hidden flag). */
export function resetVisaType(t: VisaType): VisaType {
  const d = systemDefaultFor(t);
  return d ? { ...t, subclass: d.subclass, name: d.name, substream: d.substream, note: d.note } : t;
}

/** Returns a user-facing error, or null. `ignoreId` skips the row being edited. */
export function validateVisaType(
  input: { subclass: string; name: string; substream: string },
  all: VisaType[],
  ignoreId?: string,
): string | null {
  const subclass = input.subclass.trim();
  if (!subclass) return 'Subclass is required.';
  if (subclass === NOT_CONFIRMED_SUBCLASS || subclass.toLowerCase() === NOT_CONFIRMED_LABEL.toLowerCase()) {
    return '"Not Confirmed" is built in and can\'t be added as a subclass.';
  }
  if (!input.name.trim()) return 'Subclass name is required.';
  const substream = input.substream.trim().toLowerCase();
  const dup = all.find(
    t => t.id !== ignoreId && t.subclass === subclass && t.substream.trim().toLowerCase() === substream,
  );
  if (dup) return substream ? 'That subclass already has this substream.' : 'That subclass is already in the list.';
  return null;
}

/** Search across subclass code, name, substream and note. */
export function filterVisaTypes(types: VisaType[], query: string): VisaType[] {
  const q = query.trim().toLowerCase();
  if (!q) return types;
  return types.filter(t =>
    `${t.subclass} ${displaySubclassCode(t.subclass)} ${t.name} ${t.substream} ${t.note}`.toLowerCase().includes(q),
  );
}

/** Compact chip text: "SC-189", "SC-820/801", or "Not Confirmed". */
export const subclassChip = (code: string): string =>
  code === NOT_CONFIRMED_SUBCLASS ? NOT_CONFIRMED_LABEL : `SC-${displaySubclassCode(code)}`;

/** Short label: "Subclass 189", or "Not Confirmed". Add " · substream" when one is given. */
export const subclassShortLabel = (code: string, substream?: string): string =>
  (code === NOT_CONFIRMED_SUBCLASS ? NOT_CONFIRMED_LABEL : `Subclass ${displaySubclassCode(code)}`) +
  (substream ? ` · ${substream}` : '');
