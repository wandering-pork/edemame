import { addMonths, differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { DocumentChecklistItem, LmtAdRecord, Task } from '../types';

/**
 * Labour Market Testing (LMT) window rules — GitHub issue #31.
 *
 * DoHA requires employer-sponsored nominations to be supported by evidence of
 * at least two job advertisements, each run for a minimum of 28 days, and the
 * nomination must be lodged **within 4 months of the advertising campaign's
 * closing date**. Once that window lapses the evidence expires and the employer
 * has to re-advertise before the nomination can be lodged.
 *
 * Scope note: this module models the general 4-month rule as stated in the
 * issue. Real-world LMT policy has carve-outs this deliberately does not encode
 * (international trade obligation exemptions, ad requirements that vary with
 * the occupation and the sponsor's redundancy history, and periods where the
 * Department has extended the window by legislative instrument). The dates it
 * shows are a prompt to check, not legal advice.
 */

/** Months between the last ad's closing date and the nomination lodgement deadline. */
export const LMT_WINDOW_MONTHS = 4;

/** Days out from expiry at which the case starts warning. */
export const LMT_WARNING_DAYS = 30;

/** Minimum number of advertisements DoHA expects as LMT evidence. */
export const LMT_MIN_ADS = 2;

/** Minimum number of days each advertisement must have run for. */
export const LMT_MIN_AD_DAYS = 28;

/**
 * Subclasses whose nominations carry an LMT requirement. Not hardcoded to 482:
 * 494 and 186 (Direct Entry / TRT, depending on the stream) have equivalent
 * requirements, so the feature is enabled by subclass membership here rather
 * than by an `if (subclass === '482')` anywhere in the UI.
 */
export const LMT_SUBCLASSES = ['482', '494', '186'];

/** The Document Type code for uploaded ad evidence (seeded in `lib/documentTypes.ts`). */
export const LMT_EVIDENCE_DOCUMENT_TYPE_CODE = 'LMTEVD';

/** The Document Type code for the nomination application itself (Form 1395). */
export const NOMINATION_DOCUMENT_TYPE_CODE = 'NOMAPP';

export function caseRequiresLmt(visaSubclass?: string): boolean {
  return !!visaSubclass && LMT_SUBCLASSES.includes(visaSubclass);
}

export type LmtWindowState =
  /** No ad records captured yet — nothing to track. */
  | 'no-records'
  /** Expiry is more than LMT_WARNING_DAYS away. */
  | 'ok'
  /** Expiry is within LMT_WARNING_DAYS. */
  | 'approaching'
  /** Expiry date has passed. */
  | 'lapsed';

export interface LmtWindowStatus {
  state: LmtWindowState;
  /** Latest `endDate` across all ad records — the campaign closing date. */
  latestAdEndDate?: string;
  /** `latestAdEndDate` + LMT_WINDOW_MONTHS, YYYY-MM-DD. */
  expiryDate?: string;
  /** Days until expiry; negative once lapsed. */
  daysRemaining?: number;
  adCount: number;
  /** Ads that ran for fewer than LMT_MIN_AD_DAYS — advisory only. */
  shortAds: LmtAdRecord[];
}

/** Inclusive day count an ad ran for, or null when either date is unparseable. */
export function adDurationDays(record: LmtAdRecord): number | null {
  try {
    const start = parseISO(record.startDate);
    const end = parseISO(record.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return differenceInCalendarDays(end, start) + 1;
  } catch {
    return null;
  }
}

/**
 * The window is anchored on the *latest* closing date in the set: an employer
 * who re-runs one ad extends the campaign, and lodging against the earliest ad
 * would flag an expiry that has not actually happened.
 */
export function computeLmtWindow(records: LmtAdRecord[], now: Date = new Date()): LmtWindowStatus {
  const shortAds = records.filter(r => {
    const days = adDurationDays(r);
    return days !== null && days < LMT_MIN_AD_DAYS;
  });

  const endDates = records.map(r => r.endDate).filter(Boolean).sort();
  const latestAdEndDate = endDates[endDates.length - 1];
  if (!latestAdEndDate) {
    return { state: 'no-records', adCount: records.length, shortAds };
  }

  const parsed = parseISO(latestAdEndDate);
  if (Number.isNaN(parsed.getTime())) {
    return { state: 'no-records', adCount: records.length, shortAds };
  }

  const expiry = addMonths(parsed, LMT_WINDOW_MONTHS);
  const daysRemaining = differenceInCalendarDays(expiry, now);

  const state: LmtWindowState =
    daysRemaining < 0 ? 'lapsed' : daysRemaining <= LMT_WARNING_DAYS ? 'approaching' : 'ok';

  return {
    state,
    latestAdEndDate,
    expiryDate: format(expiry, 'yyyy-MM-dd'),
    daysRemaining,
    adCount: records.length,
    shortAds,
  };
}

export interface NominationLodgedSignal {
  lodged: boolean;
  /** Human-readable explanation of what was (or wasn't) matched. */
  reason: string;
}

const NOMINATION_LABEL_RE = /nomination/i;
const LODGEMENT_VERB_RE = /lodg|submit|filed?\b/i;

/**
 * "Has the nomination been lodged?" inferred from case state that already
 * exists, rather than from a new nomination-tracking entity:
 *
 * 1. A Document Checklist item representing the nomination (Document Type
 *    `NOMAPP`, or a label mentioning "nomination") that has reached
 *    linked / verified / waived — i.e. the nomination paperwork is on file.
 * 2. A completed case Task whose title reads as nomination lodgement
 *    (e.g. "Lodge nomination").
 *
 * Either is enough. Both are user-controllable without a new UI concept, which
 * is the point: a practitioner can always silence a stale alert by ticking the
 * work they've actually done.
 */
export function inferNominationLodged(
  checklist: DocumentChecklistItem[],
  tasks: Task[],
): NominationLodgedSignal {
  const checklistHit = checklist.find(
    i =>
      (i.documentTypeCode === NOMINATION_DOCUMENT_TYPE_CODE || NOMINATION_LABEL_RE.test(i.label)) &&
      (i.status === 'linked' || i.status === 'verified' || i.status === 'waived'),
  );
  if (checklistHit) {
    return { lodged: true, reason: `Checklist item "${checklistHit.label}" is ${checklistHit.status}.` };
  }

  const taskHit = tasks.find(
    t => t.isCompleted && NOMINATION_LABEL_RE.test(t.title) && LODGEMENT_VERB_RE.test(t.title),
  );
  if (taskHit) {
    return { lodged: true, reason: `Task "${taskHit.title}" is complete.` };
  }

  return {
    lodged: false,
    reason:
      'No nomination checklist item is linked/verified and no completed task mentions lodging the nomination.',
  };
}

/** True when the case should be shouting about the LMT window right now. */
export function shouldAlertLmt(status: LmtWindowStatus, nominationLodged: boolean): boolean {
  if (nominationLodged) return false;
  return status.state === 'approaching' || status.state === 'lapsed';
}

/** Stable notification id, so the same window never notifies twice. */
export function lmtNotificationId(caseId: string, status: LmtWindowStatus): string {
  return `lmt-${caseId}-${status.expiryDate}-${status.state}`;
}
