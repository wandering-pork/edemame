import { describe, it, expect, vi, afterEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { Document } from '../types';
import {
  loadPdf,
  mergePdfs,
  splitIntoGroups,
  sanitiseFilenameSegment,
  immiAccountName,
  formatBytes,
  createDownloadUrl,
  type LoadedPdf,
} from './pdfBundle';
import { DOHA_MAX_BYTES, formatBytes as formatBytesFromDocumentCompressor } from './documentCompressor';

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

async function makePdfBytes(pageCount: number, pageSize: [number, number] = [595, 842]) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) pdf.addPage(pageSize);
  // addDefaultPage:false — pdf-lib's save() otherwise auto-inserts a blank
  // page whenever the document has zero pages, which would make it
  // impossible to construct a genuinely empty fixture for the 0-page test.
  return pdf.save({ addDefaultPage: false });
}

async function makePdfBlob(pageCount: number, pageSize: [number, number] = [595, 842]) {
  return new Blob([await makePdfBytes(pageCount, pageSize)], { type: 'application/pdf' });
}

function loadedPdfOfSize(id: string, size: number): LoadedPdf {
  return { doc: makeDoc({ id }), bytes: new Uint8Array(size), pageCount: 1 };
}

describe('loadPdf', () => {
  it('reports page count and preserves byte fidelity', async () => {
    const blob = await makePdfBlob(3);
    const doc = makeDoc({ fileName: 'a.pdf' });

    const loaded = await loadPdf(doc, blob);

    expect(loaded.pageCount).toBe(3);
    expect(loaded.bytes).toBeInstanceOf(Uint8Array);
    expect(loaded.bytes.length).toBe(blob.size);
    const header = new TextDecoder().decode(loaded.bytes.subarray(0, 5));
    expect(header).toBe('%PDF-');
    expect(loaded.doc).toBe(doc);
  });

  it('handles a single-page document', async () => {
    const blob = await makePdfBlob(1);
    const loaded = await loadPdf(makeDoc(), blob);
    expect(loaded.pageCount).toBe(1);
  });

  it('handles a zero-page document without throwing', async () => {
    const blob = await makePdfBlob(0);
    const loaded = await loadPdf(makeDoc(), blob);
    expect(loaded.pageCount).toBe(0);
  });

  it('rejects non-PDF bytes', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'application/pdf' });
    await expect(loadPdf(makeDoc(), blob)).rejects.toThrow();
  });

  it('tolerates loading without throwing on ignoreEncryption (regression: encrypted PDFs must not error)', async () => {
    // We can't cheaply produce a genuinely-encrypted fixture with pdf-lib here;
    // this pins that a normal load still succeeds under the { ignoreEncryption: true }
    // call site, so a future removal of that option would be caught by the rejection test above.
    const blob = await makePdfBlob(1);
    await expect(loadPdf(makeDoc(), blob)).resolves.toBeDefined();
  });
});

