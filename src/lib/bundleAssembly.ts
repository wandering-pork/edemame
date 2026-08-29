import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import Papa from 'papaparse';
import { zipSync, type Zippable } from 'fflate';
import type { Aspect820, Document } from '../types';
import { ASPECTS_820, ASPECT_ORDER_820, aspectFilenameToken } from './aspects820';
import {
  loadPdf,
  mergePdfs,
  splitIntoGroups,
  sanitiseFilenameSegment,
  formatBytes,
  type LoadedPdf,
} from './pdfBundle';
import { classifyKind, compressDocument, SAFE_TARGET_BYTES } from './autoPackager';

/**
 * Submission-bundle assembly for Subclass 820 (GitHub issue #35).
 *
 * Extends the PDF-only per-slot bundler into a full package builder:
 *  - non-PDF evidence (images, DOCX, ...) is folded into each slot,
 *  - anything oversized is routed through the Auto-Packager's compression
 *    primitives (`compressDocument`) before merging,
 *  - a master index PDF and an upload manifest CSV are generated,
 *  - everything is zipped into a single download.
 *
 * How non-PDF files are handled (judgment call, documented in the PR):
 *  - **Raster images** (JPG/PNG, plus BMP/GIF/WEBP which the Auto-Packager
 *    converts to JPG) are compressed via `compressDocument` and then embedded
 *    as a full A4 page in the slot's merged PDF. ImmiAccount wants one
 *    attachment per evidence field, so folding photos into the slot PDF is
 *    strictly better than shipping them as loose files.
 *  - **Everything we cannot render client-side** — DOCX/XLSX/TXT (no in-browser
 *    Word engine) and HEIC/TIFF (no canvas decoder) — is compressed where
 *    possible and shipped as a *standalone* attachment inside the ZIP's
 *    `unmerged/` folder, listed in the manifest against the same ImmiAccount
 *    field. Silently dropping them (today's behaviour) or corrupting them is
 *    worse than making the agent upload two attachments for that field.
 */

/** Per-slot working target — one attachment must stay under DoHA's 5 MB ceiling. */
export const BUNDLE_TARGET_BYTES = SAFE_TARGET_BYTES;

export interface BundleOutputFile {
  filename: string;
  bytes: Uint8Array;
  mimeType: string;
  size: number;
  /** 1-indexed part number when the slot was split, undefined when a single part. */
  partIndex?: number;
  partTotal?: number;
  /** True for files that could not be merged into the slot PDF (DOCX, HEIC, ...). */
  standalone: boolean;
  /** Original document filenames folded into this output. */
  sourceFileNames: string[];
  /** Compression / handling note surfaced in the manifest. */
  note?: string;
  /** True when the output is still over DoHA's hard 5 MB limit. */
  flagged: boolean;
}

export interface SlotBuildResult {
  aspect: Aspect820;
  files: BundleOutputFile[];
  mergedDocCount: number;
  standaloneDocCount: number;
  warnings: string[];
}

export interface BundleNaming {
  lastName: string;
  dateStr: string;
}

type BlobLoader = (doc: Document) => Promise<Blob | null>;

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

/** Wrap a raster image's bytes in a single-page A4 PDF, centred and letterboxed. */
async function imageToPdfBytes(bytes: Uint8Array, mimeType: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const img = mimeType === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);

  const margin = 36;
  const maxW = A4_WIDTH - margin * 2;
  const maxH = A4_HEIGHT - margin * 2;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;

  const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  page.drawImage(img, { x: (A4_WIDTH - w) / 2, y: (A4_HEIGHT - h) / 2, width: w, height: h });
  return pdf.save();
}

/**
 * Build every output file for one aspect slot.
 * `onProgress` receives short human-readable status strings for the UI.
 */
