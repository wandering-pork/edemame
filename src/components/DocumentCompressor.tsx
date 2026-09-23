import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import {
  Package, X, ArrowRight, ArrowLeft, Loader2, CheckCircle, AlertCircle,
  FileWarning, Download, Save, FolderOpen, Monitor, Plus, XCircle, CircleCheck,
} from 'lucide-react';
import type { Client, Document } from '../types';
import { useRepositories } from '../contexts/RepositoryContext';
import {
  classifyKind, kindLabel, compressDocument, suggestOutputName, validateOutputNames,
  DOHA_MAX_BYTES, formatBytes, exceedsCaseFilesLimit, type CompressOutcome,
} from '../lib/documentCompressor';
import { ACCEPTED_DOCUMENT_EXTENSIONS, SUPPORTED_FORMATS_LABEL, isSupportedDocumentFile, CASE_FILES_MAX_BYTES } from '../lib/supportedFormats';

/**
 * Document Compressor (formerly "Auto-Packager", renamed and redesigned per
 * the "Document Compressor" rebuild brief). DoHA only requires each
 * individual ImmiAccount attachment to be under 5 MB — this tool no longer
 * bundles documents into a checklist-driven package, it just compresses
 * whichever files you pick, one at a time, and lets you save or download
 * each result. Three steps:
 *
 *   1. Select & Check — pick a source (files already in Case Files, or
 *      straight from the local PC), auto-select files over 5 MB in a
 *      supported format, flag already-compliant and unsupported files.
 *   2. Compress — each selected file is compressed on its own (never
 *      bundled with others). Under 5 MB auto-proceeds; 5–50 MB warns but
 *      can still proceed if the user opts in; over 50 MB is a hard fail and
 *      cannot proceed — this is what closes the "still-over-50MB file ends
 *      up in Case Files anyway" loophole at the root, rather than only
 *      catching it at save time.
 *   3. Save or Download — per file, save to Case Files (auto-suggested
 *      name, prompts on a duplicate name) and/or download to the computer.
 *      "Complete" exits at any point.
 *
 * Complements (does not replace) PdfPackager ("5MB Crusher", PDF-only quick
 * merge) and BundleBuilder820 (per-aspect 820 bundling) — this is the
 * general, multi-format, per-file compression path for anything else.
 */

interface DocumentCompressorProps {
  caseId: string;
  documents: Document[];
  applicant: Client;
  onClose: () => void;
  /** Called after a file is saved into the case's documents, so the caller can refresh its list. */
  onSaved?: () => void;
  /**
   * CF-2 handoff: files a Case Files upload rejected for exceeding the size
   * ceiling, handed straight to the local-PC source in memory (no re-browse
   * needed since they were never accepted into Case Files).
   */
  initialLocalFiles?: File[];
  /** Pre-selects one or more existing Case Files — the "Compress" quick action on an oversized row in Case Files. */
  initialCaseDocIds?: string[];
}

type Phase = 'source' | 'select' | 'compress' | 'output';
type Source = 'case' | 'local';
type SizeTier = 'success' | 'warning' | 'failed';

interface FileResult {
  docId: string;
  outcome: CompressOutcome;
  outputName: string;
  /** Cached `outcome.bytes.length`, used for the displayed post-compression size. */
  sizeBytes: number;
  /** A processing failure has no usable output, irrespective of its byte count. */
  failed: boolean;
}

interface RowOutputState {
  name: string;
  saving?: boolean;
  saved?: boolean;
  downloaded?: boolean;
  error?: string;
}

/** DoHA-compliant / needs-attention / can't-go-to-Case-Files tiers a compressed result lands in. */
function tierFor(sizeBytes: number, failed = false): SizeTier {
  if (failed) return 'failed';
  if (sizeBytes <= DOHA_MAX_BYTES) return 'success';
  if (sizeBytes <= CASE_FILES_MAX_BYTES) return 'warning';
  return 'failed';
}

/** Step 1: files eligible to be auto-selected — over the DoHA ceiling and in a format the compressor can process. */
function isAutoSelectEligible(doc: Document): boolean {
  return doc.fileSize > DOHA_MAX_BYTES && isSupportedDocumentFile({ name: doc.fileName, type: doc.fileType });
}

