/**
 * Passport OCR Service
 *
 * Privacy-first: ALL processing happens in the browser.
 * Passport images are NEVER sent to any server.
 *
 * Pipeline:
 *   1. Preprocess image for better OCR accuracy
 *   2. Run Tesseract.js OCR (client-side, ~45MB engine cached after first use)
 *   3. Extract MRZ lines via regex
 *   4. Parse MRZ with the `mrz` package
 *   5. Return structured passport data with validation flags
 */

import { createWorker } from 'tesseract.js';
import { parse } from 'mrz';
import { preprocessPassportImage } from './imagePreprocessor';

export interface PassportOcrResult {
  success: boolean;
  rawText?: string;
  fields?: {
    lastName: string;
    firstName: string;
    dateOfBirth: string; // YYYY-MM-DD
    nationality: string;
    passportNumber: string;
    expiryDate: string; // YYYY-MM-DD
    gender: string;
  };
  validationFlags?: Record<string, boolean>;
  error?: string;
}

/**
 * Convert MRZ YYMMDD date to YYYY-MM-DD.
 * Years < 50 are treated as 20xx, years >= 50 as 19xx.
 */
function mrzDateToISO(yymmdd: string): string {
  if (!yymmdd || yymmdd.length !== 6) return '';
  const yy = parseInt(yymmdd.substring(0, 2), 10);
  const mm = yymmdd.substring(2, 4);
  const dd = yymmdd.substring(4, 6);
  const century = yy < 50 ? '20' : '19';
  return `${century}${yymmdd.substring(0, 2)}-${mm}-${dd}`;
}

/**
 * Extract two consecutive 44-character MRZ lines from OCR text.
 */
function extractMrzLines(text: string): string[] | null {
  // Normalize: replace common OCR misreads and strip whitespace within lines
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\s/g, '').toUpperCase());

  const mrzPattern = /^[A-Z0-9<]{44}$/;
  const candidates: string[] = [];

  for (const line of lines) {
    if (mrzPattern.test(line)) {
      candidates.push(line);
    }
  }

  // We need exactly two consecutive MRZ lines (TD3 / passport format)
  if (candidates.length >= 2) {
    return [candidates[0], candidates[1]];
  }

  return null;
}

export async function scanPassport(
  file: File,
  onProgress?: (progress: number) => void
): Promise<PassportOcrResult> {
  try {
    // Step 1: Preprocess
    onProgress?.(5);
    const processedBlob = await preprocessPassportImage(file);

    // Step 2: Run Tesseract OCR
    onProgress?.(10);

    const worker = await createWorker('eng', undefined, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') {
          // Map Tesseract progress (0-1) to our range (10-70)
          const mapped = 10 + Math.round(m.progress * 60);
          onProgress?.(mapped);
        }
      },
    });

    const {
      data: { text },
    } = await worker.recognize(processedBlob);

    await worker.terminate();

    onProgress?.(75);

    // Step 3: Extract MRZ lines
    const mrzLines = extractMrzLines(text);

    if (!mrzLines) {
      return {
        success: false,
        rawText: text,
        error:
          'Could not detect MRZ (Machine Readable Zone) lines. Please ensure the passport photo clearly shows the bottom two lines of text.',
      };
    }

    onProgress?.(85);

    // Step 4: Parse MRZ
    const mrzText = mrzLines.join('\n');
    let parsed: ReturnType<typeof parse>;
    try {
      parsed = parse(mrzText);
    } catch {
      return {
        success: false,
        rawText: text,
        error:
          'MRZ lines were detected but could not be parsed. The image may be blurry or partially obscured.',
      };
    }

    onProgress?.(95);

    // Step 5: Build result
    const details = parsed.fields;
    const validationFlags: Record<string, boolean> = {};

    // Check digit validations from mrz parse result
    if (parsed.details) {
      for (const detail of parsed.details) {
        if (detail.field) {
          validationFlags[detail.field] = detail.valid;
        }
      }
    }

    const genderMap: Record<string, string> = {
      male: 'Male',
      female: 'Female',
      nonspecified: 'Other',
    };

    const fields = {
      lastName: details.lastName || '',
      firstName: details.firstName || '',
      dateOfBirth: details.birthDate
        ? mrzDateToISO(details.birthDate)
        : '',
      nationality: details.nationality || '',
      passportNumber: details.documentNumber || '',
      expiryDate: details.expirationDate
        ? mrzDateToISO(details.expirationDate)
        : '',
      gender: genderMap[details.sex || ''] || '',
    };

    onProgress?.(100);

    return {
      success: true,
      rawText: text,
      fields,
      validationFlags,
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred during passport scanning.',
    };
  }
}