export async function buildSlotOutputs(
  aspect: Aspect820,
  docs: Document[],
  loadBlob: BlobLoader,
  naming: BundleNaming,
  onProgress?: (msg: string) => void,
): Promise<SlotBuildResult> {
  const token = aspectFilenameToken(aspect);
  const mergeable: LoadedPdf[] = [];
  const standalone: BundleOutputFile[] = [];
  const warnings: string[] = [];
  const notesByDocId = new Map<string, string>();

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    onProgress?.(`Preparing ${i + 1} of ${docs.length}: ${doc.fileName}`);

    const blob = await loadBlob(doc);
    if (!blob) throw new Error(`Could not load "${doc.fileName}"`);

    const kind = classifyKind(doc);

    if (kind === 'pdf') {
      // Only pay for a compression pass when the source is already oversized —
      // mergePdfs recompresses the slot output anyway.
      if (blob.size > BUNDLE_TARGET_BYTES) {
        onProgress?.(`Compressing ${doc.fileName}…`);
        const outcome = await compressDocument(doc, blob);
        if (outcome.flagged) warnings.push(`${doc.fileName}: ${outcome.note}`);
        notesByDocId.set(doc.id, outcome.note);
        mergeable.push(await loadPdf(doc, new Blob([outcome.bytes as BlobPart], { type: 'application/pdf' })));
      } else {
        mergeable.push(await loadPdf(doc, blob));
      }
      continue;
    }

    onProgress?.(`Compressing ${doc.fileName}…`);
    const outcome = await compressDocument(doc, blob);
    if (outcome.flagged) warnings.push(`${doc.fileName}: ${outcome.note}`);
    notesByDocId.set(doc.id, outcome.note);

    if (kind === 'image' && (outcome.mimeType === 'image/jpeg' || outcome.mimeType === 'image/png')) {
      try {
        const pageBytes = await imageToPdfBytes(outcome.bytes, outcome.mimeType);
        mergeable.push({ doc, bytes: pageBytes, pageCount: 1 });
        continue;
      } catch {
        warnings.push(`${doc.fileName}: could not be converted to a PDF page — attached separately.`);
      }
    }

    const base = sanitiseFilenameSegment(doc.fileName.replace(/\.[^.]+$/, ''));
    standalone.push({
      filename: `820_${token}_${naming.lastName}_${naming.dateStr}_${base}.${outcome.ext}`,
      bytes: outcome.bytes,
      mimeType: outcome.mimeType,
      size: outcome.bytes.length,
      standalone: true,
      sourceFileNames: [doc.fileName],
      note: outcome.note,
      flagged: outcome.flagged,
    });
  }

  const files: BundleOutputFile[] = [];

  if (mergeable.length > 0) {
    const groups = splitIntoGroups(mergeable, BUNDLE_TARGET_BYTES);
    const total = groups.length;
    for (let i = 0; i < groups.length; i++) {
      onProgress?.(`Merging part ${i + 1} of ${total}…`);
      const { bytes } = await mergePdfs(groups[i]);
      const partSuffix = total > 1 ? `_Pt${i + 1}of${total}` : '';
      const notes = groups[i]
        .map(g => notesByDocId.get(g.doc.id))
        .filter((n): n is string => Boolean(n));
      files.push({
        filename: `820_${token}_${naming.lastName}_${naming.dateStr}${partSuffix}.pdf`,
        bytes,
        mimeType: 'application/pdf',
        size: bytes.length,
        partIndex: total > 1 ? i + 1 : undefined,
        partTotal: total > 1 ? total : undefined,
        standalone: false,
        sourceFileNames: groups[i].map(g => g.doc.fileName),
        note: notes.length > 0 ? notes.join(' ') : undefined,
        flagged: bytes.length > BUNDLE_TARGET_BYTES,
      });
    }
  }

  files.push(...standalone);

  return {
    aspect,
    files,
    mergedDocCount: mergeable.length,
    standaloneDocCount: standalone.length,
    warnings,
  };
}

/**
 * Master submission index — one cover PDF listing, per aspect slot, the label,
 * the ImmiAccount field it goes into, the output files (with part counts) and
 * the source documents folded into each.
 */
export async function buildIndexPdf(
  results: SlotBuildResult[],
  meta: { applicantName: string; dateStr: string },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  const bottom = 56;
  let page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - margin;

  const newPage = () => {
    page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    y = A4_HEIGHT - margin;
  };

  const write = (
    text: string,
    opts: { size?: number; bold?: boolean; indent?: number; gap?: number; color?: [number, number, number] } = {},
  ) => {
    const size = opts.size ?? 10;
    const gap = opts.gap ?? size + 4;
    if (y - gap < bottom) newPage();
    const [r, g, b] = opts.color ?? [0.15, 0.16, 0.18];
    page.drawText(text, {
      x: margin + (opts.indent ?? 0),
      y,
      size,
      font: opts.bold ? bold : font,
      color: rgb(r, g, b),
    });
    y -= gap;
  };

  const rule = () => {
    if (y - 12 < bottom) newPage();
    page.drawLine({
      start: { x: margin, y: y + 6 },
      end: { x: A4_WIDTH - margin, y: y + 6 },
      thickness: 0.75,
      color: rgb(0.85, 0.86, 0.88),
    });
    y -= 12;
  };

  write('SUBCLASS 820 — SUBMISSION BUNDLE INDEX', { size: 16, bold: true });
  write(`Applicant: ${meta.applicantName}`, { size: 11 });
  write(`Prepared: ${meta.dateStr}`, { size: 11, color: [0.42, 0.44, 0.47] });
  rule();

  const totalFiles = results.reduce((n, r) => n + r.files.length, 0);
  const totalDocs = results.reduce((n, r) => n + r.mergedDocCount + r.standaloneDocCount, 0);
  write(
    `${totalDocs} source document${totalDocs === 1 ? '' : 's'} packaged into ${totalFiles} attachment${totalFiles === 1 ? '' : 's'} across ${results.length} evidence slot${results.length === 1 ? '' : 's'}.`,
    { size: 10, color: [0.42, 0.44, 0.47], gap: 22 },
  );

  for (const result of results) {
    const aspectMeta = ASPECTS_820[result.aspect];
    if (y - 60 < bottom) newPage();

    write(aspectMeta.label.toUpperCase(), { size: 12, bold: true, gap: 15 });
    write(`ImmiAccount field: ${aspectMeta.immiSlot}`, { size: 9, indent: 2, color: [0.42, 0.44, 0.47] });
    write(
      `${result.mergedDocCount + result.standaloneDocCount} document(s) · ${result.files.length} attachment(s)`,
      { size: 9, indent: 2, color: [0.42, 0.44, 0.47], gap: 16 },
    );

    for (const file of result.files) {
      const partLabel = file.partTotal ? ` (part ${file.partIndex} of ${file.partTotal})` : '';
      const sep = file.standalone ? ' [separate attachment]' : '';
      write(`${file.filename}${partLabel} — ${formatBytes(file.size)}${sep}`, {
        size: 9.5,
        indent: 12,
        bold: true,
        gap: 13,
      });
      for (const src of file.sourceFileNames) {
        write(`· ${src}`, { size: 8.5, indent: 26, color: [0.42, 0.44, 0.47], gap: 11 });
      }
      if (file.flagged) {
        write('! Still over the 5 MB ImmiAccount limit — needs manual attention.', {
          size: 8.5,
          indent: 26,
          color: [0.72, 0.16, 0.12],
          gap: 11,
        });
      }
      y -= 3;
    }

    rule();
  }

  pdf.setTitle('');
  pdf.setAuthor('');
  pdf.setCreator('Edamame Legal Flow');
  pdf.setProducer('');
  return pdf.save();
}

