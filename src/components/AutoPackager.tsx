import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import {
  Package, X, ArrowRight, ArrowLeft, Loader2, CheckCircle, AlertCircle,
  FileWarning, Download, Save, GripVertical, Sparkles, FolderOpen, Monitor, Plus,
} from 'lucide-react';
import type { Client, Document } from '../types';
import { useRepositories } from '../contexts/RepositoryContext';
import { generateChecklist, SUPPORTED_SUBCLASSES } from '../lib/checklistTemplates';
import {
  classifyKind, kindLabel, compressDocument, suggestOutputName, validateOutputNames,
  DOHA_MAX_BYTES, formatBytes, type CompressOutcome,
} from '../lib/autoPackager';
import { ACCEPTED_DOCUMENT_EXTENSIONS, SUPPORTED_FORMATS_LABEL, isSupportedDocumentFile } from '../lib/supportedFormats';

/**
 * Auto-Packager — the full flow from issue #2 (extended per the Case Files
 * upload-limit fix, "Auto-Packager Circular Dependency" defect):
 *   0. Source screen — compress files already in Case Files, or pick files
 *      straight from the local PC (so oversized files that Case Files never
 *      accepted can still reach the packager).
 *   1. Checklist generated from the visa subclass template.
 *   2. Drag & drop assignment of documents onto checklist slots — files over
 *      the DoHA 5MB ceiling in a supported format are auto-selected/sorted
 *      to the top when the source is Case Files.
 *   3. Size dashboard (before/after, summary line).
 *   4. Editable auto-suggested output filenames.
 *   5. Output location (save into the case's linked storage, or download).
 *   6. Compress & package, with a per-file progress + result log.
 *
 * Complements (does not replace) PdfPackager ("5MB Crusher", PDF-only quick
 * merge) and BundleBuilder820 (per-aspect 820 bundling) — this is the general,
 * multi-format, checklist-driven path for any supported subclass.
 */

interface AutoPackagerProps {
  caseId: string;
  documents: Document[];
  visaSubclass?: string;
  applicant: Client;
  onClose: () => void;
  /** Called after files are saved back into the case's documents, so the caller can refresh its list. */
  onSaved?: () => void;
  /**
   * CF-2 handoff: files a Case Files upload rejected for exceeding the size
   * ceiling, handed straight to the local-PC source in memory (no re-browse
   * needed since they were never accepted into Case Files).
   */
  initialLocalFiles?: File[];
}

type Phase = 'source' | 'assign' | 'dashboard' | 'naming' | 'output';
type OutputMode = 'save' | 'download';
type Source = 'case' | 'local';

interface Slot {
  id: string;
  label: string;
  description?: string;
  required: boolean;
}

interface FileResult {
  docId: string;
  outcome: CompressOutcome;
  outputName: string;
}

const GENERIC_SLOT: Slot = { id: '__all__', label: 'Supporting documents', required: true };

function buildSlots(caseId: string, visaSubclass?: string): Slot[] {
  if (visaSubclass && SUPPORTED_SUBCLASSES.includes(visaSubclass)) {
    const items = generateChecklist(caseId, visaSubclass);
    return items.map(item => ({
      id: item.id,
      label: item.label,
      description: item.description,
      required: !/if applicable|occupation-dependent|where relevant/i.test(item.description || ''),
    }));
  }
  return [GENERIC_SLOT];
}

/** AP-2: files eligible to be auto-selected for compression — over the DoHA ceiling and in a format the packager can process. */
function isAutoSelectEligible(doc: Document): boolean {
  return doc.fileSize > DOHA_MAX_BYTES && isSupportedDocumentFile({ name: doc.fileName, type: doc.fileType });
}

