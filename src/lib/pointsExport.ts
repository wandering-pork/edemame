import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { format } from 'date-fns';
import { sanitiseFilenameSegment } from './pdfBundle';
import {
  POINTS_PASS_MARK,
  POINTS_TEST_AUTHORED_ON,
  POINTS_TEST_DISCLAIMER,
  POINTS_TEST_SOURCE_NOTE,
  type PointsSummary,
} from './pointsTest';

/**
 * The two exports of the Points Calculator (GitHub issue #36):
 *
 *  1. `buildPointsBreakdownPdf` — the full criterion-by-criterion breakdown to
 *     keep in the client file.
 *  2. `buildPointsCoverLetter` — a shorter, cover-letter-shaped points summary
 *     of the kind that accompanies an EOI or nomination lodgement.
 *
 * Both are **drafts for review**, and both say so on their face. Neither is
 * generated from a verified legal source — see `lib/pointsTest.ts`'s header.
 *
 * PDF generation reuses pdf-lib, already a dependency via `lib/pdfBundle.ts`;
 * no second PDF library is introduced. Everything here is pure — no React, no
 * repositories, no DOM.
 */

export interface PointsExportMeta {
  caseTitle: string;
  clientName: string;
  /** Visa applicant, when it differs from the engaging client. */
  applicantName?: string;
  /** Firm/agent preparing the summary, when known. */
  preparedBy?: string;
  generatedOn?: Date;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595.28; // A4 portrait
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.12, 0.14, 0.16);
const MUTED = rgb(0.45, 0.48, 0.52);
const EDAMAME = rgb(0.16, 0.72, 0.4);
const RULE = rgb(0.85, 0.87, 0.89);

/** Splits text into lines that fit `maxWidth` at `size`. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * A tiny top-down cursor over a growing set of pages. pdf-lib draws from the
 * bottom-left, which makes flowing text awkward; this keeps the call sites
 * reading top-to-bottom and adds a page whenever one runs out.
 */
class PdfWriter {
  page: PDFPage;
  y: number;
  private pages: PDFPage[] = [];

  constructor(private doc: PDFDocument, private regular: PDFFont, private bold: PDFFont) {
    this.page = this.newPage();
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private newPage(): PDFPage {
    const page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(page);
    return page;
  }

  space(amount: number) {
    this.y -= amount;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + 28) {
      this.page = this.newPage();
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  text(
    content: string,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; lineGap?: number } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.regular;
    const color = opts.color ?? INK;
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? CONTENT_WIDTH - (x - MARGIN);
    const lineHeight = size + (opts.lineGap ?? 3);
    for (const line of wrap(content, font, size, width)) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      this.page.drawText(line, { x, y: this.y, size, font, color });
    }
  }

  /** Draws right-aligned text on the current line without moving the cursor. */
  textRight(content: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; right?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.regular;
    const right = opts.right ?? PAGE_WIDTH - MARGIN;
    const width = font.widthOfTextAtSize(content, size);
    this.page.drawText(content, { x: right - width, y: this.y, size, font, color: opts.color ?? INK });
  }

  rule() {
    this.ensure(10);
    this.y -= 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.75,
      color: RULE,
    });
    this.y -= 6;
  }

  finish() {
    // Page numbering is applied last, once the total count is known.
    this.pages.forEach((page, i) => {
      const label = `Page ${i + 1} of ${this.pages.length}`;
      const size = 8;
      const width = this.regular.widthOfTextAtSize(label, size);
      page.drawText(label, {
        x: PAGE_WIDTH - MARGIN - width,
        y: MARGIN - 18,
        size,
        font: this.regular,
        color: MUTED,
      });
    });
  }
}

function statusLabel(status: 'unclaimed' | 'proven' | 'outstanding'): string {
  if (status === 'proven') return 'Proven';
  if (status === 'outstanding') return 'Outstanding';
  return 'Not claimed';
}