/**
 * Upload manifest — one row per output attachment, mapping it to the
 * ImmiAccount field it belongs in. Meant to sit open next to ImmiAccount
 * while the agent uploads. CSV so it opens in Excel/Sheets and can be ticked off.
 */
export function buildManifestCsv(results: SlotBuildResult[], meta: { applicantName: string; dateStr: string }): string {
  const rows = results.flatMap(result => {
    const aspectMeta = ASPECTS_820[result.aspect];
    return result.files.map(file => ({
      'Upload order': '',
      'Aspect': aspectMeta.label,
      'ImmiAccount field': aspectMeta.immiSlot,
      'File name': file.filename,
      'Part': file.partTotal ? `${file.partIndex} of ${file.partTotal}` : '1 of 1',
      'Size': formatBytes(file.size),
      'Size (bytes)': String(file.size),
      'Attachment type': file.standalone ? 'Separate attachment' : 'Merged PDF',
      'Source documents': file.sourceFileNames.join('; '),
      'Over 5 MB': file.flagged ? 'YES — needs attention' : 'No',
      'Notes': file.note ?? '',
    }));
  });

  rows.forEach((row, i) => {
    row['Upload order'] = String(i + 1);
  });

  const header = `Subclass 820 submission bundle — ${meta.applicantName} — ${meta.dateStr}\n`;
  return header + Papa.unparse(rows);
}

export interface ZipEntry {
  path: string;
  bytes: Uint8Array;
}

/** Package the slot outputs + index + manifest into a single ZIP. */
export function buildBundleZip(
  results: SlotBuildResult[],
  indexPdf: Uint8Array,
  manifestCsv: string,
  naming: BundleNaming,
): { bytes: Uint8Array; filename: string } {
  const root = `820_SubmissionBundle_${naming.lastName}_${naming.dateStr}`;
  const entries: ZipEntry[] = [
    { path: '00_Submission_Index.pdf', bytes: indexPdf },
    { path: '00_Upload_Manifest.csv', bytes: new TextEncoder().encode(manifestCsv) },
  ];

  // Keep slot order stable and prefix with the ImmiAccount upload order.
  let order = 1;
  for (const aspect of ASPECT_ORDER_820) {
    const result = results.find(r => r.aspect === aspect);
    if (!result) continue;
    for (const file of result.files) {
      const prefix = String(order).padStart(2, '0');
      entries.push({
        path: file.standalone ? `unmerged/${prefix}_${file.filename}` : `${prefix}_${file.filename}`,
        bytes: file.bytes,
      });
      order += 1;
    }
  }

  const tree: Zippable = {};
  for (const entry of entries) {
    const segments = `${root}/${entry.path}`.split('/');
    let node: any = tree;
    for (let i = 0; i < segments.length - 1; i++) {
      node[segments[i]] = node[segments[i]] ?? {};
      node = node[segments[i]];
    }
    node[segments[segments.length - 1]] = entry.bytes;
  }

  // level 6 on already-compressed PDFs/JPEGs buys little; level 1 keeps the
  // browser responsive on a 100+ document bundle.
  const bytes = zipSync(tree, { level: 1 });
  return { bytes, filename: `${root}.zip` };
}

/** Create an object URL for arbitrary bundle bytes (ZIP, CSV, ...). */
export function createBlobUrl(bytes: Uint8Array, mimeType: string): string {
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType }));
}