export const AutoPackager: React.FC<AutoPackagerProps> = ({ caseId, documents, visaSubclass, applicant, onClose, onSaved, initialLocalFiles }) => {
  const repos = useRepositories();
  const slots = useMemo(() => buildSlots(caseId, visaSubclass), [caseId, visaSubclass]);

  const hasInitialLocalFiles = !!initialLocalFiles && initialLocalFiles.length > 0;
  const [phase, setPhase] = useState<Phase>(hasInitialLocalFiles ? 'assign' : 'source');
  const [source, setSource] = useState<Source>(hasInitialLocalFiles ? 'local' : 'case');
  const [assignments, setAssignments] = useState<Record<string, string[]>>({}); // slotId -> docIds
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // ---- AP-3: local-PC source ----
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

  const [results, setResults] = useState<Record<string, FileResult>>({}); // docId -> result
  const [processing, setProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState('');

  const [outputMode, setOutputMode] = useState<OutputMode>('save');
  const [finalizing, setFinalizing] = useState(false);
  const [finalError, setFinalError] = useState<string | null>(null);
  const [finalized, setFinalized] = useState(false);
  /** docIds already written by a (possibly partial/failed) finalize() run — makes retries idempotent. */
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const sourceDocs = source === 'local' ? localDocs : documents;
  const docsById = useMemo(() => new Map([...documents, ...localDocs].map(d => [d.id, d])), [documents, localDocs]);
  const assignedIds = useMemo((): Set<string> => {
    const ids: string[] = [];
    for (const k of Object.keys(assignments)) ids.push(...assignments[k]);
    return new Set(ids);
  }, [assignments]);
  const unassigned = useMemo(() => {
    const pool = sourceDocs.filter(d => !assignedIds.has(d.id));
    // AP-2: eligible (oversized + supported format) files sort to the top.
    return [...pool].sort((a, b) => Number(isAutoSelectEligible(b)) - Number(isAutoSelectEligible(a)));
  }, [sourceDocs, assignedIds]);
  const resultList = useMemo((): FileResult[] => Object.keys(results).map((k: string) => results[k]), [results]);
  const totalAssigned = assignedIds.size;
  const nameErrors = useMemo(
    () => validateOutputNames(resultList.map(r => ({ docId: r.docId, outputName: r.outputName }))),
    [resultList],
  );
  const hasNameErrors = Object.keys(nameErrors).length > 0;

  const lastName = (applicant.name || '').trim().split(/\s+/).pop() || 'Applicant';
  const dateStr = format(new Date(), 'yyyyMMdd');

  // ---- AP-2: auto-select eligible Case Files files into the (single, generic) slot ----
  // Only when there's exactly one slot — with a real checklist template, which
  // slot an oversized file belongs to can't be guessed, so those cases fall
  // back to sort-to-top only (see `unassigned` above) and the agent drags it in.
  const autoAssignedRef = useRef(false);
  useEffect(() => {
    if (source !== 'case' || autoAssignedRef.current || slots.length !== 1) return;
    const eligible = documents.filter(isAutoSelectEligible);
    if (eligible.length === 0) return;
    autoAssignedRef.current = true;
    setAssignments(prev => {
      const slotId = slots[0].id;
      const existing = prev[slotId] || [];
      const toAdd = eligible.map(d => d.id).filter(id => !existing.includes(id));
      return toAdd.length === 0 ? prev : { ...prev, [slotId]: [...existing, ...toAdd] };
    });
  }, [source, documents, slots]);

  // ---- Local file picker (Phase 0, local-PC source) ----

  const handleLocalFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted: { id: string; file: File }[] = [];
    const rejectedNames: string[] = [];
    for (const file of Array.from(files)) {
      if (isSupportedDocumentFile(file)) accepted.push({ id: uuidv4(), file });
      else rejectedNames.push(file.name);
    }
    if (rejectedNames.length > 0) {
      setLocalFileError(`Auto-Packager can only process the following formats: ${SUPPORTED_FORMATS_LABEL}. Skipped: ${rejectedNames.join(', ')}.`);
    } else {
      setLocalFileError(null);
    }
    if (accepted.length > 0) setLocalFiles(prev => [...prev, ...accepted]);
  };

  const removeLocalFile = (id: string) => {
    setLocalFiles(prev => prev.filter(lf => lf.id !== id));
    unassignDoc(id);
  };

  // ---- Assignment (Phase 2) ----

  const assignDoc = (docId: string, slotId: string) => {
    setAssignments((prev: Record<string, string[]>) => {
      const next: Record<string, string[]> = {};
      for (const k of Object.keys(prev)) next[k] = prev[k].filter((id: string) => id !== docId);
      next[slotId] = [...(next[slotId] || []), docId];
      return next;
    });
  };

  const unassignDoc = (docId: string) => {
    setAssignments((prev: Record<string, string[]>) => {
      const next: Record<string, string[]> = {};
      for (const k of Object.keys(prev)) next[k] = prev[k].filter((id: string) => id !== docId);
      return next;
    });
  };

  const handleDrop = (slotId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const docId = e.dataTransfer.getData('text/plain') || draggingId;
    if (docId) assignDoc(docId, slotId);
    setDraggingId(null);
  };

  const handlePoolDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const docId = e.dataTransfer.getData('text/plain') || draggingId;
    if (docId) unassignDoc(docId);
    setDraggingId(null);
  };

  // ---- Compression (Phase 3) ----

  const runCompression = async () => {
    setProcessing(true);
    setPhase('dashboard');
    const assignedDocIds: string[] = Array.from(assignedIds);
    const next: Record<string, FileResult> = {};
    const usedNames = new Set<string>();
    for (let i = 0; i < assignedDocIds.length; i++) {
      const docId: string = assignedDocIds[i];
      const doc = docsById.get(docId);
      if (!doc) continue;
      setProcessProgress(`Analysing ${i + 1} of ${assignedDocIds.length} — ${doc.fileName}`);
      try {
        // eslint-disable-next-line no-await-in-loop
        const blob = localFileMap.has(docId) ? localFileMap.get(docId)! : await repos.documents.getFileData(doc);
        if (!blob) throw new Error('Could not load file data');
        // eslint-disable-next-line no-await-in-loop
        const outcome = await compressDocument(doc, blob);
        const slotId = Object.keys(assignments).find((k: string) => assignments[k].includes(docId));
        const slotLabel = slotId ? slots.find(s => s.id === slotId)?.label : undefined;
        const outputName = suggestOutputName({
          doc, ext: outcome.ext, dateStr,
          slotLabel: slotLabel && slotLabel !== GENERIC_SLOT.label ? slotLabel : undefined,
          applicantLastName: lastName,
          existingNames: usedNames,
        });
        usedNames.add(outputName.toLowerCase());
        next[docId] = { docId, outcome, outputName };
      } catch (err) {
        let fallbackName = doc.fileName;
        if (usedNames.has(fallbackName.toLowerCase())) {
          const dot = fallbackName.lastIndexOf('.');
          const stem = dot > -1 ? fallbackName.slice(0, dot) : fallbackName;
          const suffix = dot > -1 ? fallbackName.slice(dot) : '';
          let n = 2;
          while (usedNames.has(`${stem}_${n}${suffix}`.toLowerCase())) n += 1;
          fallbackName = `${stem}_${n}${suffix}`;
        }
        usedNames.add(fallbackName.toLowerCase());
        next[docId] = {
          docId,
          outcome: {
            bytes: new Uint8Array(),
            mimeType: doc.fileType,
            ext: doc.fileName.split('.').pop() || 'bin',
            flagged: true,
            note: err instanceof Error ? err.message : 'Compression failed',
          },
          outputName: fallbackName,
        };
      }
    }
    setResults(next);
    setProcessing(false);
    setProcessProgress('');
  };

  const summary = useMemo(() => {
    const items = resultList;
    if (items.length === 0) return null;
    let before = 0;
    let after = 0;
    let needingCompression = 0;
    for (const r of items) {
      const doc = docsById.get(r.docId);
      const originalSize = doc?.fileSize ?? 0;
      before += originalSize;
      after += r.outcome.bytes.length;
      // Count files that actually needed compression — i.e. were originally
      // over the DoHA 5 MB ceiling — not merely files that lost a few bytes
      // of metadata during lossless recompression.
      if (originalSize > DOHA_MAX_BYTES) needingCompression++;
    }
    return { count: items.length, needingCompression, before, after };
  }, [results, docsById]);

  const flaggedCount = resultList.filter(r => r.outcome.flagged).length;

  // ---- Naming (Phase 4) ----

  const renameResult = (docId: string, name: string) => {
    setResults(prev => ({ ...prev, [docId]: { ...prev[docId], outputName: name } }));
  };

  // ---- Output (Phase 5 & 6) ----

  const finalize = async () => {
    // Guard against re-running the naming step's validation being bypassed
    // (e.g. stale state) — never write a batch with empty/duplicate names.
    if (hasNameErrors) {
      setFinalError('Fix the file name issues on the Naming step before packaging.');
      return;
    }
    setFinalizing(true);
    setFinalError(null);
    try {
      const items = resultList;
      for (const item of items) {
        // Idempotency: skip anything a previous (partially-failed) run already
        // wrote, so retrying after an error doesn't duplicate saved files.
        if (completedIds.has(item.docId)) continue;
        const doc = docsById.get(item.docId);
        if (!doc) continue;
        const blob = new Blob([item.outcome.bytes], { type: item.outcome.mimeType });
        if (outputMode === 'save') {
          const outDoc: Document = {
            id: uuidv4(),
            caseId,
            fileName: item.outputName,
            filePath: `documents/${caseId}/${item.outputName}`,
            fileType: item.outcome.mimeType,
            fileSize: blob.size,
            uploadedAt: new Date().toISOString(),
            evidenceNote: `Auto-Packager output from "${doc.fileName}"`,
          };
          // eslint-disable-next-line no-await-in-loop
          await repos.documents.create(outDoc, blob);
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = item.outputName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
        // eslint-disable-next-line no-loop-func
        setCompletedIds(prev => new Set(prev).add(item.docId));
      }
      setFinalized(true);
      if (outputMode === 'save') onSaved?.();
    } catch (err) {
      setFinalError(err instanceof Error ? err.message : 'Packaging failed. Please try again.');
    } finally {
      setFinalizing(false);
    }
  };

  useEffect(() => {
    // Reset naming/output state if the user goes back and re-assigns.
    if (phase === 'assign') {
      setResults({});
      setFinalized(false);
      setFinalError(null);
      setCompletedIds(new Set());
    }
  }, [phase]);

  const phases: { key: Phase; label: string }[] = [
    { key: 'assign', label: '1 · Assign' },
    { key: 'dashboard', label: '2 · Size Dashboard' },
    { key: 'naming', label: '3 · Naming' },
    { key: 'output', label: '4 · Output' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm animate-[fadeIn_.18s_ease-out]">
      <div className="w-full max-w-3xl bg-white dark:bg-[#0F1113] shadow-2xl flex flex-col h-full border-l border-gray-200/60 dark:border-white/5">
        {/* Header */}
        <div className="px-7 pt-6 pb-4 border-b border-gray-100 dark:border-white/5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-edamame-600 dark:text-edamame-400">
                <Package size={12} />
                Auto-Packager
              </div>
              <h2 className="mt-1.5 text-[22px] leading-tight font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white">
                Compress, name & package for ImmiAccount
              </h2>
              <p className="mt-1 text-[13px] text-gray-500 dark:text-slate-400">
                Drag documents onto checklist slots, then compress and rename in one pass — nothing leaves this machine.
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="-mt-1 -mr-1 p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
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
                  isActive ? 'bg-edamame-500 text-white' : isPast ? 'bg-edamame-100 dark:bg-edamame-500/15 text-edamame-700 dark:text-edamame-400' : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-slate-500'
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
              <div className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Where are the files you want to compress?</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setSource('case'); setPhase('assign'); }}
                  className="text-left p-4 rounded-xl border border-gray-200 dark:border-white/10 hover:border-edamame-400 dark:hover:border-edamame-700/60 transition-colors"
                >
                  <FolderOpen size={18} className="text-edamame-600 dark:text-edamame-400 mb-1.5" />
                  <div className="text-[13px] font-bold text-gray-800 dark:text-slate-200">Compress files in Case Files</div>
                  <div className="text-[11.5px] text-gray-500 dark:text-slate-400 mt-0.5">
                    Files already uploaded to this case — oversized, supported-format files are pre-selected for you.
                  </div>
                </button>
                <button
                  onClick={() => { setSource('local'); setPhase('assign'); }}
                  className="text-left p-4 rounded-xl border border-gray-200 dark:border-white/10 hover:border-edamame-400 dark:hover:border-edamame-700/60 transition-colors"
                >
                  <Monitor size={18} className="text-edamame-600 dark:text-edamame-400 mb-1.5" />
                  <div className="text-[13px] font-bold text-gray-800 dark:text-slate-200">Compress files from your local PC</div>
                  <div className="text-[11.5px] text-gray-500 dark:text-slate-400 mt-0.5">
                    Pick files straight from your computer — including ones too large to have been uploaded to Case Files.
                  </div>
                </button>
              </div>
            </div>
          )}

          {phase === 'assign' && (
            <div className="grid grid-cols-2 gap-5">
              {/* Slots */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Checklist slots</div>
                {slots.map(slot => {
                  const ids = assignments[slot.id] || [];
                  const totalSize = ids.reduce((s, id) => s + (docsById.get(id)?.fileSize ?? 0), 0);
                  return (
                    <div
                      key={slot.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop(slot.id)}
                      className="rounded-xl border border-dashed border-gray-250 dark:border-white/10 hover:border-edamame-400 dark:hover:border-edamame-700/60 transition-colors p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[13px] font-bold text-gray-800 dark:text-slate-200 truncate">{slot.label}</div>
                          {slot.description && <div className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{slot.description}</div>}
                        </div>
                        <span className={`flex-shrink-0 text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${slot.required ? 'bg-edamame-100 dark:bg-edamame-500/15 text-edamame-700 dark:text-edamame-400' : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-slate-500'}`}>
                          {slot.required ? 'Required' : 'Optional'}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {ids.length === 0 ? (
                          <div className="text-[11px] text-gray-300 dark:text-slate-600 italic py-2 text-center">Drop a file here</div>
                        ) : ids.map(id => {
                          const doc = docsById.get(id);
                          if (!doc) return null;
                          const oversized = doc.fileSize > DOHA_MAX_BYTES;
                          return (
                            <div
                              key={id}
                              draggable
                              onDragStart={(e) => { e.dataTransfer.setData('text/plain', id); setDraggingId(id); }}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11.5px] cursor-grab ${oversized ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300' : 'bg-edamame-50 dark:bg-edamame-500/10 text-edamame-800 dark:text-edamame-300'}`}
                            >
                              <GripVertical size={11} className="flex-shrink-0 opacity-50" />
                              <span className="truncate flex-1">{doc.fileName}</span>
                              <span className="font-mono flex-shrink-0">{formatBytes(doc.fileSize)}</span>
                              {oversized && <FileWarning size={12} className="flex-shrink-0" />}
                              <button onClick={() => unassignDoc(id)} className="flex-shrink-0 opacity-60 hover:opacity-100">
                                <X size={11} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      {ids.length > 0 && (
                        <div className="mt-1.5 text-[10.5px] font-mono text-gray-400 dark:text-slate-500">
                          {ids.length} file{ids.length === 1 ? '' : 's'} · {formatBytes(totalSize)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Unassigned pool */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handlePoolDrop}
                className="space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
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
                <div className="rounded-xl border border-gray-150 dark:border-white/[0.06] bg-gray-50/40 dark:bg-white/[0.015] p-2 min-h-[120px] space-y-1">
                  {unassigned.length === 0 ? (
                    <div className="text-[11.5px] text-gray-400 dark:text-slate-500 italic text-center py-6">
                      {sourceDocs.length === 0
                        ? (source === 'local' ? 'Add files from your computer to get started.' : 'No documents uploaded for this case yet.')
                        : 'All documents assigned.'}
                    </div>
                  ) : unassigned.map(doc => {
                    const kind = classifyKind(doc);
                    const oversized = doc.fileSize > DOHA_MAX_BYTES;
                    const eligible = isAutoSelectEligible(doc);
                    return (
                      <div
                        key={doc.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', doc.id); setDraggingId(doc.id); }}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11.5px] bg-white dark:bg-[#13161A] border cursor-grab ${oversized ? 'border-amber-300 dark:border-amber-700/50' : 'border-gray-150 dark:border-white/[0.06]'}`}
                      >
                        <GripVertical size={12} className="flex-shrink-0 text-gray-300 dark:text-slate-600" />
                        <span className="truncate flex-1 text-gray-700 dark:text-slate-300">{doc.fileName}</span>
                        {eligible && (
                          <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-edamame-100 dark:bg-edamame-500/15 text-edamame-700 dark:text-edamame-400">
                            Ready to compress
                          </span>
                        )}
                        <span className="flex-shrink-0 text-[9.5px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">{kindLabel(kind)}</span>
                        <span className={`font-mono flex-shrink-0 ${oversized ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-gray-400 dark:text-slate-500'}`}>
                          {formatBytes(doc.fileSize)}
                        </span>
                        {source === 'local' && (
                          <button onClick={() => removeLocalFile(doc.id)} title="Remove" className="flex-shrink-0 text-gray-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400">
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-slate-500">Drag a file onto a slot on the left. Drop it back here to unassign.</p>
              </div>
            </div>
          )}

          {phase === 'dashboard' && (
            <div className="space-y-4">
              {processing ? (
                <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-slate-300 bg-gray-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                  <Loader2 size={16} className="animate-spin text-edamame-500 flex-shrink-0" />
                  {processProgress}
                </div>
              ) : summary && (
                <div className="bg-edamame-50 dark:bg-edamame-500/10 rounded-xl p-4">
                  <div className="text-[13.5px] font-bold text-edamame-800 dark:text-edamame-300">
                    {summary.needingCompression} of {summary.count} file{summary.count === 1 ? '' : 's'} need{summary.needingCompression === 1 ? 's' : ''} compression.
                  </div>
                  <div className="text-[12.5px] text-edamame-700 dark:text-edamame-400 mt-0.5">
                    Estimated total before: <strong>{formatBytes(summary.before)}</strong> → after: <strong>{formatBytes(summary.after)}</strong>
                  </div>
                  {flaggedCount > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-amber-700 dark:text-amber-400">
                      <FileWarning size={13} />
                      {flaggedCount} file{flaggedCount === 1 ? '' : 's'} still over 5 MB after compression — see below.
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                {resultList.map(r => {
                  const doc = docsById.get(r.docId);
                  if (!doc) return null;
                  const before = doc.fileSize;
                  const after = r.outcome.bytes.length;
                  const saved = before - after;
                  return (
                    <div key={r.docId} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 dark:border-white/5">
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-semibold text-gray-700 dark:text-slate-300 truncate">{doc.fileName}</div>
                        <div className="text-[11px] text-gray-400 dark:text-slate-500">{r.outcome.note}</div>
                      </div>
                      <div className="flex-shrink-0 text-right font-mono text-[11.5px]">
                        <div className={saved > 0 ? 'text-gray-400 dark:text-slate-500 line-through' : 'text-gray-400 dark:text-slate-500'}>{formatBytes(before)}</div>
                        <div className={r.outcome.flagged ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-edamame-600 dark:text-edamame-400 font-bold'}>{formatBytes(after)}</div>
                      </div>
                      {r.outcome.flagged ? <FileWarning size={16} className="flex-shrink-0 text-amber-500" /> : <CheckCircle size={16} className="flex-shrink-0 text-edamame-500" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {phase === 'naming' && (
            <div className="space-y-2">
              <p className="text-[12.5px] text-gray-500 dark:text-slate-400">
                Auto-suggested from applicant name, document type, and today's date — edit any name before packaging.
              </p>
              {hasNameErrors && (
                <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2.5">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  Fix the highlighted file name{Object.keys(nameErrors).length === 1 ? '' : 's'} below before continuing — names must be non-empty and unique.
                </div>
              )}
              {resultList.map(r => {
                const error = nameErrors[r.docId];
                return (
                  <div key={r.docId} className="space-y-1">
                    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${error ? 'border-red-300 dark:border-red-700/60 bg-red-50/50 dark:bg-red-900/10' : 'border-gray-100 dark:border-white/5'}`}>
                      <Sparkles size={14} className="flex-shrink-0 text-edamame-400" />
                      <input
                        type="text"
                        value={r.outputName}
                        onChange={(e) => renameResult(r.docId, e.target.value)}
                        aria-invalid={!!error}
                        className={`flex-1 min-w-0 text-[12.5px] font-mono bg-transparent border-b outline-none py-1 text-gray-800 dark:text-slate-200 ${error ? 'border-red-400 dark:border-red-600' : 'border-gray-200 dark:border-slate-700 focus:border-edamame-500'}`}
                      />
                      <span className="flex-shrink-0 font-mono text-[11px] text-gray-400 dark:text-slate-500">{formatBytes(r.outcome.bytes.length)}</span>
                    </div>
                    {error && <div className="pl-3 text-[11px] font-semibold text-red-600 dark:text-red-400">{error}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {phase === 'output' && (
            <div className="space-y-4">
              <div className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Where should packaged files go?</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setOutputMode('save')}
                  className={`text-left p-4 rounded-xl border transition-colors ${outputMode === 'save' ? 'border-edamame-500 bg-edamame-50 dark:bg-edamame-500/10' : 'border-gray-200 dark:border-white/10 hover:border-edamame-300'}`}
                >
                  <Save size={16} className="text-edamame-600 dark:text-edamame-400 mb-1.5" />
                  <div className="text-[13px] font-bold text-gray-800 dark:text-slate-200">Add to Case Files</div>
                  <div className="text-[11.5px] text-gray-500 dark:text-slate-400 mt-0.5">
                    Writes to the client's linked folder (local mode) or cloud storage (cloud mode) via the case's Documents tab — nothing leaves the machine unless cloud sync is enabled.
                  </div>
                </button>
                <button
                  onClick={() => setOutputMode('download')}
                  className={`text-left p-4 rounded-xl border transition-colors ${outputMode === 'download' ? 'border-edamame-500 bg-edamame-50 dark:bg-edamame-500/10' : 'border-gray-200 dark:border-white/10 hover:border-edamame-300'}`}
                >
                  <Download size={16} className="text-edamame-600 dark:text-edamame-400 mb-1.5" />
                  <div className="text-[13px] font-bold text-gray-800 dark:text-slate-200">Download to my computer</div>
                  <div className="text-[11.5px] text-gray-500 dark:text-slate-400 mt-0.5">
                    Triggers a browser download per file — pick a different folder in your browser's save dialog if needed.
                  </div>
                </button>
              </div>

              {finalError && (
                <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2.5">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  {finalError}
                </div>
              )}

              {finalized && (
                <div className="flex items-center gap-2 text-sm text-edamame-700 dark:text-edamame-400 bg-edamame-50 dark:bg-edamame-500/10 rounded-lg px-3 py-2.5">
                  <CheckCircle size={16} className="flex-shrink-0" />
                  {outputMode === 'save' ? 'All files saved to this case’s Documents tab.' : 'All files downloaded.'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-gray-100 dark:border-white/5 bg-gray-50/60 dark:bg-black/20 flex items-center gap-2.5">
          {phase !== 'assign' && (
            <button
              onClick={() => setPhase(phases[phases.findIndex(p => p.key === phase) - 1].key)}
              disabled={processing || finalizing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              <ArrowLeft size={14} /> Back
            </button>
          )}
          {phase === 'assign' && !hasInitialLocalFiles && (
            <button
              onClick={() => setPhase('source')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            >
              <ArrowLeft size={14} /> Change source
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-3.5 py-2 text-[12.5px] font-semibold text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors">
            Cancel
          </button>
          {phase === 'assign' && (
            <button
              onClick={runCompression}
              disabled={totalAssigned === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-lg text-[12.5px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Analyse & Compress <ArrowRight size={14} />
            </button>
          )}
          {phase === 'dashboard' && (
            <button
              onClick={() => setPhase('naming')}
              disabled={processing || Object.keys(results).length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-lg text-[12.5px] transition-colors disabled:opacity-50"
            >
              Continue to Naming <ArrowRight size={14} />
            </button>
          )}
          {phase === 'naming' && (
            <button
              onClick={() => setPhase('output')}
              disabled={hasNameErrors}
              title={hasNameErrors ? 'Fix file name issues before continuing' : undefined}
              className="inline-flex items-center gap-2 px-4 py-2 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-lg text-[12.5px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue to Output <ArrowRight size={14} />
            </button>
          )}
          {phase === 'output' && (
            <button
              onClick={finalize}
              disabled={finalizing || finalized || hasNameErrors}
              title={hasNameErrors ? 'Go back and fix file name issues before packaging' : undefined}
              className="inline-flex items-center gap-2 px-4 py-2 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-lg text-[12.5px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {finalizing ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
              {finalizing ? 'Packaging…' : finalized ? 'Done' : 'Compress & Package'}
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

export default AutoPackager;
