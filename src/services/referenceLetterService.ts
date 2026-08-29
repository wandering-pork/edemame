/**
 * Reference Letter Validator service (GitHub issue #32 §2).
 *
 * Client half of `api/validate-reference-letter-gemini.ts` — same shape as
 * `ocrService.ts`'s `scanPassport()`: read the file as base64, POST it, hand
 * back a result the caller reviews before trusting. The per-authority field
 * list travels with the request because the rule sets live in
 * `lib/referenceLetterRequirements.ts`, not in the serverless function.
 */

import {
  REFERENCE_LETTER_AUTHORITIES_BY_ID,
  requirementsForAuthority,
  type ReferenceLetterAuthorityId,
  type ReferenceLetterValues,
} from '../lib/referenceLetterRequirements';

export interface ReferenceLetterExtractionResult {
  success: boolean;
  values?: ReferenceLetterValues;
  error?: string;
}

/** What the extraction endpoint (and Gemini) can read. */
export const REFERENCE_LETTER_ACCEPTED_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

export const REFERENCE_LETTER_FORMATS_LABEL = 'PDF, JPG or PNG';

/** Gemini inline data has to fit in the request — keep uploads well under it. */
export const REFERENCE_LETTER_MAX_BYTES = 15 * 1024 * 1024;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function extractReferenceLetterFields(
  file: File,
  authorityId: ReferenceLetterAuthorityId,
): Promise<ReferenceLetterExtractionResult> {
  try {
    if (file.size > REFERENCE_LETTER_MAX_BYTES) {
      return { success: false, error: 'That file is too large to read. Please upload a file under 15 MB.' };
    }

    const fileBase64 = await toBase64(file);
    const authority = REFERENCE_LETTER_AUTHORITIES_BY_ID[authorityId];
    const fields = requirementsForAuthority(authorityId).map(({ field }) => ({
      key: field.key,
      label: field.label,
      hint: field.hint,
    }));

    const response = await fetch('/api/validate-reference-letter-gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64,
        mimeType: file.type,
        authorityName: authority.name,
        fields,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error || 'Could not read the reference letter. Please try again.' };
    }

    const data = await response.json();
    if (data.success && data.values) {
      return { success: true, values: data.values as ReferenceLetterValues };
    }
    return { success: false, error: data.error || 'Could not read the reference letter.' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred while reading the letter.',
    };
  }
}
