import type { Document, DocumentChecklistItem, DocumentType } from '../types';

/**
 * Document Checklist auto-link (GitHub issue #4 §4.3).
 *
 * A Case File whose Document Type matches a checklist item's
 * `documentTypeCode`, and whose Document Type has `autoLink` on in the firm's
 * Configurations, links itself to that item and flips it to Linked.
 *
 * This is a *display-time recalculation*, not a background process: it runs
 * when the Document Checklist tab is opened, when the Refresh button is
 * pressed, and immediately for a single item when its Document Type changes.
 *
 * Two rules are load-bearing:
 *  - **Never touch Verified or Waived items.** Those are human decisions and a
 *    later upload or config change must not silently overwrite them.
 *  - **Most recently uploaded file wins** when several share a Document Type,
 *    using `Document.uploadedAt` as the created time.
 *
 * Judgment call, not spelled out in the issue: an item already in **Linked**
 * status keeps the file it is linked to, unless that link is *stale* — the
 * document has since been deleted, or its Document Type no longer matches the
 * item's. The spec includes Linked items in the pass, but re-pointing a link a
 * user deliberately dragged into place every time a newer file is uploaded
 * would destroy manual work; refreshing only stale links honours both.
 */

/** Returns the auto-linkable document for an item, or undefined if there isn't one. */
function bestMatchFor(
  item: DocumentChecklistItem,
  documents: Document[],
  typesByCode: Map<string, DocumentType>,
): Document | undefined {
  const code = item.documentTypeCode;
  if (!code) return undefined;
  const type = typesByCode.get(code);
  if (!type?.autoLink) return undefined;

  const candidates = documents.filter(d => d.documentTypeCode === code);
  if (candidates.length === 0) return undefined;

  // Tie-break: most recently uploaded wins (§4.3).
  return candidates.reduce((newest, d) =>
    new Date(d.uploadedAt).getTime() > new Date(newest.uploadedAt).getTime() ? d : newest,
  );
}

/**
 * Recalculates auto-link for a single item. Returns the item unchanged when
 * nothing applies, so callers can cheaply detect a no-op by identity.
 */
export function recalcAutoLinkForItem(
  item: DocumentChecklistItem,
  documents: Document[],
  typesByCode: Map<string, DocumentType>,
): DocumentChecklistItem {
  if (item.status === 'verified' || item.status === 'waived') return item;

  if (item.status === 'linked' && item.linkedDocumentId) {
    const linked = documents.find(d => d.id === item.linkedDocumentId);
    const isStale = !linked || (!!item.documentTypeCode && linked.documentTypeCode !== item.documentTypeCode);
    if (!isStale) return item;
  }

  const match = bestMatchFor(item, documents, typesByCode);
  if (!match) return item;
  if (item.linkedDocumentId === match.id && item.status === 'linked') return item;
  return { ...item, linkedDocumentId: match.id, status: 'linked' };
}

/**
 * Recalculates auto-link across a whole checklist. Returns the original array
 * (by identity) when nothing changed, so a caller can skip a state update — and
 * therefore skip a repository write — on a no-op pass.
 */
export function recalcAutoLinks(
  items: DocumentChecklistItem[],
  documents: Document[],
  documentTypes: DocumentType[],
): DocumentChecklistItem[] {
  const typesByCode = new Map(documentTypes.map(t => [t.code, t]));
  let changed = false;
  const next = items.map(item => {
    const updated = recalcAutoLinkForItem(item, documents, typesByCode);
    if (updated !== item) changed = true;
    return updated;
  });
  return changed ? next : items;
}
