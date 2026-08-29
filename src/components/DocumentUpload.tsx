import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import { useRepositories } from '@/contexts/RepositoryContext';
import { Upload, CheckCircle, AlertCircle, Package, X, FileText } from 'lucide-react';
import type { Document } from '../types';
import { suggestAspectFromFilename } from '../lib/aspects820';
import { ACCEPTED_DOCUMENT_TYPES, CASE_FILES_MAX_BYTES } from '../lib/supportedFormats';
import { DocumentTypePicker } from './DocumentTypePicker';

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

/** A dropped file held back until the user has given it a Document Type. */
interface StagedFile {
  id: string;
  file: File;
  documentTypeCode?: string;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({ caseId, visaSubclass, onUpload, compact, onRequestCompress }) => {
  const repos = useRepositories();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [oversizedFiles, setOversizedFiles] = useState<File[]>([]);
  // Document Type is mandatory (issue #4 §6), so a drop no longer uploads
  // straight away — files are staged here until every one has a type.
  const [staged, setStaged] = useState<StagedFile[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    setSuccess(null);
    setOversizedFiles([]);
    if (acceptedFiles.length === 0) return;
    setStaged(prev => [...prev, ...acceptedFiles.map(file => ({ id: uuidv4(), file }))]);
  }, []);

  const setStagedType = (id: string, code: string) =>
    setStaged(prev => prev.map(s => (s.id === id ? { ...s, documentTypeCode: code } : s)));

  const removeStaged = (id: string) => setStaged(prev => prev.filter(s => s.id !== id));

  const allTyped = staged.length > 0 && staged.every(s => !!s.documentTypeCode);

  const confirmUpload = async () => {
    if (!allTyped) return;
    setError(null);
    setUploading(true);
    try {
      for (const entry of staged) {
        const doc: Document = {
          id: uuidv4(),
          caseId,
          fileName: entry.file.name,
          filePath: `documents/${caseId}/${entry.file.name}`,
          fileType: entry.file.type,
          fileSize: entry.file.size,
          uploadedAt: new Date().toISOString(),
          documentTypeCode: entry.documentTypeCode,
          aspectTag: visaSubclass === '820' ? suggestAspectFromFilename(entry.file.name) : undefined,
        };

        const created = await repos.documents.create(doc, entry.file);
        onUpload(created);
      }
      setSuccess(
        staged.length === 1
          ? `Uploaded "${staged[0].file.name}" successfully.`
          : `Uploaded ${staged.length} files successfully.`
      );
      setStaged([]);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

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

      {staged.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-gray-700 dark:text-slate-200">
              Set a document type to finish uploading
            </span>
            <span className="text-[10.5px] font-semibold text-gray-400 dark:text-slate-500">
              {staged.filter(s => s.documentTypeCode).length}/{staged.length} typed
            </span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {staged.map(entry => (
              <div key={entry.id} className="flex items-center gap-2 px-3.5 py-2">
                <FileText size={13} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
                <span className="flex-1 min-w-0 text-[12px] font-semibold text-gray-700 dark:text-slate-200 truncate" title={entry.file.name}>
                  {entry.file.name}
                </span>
                <DocumentTypePicker
                  value={entry.documentTypeCode}
                  onChange={code => setStagedType(entry.id, code)}
                  placeholder="Document type (required)"
                  invalid={!entry.documentTypeCode}
                  compact
                  className="w-56 flex-shrink-0"
                />
                <button
                  type="button"
                  onClick={() => removeStaged(entry.id)}
                  title="Remove from this upload"
                  className="p-1 text-gray-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 flex-shrink-0"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="px-3.5 py-2.5 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-gray-400 dark:text-slate-500">
              Nothing fits? Pick <span className="font-mono font-bold">OTH — Other</span>.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStaged([])}
                className="px-3 py-1.5 text-[11.5px] font-semibold text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmUpload}
                disabled={!allTyped || uploading}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-edamame hover:bg-edamame-600 disabled:opacity-40 text-white font-bold rounded-lg text-[11.5px] transition-colors"
              >
                <Upload size={12} /> {uploading ? 'Uploading…' : `Upload ${staged.length} file${staged.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

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
