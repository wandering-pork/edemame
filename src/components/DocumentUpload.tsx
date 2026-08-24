import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import { useRepositories } from '@/contexts/RepositoryContext';
import { Upload, CheckCircle, AlertCircle, Package } from 'lucide-react';
import type { Document } from '../types';
import { suggestAspectFromFilename } from '../lib/aspects820';
import { ACCEPTED_DOCUMENT_TYPES, CASE_FILES_MAX_BYTES } from '../lib/supportedFormats';

interface DocumentUploadProps {
  caseId: string;
  /** Visa subclass — when '820', filename heuristics pre-fill aspectTag */
  visaSubclass?: string;
  onUpload: (doc: Document) => void;
  /** Renders a smaller dropzone for tight spaces, e.g. the Case Files rail. */
  compact?: boolean;
  /**
   * Called when a file was rejected for exceeding CASE_FILES_MAX_BYTES and the
   * user opts to compress it instead (CF-2). Hands off the raw File(s) in
   * memory — these were never accepted into Case Files, so there's nothing to
   * re-browse to; the caller should open Auto-Packager with them pre-loaded.
   */
  onRequestCompress?: (files: File[]) => void;
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({ caseId, visaSubclass, onUpload, compact, onRequestCompress }) => {
  const repos = useRepositories();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [oversizedFiles, setOversizedFiles] = useState<File[]>([]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setError(null);
    setSuccess(null);
    setOversizedFiles([]);

    if (acceptedFiles.length === 0) return;

    setUploading(true);
    try {
      for (const file of acceptedFiles) {
        const doc: Document = {
          id: uuidv4(),
          caseId,
          fileName: file.name,
          filePath: `documents/${caseId}/${file.name}`,
          fileType: file.type,
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
          aspectTag: visaSubclass === '820' ? suggestAspectFromFilename(file.name) : undefined,
        };

        const created = await repos.documents.create(doc, file);
        onUpload(created);
      }
      setSuccess(
        acceptedFiles.length === 1
          ? `Uploaded "${acceptedFiles[0].name}" successfully.`
          : `Uploaded ${acceptedFiles.length} files successfully.`
      );
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [caseId, repos.documents, onUpload]);

  const onDropRejected = useCallback((fileRejections: any[]) => {
    const messages: string[] = [];
    const tooLarge: File[] = [];
    for (const rejection of fileRejections) {
      for (const err of rejection.errors) {
        if (err.code === 'file-too-large') {
          tooLarge.push(rejection.file);
        } else if (err.code === 'file-invalid-type') {
          messages.push(`"${rejection.file.name}" is not a supported file type.`);
        } else {
          messages.push(`"${rejection.file.name}": ${err.message}`);
        }
      }
    }
    if (tooLarge.length > 0) setOversizedFiles(tooLarge);
    setError(messages.length > 0 ? messages.join(' ') : null);
    setSuccess(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: ACCEPTED_DOCUMENT_TYPES,
    maxSize: CASE_FILES_MAX_BYTES,
    multiple: true,
  } as any);

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`
          group relative border-2 border-dashed rounded-2xl text-center cursor-pointer
          transition-all duration-200 ease-out
          ${compact ? 'px-3 py-4' : 'px-6 py-9'}
          ${isDragActive
            ? 'border-edamame-500 bg-edamame-50/70 dark:bg-edamame-500/10 scale-[1.005]'
            : 'border-gray-250 dark:border-white/10 bg-white/40 dark:bg-white/[0.015] hover:border-edamame-400 hover:bg-edamame-50/30 dark:hover:border-edamame-700/60 dark:hover:bg-edamame-500/[0.04]'
          }
          ${uploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input {...getInputProps()} />
        <div className={`flex flex-col items-center ${compact ? 'gap-1.5' : 'gap-2.5'}`}>
          <div
            className={`rounded-2xl flex items-center justify-center transition-all duration-200 ${compact ? 'w-8 h-8' : 'w-11 h-11'} ${
              isDragActive
                ? 'bg-edamame-500 text-white scale-110'
                : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-slate-500 group-hover:bg-edamame-100 dark:group-hover:bg-edamame-500/15 group-hover:text-edamame-600 dark:group-hover:text-edamame-400'
            }`}
          >
            <Upload size={compact ? 13 : 18} strokeWidth={2} />
          </div>
          {uploading ? (
            <p className={`font-semibold text-gray-500 dark:text-slate-400 ${compact ? 'text-[11px]' : 'text-sm'}`}>Uploading…</p>
          ) : isDragActive ? (
            <p className={`font-bold text-edamame-600 dark:text-edamame-400 ${compact ? 'text-[11px]' : 'text-sm'}`}>
              Drop to upload
            </p>
          ) : compact ? (
            <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-200">
              Drop files, or{' '}
              <span className="text-edamame-600 dark:text-edamame-400 underline decoration-edamame-300 dark:decoration-edamame-700/60 underline-offset-2">
                browse
              </span>
            </p>
          ) : (
            <>
              <p className="text-[13.5px] font-semibold text-gray-700 dark:text-slate-200">
                Drop files here, or{' '}
                <span className="text-edamame-600 dark:text-edamame-400 underline decoration-edamame-300 dark:decoration-edamame-700/60 underline-offset-2">
                  browse
                </span>
              </p>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-gray-400 dark:text-slate-500">
                PDF · JPG · PNG · DOCX  —  max 50 MB
              </p>
            </>
          )}
        </div>
      </div>

      {oversizedFiles.length > 0 && (
        <div className="flex flex-col gap-2 text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {oversizedFiles.length === 1
                ? `"${oversizedFiles[0].name}" exceeds ${formatMB(CASE_FILES_MAX_BYTES)}.`
                : `${oversizedFiles.length} files exceed ${formatMB(CASE_FILES_MAX_BYTES)}.`}
              {' '}Compress {oversizedFiles.length === 1 ? 'it' : 'them'} with Auto-Packager first?
            </span>
          </div>
          <div className="flex items-center gap-2 pl-6">
            <button
              type="button"
              onClick={() => {
                onRequestCompress?.(oversizedFiles);
                setOversizedFiles([]);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-edamame-600 hover:bg-edamame-700 text-white text-[12px] font-bold transition-colors"
            >
              <Package className="w-3.5 h-3.5" /> Use Auto-Packager
            </button>
            <button
              type="button"
              onClick={() => setOversizedFiles([])}
              className="px-2.5 py-1 rounded-lg text-[12px] font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}
    </div>
  );
};

export default DocumentUpload;
