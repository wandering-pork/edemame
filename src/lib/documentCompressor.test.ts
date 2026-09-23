import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Document } from '../types';

// Mock the two heavier collaborators compressDocument delegates to for PDFs,
// so these tests exercise documentCompressor.ts's own decision logic (which
// path to take, how to size/flag the result) without needing a real PDF
// parser, pdf.js worker, or canvas.
vi.mock('./pdfBundle', () => ({
  loadPdf: vi.fn(async (doc: Document, blob: Blob) => ({ doc, bytes: new Uint8Array(await blob.arrayBuffer()), pageCount: 1 })),
  mergePdfs: vi.fn(),
  sanitiseFilenameSegment: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_'),
  formatBytes: (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  },
}));
vi.mock('./pdfRasterize', () => ({
  rasterizeAndCompressPdf: vi.fn(),
}));
vi.mock('./imageCompress', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./imageCompress')>();
  return { ...actual, compressImage: vi.fn() };
});

import { loadPdf, mergePdfs } from './pdfBundle';
import { rasterizeAndCompressPdf } from './pdfRasterize';
import { compressImage } from './imageCompress';
import {
  compressDocument,
  exceedsCaseFilesLimit,
  classifyKind,
  kindLabel,
  suggestOutputName,
  validateOutputNames,
  formatBytes,
  DOHA_MAX_BYTES,
  SAFE_TARGET_BYTES,
  IMAGE_TARGET_BYTES,
} from './documentCompressor';
import { formatBytes as formatBytesFromPdfBundle } from './pdfBundle';

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

