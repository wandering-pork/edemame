import { describe, it, expect } from 'vitest';
import {
  isSupportedDocumentFile,
  ACCEPTED_DOCUMENT_EXTENSIONS,
  SUPPORTED_FORMATS_LABEL,
  CASE_FILES_MAX_BYTES,
} from './supportedFormats';
import { DOHA_MAX_BYTES } from './documentCompressor';

describe('isSupportedDocumentFile', () => {
  it.each([
    ['x.bin', 'application/pdf'],
    ['x.bin', 'image/jpeg'],
    ['x.bin', 'image/png'],
    ['x.bin', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ])('accepted by mime type: %s (%s)', (name, type) => {
    expect(isSupportedDocumentFile({ name, type })).toBe(true);
  });

  it.each([
    ['scan.pdf', ''],
    ['photo.jpg', ''],
    ['photo.jpeg', ''],
    ['shot.png', ''],
    ['form.docx', ''],
  ])('accepted by extension when mime is missing: %s', (name, type) => {
    expect(isSupportedDocumentFile({ name, type })).toBe(true);
  });

  it.each([
    ['SCAN.PDF', ''],
    ['PHOTO.JPG', ''],
    ['PHOTO.JPEG', ''],
    ['IMG.PNG', ''],
    ['FORM.DOCX', ''],
  ])('extension matching is case-insensitive: %s', (name, type) => {
    expect(isSupportedDocumentFile({ name, type })).toBe(true);
  });

  it('mime type matching is case-sensitive (current behavior, not a bug fix target)', () => {
    expect(isSupportedDocumentFile({ name: 'x.bin', type: 'IMAGE/JPEG' })).toBe(false);
  });

  it.each([
    ['a.heic', 'image/heic'],
    ['a.tiff', 'image/tiff'],
    ['a.bmp', 'image/bmp'],
    ['a.gif', 'image/gif'],
    ['a.webp', 'image/webp'],
    ['a.doc', 'application/msword'],
    ['a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['a.txt', 'text/plain'],
    ['a.zip', 'application/zip'],
    ['noextension', ''],
    ['', ''],
  ])('rejected: %s (%s)', (name, type) => {
    // imageCompress can technically handle BMP/GIF and classifyKind would
    // call them images, but the upload/picker gate deliberately rejects
    // them (DoHA's accepted-format list) — this pins that divergence.
    expect(isSupportedDocumentFile({ name, type })).toBe(false);
  });

  it('a mime type match wins even with a misleading extension', () => {
    expect(isSupportedDocumentFile({ name: 'malware.exe', type: 'application/pdf' })).toBe(true);
  });

  it('an extension match wins even with a misleading mime type', () => {
    expect(isSupportedDocumentFile({ name: 'report.pdf', type: 'application/zip' })).toBe(true);
  });

  it('the extension must be terminal — a trailing non-document extension is not stripped', () => {
    expect(isSupportedDocumentFile({ name: 'report.pdf.exe', type: '' })).toBe(false);
  });

  it('matches DOCX templates via the loose wordprocessingml substring check', () => {
    expect(
      isSupportedDocumentFile({
        name: 'x.bin',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
      }),
    ).toBe(true);
  });
});

describe('constants coherence', () => {
  it('ACCEPTED_DOCUMENT_EXTENSIONS matches the documented flat list and order', () => {
    expect(ACCEPTED_DOCUMENT_EXTENSIONS).toEqual(['.pdf', '.jpg', '.jpeg', '.png', '.docx']);
  });

  it('every accepted extension is individually accepted by isSupportedDocumentFile', () => {
    for (const ext of ACCEPTED_DOCUMENT_EXTENSIONS) {
      expect(isSupportedDocumentFile({ name: `file${ext}`, type: '' })).toBe(true);
    }
  });

  it('SUPPORTED_FORMATS_LABEL tokens have a case-insensitive counterpart in ACCEPTED_DOCUMENT_EXTENSIONS', () => {
    expect(SUPPORTED_FORMATS_LABEL).toBe('PDF, JPG, PNG, DOCX');
    const tokens = SUPPORTED_FORMATS_LABEL.split(',').map((t) => t.trim().toLowerCase());
    for (const token of tokens) {
      expect(ACCEPTED_DOCUMENT_EXTENSIONS.some((ext) => ext.slice(1).toLowerCase() === token)).toBe(true);
    }
  });

  it('CASE_FILES_MAX_BYTES is 50 MB and exceeds the DoHA ceiling', () => {
    expect(CASE_FILES_MAX_BYTES).toBe(50 * 1024 * 1024);
    expect(CASE_FILES_MAX_BYTES).toBeGreaterThan(DOHA_MAX_BYTES);
  });

  it('CASE_FILES_MAX_BYTES is exactly 10x DOHA_MAX_BYTES', () => {
    expect(CASE_FILES_MAX_BYTES).toBe(DOHA_MAX_BYTES * 10);
  });
});

describe('auto-select eligibility (proxy for DocumentCompressor.tsx isAutoSelectEligible, not exported)', () => {
  // isAutoSelectEligible(doc) = fileSize > DOHA_MAX_BYTES && isSupportedDocumentFile(...)
  // Re-implemented locally since the real predicate lives unexported inside a .tsx component.
  function isAutoSelectEligible(fileSize: number, fileName: string, fileType: string): boolean {
    return fileSize > DOHA_MAX_BYTES && isSupportedDocumentFile({ name: fileName, type: fileType });
  }

  it('an oversized, supported PDF is eligible', () => {
    expect(isAutoSelectEligible(8 * 1024 * 1024, 'scan.pdf', 'application/pdf')).toBe(true);
  });

  it('an under-ceiling file is not eligible (already compliant)', () => {
    expect(isAutoSelectEligible(4 * 1024 * 1024, 'scan.pdf', 'application/pdf')).toBe(false);
  });

  it('exactly at the ceiling is not eligible (strictly-greater)', () => {
    expect(isAutoSelectEligible(5_242_880, 'scan.pdf', 'application/pdf')).toBe(false);
  });

  it('one byte over the ceiling is eligible', () => {
    expect(isAutoSelectEligible(5_242_881, 'scan.pdf', 'application/pdf')).toBe(true);
  });

  it('an oversized but unsupported format (HEIC) is not eligible', () => {
    expect(isAutoSelectEligible(8 * 1024 * 1024, 'photo.heic', 'image/heic')).toBe(false);
  });

  it('an oversized but unsupported format (TIFF) is not eligible', () => {
    expect(isAutoSelectEligible(8 * 1024 * 1024, 'book.tiff', 'image/tiff')).toBe(false);
  });

  it('a file over the Case Files ceiling too is still eligible', () => {
    expect(isAutoSelectEligible(60 * 1024 * 1024, 'huge.pdf', 'application/pdf')).toBe(true);
  });
});