export const DocumentCompressor: React.FC<DocumentCompressorProps> = ({
  caseId, documents, applicant, onClose, onSaved, initialLocalFiles, initialCaseDocIds,
}) => {
  const repos = useRepositories();

  const hasInitialLocalFiles = !!initialLocalFiles && initialLocalFiles.length > 0;
  const hasInitialCaseDocIds = !!initialCaseDocIds && initialCaseDocIds.length > 0;
  const skipSourceScreen = hasInitialLocalFiles || hasInitialCaseDocIds;

  const [phase, setPhase] = useState<Phase>(skipSourceScreen ? 'select' : 'source');
  const [source, setSource] = useState<Source>(hasInitialLocalFiles ? 'local' : 'case');

  // ---- Local-PC source ----
  const [localFiles, setLocalFiles] = useState<{ id: string; file: File }[]>(
    () => (initialLocalFiles || []).map(file => ({ id: uuidv4(), file })),
  );
  const [localFileError, setLocalFileError] = useState<string | null>(null);
  const localFileMap = useMemo(() => new Map(localFiles.map(lf => [lf.id, lf.file])), [localFiles]);
  const localDocs = useMemo((): Document[] => localFiles.map(({ id, file }) => ({
    id,
    caseId,
    fileName: file.name,
    filePath: '',
    fileType: file.type,
    fileSize: file.size,
    uploadedAt: new Date().toISOString(),
  })), [localFiles, caseId]);

  const sourceDocs = source === 'local' ? localDocs : documents;
  const docsById = useMemo(() => new Map([...documents, ...localDocs].map(d => [d.id, d])), [documents, localDocs]);

  // ---- Step 1: Select & Check ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialCaseDocIds || []));
  // Tracks which candidate ids we've already evaluated for auto-select, so a
  // user manually unticking an auto-selected file doesn't get overridden on
  // the next render — newly-added local files still get evaluated once.
  const autoCheckedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const doc of sourceDocs) {
        if (autoCheckedRef.current.has(doc.id)) continue;
        autoCheckedRef.current.add(doc.id);
        if (isAutoSelectEligible(doc)) {
          next.add(doc.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [sourceDocs]);

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const changeSource = (next: Source) => {
    setSource(next);
    setSelectedIds(new Set());
    autoCheckedRef.current = new Set();
    setPhase('select');
  };

  const handleLocalFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted: { id: string; file: File }[] = [];
    const rejectedNames: string[] = [];
    for (const file of Array.from(files)) {
      if (isSupportedDocumentFile(file)) accepted.push({ id: uuidv4(), file });
      else rejectedNames.push(file.name);
    }
    setLocalFileError(
      rejectedNames.length > 0
        ? `Document Compressor can only process the following formats: ${SUPPORTED_FORMATS_LABEL}. Skipped: ${rejectedNames.join(', ')}.`
        : null,
    );
    if (accepted.length > 0) setLocalFiles(prev => [...prev, ...accepted]);
  };

  const removeLocalFile = (id: string) => {
    setLocalFiles(prev => prev.filter(lf => lf.id !== id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const anyEligibleFormat = sourceDocs.some(doc => isSupportedDocumentFile({ name: doc.fileName, type: doc.fileType }));
  const noEligibleDetected = sourceDocs.length > 0 && !anyEligibleFormat;

  // ---- Step 2: Compress ----
  const [results, setResults] = useState<Record<string, FileResult>>({});
  const [proceedIds, setProceedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState('');

  const lastName = (applicant.name || '').trim().split(/\s+/).pop() || 'Applicant';
  const dateStr = format(new Date(), 'yyyyMMdd');

  const runCompression = async () => {
    setPhase('compress');
    setProcessing(true);
    setResults({});
    setProceedIds(new Set());
    const ids: string[] = Array.from(selectedIds);
    const next: Record<string, FileResult> = {};
    const proceed = new Set<string>();
    const usedNames = new Set<string>();
    for (let i = 0; i < ids.length; i++) {
      const docId = ids[i];
      const doc = docsById.get(docId);
      if (!doc) continue;
      setProcessProgress(`Compressing ${i + 1} of ${ids.length} — ${doc.fileName}`);
      try {
        // eslint-disable-next-line no-await-in-loop
        const blob = localFileMap.has(docId) ? localFileMap.get(docId)! : await repos.documents.getFileData(doc);
        if (!blob) throw new Error('Could not load file data');
        // eslint-disable-next-line no-await-in-loop
        const outcome = await compressDocument(doc, blob);
        const outputName = suggestOutputName({ doc, ext: outcome.ext, dateStr, applicantLastName: lastName, existingNames: usedNames });
        usedNames.add(outputName.toLowerCase());
        const failed = outcome.bytes.length === 0;
        next[docId] = {
          docId,
          outcome: failed
            ? { ...outcome, flagged: true, note: 'Compression failed - no usable output was produced.' }
            : outcome,
          outputName,
          sizeBytes: outcome.bytes.length,
          failed,
        };
        if (!failed && tierFor(outcome.bytes.length) === 'success') proceed.add(docId);
      } catch (err) {
        // Treat a compression failure as a hard fail (never a false "success") —
        // forced past the Case Files ceiling without allocating a same-size
        // dummy buffer for a potentially huge original file.
        usedNames.add(doc.fileName.toLowerCase());
        next[docId] = {
          docId,
          outcome: {
            bytes: new Uint8Array(0),
            mimeType: doc.fileType,
            ext: doc.fileName.split('.').pop() || 'bin',
            flagged: true,
            note: err instanceof Error ? err.message : 'Compression failed.',
          },
          outputName: doc.fileName,
          sizeBytes: 0,
          failed: true,
        };
      }
    }
    setResults(next);
    setProceedIds(proceed);
    setProcessing(false);
    setProcessProgress('');
  };

  const toggleProceed = (id: string) => {
    const r = results[id];
    if (!r || tierFor(r.sizeBytes, r.failed) === 'failed') return;
    setProceedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const resultList = useMemo(
    () => Array.from(selectedIds).map(id => results[id]).filter((r): r is FileResult => !!r),
    [selectedIds, results],
  );
  const noneCanProceed = !processing && resultList.length > 0 && resultList.every(r => tierFor(r.sizeBytes, r.failed) === 'failed');

  // ---- Step 3: Save or Download ----
  const [rowState, setRowState] = useState<Record<string, RowOutputState>>({});
  const [sessionSavedNames, setSessionSavedNames] = useState<Set<string>>(new Set());

  const enterOutputPhase = () => {
    setRowState(() => {
      const seeded: Record<string, RowOutputState> = {};
      for (const id of proceedIds) {
        const r = results[id];
        if (r) seeded[id] = { name: r.outputName };
      }
      return seeded;
    });
    setPhase('output');
  };

  const batchErrors = useMemo(
    () => validateOutputNames(Array.from(proceedIds).map((id: string) => ({ docId: id, outputName: rowState[id]?.name ?? '' }))),
    [proceedIds, rowState],
  );

  const existingNamesLower = useMemo(
    () => new Set([...documents.map(d => d.fileName.toLowerCase()), ...Array.from(sessionSavedNames)]),
    [documents, sessionSavedNames],
  );

  const doSave = async (id: string) => {
    const r = results[id];
    const doc = docsById.get(id);
    if (!r || !doc) return;
    if (r.failed || r.outcome.bytes.length === 0) {
      setRowState(prev => ({ ...prev, [id]: { ...prev[id], error: 'Compression failed - no usable file is available to save.' } }));
      return;
    }
    const name = (rowState[id]?.name ?? r.outputName).trim();
    if (batchErrors[id]) {
      setRowState(prev => ({ ...prev, [id]: { ...prev[id], name, error: batchErrors[id] } }));
      return;
    }
    if (existingNamesLower.has(name.toLowerCase())) {
      setRowState(prev => ({
        ...prev,
        [id]: { ...prev[id], name, error: `A file named "${name}" already exists in Case Files — rename it to continue.` },
      }));
      return;
    }
    const blob = new Blob([r.outcome.bytes], { type: r.outcome.mimeType });
    if (exceedsCaseFilesLimit(blob.size, CASE_FILES_MAX_BYTES)) {
      // Defence in depth — Step 2 already excludes anything over the Case
      // Files ceiling from reaching here, but never let a save slip through.
      setRowState(prev => ({ ...prev, [id]: { ...prev[id], error: `Still over ${formatBytes(CASE_FILES_MAX_BYTES)} — can't be saved to Case Files.` } }));
      return;
    }
    setRowState(prev => ({ ...prev, [id]: { ...prev[id], name, saving: true, error: undefined } }));
    try {
      const outDoc: Document = {
        id: uuidv4(),
        caseId,
        fileName: name,
        filePath: `documents/${caseId}/${name}`,
        fileType: r.outcome.mimeType,
        fileSize: blob.size,
        uploadedAt: new Date().toISOString(),
        // A compressed copy is the same document, so it inherits the source
        // file's Document Type — otherwise the compressed version (the one a
        // firm actually lodges) would drop out of auto-link.
        documentTypeCode: doc.documentTypeCode,
        evidenceNote: `Document Compressor output from "${doc.fileName}"`,
      };
      await repos.documents.create(outDoc, blob);
      setSessionSavedNames(prev => new Set(prev).add(name.toLowerCase()));
      setRowState(prev => ({ ...prev, [id]: { ...prev[id], name, saving: false, saved: true } }));
      onSaved?.();
    } catch (err) {
      setRowState(prev => ({ ...prev, [id]: { ...prev[id], saving: false, error: err instanceof Error ? err.message : 'Save failed. Please try again.' } }));
    }
  };

  const doDownload = (id: string) => {
    const r = results[id];
    if (!r) return;
    if (r.failed || r.outcome.bytes.length === 0) {
      setRowState(prev => ({ ...prev, [id]: { ...prev[id], error: 'Compression failed - no usable file is available to download.' } }));
      return;
    }
    const name = (rowState[id]?.name ?? r.outputName).trim();
    if (!name) {
      setRowState(prev => ({ ...prev, [id]: { ...prev[id], error: 'File name cannot be empty.' } }));
      return;
    }
    const blob = new Blob([r.outcome.bytes], { type: r.outcome.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setRowState(prev => ({ ...prev, [id]: { ...prev[id], name, downloaded: true, error: undefined } }));
  };

  const goBack = () => {
    if (phase === 'select') { if (!skipSourceScreen) setPhase('source'); }
    else if (phase === 'compress') setPhase('select');
    else if (phase === 'output') setPhase('compress');
  };

  const phases: { key: Phase; label: string }[] = [
    { key: 'select', label: '1 · Select & Check' },
    { key: 'compress', label: '2 · Compress' },
    { key: 'output', label: '3 · Save or Download' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm animate-[fadeIn_.18s_ease-out]">
      <div className="w-full max-w-3xl bg-white dark:bg-[#0F1113] shadow-2xl flex flex-col h-full border-l border-ink/15 dark:border-plate-ink/20/60 dark:border-white/5">
        {/* Header */}
        <div className="px-7 pt-6 pb-4 border-b border-ink/10 dark:border-plate-ink/15 dark:border-white/5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-edamame-600 dark:text-edamame-400">
                <Package size={12} />
                Document Compressor
              </div>
              <h2 className="mt-1.5 text-[22px] leading-tight font-extrabold tracking-[-0.02em] text-ink dark:text-plate-ink">
                Compress documents for ImmiAccount
              </h2>
              <p className="mt-1 text-[13px] text-ink-soft dark:text-plate-ink-soft">
                Each file is compressed on its own to fit DoHA's 5 MB attachment limit — nothing leaves this machine.
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="-mt-1 -mr-1 p-2 rounded-lg text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink hover:bg-paper-2 dark:hover:bg-plate-card dark:hover:bg-white/5 transition-colors">
              <X size={18} strokeWidth={2.25} />
            </button>
          </div>

          {/* Stepper */}
          {phase !== 'source' && (
            <div className="mt-4 flex items-center gap-1.5">
              {phases.map((p, i) => {
                const isActive = phase === p.key;
                const isPast = phases.findIndex(x => x.key === phase) > i;
                return (
                  <div key={p.key} className={`text-[10.5px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                    isActive ? 'bg-edamame-500 text-white' : isPast ? 'bg-edamame-100 dark:bg-edamame-500/15 text-edamame-700 dark:text-edamame-400' : 'bg-paper-2 dark:bg-plate-card dark:bg-white/5 text-ink-faint dark:text-plate-ink-faint'
                  }`}>
                    {p.label}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 py-6 space-y-5">
          {phase === 'source' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-wider">Where are the files you want to compress?</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => changeSource('case')}
                  className="text-left p-4 rounded-xl border border-ink/15 dark:border-plate-ink/20 dark:border-white/10 hover:border-edamame-400 dark:hover:border-edamame-700/60 transition-colors"
                >
                  <FolderOpen size={18} className="text-edamame-600 dark:text-edamame-400 mb-1.5" />
                  <div className="text-[13px] font-bold text-ink dark:text-plate-ink-soft">Compress files in Case Files</div>
                  <div className="text-[11.5px] text-ink-soft dark:text-plate-ink-soft mt-0.5">
                    Files already uploaded to this case — oversized, supported-format files are pre-selected for you.
                  </div>
                </button>
                <button
                  onClick={() => changeSource('local')}
                  className="text-left p-4 rounded-xl border border-ink/15 dark:border-plate-ink/20 dark:border-white/10 hover:border-edamame-400 dark:hover:border-edamame-700/60 transition-colors"
                >
                  <Monitor size={18} className="text-edamame-600 dark:text-edamame-400 mb-1.5" />
                  <div className="text-[13px] font-bold text-ink dark:text-plate-ink-soft">Compress files from your local PC</div>
                  <div className="text-[11.5px] text-ink-soft dark:text-plate-ink-soft mt-0.5">
                    Pick files straight from your computer — including ones too large to have been uploaded to Case Files.
                  </div>
                </button>
              </div>
            </div>
          )}

          {phase === 'select' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-wider">
                  {source === 'local' ? 'Files from your PC' : 'Case documents'}
                </div>
                {source === 'local' && (
                  <label className="inline-flex items-center gap-1 text-[11px] font-bold text-edamame-600 dark:text-edamame-400 cursor-pointer hover:underline">
                    <Plus size={12} /> Add files
                    <input
                      type="file"
                      multiple
                      accept={ACCEPTED_DOCUMENT_EXTENSIONS.join(',')}
                      className="hidden"
                      onChange={(e) => { handleLocalFilesSelected(e.target.files); e.target.value = ''; }}
                    />
                  </label>
                )}
              </div>

              {localFileError && source === 'local' && (
                <div className="flex items-start gap-1.5 text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-2.5 py-2">
                  <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                  {localFileError}
                </div>
              )}

              {noEligibleDetected && (
                <div className="flex flex-col gap-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-3.5 py-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>No eligible file detected. Document Compressor only supports {SUPPORTED_FORMATS_LABEL}.</span>
                  </div>
                  <div>
                    <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[12px] font-bold transition-colors">
                      Exit tool
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-ink/10 dark:border-white/[0.06] bg-paper-2/60 dark:bg-plate-card/40 dark:bg-white/[0.015] p-2 min-h-[120px] space-y-1.5">
                {sourceDocs.length === 0 ? (
                  <div className="text-[11.5px] text-ink-faint dark:text-plate-ink-faint italic text-center py-6">
                    {source === 'local' ? 'Add files from your computer to get started.' : 'No documents uploaded for this case yet.'}
                  </div>
                ) : sourceDocs.map(doc => {
                  const kind = classifyKind(doc);
                  const eligible = isSupportedDocumentFile({ name: doc.fileName, type: doc.fileType });
                  const underLimit = doc.fileSize <= DOHA_MAX_BYTES;
                  const checked = selectedIds.has(doc.id);
                  return (
                    <div
                      key={doc.id}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[11.5px] bg-white dark:bg-[#13161A] border ${
                        !eligible ? 'border-red-200 dark:border-red-900/40' : underLimit ? 'border-emerald-200 dark:border-emerald-900/40' : 'border-ink/10 dark:border-white/[0.06]'
                      }`}
                    >
                      {eligible ? (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelected(doc.id)}
                          className="flex-shrink-0 w-3.5 h-3.5 accent-edamame-500"
                        />
                      ) : (
                        <XCircle size={14} className="flex-shrink-0 text-red-500" />
                      )}
                      <span className="truncate flex-1 text-ink-soft dark:text-plate-ink-soft font-semibold">{doc.fileName}</span>
                      <span className="flex-shrink-0 text-[9.5px] font-bold uppercase tracking-wider text-ink-faint dark:text-plate-ink-faint">{kindLabel(kind)}</span>
                      <span className="font-mono flex-shrink-0 text-ink-faint dark:text-plate-ink-faint">{formatBytes(doc.fileSize)}</span>
                      {!eligible ? (
                        <span className="flex-shrink-0 text-[10px] font-bold text-red-600 dark:text-red-400 max-w-[220px] text-right leading-tight">
                          Format is not eligible for compressing. Raise a feature request to us if needed.
                        </span>
                      ) : underLimit ? (
                        <span className="flex-shrink-0 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          Already meets requirement, no need to compress.
                        </span>
                      ) : (
                        <span className="flex-shrink-0 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                          Over 5 MB — will be compressed.
                        </span>
                      )}
                      {source === 'local' && (
                        <button onClick={() => removeLocalFile(doc.id)} title="Remove" className="flex-shrink-0 text-ink-soft/40 dark:text-plate-ink-soft/40 hover:text-red-500 dark:hover:text-red-400">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {phase === 'compress' && (
            <div className="space-y-4">
              {processing ? (
                <div className="flex items-center gap-2.5 text-sm text-ink-soft dark:text-plate-ink-soft bg-paper-2 dark:bg-plate-card/50 rounded-lg px-3 py-2.5">
                  <Loader2 size={16} className="animate-spin text-edamame-500 flex-shrink-0" />
                  {processProgress}
                </div>
              ) : noneCanProceed ? (
                <div className="flex flex-col gap-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-3.5 py-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>None of these files could be brought under {formatBytes(CASE_FILES_MAX_BYTES)} — none can proceed. Go back and choose different files, or exit.</span>
                  </div>
                  <div>
                    <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[12px] font-bold transition-colors">
                      Exit tool
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-1.5">
                {resultList.map(r => {
                  const doc = docsById.get(r.docId);
                  if (!doc) return null;
                  const tier = tierFor(r.sizeBytes, r.failed);
                  const before = doc.fileSize;
                  const after = r.sizeBytes;
                  const checked = proceedIds.has(r.docId);
                  return (
                    <div key={r.docId} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                      tier === 'failed' ? 'border-red-200 dark:border-red-900/40 bg-red-50/40 dark:bg-red-900/10' : 'border-ink/10 dark:border-plate-ink/15 dark:border-white/5'
                    }`}>
                      {tier === 'failed' ? (
                        <XCircle size={16} className="flex-shrink-0 text-red-500" />
                      ) : (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProceed(r.docId)}
                          className="flex-shrink-0 w-3.5 h-3.5 accent-edamame-500"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-semibold text-ink-soft dark:text-plate-ink-soft truncate">{doc.fileName}</div>
                        <div className="text-[11px] text-ink-faint dark:text-plate-ink-faint">
                          {r.failed
                            ? r.outcome.note
                            : tier === 'failed'
                              ? 'Still over 50 MB after compression — cannot be saved to Case Files. Download and split it, or re-scan at a lower resolution.'
                              : r.outcome.note}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right font-mono text-[11.5px]">
                        <div className="text-ink-faint dark:text-plate-ink-faint line-through">{formatBytes(before)}</div>
                        <div className={
                          tier === 'success' ? 'text-edamame-600 dark:text-edamame-400 font-bold'
                            : tier === 'warning' ? 'text-amber-600 dark:text-amber-400 font-bold'
                              : 'text-red-600 dark:text-red-400 font-bold'
                        }>
                          {r.failed ? 'Failed' : formatBytes(after)}
                        </div>
                      </div>
                      {tier === 'success' && <CheckCircle size={16} className="flex-shrink-0 text-edamame-500" />}
                      {tier === 'warning' && <FileWarning size={16} className="flex-shrink-0 text-amber-500" />}
                      {tier === 'failed' && <span className="flex-shrink-0 text-[9.5px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Failed</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {phase === 'output' && (
            <div className="space-y-2">
              <p className="text-[12.5px] text-ink-soft dark:text-plate-ink-soft">
                Auto-suggested from the applicant, original file name, and today's date — edit before saving. Save and download are independent, so you can do either or both per file.
              </p>
              {Array.from(proceedIds).map((id: string) => {
                const r = results[id];
                const doc = docsById.get(id);
                if (!r || !doc) return null;
                const state = rowState[id] || { name: r.outputName };
                const tier = tierFor(r.sizeBytes, r.failed);
                return (
                  <div key={id} className="space-y-1">
                    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${state.error ? 'border-red-300 dark:border-red-700/60 bg-red-50/50 dark:bg-red-900/10' : 'border-ink/10 dark:border-plate-ink/15 dark:border-white/5'}`}>
                      <input
                        type="text"
                        value={state.name}
                        onChange={(e) => setRowState(prev => ({ ...prev, [id]: { ...prev[id], name: e.target.value, error: undefined, saved: false } }))}
                        aria-invalid={!!state.error}
                        className={`flex-1 min-w-0 text-[12.5px] font-mono bg-transparent border-b outline-none py-1 text-ink dark:text-plate-ink-soft ${state.error ? 'border-red-400 dark:border-red-600' : 'border-ink/15 dark:border-plate-ink/20 focus:border-edamame-500'}`}
                      />
                      {tier === 'warning' && <FileWarning size={14} className="flex-shrink-0 text-amber-500" title="Still over 5 MB — DoHA may reject this attachment." />}
                      <span className="flex-shrink-0 font-mono text-[11px] text-ink-faint dark:text-plate-ink-faint">{formatBytes(r.sizeBytes)}</span>
                      <button
                        type="button"
                        onClick={() => doSave(id)}
                        disabled={state.saving || state.saved}
                        className="inline-flex items-center gap-1 flex-shrink-0 px-2.5 py-1 rounded-lg bg-edamame hover:bg-edamame-600 disabled:opacity-50 text-white text-[11px] font-bold transition-colors"
                      >
                        {state.saving ? <Loader2 size={11} className="animate-spin" /> : state.saved ? <CircleCheck size={11} /> : <Save size={11} />}
                        {state.saving ? 'Saving…' : state.saved ? 'Saved' : 'Save to Case Files'}
                      </button>
                      <button
                        type="button"
                        onClick={() => doDownload(id)}
                        className="inline-flex items-center gap-1 flex-shrink-0 px-2.5 py-1 rounded-lg border border-ink/15 dark:border-plate-ink/20 hover:border-edamame-400 text-ink-soft dark:text-plate-ink-soft text-[11px] font-bold transition-colors"
                      >
                        {state.downloaded ? <CircleCheck size={11} className="text-edamame-500" /> : <Download size={11} />}
                        {state.downloaded ? 'Downloaded' : 'Download'}
                      </button>
                    </div>
                    {state.error && <div className="pl-3 text-[11px] font-semibold text-red-600 dark:text-red-400">{state.error}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-ink/10 dark:border-plate-ink/15 dark:border-white/5 bg-paper-2/60 dark:bg-plate-card/40 dark:bg-black/20 flex items-center gap-2.5">
          {phase !== 'source' && (phase !== 'select' || !skipSourceScreen) && (
            <button
              onClick={goBack}
              disabled={processing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate-card dark:hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              <ArrowLeft size={14} /> Back
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-3.5 py-2 text-[12.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate-card dark:hover:bg-white/5 rounded-lg transition-colors">
            {phase === 'output' ? 'Complete' : 'Cancel'}
          </button>
          {phase === 'select' && (
            <button
              onClick={runCompression}
              disabled={selectedIds.size === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-lg text-[12.5px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Check &amp; Compress <ArrowRight size={14} />
            </button>
          )}
          {phase === 'compress' && (
            <button
              onClick={enterOutputPhase}
              disabled={processing || proceedIds.size === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-lg text-[12.5px] transition-colors disabled:opacity-50"
            >
              Continue to Save/Download <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </div>
  );
};

export default DocumentCompressor;
