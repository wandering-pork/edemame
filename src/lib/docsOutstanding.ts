import type { DocumentChecklistItem } from '../types';

/**
 * How many of a case's checklist items are still outstanding — i.e. not yet
 * `linked` or `verified`. Matches `pages/CaseDetails.tsx`'s sidebar
 * definition exactly (`uploadedCount` = linked + verified; outstanding =
 * total − uploaded), including counting a `waived` item as outstanding —
 * "waived" means the agent doesn't need it, not that it's been resolved off
 * the checklist, so it still shows as something to review.
 */
export function countOutstandingChecklistItems(items: DocumentChecklistItem[]): number {
  if (items.length === 0) return 0;
  const uploaded = items.filter(i => i.status === 'linked' || i.status === 'verified').length;
  return items.length - uploaded;
}

/**
 * Sums outstanding checklist items across a set of `checklistItems` (from
 * any number of cases), restricted to `caseIds` — callers pass the ids of
 * non-closed cases so a closed case's stale checklist doesn't inflate the
 * Dashboard's "Docs outstanding" stat.
 */
export function totalOutstandingDocs(
  checklistItems: DocumentChecklistItem[],
  caseIds: Set<string>,
): number {
  const relevant = checklistItems.filter(i => caseIds.has(i.caseId));
  return countOutstandingChecklistItems(relevant);
}