describe('classifyKind', () => {
  it.each([
    ['scan.pdf', 'application/pdf', 'pdf'],
    ['scan.pdf', '', 'pdf'],
    ['scan.bin', 'application/pdf', 'pdf'],
    ['SCAN.PDF', '', 'pdf'],
    ['photo.jpg', 'image/jpeg', 'image'],
    ['photo.heic', 'image/heic', 'image'],
    ['old.bmp', 'image/bmp', 'image'],
    ['form.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
    ['form.doc', 'application/msword', 'docx'],
    ['form.DOCX', '', 'docx'],
    ['sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'spreadsheet'],
    ['sheet.xls', 'application/vnd.ms-excel', 'spreadsheet'],
    ['notes.txt', 'text/plain', 'text'],
    ['notes.txt', '', 'text'],
    ['archive.zip', 'application/zip', 'other'],
    ['noextension', '', 'other'],
    ['weird.pdf.docx', '', 'docx'],
    ['x.pdf', 'image/jpeg', 'pdf'],
  ] as const)('classifyKind(%s, %s) === %s', (fileName, fileType, expected) => {
    expect(classifyKind(makeDoc({ fileName, fileType }))).toBe(expected);
  });
});

describe('kindLabel', () => {
  it('gives every PackagerFileKind a non-empty, distinct label', () => {
    const labels = {
      pdf: kindLabel('pdf'),
      image: kindLabel('image'),
      docx: kindLabel('docx'),
      spreadsheet: kindLabel('spreadsheet'),
      text: kindLabel('text'),
      other: kindLabel('other'),
    };
    expect(labels).toEqual({
      pdf: 'PDF',
      image: 'Image',
      docx: 'Word document',
      spreadsheet: 'Spreadsheet',
      text: 'Text file',
      other: 'File',
    });
    const distinct = new Set(Object.values(labels));
    expect(distinct.size).toBe(Object.values(labels).length);
  });
});

describe('compressDocument — image path', () => {
  beforeEach(() => {
    vi.mocked(compressImage).mockReset();
  });

  it('happy case — resizes/re-encodes and reports the exact target and note', async () => {
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob([new Uint8Array(400_000)]),
      width: 1600,
      height: 1200,
      mimeType: 'image/jpeg',
    });
    const doc = makeDoc({ fileName: 'passport.jpg', fileType: 'image/jpeg', fileSize: 8 * 1024 * 1024 });
    const blob = new Blob([bytesOfSize(doc.fileSize)]);

    const outcome = await compressDocument(doc, blob);

    expect(compressImage).toHaveBeenCalledWith(blob, IMAGE_TARGET_BYTES);
    expect(IMAGE_TARGET_BYTES).toBe(512_000);
    expect(outcome.bytes.length).toBe(400_000);
    expect(outcome.mimeType).toBe('image/jpeg');
    expect(outcome.ext).toBe('jpg');
    expect(outcome.flagged).toBe(false);
    expect(outcome.note).toBe('Resized/re-encoded to 1600×1200 at reduced quality.');
  });

  it('BMP is converted to JPG with a "Converted to JPG" note', async () => {
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob([new Uint8Array(300_000)]),
      width: 800,
      height: 600,
      mimeType: 'image/jpeg',
    });
    const doc = makeDoc({ fileName: 'old.bmp', fileType: 'image/bmp' });
    const blob = new Blob([bytesOfSize(doc.fileSize)]);

    const outcome = await compressDocument(doc, blob);

    expect(outcome.ext).toBe('jpg');
    expect(outcome.note).toBe('Converted to JPG and resized to 800×600.');
  });

  it('GIF is also converted to JPG with the same wording', async () => {
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob([new Uint8Array(300_000)]),
      width: 800,
      height: 600,
      mimeType: 'image/jpeg',
    });
    const doc = makeDoc({ fileName: 'anim.gif', fileType: 'image/gif' });
    const blob = new Blob([bytesOfSize(doc.fileSize)]);

    const outcome = await compressDocument(doc, blob);

    expect(outcome.note).toBe('Converted to JPG and resized to 800×600.');
  });

  it('an output still over 5 MB is flagged, with the normal note (no special over-limit wording)', async () => {
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob([new Uint8Array(6 * 1024 * 1024)]),
      width: 4000,
      height: 3000,
      mimeType: 'image/jpeg',
    });
    const doc = makeDoc({ fileName: 'huge.png', fileType: 'image/png' });
    const blob = new Blob([bytesOfSize(doc.fileSize)]);

    const outcome = await compressDocument(doc, blob);

    expect(outcome.flagged).toBe(true);
    expect(outcome.ext).toBe('jpg');
    expect(outcome.note).toBe('Resized/re-encoded to 4000×3000 at reduced quality.');
  });

  it('is unflagged exactly at the DoHA ceiling', async () => {
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob([new Uint8Array(DOHA_MAX_BYTES)]),
      width: 100,
      height: 100,
      mimeType: 'image/jpeg',
    });
    const doc = makeDoc({ fileName: 'x.jpg', fileType: 'image/jpeg' });
    const outcome = await compressDocument(doc, new Blob([bytesOfSize(doc.fileSize)]));
    expect(outcome.flagged).toBe(false);
  });

  it('is flagged one byte over the DoHA ceiling', async () => {
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob([new Uint8Array(DOHA_MAX_BYTES + 1)]),
      width: 100,
      height: 100,
      mimeType: 'image/jpeg',
    });
    const doc = makeDoc({ fileName: 'x.jpg', fileType: 'image/jpeg' });
    const outcome = await compressDocument(doc, new Blob([bytesOfSize(doc.fileSize)]));
    expect(outcome.flagged).toBe(true);
  });

  it('falls back to the original bytes and extension when compressImage throws', async () => {
    vi.mocked(compressImage).mockRejectedValue(new Error('Canvas encoding failed'));
    const doc = makeDoc({ fileName: 'photo.png', fileType: 'image/png', fileSize: 8 * 1024 * 1024 });
    const blob = new Blob([bytesOfSize(doc.fileSize)]);

    const outcome = await compressDocument(doc, blob);

    expect(outcome.bytes.length).toBe(8 * 1024 * 1024);
    expect(outcome.mimeType).toBe('image/png');
    expect(outcome.ext).toBe('png');
    expect(outcome.flagged).toBe(true);
    expect(outcome.note).toBe('Image compression failed — left unchanged.');
  });

  it('falls back unflagged when the original was already under the ceiling', async () => {
    vi.mocked(compressImage).mockRejectedValue(new Error('Canvas encoding failed'));
    const doc = makeDoc({ fileName: 'photo.jpg', fileType: 'image/jpeg', fileSize: 2 * 1024 * 1024 });
    const blob = new Blob([bytesOfSize(doc.fileSize)]);

    const outcome = await compressDocument(doc, blob);

    expect(outcome.flagged).toBe(false);
  });
});

