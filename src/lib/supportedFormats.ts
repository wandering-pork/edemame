/**
 * Shared "what can Case Files / Auto-Packager accept" definitions, used by
 * both the Case Files upload dropzone (DocumentUpload.tsx) and the
 * Auto-Packager's local-PC file picker (AutoPackager.tsx) so the two stay
 * in sync rather than drifting into two different format matrices.
 */

/** react-dropzone `accept` map: mime type -> allowed extensions. */
export const ACCEPTED_DOCUMENT_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

/** Flat `<input accept>` string form of ACCEPTED_DOCUMENT_TYPES. */
export const ACCEPTED_DOCUMENT_EXTENSIONS = Object.values(ACCEPTED_DOCUMENT_TYPES).flat();

/** Human-readable list for error messages, e.g. "PDF, JPG, PNG, DOCX". */
export const SUPPORTED_FORMATS_LABEL = 'PDF, JPG, PNG, DOCX';

/**
 * Case Files' upload ceiling (CF-1). Raised from the old hard 5 MB block so
 * oversized-but-realistic scans/bundles have somewhere to land before being
 * run through the Auto-Packager — DoHA's actual 5 MB limit is enforced per
 * output attachment by the packager, not at the Case Files upload gate.
 */
export const CASE_FILES_MAX_BYTES = 50 * 1024 * 1024;

/** Whether a given file is one of the formats Case Files / Auto-Packager can handle. */
export function isSupportedDocumentFile(file: { name: string; type: string }): boolean {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return true;
  if (file.type === 'image/jpeg' || file.type === 'image/png' || /\.(jpe?g|png)$/.test(name)) return true;
  if (file.type.includes('wordprocessingml') || name.endsWith('.docx')) return true;
  return false;
}