/** The full points breakdown, for the client file. */
export async function buildPointsBreakdownPdf(summary: PointsSummary, meta: PointsExportMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new PdfWriter(doc, regular, bold);
  const generatedOn = meta.generatedOn ?? new Date();

  w.text('Points Test Breakdown — DRAFT FOR REVIEW', { size: 16, bold: true });
  w.space(4);
  w.text(`Subclass ${summary.subclass} · ${meta.caseTitle}`, { size: 11, color: MUTED });
  w.text(
    `Applicant: ${meta.applicantName || meta.clientName}${meta.applicantName && meta.applicantName !== meta.clientName ? ` (client: ${meta.clientName})` : ''}`,
    { size: 10, color: MUTED },
  );
  w.text(`Prepared ${format(generatedOn, 'd MMMM yyyy')}${meta.preparedBy ? ` by ${meta.preparedBy}` : ''}`, {
    size: 10,
    color: MUTED,
  });
  w.rule();

  // Totals
  w.space(4);
  w.text('Totals', { size: 12, bold: true });
  w.space(2);
  w.text(`Claimed: ${summary.claimedTotal}`, { size: 11, bold: true, color: EDAMAME });
  w.text(`Proven (backed by a document in the case file): ${summary.provenTotal}`, { size: 11 });
  w.text(`Outstanding (claimed but not yet evidenced): ${summary.outstandingTotal}`, { size: 11 });
  w.space(2);
  w.text(
    summary.meetsPassMark
      ? `Claimed total meets the ${POINTS_PASS_MARK}-point minimum. Only the proven total is supported by documents held on file.`
      : `Claimed total is below the ${POINTS_PASS_MARK}-point minimum for an EOI.`,
    { size: 9.5, color: MUTED },
  );

  for (const cap of summary.capAdjustments) {
    if (cap.claimedRaw > cap.claimedCapped || cap.provenRaw > cap.provenCapped) {
      w.text(
        `Cap applied — ${cap.group.label}: ${cap.claimedRaw} claimed reduced to ${cap.group.max}. ${cap.group.note}`,
        { size: 9.5, color: MUTED },
      );
    }
  }

  w.rule();
  w.space(4);
  w.text('Criterion breakdown', { size: 12, bold: true });
  w.space(4);

  for (const r of summary.results) {
    w.ensure(58);
    w.space(6);
    const headerY = w.y;
    w.text(r.criterion.label, { size: 10.5, bold: true, width: CONTENT_WIDTH - 150 });
    const savedY = w.y;
    w.y = headerY - 10.5 - 3;
    w.textRight(`${r.claimedPoints} pts · ${statusLabel(r.status)}`, {
      size: 10,
      bold: true,
      color: r.status === 'proven' ? EDAMAME : r.status === 'outstanding' ? MUTED : MUTED,
    });
    w.y = savedY;

    w.text(r.option ? r.option.label : 'No band claimed.', { size: 9.5, color: MUTED, x: MARGIN + 12 });
    if (r.entry?.note) w.text(`Note: ${r.entry.note}`, { size: 9, color: MUTED, x: MARGIN + 12 });

    if (r.linkedDocuments.length > 0) {
      w.text(`Evidence on file: ${r.linkedDocuments.map(d => d.fileName).join('; ')}`, {
        size: 9,
        x: MARGIN + 12,
      });
    } else if (r.claimedPoints > 0) {
      w.text(`Evidence still required: ${r.criterion.evidenceHint}`, { size: 9, x: MARGIN + 12 });
    }
    if (r.missingDocumentIds.length > 0) {
      w.text(
        `${r.missingDocumentIds.length} previously linked file${r.missingDocumentIds.length === 1 ? ' is' : 's are'} no longer in Case Files.`,
        { size: 9, color: MUTED, x: MARGIN + 12 },
      );
    }
    w.text(`Source: ${r.criterion.source}`, { size: 8, color: MUTED, x: MARGIN + 12 });
  }

  w.rule();
  w.space(4);
  w.text('Important', { size: 10, bold: true });
  w.text(POINTS_TEST_DISCLAIMER, { size: 8.5, color: MUTED });
  w.space(2);
  w.text(`${POINTS_TEST_SOURCE_NOTE} Points table last authored/reviewed ${POINTS_TEST_AUTHORED_ON}.`, {
    size: 8.5,
    color: MUTED,
  });

  w.finish();
  return doc.save();
}

