/**
 * Passport OCR Service
 *
 * Uses Gemini Vision API to extract passport data from images.
 * More reliable than client-side OCR for real-world passport photos.
 */

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

export async function scanPassport(
  file: File,
  onProgress?: (progress: number) => void
): Promise<PassportOcrResult> {
  try {
    onProgress?.(10);

    // Convert file to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64String = result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    onProgress?.(30);

    // Call backend API which uses Gemini Vision
    const response = await fetch('/api/scan-passport-gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType: file.type,
      }),
    });

    onProgress?.(75);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || 'Failed to scan passport. Please try again.',
      };
    }

    const data = await response.json();
    onProgress?.(100);

    if (data.success && data.fields) {
      return {
        success: true,
        fields: data.fields,
        validationFlags: {},
      };
    } else {
      return {
        success: false,
        error: data.error || 'Could not extract passport data from image.',
      };
    }
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