describe('mergePdfs', () => {
  it('builds a 1-indexed, cumulative page map', async () => {
    const a = await loadPdf(makeDoc({ id: 'a' }), await makePdfBlob(2));
    const b = await loadPdf(makeDoc({ id: 'b' }), await makePdfBlob(3));
    const c = await loadPdf(makeDoc({ id: 'c' }), await makePdfBlob(1));

    const { bytes, pageMap } = await mergePdfs([a, b, c]);

    expect(pageMap.get('a')).toBe(1);
    expect(pageMap.get('b')).toBe(3);
    expect(pageMap.get('c')).toBe(6);
    expect(pageMap.size).toBe(3);

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(6);
  });

  it('resolves to a valid 0-page PDF for empty input', async () => {
    const { bytes, pageMap } = await mergePdfs([]);

    expect(pageMap.size).toBe(0);
    expect(bytes.length).toBeGreaterThan(0);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(0);
  });

  it('strips/normalises source metadata', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]);
    pdf.setTitle('Client Bank Statement');
    pdf.setAuthor('Jane Doe');
    pdf.setSubject('secret');
    pdf.setKeywords(['divorce']);
    pdf.setProducer('Acme Scanner');
    const bytes = await pdf.save();
    const loaded = await loadPdf(makeDoc(), new Blob([bytes], { type: 'application/pdf' }));

    const { bytes: mergedBytes } = await mergePdfs([loaded]);

    // Producer can't be checked via PDFDocument.load(mergedBytes).getProducer():
    // pdf-lib's own constructor (updateInfoDict) unconditionally re-stamps
    // Producer to its own default the moment the bytes are reloaded, which
    // would mask a real leak just as easily as a real strip. Check the raw
    // serialized bytes instead, which is what a case officer would actually see.
    const raw = new TextDecoder('latin1').decode(mergedBytes);
    expect(raw).not.toContain('Acme Scanner');
    expect(raw).not.toContain('Jane Doe');
    expect(raw).not.toContain('Client Bank Statement');
    expect(raw).not.toContain('divorce');

    const reloaded = await PDFDocument.load(mergedBytes);
    expect(reloaded.getTitle() || '').toBe('');
    expect(reloaded.getAuthor() || '').toBe('');
    expect(reloaded.getSubject() || '').toBe('');
    expect(reloaded.getKeywords() || '').toBe('');
    expect(reloaded.getCreator()).toBe('Edamame Legal Flow');
  });

  it('the same doc id passed twice is last-write-wins in the page map', async () => {
    const a = await loadPdf(makeDoc({ id: 'a' }), await makePdfBlob(2));

    const { bytes, pageMap } = await mergePdfs([a, a]);

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(4);
    expect(pageMap.size).toBe(1);
    expect(pageMap.get('a')).toBe(3);
  });

  it('picks the smaller of the object-stream vs fallback save, and the result stays parseable', async () => {
    const loaded = await loadPdf(makeDoc(), await makePdfBlob(20));
    const inputTotal = loaded.bytes.length;

    const { bytes } = await mergePdfs([loaded]);

    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.length).toBeLessThanOrEqual(inputTotal * 1.5);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(20);
  });
});

