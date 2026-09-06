import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Document } from '../types';

// Mock the two heavier collaborators compressDocument delegates to for PDFs,
// so these tests exercise autoPackager.ts's own decision logic (which path
// to take, how to size/flag the result) without needing a real PDF parser,
// pdf.js worker, or canvas.
vi.mock('./pdfBundle', () => ({
  loadPdf: vi.fn(async (doc: Document, blob: Blob) => ({ doc, bytes: new Uint8Array(await blob.arrayBuffer()), pageCount: 1 })),
  mergePdfs: vi.fn(),
  sanitiseFilenameSegment: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_'),
}));
vi.mock('./pdfRasterize', () => ({
  rasterizeAndCompressPdf: vi.fn(),
}));

import { mergePdfs } from './pdfBundle';
import { rasterizeAndCompressPdf } from './pdfRasterize';
import { compressDocument, exceedsCaseFilesLimit, DOHA_MAX_BYTES, SAFE_TARGET_BYTES } from './autoPackager';

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    caseId: 'case-1',
    fileName: 'scan.pdf',
    filePath: 'documents/case-1/scan.pdf',
    fileType: 'application/pdf',
    fileSize: 8 * 1024 * 1024,
    uploadedAt: new Date().toISOString(),
    ...overrides,
  };
}

function bytesOfSize(n: number): Uint8Array {
  return new Uint8Array(n);
}

describe('exceedsCaseFilesLimit', () => {
  // Regression guard for the "Auto-Packager still uploads >50MB files to
  // Case Files" defect: Case Files' own upload ceiling must be enforced
  // independently of whatever DoHA-lodgement target this module aims for.
  it('is false when a size is within the ceiling', () => {
    expect(exceedsCaseFilesLimit(10 * 1024 * 1024, 50 * 1024 * 1024)).toBe(false);
  });

  it('is false exactly at the ceiling (only strictly-over is blocked)', () => {
    expect(exceedsCaseFilesLimit(50 * 1024 * 1024, 50 * 1024 * 1024)).toBe(false);
  });

  it('is true once a size exceeds the ceiling', () => {
    expect(exceedsCaseFilesLimit(50 * 1024 * 1024 + 1, 50 * 1024 * 1024)).toBe(true);
  });
});

describe('compressDocument — PDF path', () => {
  beforeEach(() => {
    vi.mocked(mergePdfs).mockReset();
    vi.mocked(rasterizeAndCompressPdf).mockReset();
  });

  it('returns unflagged once lossless recompression alone gets under the DoHA ceiling', async () => {
    vi.mocked(mergePdfs).mockResolvedValue({ bytes: bytesOfSize(3 * 1024 * 1024), pageMap: new Map() });
    const doc = makeDoc();
    const blob = new Blob([bytesOfSize(doc.fileSize)]);

    const outcome = await compressDocument(doc, blob);

    expect(outcome.flagged).toBe(false);
    expect(rasterizeAndCompressPdf).not.toHaveBeenCalled();
  });

  it('falls back to rasterizing pages when lossless compression is not enough, and unflags if that gets it under the ceiling', async () => {
    vi.mocked(mergePdfs).mockResolvedValue({ bytes: bytesOfSize(9 * 1024 * 1024), pageMap: new Map() });
    vi.mocked(rasterizeAndCompressPdf).mockResolvedValue(bytesOfSize(4 * 1024 * 1024));
    const doc = makeDoc();
    const blob = new Blob([bytesOfSize(doc.fileSize)]);

    const outcome = await compressDocument(doc, blob);

    expect(rasterizeAndCompressPdf).toHaveBeenCalledWith(expect.any(Uint8Array), SAFE_TARGET_BYTES);
    expect(outcome.flagged).toBe(false);
    expect(outcome.bytes.length).toBe(4 * 1024 * 1024);
    expect(outcome.note).toMatch(/flatten/i);
  });

  it('flags the result when rasterizing still leaves it over the DoHA ceiling', async () => {
    vi.mocked(mergePdfs).mockResolvedValue({ bytes: bytesOfSize(60 * 1024 * 1024), pageMap: new Map() });
    vi.mocked(rasterizeAndCompressPdf).mockResolvedValue(bytesOfSize(6 * 1024 * 1024));
    const doc = makeDoc({ fileSize: 70 * 1024 * 1024 });
    const blob = new Blob([bytesOfSize(doc.fileSize)]);

    const outcome = await compressDocument(doc, blob);

    expect(outcome.flagged).toBe(true);
    expect(outcome.bytes.length).toBe(6 * 1024 * 1024);
  });

  it('falls back to the lossless-only bytes when rasterizing fails (returns null)', async () => {
    vi.mocked(mergePdfs).mockResolvedValue({ bytes: bytesOfSize(9 * 1024 * 1024), pageMap: new Map() });
    vi.mocked(rasterizeAndCompressPdf).mockResolvedValue(null);
    const doc = makeDoc();
    const blob = new Blob([bytesOfSize(doc.fileSize)]);

    const outcome = await compressDocument(doc, blob);

    expect(outcome.bytes.length).toBe(9 * 1024 * 1024);
    expect(outcome.flagged).toBe(true);
    expect(outcome.note).toMatch(/still over 5 ?MB/i);
  });

  it('falls back to the lossless-only bytes when rasterizing does not actually shrink the file', async () => {
    vi.mocked(mergePdfs).mockResolvedValue({ bytes: bytesOfSize(9 * 1024 * 1024), pageMap: new Map() });
    vi.mocked(rasterizeAndCompressPdf).mockResolvedValue(bytesOfSize(9.5 * 1024 * 1024));
    const doc = makeDoc();
    const blob = new Blob([bytesOfSize(doc.fileSize)]);

    const outcome = await compressDocument(doc, blob);

    expect(outcome.bytes.length).toBe(9 * 1024 * 1024);
  });
});

describe('module constants', () => {
  it('keeps the safe target under the hard DoHA ceiling', () => {
    expect(SAFE_TARGET_BYTES).toBeLessThan(DOHA_MAX_BYTES);
  });
});
