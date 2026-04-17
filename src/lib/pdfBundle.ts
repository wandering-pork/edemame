import { PDFDocument } from 'pdf-lib';
import { format } from 'date-fns';
import type { Document } from '../types';

/**
 * Pure PDF bundling primitives. No React, no DOM, no repositories.
 * Used by PdfPackager (single-bundle mode) and BundleBuilder820 (per-slot mode).
 */

export interface LoadedPdf {
  doc: Document;
  bytes: Uint8Array;
  pageCount: number;
}

/** Sanitise a string for use in a filename. */
export function sanitiseFilenameSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * ImmiAccount-friendly rename: <base>_<YYYYMMDD>.pdf, sanitised.
 */
export function immiAccountName(doc: Document, dateStr?: string): string {
  const base = doc.fileName.replace(/\.[^.]+$/, '');
  const date = dateStr ?? format(new Date(), 'yyyyMMdd');
  return `${sanitiseFilenameSegment(base)}_${date}.pdf`;
}

/**
 * Load a Document's blob and parse it as a PDF, returning the bytes + page count.
 * Caller is responsible for resolving the blob (we don't import the repository here).
 */
export async function loadPdf(doc: Document, blob: Blob): Promise<LoadedPdf> {
  const ab = await blob.arrayBuffer();
  const bytes = new Uint8Array(ab);
  const parsed = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return { doc, bytes, pageCount: parsed.getPageCount() };
}

/**
 * Merge a sequence of PDFs into a single PDF, in order.
 * Returns the merged bytes and a map of doc.id → starting page (1-indexed) within the merged PDF.
 */
export async function mergePdfs(loaded: LoadedPdf[]): Promise<{ bytes: Uint8Array; pageMap: Map<string, number> }> {
  const merged = await PDFDocument.create();
  const pageMap = new Map<string, number>();

  for (const item of loaded) {
    pageMap.set(item.doc.id, merged.getPageCount() + 1);
    const src = await PDFDocument.load(item.bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }

  // Strip metadata to keep size + privacy clean
  merged.setTitle('');
  merged.setAuthor('');
  merged.setCreator('Edamame Legal Flow');
  merged.setProducer('');
  merged.setSubject('');
  merged.setKeywords([]);

  // Try object-stream compression first; fall back if it produces larger output
  let bytes = await merged.save({ useObjectStreams: true });
  const fallback = await merged.save({ useObjectStreams: false });
  if (fallback.length < bytes.length) bytes = fallback;

  return { bytes, pageMap };
}

/**
 * Split documents into groups, each whose merged size stays under targetBytes.
 * Splits on document boundaries — never mid-document. A single document over the
 * target gets its own group (the agent will need to compress upstream).
 *
 * Note: this estimates by summing source bytes. Actual merged size differs slightly
 * after compression — call sites should re-merge each group and verify.
 */
export function splitIntoGroups(loaded: LoadedPdf[], targetBytes: number): LoadedPdf[][] {
  const groups: LoadedPdf[][] = [];
  let current: LoadedPdf[] = [];
  let currentSize = 0;

  for (const item of loaded) {
    const itemSize = item.bytes.length;
    if (current.length > 0 && currentSize + itemSize > targetBytes) {
      groups.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(item);
    currentSize += itemSize;
  }

  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * Build a download URL + filename for a Uint8Array PDF.
 * Caller must URL.revokeObjectURL when done.
 */
export function createDownloadUrl(bytes: Uint8Array, filename: string): { url: string; filename: string } {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  return { url: URL.createObjectURL(blob), filename };
}

/** Trigger a browser download for a previously-created object URL. */
export function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Pretty-print a byte count. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