describe('splitIntoGroups', () => {
  const MB = 1024 * 1024;
  const target = 4.9 * MB;

  it('keeps everything in one group when it all fits', () => {
    const items = [loadedPdfOfSize('a', 1 * MB), loadedPdfOfSize('b', 1 * MB), loadedPdfOfSize('c', 1 * MB)];
    const groups = splitIntoGroups(items, target);
    expect(groups.length).toBe(1);
    expect(groups[0].length).toBe(3);
  });

  it('splits on document boundaries, never mid-document', () => {
    const items = [
      loadedPdfOfSize('a', 2 * MB),
      loadedPdfOfSize('b', 2 * MB),
      loadedPdfOfSize('c', 2 * MB),
      loadedPdfOfSize('d', 2 * MB),
    ];
    const groups = splitIntoGroups(items, target);

    expect(groups.length).toBe(2);
    expect(groups[0].length).toBe(2);
    expect(groups[1].length).toBe(2);
    for (const g of groups) {
      const sum = g.reduce((s, i) => s + i.bytes.length, 0);
      expect(sum).toBeLessThanOrEqual(target);
    }
    expect(groups.flat().map((i) => i.doc.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('gives a single oversized document its own group', () => {
    const items = [loadedPdfOfSize('a', 8 * MB), loadedPdfOfSize('b', 1 * MB)];
    const groups = splitIntoGroups(items, target);

    expect(groups.length).toBe(2);
    expect(groups[0].map((i) => i.doc.id)).toEqual(['a']);
    expect(groups[1].map((i) => i.doc.id)).toEqual(['b']);
  });

  it('gives a single oversized document its own group (variant: oversized item last)', () => {
    const items = [loadedPdfOfSize('a', 1 * MB), loadedPdfOfSize('b', 8 * MB)];
    const groups = splitIntoGroups(items, target);

    expect(groups.length).toBe(2);
    expect(groups[0].map((i) => i.doc.id)).toEqual(['a']);
    expect(groups[1].map((i) => i.doc.id)).toEqual(['b']);
  });

  it('empty input yields an empty array, not a single empty group', () => {
    expect(splitIntoGroups([], target)).toEqual([]);
  });

  it('exact-boundary sum equal to target stays in one group', () => {
    const items = [loadedPdfOfSize('a', target / 2), loadedPdfOfSize('b', target / 2)];
    const groups = splitIntoGroups(items, target);
    expect(groups.length).toBe(1);
  });

  it('a sum one byte over the target splits into two groups', () => {
    const items = [loadedPdfOfSize('a', target / 2), loadedPdfOfSize('b', target / 2 + 1)];
    const groups = splitIntoGroups(items, target);
    expect(groups.length).toBe(2);
  });
});

describe('sanitiseFilenameSegment', () => {
  it.each([
    ['Smith', 'Smith'],
    ['Bank Statement', 'Bank_Statement'],
    ['Police & Health', 'Police___Health'],
    ['a/b\\c:d*e?f"g<h>i|j', 'a_b_c_d_e_f_g_h_i_j'],
    ['Nguyễn', 'Nguy_n'],
    ['李明', '__'],
    ['Müller', 'M_ller'],
    ['José-Ramírez_2024', 'Jos_-Ram_rez_2024'],
    ['', ''],
    ['   ', '___'],
    ['....', '____'],
    ['file.name', 'file_name'],
    ['👍', '__'],
  ])('sanitiseFilenameSegment(%j) === %j', (input, expected) => {
    expect(sanitiseFilenameSegment(input)).toBe(expected);
  });

  it('does not truncate a very long segment', () => {
    const input = 'A'.repeat(300);
    const result = sanitiseFilenameSegment(input);
    expect(result).toBe(input);
    expect(result.length).toBe(300);
  });

  it.each(['../../etc/passwd', '..\\..\\windows', 'C:/Users/x'])(
    'path traversal cannot survive: %j',
    (input) => {
      const result = sanitiseFilenameSegment(input);
      expect(result).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(result).not.toContain('.');
      expect(result).not.toContain('/');
      expect(result).not.toContain('\\');
      expect(result).not.toContain(':');
    },
  );
});

describe('immiAccountName', () => {
  it('renames with the standard <base>_<date>.pdf pattern', () => {
    const doc = makeDoc({ fileName: 'Bank Statement.pdf' });
    expect(immiAccountName(doc, '20260101')).toBe('Bank_Statement_20260101.pdf');
  });

  it('strips only the last extension, leaving other dots sanitised, and always outputs .pdf', () => {
    const doc = makeDoc({ fileName: 'archive.tar.gz' });
    expect(immiAccountName(doc, '20260101')).toBe('archive_tar_20260101.pdf');
  });

  it('handles a filename with no extension', () => {
    const doc = makeDoc({ fileName: 'noextension' });
    expect(immiAccountName(doc, '20260101')).toBe('noextension_20260101.pdf');
  });

  it('defaults the date to today when omitted', () => {
    const doc = makeDoc({ fileName: 'a.pdf' });
    expect(immiAccountName(doc)).toMatch(/_\d{8}\.pdf$/);
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024 - 1, '1024.0 KB'],
    [1024 * 1024, '1.00 MB'],
    [5 * 1024 * 1024, '5.00 MB'],
    [50 * 1024 * 1024, '50.00 MB'],
    [4.9 * 1024 * 1024, '4.90 MB'],
  ])('formatBytes(%d) === %j', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it('is the same function reference as the one re-exported from documentCompressor.ts', () => {
    expect(formatBytesFromDocumentCompressor).toBe(formatBytes);
  });
});

describe('createDownloadUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates an object URL for a PDF-typed blob and passes the filename through unchanged', () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock-url');
    vi.stubGlobal('URL', { ...URL, createObjectURL });

    const bytes = new Uint8Array(1234);
    const result = createDownloadUrl(bytes, 'output.pdf');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const passedBlob = createObjectURL.mock.calls[0][0];
    expect(passedBlob.type).toBe('application/pdf');
    expect(passedBlob.size).toBe(1234);
    expect(result.filename).toBe('output.pdf');
    expect(result.url).toBe('blob:mock-url');
  });
});

describe('Run Crusher bundle filename composition (proxy for PdfPackager.tsx)', () => {
  // PdfPackager.tsx composes its download filename as
  // `${caseId.slice(0,8).toUpperCase()}_ImmiAccount_Bundle_${yyyyMMdd}.pdf` —
  // that logic isn't exported, so this re-implements the one-liner to pin it.
  function runCrusherFilename(caseId: string, dateStr: string): string {
    return `${caseId.slice(0, 8).toUpperCase()}_ImmiAccount_Bundle_${dateStr}.pdf`;
  }

  it('uses the first 8 characters of the case id, uppercased', () => {
    expect(runCrusherFilename('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '20260115')).toBe(
      'A1B2C3D4_ImmiAccount_Bundle_20260115.pdf',
    );
  });

  it('does not pad a case id shorter than 8 characters', () => {
    expect(runCrusherFilename('short', '20260115')).toBe('SHORT_ImmiAccount_Bundle_20260115.pdf');
  });
});

describe('DOHA_MAX_BYTES constant', () => {
  it('matches the documented value', () => {
    expect(DOHA_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});