/** `Points_Breakdown_<case>_<yyyyMMdd>.pdf`. */
export function pointsBreakdownFileName(meta: PointsExportMeta, generatedOn = new Date()): string {
  return `Points_Breakdown_${sanitiseFilenameSegment(meta.caseTitle)}_${format(generatedOn, 'yyyyMMdd')}.pdf`;
}

// ---------------------------------------------------------------------------
// Cover letter points summary
// ---------------------------------------------------------------------------

/**
 * A cover-letter-shaped points summary of the kind that accompanies an EOI or
 * a nomination lodgement: criterion → points claimed → evidence reference →
 * total.
 *
 * Framed as a draft throughout, the same way the Reference Letter Generator's
 * output is: it is prepared for a human to check, edit and sign, never a
 * finished submission. Only claimed points appear in the body totals (that is
 * what is being asserted to the decision-maker), with the proven/outstanding
 * split called out separately so the agent can see what is not yet supported
 * before they send anything.
 */
export function buildPointsCoverLetter(summary: PointsSummary, meta: PointsExportMeta): string {
  const generatedOn = meta.generatedOn ?? new Date();
  const applicant = meta.applicantName || meta.clientName;
  const claimed = summary.results.filter(r => r.claimedPoints > 0);
  const outstanding = summary.results.filter(r => r.status === 'outstanding' && r.claimedPoints > 0);

  const lines: string[] = [];
  lines.push('DRAFT — for review by the responsible migration agent or lawyer before use.');
  lines.push('');
  lines.push(format(generatedOn, 'd MMMM yyyy'));
  lines.push('');
  lines.push(`Re: ${applicant} — points claim, subclass ${summary.subclass}`);
  lines.push('');
  lines.push(
    `We set out below the points claimed by ${applicant} under the General Skilled Migration points test for a subclass ${summary.subclass} visa, together with the evidence relied on for each claim.`,
  );
  lines.push('');
  lines.push('POINTS CLAIMED');
  lines.push('');

  for (const r of claimed) {
    lines.push(`${r.criterion.label} — ${r.claimedPoints} points`);
    if (r.option) lines.push(`    Claim: ${r.option.label}`);
    if (r.entry?.note) lines.push(`    Note: ${r.entry.note}`);
    lines.push(
      r.linkedDocuments.length > 0
        ? `    Evidence: ${r.linkedDocuments.map(d => d.fileName).join('; ')}`
        : `    Evidence: TO BE ATTACHED — ${r.criterion.evidenceHint}`,
    );
    lines.push('');
  }

  if (claimed.length === 0) {
    lines.push('No criteria have been claimed yet.');
    lines.push('');
  }

  lines.push(`TOTAL POINTS CLAIMED: ${summary.claimedTotal}`);
  for (const cap of summary.capAdjustments) {
    if (cap.claimedRaw > cap.claimedCapped) {
      lines.push(`  (${cap.group.label} capped at ${cap.group.max}; ${cap.claimedRaw} would otherwise apply.)`);
    }
  }
  lines.push('');
  lines.push(
    `Of that total, ${summary.provenTotal} points are supported by documents currently held on the case file and ${summary.outstandingTotal} points are not yet evidenced.`,
  );

  if (outstanding.length > 0) {
    lines.push('');
    lines.push('NOT YET EVIDENCED — resolve before lodgement:');
    for (const r of outstanding) {
      lines.push(`  - ${r.criterion.label} (${r.claimedPoints} points): ${r.criterion.evidenceHint}`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push(POINTS_TEST_DISCLAIMER);
  lines.push(`Points table authored/reviewed ${POINTS_TEST_AUTHORED_ON}. ${POINTS_TEST_SOURCE_NOTE}`);

  return lines.join('\n');
}

/** `Points_Summary_<case>_<yyyyMMdd>.txt`. */
export function pointsCoverLetterFileName(meta: PointsExportMeta, generatedOn = new Date()): string {
  return `Points_Summary_${sanitiseFilenameSegment(meta.caseTitle)}_${format(generatedOn, 'yyyyMMdd')}.txt`;
}
