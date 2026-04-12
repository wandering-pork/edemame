import React, { useState, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Package, Download, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import type { Document } from '../types';
import { useRepositories } from '../contexts/RepositoryContext';

interface PdfPackagerProps {
  caseId: string;
  documents: Document[];
  visaSubclass: string;
  onClose: () => void;
}

const TARGET_SIZES = [
  { label: '5 MB (ImmiAccount limit)', bytes: 5 * 1024 * 1024 },
  { label: '4 MB (safe margin)', bytes: 4 * 1024 * 1024 },
  { label: '3 MB (maximum safety)', bytes: 3 * 1024 * 1024 },
];

/** ImmiAccount file naming convention */
function immiAccountName(doc: Document): string {
  const base = doc.fileName.replace(/\.[^.]+$/, '');
  const dateStr = format(new Date(), 'yyyyMMdd');
  return `${base.replace(/[^a-zA-Z0-9_-]/g, '_')}_${dateStr}.pdf`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const PdfPackager: React.FC<PdfPackagerProps> = ({ caseId, documents, visaSubclass, onClose }) => {
  const repos = useRepositories();
  const pdfDocs = documents.filter(d => d.fileType === 'application/pdf');

  const [selected, setSelected] = useState<Set<string>>(new Set(pdfDocs.map(d => d.id)));
  const [targetIdx, setTargetIdx] = useState(0);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ url: string; size: number; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleDoc = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePackage = async () => {
    const selectedDocs = pdfDocs.filter(d => selected.has(d.id));
    if (selectedDocs.length === 0) return;

    setStatus('processing');
    setError(null);
    setResult(null);

    try {
      const targetBytes = TARGET_SIZES[targetIdx].bytes;
      setProgress(`Loading ${selectedDocs.length} PDF(s)...`);

      // Load all selected PDFs
      const pdfBytes: Uint8Array[] = [];
      for (const doc of selectedDocs) {
        const blob = await repos.documents.getFileData(doc);
        if (!blob) throw new Error(`Could not load "${doc.fileName}"`);
        const ab = await blob.arrayBuffer();
        pdfBytes.push(new Uint8Array(ab));
      }

      setProgress('Merging PDFs...');

      // Merge all PDFs into one
      const merged = await PDFDocument.create();
      for (const bytes of pdfBytes) {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }

      // Strip metadata
      merged.setTitle('');
      merged.setAuthor('');
      merged.setCreator('Edamame Legal Flow');
      merged.setProducer('');
      merged.setSubject('');
      merged.setKeywords([]);

      setProgress('Applying object-stream compression...');

      // Save with object-stream compression (best lossless option from pdf-lib)
      let finalBytes = await merged.save({ useObjectStreams: true });

      if (finalBytes.length > targetBytes) {
        // Try without object streams as a fallback (sometimes slightly smaller)
        const fallback = await merged.save({ useObjectStreams: false });
        if (fallback.length < finalBytes.length) finalBytes = fallback;
      }

      const caseIdShort = caseId.slice(0, 8).toUpperCase();
      const dateStr = format(new Date(), 'yyyyMMdd');
      const filename = `${caseIdShort}_ImmiAccount_Bundle_${dateStr}.pdf`;

      const blob = new Blob([finalBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      setResult({ url, size: finalBytes.length, filename });
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Packaging failed. Please try again.');
      setStatus('error');
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url;
    a.download = result.filename;
    a.click();
  };

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (result?.url) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-100 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-edamame/10 dark:bg-edamame/15 text-edamame-600 flex items-center justify-center">
              <Package size={16} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-sm">5MB Crusher</h3>
              <p className="text-xs text-gray-400 dark:text-slate-500">Bundle & compress for ImmiAccount</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Document selection */}
          {pdfDocs.length === 0 ? (
            <div className="text-center py-6 text-gray-400 dark:text-slate-500 text-sm">
              No PDF documents uploaded for this case yet.
            </div>
          ) : (
            <div>
              <div className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                Select PDFs to include
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {pdfDocs.map(doc => (
                  <label key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={selected.has(doc.id)}
                      onChange={() => toggleDoc(doc.id)}
                      className="w-4 h-4 text-edamame-500 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-700 dark:text-slate-300 truncate">{doc.fileName}</div>
                      <div className="text-xs text-gray-400 dark:text-slate-500">{formatBytes(doc.fileSize)} → {immiAccountName(doc)}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Target size */}
          <div>
            <div className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">
              Target size
            </div>
            <div className="flex gap-2">
              {TARGET_SIZES.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setTargetIdx(i)}
                  className={`flex-1 text-xs font-semibold px-2 py-1.5 rounded-lg transition-colors ${
                    targetIdx === i
                      ? 'bg-edamame text-white'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {t.label.split(' ')[0]}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{TARGET_SIZES[targetIdx].label}</p>
          </div>

          {/* Status */}
          {status === 'processing' && (
            <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-slate-300 bg-gray-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
              <Loader2 size={16} className="animate-spin text-edamame-500 flex-shrink-0" />
              {progress}
            </div>
          )}

          {status === 'done' && result && (
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-semibold text-sm">
                <CheckCircle size={16} />
                Bundle ready — {formatBytes(result.size)}
              </div>
              <div className="text-xs text-green-600 dark:text-green-500">{result.filename}</div>
              {result.size > TARGET_SIZES[targetIdx].bytes && (
                <div className="text-xs text-amber-600 dark:text-amber-400">
                  Bundle is over target after lossless compression. To reduce further, split large scanned PDFs into separate uploads, or reduce scan resolution (150 DPI is sufficient for ImmiAccount). ImmiAccount typically accepts up to 5.1 MB.
                </div>
              )}
            </div>
          )}

          {status === 'error' && error && (
            <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2.5">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 p-5 border-t border-gray-100 dark:border-slate-800">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            Cancel
          </button>
          {status === 'done' && result ? (
            <button
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-edamame hover:bg-edamame-600 text-white font-semibold rounded-xl transition-colors shadow-sm shadow-edamame/20 text-sm"
            >
              <Download size={16} />
              Download Bundle
            </button>
          ) : (
            <button
              onClick={handlePackage}
              disabled={selected.size === 0 || status === 'processing'}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-edamame hover:bg-edamame-600 text-white font-semibold rounded-xl transition-colors shadow-sm shadow-edamame/20 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'processing' ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
              {status === 'processing' ? 'Processing...' : 'Compress & Bundle'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

