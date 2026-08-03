import type { Document } from '../types';
import { loadPdf, mergePdfs, sanitiseFilenameSegment } from './pdfBundle';
import { compressImage, isRasterImage, needsFormatConversion } from './imageCompress';

/**
 * Auto-Packager orchestration — classification + per-file compression
 * primitives, driven by the DoHA rules and compression-tier priorities from
 * GitHub issue #2. Pure logic, no React/DOM beyond what imageCompress needs
 * (canvas), so it's usable from any component or a future headless test.
 */

/** ImmiAccount's hard per-attachment ceiling. */
export const DOHA_MAX_BYTES = 5 * 1024 * 1024;
/** The Auto-Packager's working target — a safety margin under the hard ceiling. */
export const SAFE_TARGET_BYTES = 4.9 * 1024 * 1024;
/** DoHA's recommended size for image attachments. */
export const IMAGE_TARGET_BYTES = 500 * 1024;

export type PackagerFileKind = 'pdf' | 'image' | 'docx' | 'spreadsheet' | 'text' | 'other';

/** Classify a Document for compression-strategy purposes. */
export function classifyKind(doc: Document): PackagerFileKind {
  const name = doc.fileName.toLowerCase();
  if (doc.fileType === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (isRasterImage(doc.fileType, doc.fileName)) return 'image';
  if (/\.docx?$/.test(name) || doc.fileType.includes('wordprocessingml') || doc.fileType === 'application/msword') {
    return 'docx';
  }
  if (/\.xlsx?$/.test(name) || doc.fileType.includes('spreadsheetml') || doc.fileType === 'application/vnd.ms-excel') {
    return 'spreadsheet';
  }
  if (/\.txt$/.test(name) || doc.fileType === 'text/plain') return 'text';
  return 'other';
}

/** Human label for a PackagerFileKind, used in flags/notes. */
export function kindLabel(kind: PackagerFileKind): string {
  switch (kind) {
    case 'pdf': return 'PDF';
    case 'image': return 'Image';
    case 'docx': return 'Word document';
    case 'spreadsheet': return 'Spreadsheet';
    case 'text': return 'Text file';
    default: return 'File';
  }
}

export interface CompressOutcome {
  bytes: Uint8Array;
  mimeType: string;
  /** Extension without the leading dot, e.g. 'pdf', 'jpg'. */
  ext: string;
  /** True when the output is still over the DoHA 5 MB ceiling and needs manual attention. */
  flagged: boolean;
  note: string;
}

/**
 * Compress a single document's blob per the Tier 1/2/3 rules in the
 * Auto-Packager spec:
 *  - PDF: lossless recompression via pdf-lib (strip metadata, object streams).
 *    Downsampling embedded images inside a PDF isn't feasible with pdf-lib —
 *    out of scope here; oversized scanned PDFs are flagged for the agent to
 *    split or re-scan at lower DPI upstream.
 *  - Image (incl. BMP/GIF): resize + quality reduction via canvas, always
 *    re-encoded as JPEG per DoHA's stated preference.
 *  - DOCX/XLSX/TXT/other: no safe client-side compression path exists
 *    (DOCX->PDF conversion is out of reach without a server) — passed
 *    through unchanged and flagged only if it exceeds the DoHA limit.
 */
export async function compressDocument(doc: Document, blob: Blob): Promise<CompressOutcome> {
  const kind = classifyKind(doc);
  const originalBytes = new Uint8Array(await blob.arrayBuffer());
  const ext = doc.fileName.includes('.') ? doc.fileName.split('.').pop()!.toLowerCase() : 'bin';

  if (kind === 'pdf') {
    try {
      const loaded = await loadPdf(doc, blob);
      const { bytes } = await mergePdfs([loaded]);
      const flagged = bytes.length > DOHA_MAX_BYTES;
      return {
        bytes,
        mimeType: 'application/pdf',
        ext: 'pdf',
        flagged,
        note: flagged
          ? 'Still over 5 MB after lossless compression — split into multiple uploads or reduce scan resolution upstream (150 DPI is enough for ImmiAccount).'
          : bytes.length < originalBytes.length
            ? 'Losslessly recompressed.'
            : 'Already optimal — no further lossless savings available.',
      };
    } catch {
      return {
        bytes: originalBytes,
        mimeType: doc.fileType || 'application/pdf',
        ext: 'pdf',
        flagged: originalBytes.length > DOHA_MAX_BYTES,
        note: 'Could not parse as a PDF — left unchanged.',
      };
    }
  }

  if (kind === 'image') {
    try {
      const result = await compressImage(blob, IMAGE_TARGET_BYTES);
      const bytes = new Uint8Array(await result.blob.arrayBuffer());
      const flagged = bytes.length > DOHA_MAX_BYTES;
      return {
        bytes,
        mimeType: result.mimeType,
        ext: 'jpg',
        flagged,
        note: needsFormatConversion(doc.fileType, doc.fileName)
          ? `Converted to JPG and resized to ${result.width}×${result.height}.`
          : `Resized/re-encoded to ${result.width}×${result.height} at reduced quality.`,
      };
    } catch {
      return {
        bytes: originalBytes,
        mimeType: doc.fileType,
        ext,
        flagged: originalBytes.length > DOHA_MAX_BYTES,
        note: 'Image compression failed — left unchanged.',
      };
    }
  }

  // docx / spreadsheet / text / other — no safe client-side compression path.
  const flagged = originalBytes.length > DOHA_MAX_BYTES;
  return {
    bytes: originalBytes,
    mimeType: doc.fileType,
    ext,
    flagged,
    note: flagged
      ? `${kindLabel(kind)}s can't be safely compressed client-side — this file exceeds 5 MB and needs manual attention (re-save with smaller embedded images, or split the content).`
      : 'Within size limit — no compression needed.',
  };
}

/**
 * Auto-suggest an ImmiAccount-friendly output filename for a packaged file.
 * When assigned to a checklist slot, prefers `<Applicant>_<SlotLabel>_<date>.<ext>`;
 * otherwise falls back to `<originalBase>_<date>.<ext>`. Always editable by the
 * agent before finalising (Phase 4 of the Auto-Packager flow).
 */
export function suggestOutputName(opts: {
  doc: Document;
  ext: string;
  dateStr: string;
  slotLabel?: string;
  applicantLastName?: string;
}): string {
  const { doc, ext, dateStr, slotLabel, applicantLastName } = opts;
  if (slotLabel) {
    const parts = [applicantLastName, slotLabel].filter(Boolean).map(sanitiseFilenameSegment);
    return `${parts.join('_')}_${dateStr}.${ext}`;
  }
  const base = doc.fileName.replace(/\.[^.]+$/, '');
  return `${sanitiseFilenameSegment(base)}_${dateStr}.${ext}`;
}

/** Pretty-print a byte count (re-exported here so callers only need one import). */
export { formatBytes } from './pdfBundle';
