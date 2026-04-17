import React, { useState, useEffect, useCallback } from 'react';
import { useRepositories } from '@/contexts/RepositoryContext';
import { format } from 'date-fns';
import { FileText, Image, Download, Trash2, File, Eye } from 'lucide-react';
import type { Document, Aspect820 } from '../types';
import { ASPECTS_820, ASPECT_ORDER_820 } from '../lib/aspects820';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string) {
  if (fileType.startsWith('image/')) return Image;
  if (fileType === 'application/pdf' || fileType.includes('wordprocessing')) return FileText;
  return File;
}

function isImage(fileType: string) {
  return fileType.startsWith('image/');
}

function isPdf(fileType: string) {
  return fileType === 'application/pdf';
}

interface DocumentListProps {
  caseId: string;
  /** Increment this value to trigger a refresh (e.g., after an upload). */
  refreshKey?: number;
  /** When '820', renders aspect-tag badge + reassign dropdown per document. */
  visaSubclass?: string;
}

export const DocumentList: React.FC<DocumentListProps> = ({ caseId, refreshKey, visaSubclass }) => {
  const repos = useRepositories();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<{ [key: string]: string }>({});
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const show820Tags = visaSubclass === '820';

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    const docs = await repos.documents.getByCaseId(caseId);
    // Newest first
    docs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    setDocuments(docs);
    setLoading(false);

    // Generate image thumbnails
    const newThumbs: Record<string, string> = {};
    for (const doc of docs) {
      if (isImage(doc.fileType)) {
        try {
          const blob = await repos.documents.getFileData(doc);
          if (blob) {
            newThumbs[doc.id] = URL.createObjectURL(blob);
          }
        } catch {
          // skip thumbnail on error
        }
      }
    }
    setThumbnails(prev => {
      // Revoke old URLs
      Object.keys(prev).forEach(key => URL.revokeObjectURL(prev[key]));
      return newThumbs;
    });
  }, [repos.documents, caseId]);

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDocuments, refreshKey]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.keys(thumbnails).forEach(key => URL.revokeObjectURL(thumbnails[key]));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = async (doc: Document) => {
    const blob = await repos.documents.getFileData(doc);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePreview = async (doc: Document) => {
    const blob = await repos.documents.getFileData(doc);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Delay revoke so the new tab can load
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleAssignAspect = async (doc: Document, next: Aspect820 | undefined) => {
    const updated: Document = { ...doc, aspectTag: next };
    await repos.documents.update(updated);
    setDocuments(prev => prev.map(d => (d.id === doc.id ? updated : d)));
    setEditingTagId(null);
  };

  const handleDelete = async (id: string) => {
    await repos.documents.delete(id);
    setDocuments(prev => prev.filter(d => d.id !== id));
    setConfirmDeleteId(null);
    // Cleanup thumbnail if exists
    if (thumbnails[id]) {
      URL.revokeObjectURL(thumbnails[id]);
      setThumbnails(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
        Loading documents...
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
        No documents attached to this case yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map(doc => {
        const IconComponent = getFileIcon(doc.fileType);
        const canPreview = isImage(doc.fileType) || isPdf(doc.fileType);

        return (
          <div
            key={doc.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
          >
            {/* Thumbnail or Icon */}
            {thumbnails[doc.id] ? (
              <img
                src={thumbnails[doc.id]}
                alt={doc.fileName}
                className="w-10 h-10 rounded object-cover border border-gray-200 dark:border-gray-600 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                <IconComponent className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </div>
            )}

            {/* File info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                {doc.fileName}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {formatFileSize(doc.fileSize)} &middot; {format(new Date(doc.uploadedAt), 'dd MMM yyyy, h:mm a')}
              </p>
              {show820Tags && (
                editingTagId === doc.id ? (
                  <select
                    autoFocus
                    value={doc.aspectTag ?? ''}
                    onChange={(e) => handleAssignAspect(doc, (e.target.value || undefined) as Aspect820 | undefined)}
                    onBlur={() => setEditingTagId(null)}
                    className="mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-edamame-500/30"
                  >
                    <option value="">— Untagged —</option>
                    {ASPECT_ORDER_820.map(k => (
                      <option key={k} value={k}>{ASPECTS_820[k].label}</option>
                    ))}
                  </select>
                ) : doc.aspectTag ? (
                  <button
                    type="button"
                    onClick={() => setEditingTagId(doc.id)}
                    title={`Aspect: ${ASPECTS_820[doc.aspectTag].label} — click to reassign`}
                    className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] pl-1.5 pr-2 py-0.5 rounded-sm border-l-2 transition-all hover:brightness-110 dark:hover:brightness-125"
                    style={{
                      color: ASPECTS_820[doc.aspectTag].color,
                      backgroundColor: `${ASPECTS_820[doc.aspectTag].color}14`,
                      borderLeftColor: ASPECTS_820[doc.aspectTag].color,
                    }}
                  >
                    {ASPECTS_820[doc.aspectTag].label}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingTagId(doc.id)}
                    title="Click to tag with an aspect of the relationship"
                    className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-sm border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:text-edamame-600 hover:border-edamame-400 dark:hover:text-edamame-400 dark:hover:border-edamame-700 transition-colors"
                  >
                    + Tag aspect
                  </button>
                )
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {canPreview && (
                <button
                  onClick={() => handlePreview(doc)}
                  title="Preview"
                  className="p-1.5 rounded-md text-gray-400 hover:text-edamame-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => handleDownload(doc)}
                title="Download"
                className="p-1.5 rounded-md text-gray-400 hover:text-edamame-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Download className="w-4 h-4" />
              </button>

              {confirmDeleteId === doc.id ? (
                <div className="flex items-center gap-1 ml-1">
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(doc.id)}
                  title="Delete"
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DocumentList;
