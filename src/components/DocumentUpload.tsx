import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import { useRepositories } from '@/contexts/RepositoryContext';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import type { Document } from '../types';
import { suggestAspectFromFilename } from '../lib/aspects820';

const ACCEPTED_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

interface DocumentUploadProps {
  caseId: string;
  /** Visa subclass — when '820', filename heuristics pre-fill aspectTag */
  visaSubclass?: string;
  onUpload: (doc: Document) => void;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({ caseId, visaSubclass, onUpload }) => {
  const repos = useRepositories();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setError(null);
    setSuccess(null);

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
    for (const rejection of fileRejections) {
      for (const err of rejection.errors) {
        if (err.code === 'file-too-large') {
          messages.push(`"${rejection.file.name}" exceeds 5 MB. Use the 5MB Crusher in Focus Mode to compress and bundle your documents.`);
        } else if (err.code === 'file-invalid-type') {
          messages.push(`"${rejection.file.name}" is not a supported file type.`);
        } else {
          messages.push(`"${rejection.file.name}": ${err.message}`);
        }
      }
    }
    setError(messages.join(' '));
    setSuccess(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
  } as any);

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`
          group relative border-2 border-dashed rounded-2xl px-6 py-9 text-center cursor-pointer
          transition-all duration-200 ease-out
          ${isDragActive
            ? 'border-edamame-500 bg-edamame-50/70 dark:bg-edamame-500/10 scale-[1.005]'
            : 'border-gray-250 dark:border-white/10 bg-white/40 dark:bg-white/[0.015] hover:border-edamame-400 hover:bg-edamame-50/30 dark:hover:border-edamame-700/60 dark:hover:bg-edamame-500/[0.04]'
          }
          ${uploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2.5">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 ${
              isDragActive
                ? 'bg-edamame-500 text-white scale-110'
                : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-slate-500 group-hover:bg-edamame-100 dark:group-hover:bg-edamame-500/15 group-hover:text-edamame-600 dark:group-hover:text-edamame-400'
            }`}
          >
            <Upload size={18} strokeWidth={2} />
          </div>
          {uploading ? (
            <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">Uploading…</p>
          ) : isDragActive ? (
            <p className="text-sm font-bold text-edamame-600 dark:text-edamame-400">
              Drop to upload
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
                PDF · JPG · PNG · DOCX  —  max 5 MB
              </p>
            </>
          )}
        </div>
      </div>

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
