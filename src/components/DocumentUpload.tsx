import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import { useRepositories } from '@/contexts/RepositoryContext';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import type { Document } from '../types';

const ACCEPTED_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

interface DocumentUploadProps {
  caseId: string;
  onUpload: (doc: Document) => void;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({ caseId, onUpload }) => {
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
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200
          ${isDragActive
            ? 'border-edamame-500 bg-edamame-50 dark:bg-edamame-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-edamame-400 hover:bg-gray-50 dark:hover:bg-gray-700/30'
          }
          ${uploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          <Upload
            className={`w-10 h-10 ${
              isDragActive ? 'text-edamame-500' : 'text-gray-400 dark:text-gray-500'
            }`}
          />
          {uploading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Uploading...</p>
          ) : isDragActive ? (
            <p className="text-sm font-medium text-edamame-600 dark:text-edamame-400">
              Drop files here
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Drag & drop files here, or <span className="text-edamame-600 dark:text-edamame-400 underline">browse</span>
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                PDF, JPG, PNG, DOCX — max 5 MB per file
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