describe('compressDocument — HEIC/TIFF passthrough', () => {
  it('an oversized HEIC is passed through unchanged and flagged, with an actionable note', async () => {
    const doc = makeDoc({ fileName: 'IMG_0001.HEIC', fileType: 'image/heic', fileSize: 8 * 1024 * 1024 });
    const blob = new Blob([bytesOfSize(doc.fileSize)]);

    const outcome = await compressDocument(doc, blob);

    expect(compressImage).not.toHaveBeenCalled();
    expect(outcome.bytes.length).toBe(8 * 1024 * 1024);
    expect(outcome.mimeType).toBe('image/heic');
    expect(outcome.ext).toBe('heic');
    expect(outcome.flagged).toBe(true);
    expect(outcome.note).toMatch(/HEIC images aren't supported for in-browser compression and this file exceeds 5 MB/);
  });

  it('a within-limit HEIC is passed through unflagged', async () => {
    const doc = makeDoc({ fileName: 'IMG_0001.HEIC', fileType: 'image/heic', fileSize: 2 * 1024 * 1024 });
    const blob = new Blob([bytesOfSize(doc.fileSize)]);

    const outcome = await compressDocument(doc, blob);

    expect(outcome.flagged).toBe(false);
    expect(outcome.note).toMatch(/left unchanged \(within size limit\)/);
    expect(outcome.note).toMatch(/^HEIC/);
  });

  it('a within-limit TIFF is passed through unflagged with a TIFF-specific note', async () => {
    const doc = makeDoc({ fileName: 'scan.tiff', fileType: 'image/tiff', fileSize: 2 * 1024 * 1024 });
    const blob = new Blob([bytesOfSize(doc.fileSize)]);

    const outcome = await compressDocument(doc, blob);

    expect(outcome.note).toMatch(/^TIFF/);
  });
});

describe('compressDocument — DOCX / XLSX / TXT / other passthrough', () => {
  const cases = [
    ['brief.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Word document', 'docx'],
    ['fees.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Spreadsheet', 'xlsx'],
    ['notes.txt', 'text/plain', 'Text file', 'txt'],
    ['bundle.zip', 'application/zip', 'File', 'zip'],
  ] as const;

  it.each(cases)('%s over the limit is flagged and byte-identical', async (fileName, fileType, label, ext) => {
    const doc = makeDoc({ fileName, fileType, fileSize: 8 * 1024 * 1024 });
    const pattern = new Uint8Array(8 * 1024 * 1024);
    pattern[0] = 0xab;
    pattern[pattern.length - 1] = 0xcd;
    const blob = new Blob([pattern]);

    const outcome = await compressDocument(doc, blob);

    expect(outcome.bytes.length).toBe(8 * 1024 * 1024);
    expect(outcome.bytes[0]).toBe(0xab);
    expect(outcome.bytes[outcome.bytes.length - 1]).toBe(0xcd);
    expect(outcome.mimeType).toBe(fileType);
    expect(outcome.ext).toBe(ext);
    expect(outcome.flagged).toBe(true);
    expect(outcome.note.startsWith(`${label}s can't be safely compressed client-side`)).toBe(true);
    expect(outcome.note).toMatch(/exceeds 5 MB/);
  });

  it.each(cases)('%s under the limit is unflagged with the generic within-limit note', async (fileName, fileType) => {
    const doc = makeDoc({ fileName, fileType, fileSize: 1 * 1024 * 1024 });
    const blob = new Blob([bytesOfSize(doc.fileSize)]);

    const outcome = await compressDocument(doc, blob);

    expect(outcome.flagged).toBe(false);
    expect(outcome.note).toBe('Within size limit — no compression needed.');
  });

  it('a file with no extension gets ext "bin"', async () => {
    const doc = makeDoc({ fileName: 'noextension', fileType: '' });
    const outcome = await compressDocument(doc, new Blob([bytesOfSize(doc.fileSize)]));
    expect(outcome.ext).toBe('bin');
  });
});

describe('compressDocument — zero-byte input', () => {
  it('a zero-byte non-PDF resolves benignly, unflagged', async () => {
    const doc = makeDoc({ fileName: 'empty.docx', fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileSize: 0 });
    const outcome = await compressDocument(doc, new Blob([]));

    expect(outcome.bytes.length).toBe(0);
    expect(outcome.flagged).toBe(false);
    expect(outcome.note).toBe('Within size limit — no compression needed.');
  });

  it('a zero-byte PDF fails to parse and falls back benignly', async () => {
    vi.mocked(loadPdf).mockRejectedValueOnce(new Error('Could not parse'));
    const doc = makeDoc({ fileName: 'empty.pdf', fileType: 'application/pdf', fileSize: 0 });
    const outcome = await compressDocument(doc, new Blob([]));

    expect(outcome.note).toBe('Could not parse as a PDF — left unchanged.');
    expect(outcome.flagged).toBe(false);
    expect(outcome.ext).toBe('pdf');
    expect(outcome.mimeType).toBe('application/pdf');
  });
});

describe('compressDocument — ext derivation', () => {
  it('uppercase .PDF extension lowercases to "pdf" on the PDF path', async () => {
    const doc = makeDoc({ fileName: 'a.PDF', fileType: 'application/pdf' });
    const outcome = await compressDocument(doc, new Blob([bytesOfSize(doc.fileSize)]));
    expect(outcome.ext).toBe('pdf');
  });

  it('only the last extension is used on the "other" path (a.tar.gz -> gz)', async () => {
    const doc = makeDoc({ fileName: 'a.tar.gz', fileType: 'application/gzip', fileSize: 1024 });
    const outcome = await compressDocument(doc, new Blob([bytesOfSize(1024)]));
    expect(outcome.ext).toBe('gz');
  });

  it('a leading-dot dotfile still splits on "." (.gitignore -> gitignore)', async () => {
    const doc = makeDoc({ fileName: '.gitignore', fileType: '', fileSize: 1024 });
    const outcome = await compressDocument(doc, new Blob([bytesOfSize(1024)]));
    expect(outcome.ext).toBe('gitignore');
  });

  it('a name with no dot at all gets ext "bin"', async () => {
    const doc = makeDoc({ fileName: 'noext', fileType: '', fileSize: 1024 });
    const outcome = await compressDocument(doc, new Blob([bytesOfSize(1024)]));
    expect(outcome.ext).toBe('bin');
  });
});

describe('suggestOutputName', () => {
  it('slot-based naming: <applicant>_<slot>_<date>.<ext>', () => {
    const name = suggestOutputName({
      doc: makeDoc({ fileName: 'IMG_1234.jpg' }),
      ext: 'jpg',
      dateStr: '20260115',
      slotLabel: 'Bank Statements',
      applicantLastName: 'Nguyễn',
    });
    expect(name).toBe('Nguy_n_Bank_Statements_20260115.jpg');
  });

  it('drops a missing applicant name without a leading underscore', () => {
    const name = suggestOutputName({
      doc: makeDoc({ fileName: 'IMG_1234.jpg' }),
      ext: 'jpg',
      dateStr: '20260115',
      slotLabel: 'Bank Statements',
    });
    expect(name).toBe('Bank_Statements_20260115.jpg');
  });

  it('treats an empty-string applicant name the same as undefined', () => {
    const name = suggestOutputName({
      doc: makeDoc({ fileName: 'IMG_1234.jpg' }),
      ext: 'jpg',
      dateStr: '20260115',
      slotLabel: 'Bank Statements',
      applicantLastName: '',
    });
    expect(name).toBe('Bank_Statements_20260115.jpg');
  });

  it('falls back to the original base name when there is no slot label', () => {
    const name = suggestOutputName({
      doc: makeDoc({ fileName: 'Joint Lease Agreement.pdf' }),
      ext: 'pdf',
      dateStr: '20260115',
    });
    expect(name).toBe('Joint_Lease_Agreement_20260115.pdf');
  });

  it('fallback strips only the last extension of a multi-dot filename', () => {
    const name = suggestOutputName({
      doc: makeDoc({ fileName: 'archive.tar.gz' }),
      ext: 'gz',
      dateStr: '20260115',
    });
    expect(name).toBe('archive_tar_20260115.gz');
  });

  it('fallback handles a filename with no extension', () => {
    const name = suggestOutputName({
      doc: makeDoc({ fileName: 'noextension' }),
      ext: 'bin',
      dateStr: '20260115',
    });
    expect(name).toBe('noextension_20260115.bin');
  });

  it('disambiguates a collision with a "_2" suffix before the extension', () => {
    const name = suggestOutputName({
      doc: makeDoc({ fileName: 'IMG_1234.jpg' }),
      ext: 'jpg',
      dateStr: '20260115',
      slotLabel: 'Bank Statements',
      applicantLastName: 'Nguyễn',
      existingNames: new Set(['nguy_n_bank_statements_20260115.jpg']),
    });
    expect(name).toBe('Nguy_n_Bank_Statements_20260115_2.jpg');
  });

  it('chains disambiguation past _2 and _3', () => {
    const name = suggestOutputName({
      doc: makeDoc({ fileName: 'IMG_1234.jpg' }),
      ext: 'jpg',
      dateStr: '20260115',
      slotLabel: 'Bank Statements',
      applicantLastName: 'Nguyễn',
      existingNames: new Set([
        'nguy_n_bank_statements_20260115.jpg',
        'nguy_n_bank_statements_20260115_2.jpg',
        'nguy_n_bank_statements_20260115_3.jpg',
      ]),
    });
    expect(name).toBe('Nguy_n_Bank_Statements_20260115_4.jpg');
  });

  it('the collision check is case-insensitive', () => {
    const name = suggestOutputName({
      doc: makeDoc({ fileName: 'IMG_1234.jpg' }),
      ext: 'jpg',
      dateStr: '20260115',
      slotLabel: 'Bank Statements',
      applicantLastName: 'Nguyễn',
      existingNames: new Set(['NGUY_N_BANK_STATEMENTS_20260115.JPG'.toLowerCase()]),
    });
    expect(name).toBe('Nguy_n_Bank_Statements_20260115_2.jpg');
  });

  it('disambiguates a name with no extension by appending at the end', () => {
    const name = suggestOutputName({
      doc: makeDoc({ fileName: 'noextension' }),
      ext: '',
      dateStr: '20260115',
      existingNames: new Set(['noextension_20260115.']),
    });
    expect(name.endsWith('_2.')).toBe(true);
  });
});

describe('validateOutputNames', () => {
  it('a clean batch produces no errors', () => {
    const errors = validateOutputNames([
      { docId: 'a', outputName: 'A_20260115.pdf' },
      { docId: 'b', outputName: 'B_20260115.pdf' },
    ]);
    expect(errors).toEqual({});
    expect(Object.keys(errors).length).toBe(0);
  });

  it('flags empty and whitespace-only names, without claiming a duplicate slot', () => {
    const errors = validateOutputNames([
      { docId: 'a', outputName: '' },
      { docId: 'b', outputName: '   ' },
    ]);
    expect(errors.a).toBe('File name cannot be empty.');
    expect(errors.b).toBe('File name cannot be empty.');
  });

  it('flags case-insensitive duplicates, first claimant wins', () => {
    const errors = validateOutputNames([
      { docId: 'a', outputName: 'Smith_Passport.pdf' },
      { docId: 'b', outputName: 'SMITH_passport.PDF' },
      { docId: 'c', outputName: '  Smith_Passport.pdf  ' },
    ]);
    expect(errors.a).toBeUndefined();
    expect(errors.b).toBe('Duplicate file name — give this file a unique name.');
    expect(errors.c).toBe('Duplicate file name — give this file a unique name.');
  });

  it('the same docId repeating the same name is not a duplicate', () => {
    const errors = validateOutputNames([
      { docId: 'a', outputName: 'Smith_Passport.pdf' },
      { docId: 'a', outputName: 'Smith_Passport.pdf' },
    ]);
    expect(errors).toEqual({});
  });
});

describe('formatBytes re-export identity', () => {
  it('documentCompressor re-exports the exact same function as pdfBundle', () => {
    expect(formatBytes).toBe(formatBytesFromPdfBundle);
  });
});

describe('cross-cutting: duplicate names within one batch resolve the way runCompression relies on', () => {
  it('three docs assigned to the same slot get sequentially disambiguated names that validateOutputNames accepts', () => {
    const existingNames = new Set<string>();
    const names: string[] = [];
    for (let i = 0; i < 3; i++) {
      const name = suggestOutputName({
        doc: makeDoc({ fileName: `scan${i}.pdf` }),
        ext: 'pdf',
        dateStr: '20260115',
        slotLabel: 'Bank Statements',
        applicantLastName: 'Smith',
        existingNames,
      });
      names.push(name);
      existingNames.add(name.toLowerCase());
    }

    expect(names).toEqual([
      'Smith_Bank_Statements_20260115.pdf',
      'Smith_Bank_Statements_20260115_2.pdf',
      'Smith_Bank_Statements_20260115_3.pdf',
    ]);

    const errors = validateOutputNames(names.map((outputName, i) => ({ docId: String(i), outputName })));
    expect(errors).toEqual({});
  });
});

describe('cross-cutting: non-ASCII applicant surnames end-to-end through suggestOutputName', () => {
  it.each(['Nguyễn', '李', 'Müller', 'Ríos-García', "O'Brien"])(
    'produces an ASCII-safe filename for surname %j',
    (applicantLastName) => {
      const name = suggestOutputName({
        doc: makeDoc({ fileName: 'evidence.pdf' }),
        ext: 'pdf',
        dateStr: '20260115',
        slotLabel: 'Evidence',
        applicantLastName,
      });
      expect(name).toMatch(/^[A-Za-z0-9_.-]+$/);
      expect(name.length).toBeGreaterThan(0);
      expect(name.endsWith('_20260115.pdf')).toBe(true);
    },
  );

  it("O'Brien sanitises the apostrophe to an underscore", () => {
    const name = suggestOutputName({
      doc: makeDoc({ fileName: 'evidence.pdf' }),
      ext: 'pdf',
      dateStr: '20260115',
      slotLabel: 'Evidence',
      applicantLastName: "O'Brien",
    });
    expect(name).toBe('O_Brien_Evidence_20260115.pdf');
  });

  it('a two-byte-in-UTF-16 CJK surname collapses to a single underscore (one UTF-16 code unit)', () => {
    const name = suggestOutputName({
      doc: makeDoc({ fileName: 'evidence.pdf' }),
      ext: 'pdf',
      dateStr: '20260115',
      slotLabel: 'Evidence',
      applicantLastName: '李',
    });
    expect(name).toBe('__Evidence_20260115.pdf');
  });
});
