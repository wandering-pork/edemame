/**
 * LMT Evidence OCR Service (GitHub issue #31)
 *
 * Sends a job-ad screenshot or PDF to Gemini Vision via
 * `/api/scan-lmt-evidence-gemini` and returns the advertising campaign details.
 * Same shape as `ocrService.ts`'s passport scan — the caller is expected to put
 * the result in front of the user for editing before saving anything.
 */

export interface LmtEvidenceFields {
  platform: string;
  /** YYYY-MM-DD, or '' when the model could not determine it. */
  startDate: string;
  /** YYYY-MM-DD, or '' when the model could not determine it. */
  endDate: string;
  positionTitle: string;
  notes: string;
}

export interface LmtEvidenceOcrResult {
  success: boolean;
  fields?: LmtEvidenceFields;
  error?: string;
}

export async function scanLmtEvidence(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<LmtEvidenceOcrResult> {
  try {
    onProgress?.(10);

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    onProgress?.(30);

    const response = await fetch('/api/scan-lmt-evidence-gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64: base64,
        mimeType: file.type,
      }),
    });

    onProgress?.(75);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || 'Failed to read the advertisement. Please try again.',
      };
    }

    const data = await response.json();
    onProgress?.(100);

    if (data.success && data.fields) {
      return { success: true, fields: data.fields };
    }
    return {
      success: false,
      error: data.error || 'Could not extract advertisement details from this file.',
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred while reading the advertisement.',
    };
  }
}
