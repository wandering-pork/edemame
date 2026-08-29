import React, { useState, useMemo, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { X, Layers, Loader2, AlertCircle, CheckCircle, Download, FileWarning, Package, FileText } from 'lucide-react';
import type { Document, Aspect820, Client } from '../types';
import { useRepositories } from '../contexts/RepositoryContext';
import { ASPECTS_820, ASPECT_ORDER_820 } from '../lib/aspects820';
import { formatBytes, triggerDownload } from '../lib/pdfBundle';
import {
  BUNDLE_TARGET_BYTES,
  buildSlotOutputs,
  buildIndexPdf,
  buildManifestCsv,
  buildBundleZip,
  createBlobUrl,
  type SlotBuildResult,
} from '../lib/bundleAssembly';

const TARGET_BYTES = BUNDLE_TARGET_BYTES;

interface BundleBuilder820Props {
  caseId: string;
  documents: Document[];
  applicant: Client;
  sponsor?: Client;
  onClose: () => void;
}

interface SlotResult {
  filename: string;
  url: string;
  size: number;
  standalone: boolean;
  flagged: boolean;
}

interface SlotState {
  status: 'idle' | 'processing' | 'done' | 'error';
  progress?: string;
  results?: SlotResult[];
  warnings?: string[];
  error?: string;
}

interface PackageState {
  status: 'idle' | 'processing' | 'done' | 'error';
  progress?: string;
  url?: string;
  filename?: string;
  size?: number;
  error?: string;
}

export const BundleBuilder820: React.FC<BundleBuilder820Props> = ({
  documents,
  applicant,
  onClose,
}) => {
  const repos = useRepositories();
  const [slotState, setSlotState] = useState<Record<Aspect820, SlotState>>(() => {
    const initial: Partial<Record<Aspect820, SlotState>> = {};
    for (const k of ASPECT_ORDER_820) initial[k] = { status: 'idle' };
    return initial as Record<Aspect820, SlotState>;
  });

  const [packageState, setPackageState] = useState<PackageState>({ status: 'idle' });
  const packageUrlRef = useRef<string | undefined>(undefined);

  const { grouped, untagged } = useMemo(() => {
    // Every uploaded format is bundlable now — PDFs and images merge into the
    // slot PDF, everything else rides along as a separate attachment.
    const grouped: Record<Aspect820, Document[]> = {} as any;
    for (const k of ASPECT_ORDER_820) grouped[k] = [];
    const untagged: Document[] = [];

    for (const d of documents) {
      if (d.aspectTag) grouped[d.aspectTag].push(d);
      else untagged.push(d);
    }
    return { grouped, untagged };
  }, [documents]);

  const totalTagged = ASPECT_ORDER_820.reduce((sum, k) => sum + grouped[k].length, 0);
  const populatedSlots = ASPECT_ORDER_820.filter(k => grouped[k].length > 0).length;
  const lastName = applicant.name.split(/\s+/).pop() || 'Applicant';
  const dateStr = format(new Date(), 'yyyyMMdd');

  const slotStateRef = useRef(slotState);
  slotStateRef.current = slotState;

  useEffect(() => {
    return () => {
      (Object.values(slotStateRef.current) as SlotState[]).forEach(s =>
        s.results?.forEach(r => URL.revokeObjectURL(r.url)),
      );
      if (packageUrlRef.current) URL.revokeObjectURL(packageUrlRef.current);
    };
  }, []);

  const tagAllUntaggedAsMisc = async () => {
    for (const d of untagged) {
      await repos.documents.update({ ...d, aspectTag: 'commitment' });
    }
    onClose();
  };

  const loadBlob = async (doc: Document) => repos.documents.getFileData(doc);

  /** Run one slot's assembly, publishing progress/results into slotState. */
  const runSlot = async (aspect: Aspect820): Promise<SlotBuildResult | null> => {
    const docs = grouped[aspect];
    if (docs.length === 0) return null;

    setSlotState(s => ({
      ...s,
      [aspect]: { status: 'processing', progress: `Preparing ${docs.length} file${docs.length === 1 ? '' : 's'}…` },
    }));

    // Drop any object URLs from a previous build of this slot.
    slotStateRef.current[aspect]?.results?.forEach(r => URL.revokeObjectURL(r.url));

    try {
      const result = await buildSlotOutputs(
        aspect,
        docs,
        loadBlob,
        { lastName, dateStr },
        progress => setSlotState(s => ({ ...s, [aspect]: { status: 'processing', progress } })),
      );

      const results: SlotResult[] = result.files.map(f => ({
        filename: f.filename,
        url: createBlobUrl(f.bytes, f.mimeType),
        size: f.size,
        standalone: f.standalone,
        flagged: f.flagged,
      }));

      setSlotState(s => ({ ...s, [aspect]: { status: 'done', results, warnings: result.warnings } }));
      return result;
    } catch (err) {
      setSlotState(s => ({
        ...s,
        [aspect]: { status: 'error', error: err instanceof Error ? err.message : 'Bundle failed' },
      }));
      return null;
    }
  };

  const buildSlot = (aspect: Aspect820) => runSlot(aspect);

  const buildAll = async () => {
    for (const aspect of ASPECT_ORDER_820) {
      if (grouped[aspect].length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await runSlot(aspect);
      }
    }
  };

  /**
   * One-click packaging: build every populated slot, generate the master index
   * PDF + upload manifest CSV, and zip the lot into a single download.
   */
  const generateSubmissionBundle = async () => {
    if (packageUrlRef.current) {
      URL.revokeObjectURL(packageUrlRef.current);
      packageUrlRef.current = undefined;
    }
    setPackageState({ status: 'processing', progress: 'Starting…' });

    try {
      const populated = ASPECT_ORDER_820.filter(a => grouped[a].length > 0);
      const results: SlotBuildResult[] = [];

      for (let i = 0; i < populated.length; i++) {
        const aspect = populated[i];
        setPackageState({
          status: 'processing',
          progress: `Building ${ASPECTS_820[aspect].label} (${i + 1} of ${populated.length})…`,
        });
        // eslint-disable-next-line no-await-in-loop
        const result = await runSlot(aspect);
        if (!result) throw new Error(`${ASPECTS_820[aspect].label} failed to build — fix it and retry.`);
        results.push(result);
      }

      if (results.length === 0) throw new Error('Nothing to package — tag some documents first.');

      setPackageState({ status: 'processing', progress: 'Generating submission index…' });
      const indexPdf = await buildIndexPdf(results, { applicantName: applicant.name, dateStr });

      setPackageState({ status: 'processing', progress: 'Generating upload manifest…' });
      const manifestCsv = buildManifestCsv(results, { applicantName: applicant.name, dateStr });

      setPackageState({ status: 'processing', progress: 'Zipping bundle…' });
      const { bytes, filename } = buildBundleZip(results, indexPdf, manifestCsv, { lastName, dateStr });
      const url = createBlobUrl(bytes, 'application/zip');
      packageUrlRef.current = url;

      setPackageState({ status: 'done', url, filename, size: bytes.length });
      triggerDownload(url, filename);
    } catch (err) {
      setPackageState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Could not generate the submission bundle',
      });
    }
  };

  const blocked = untagged.length > 0;
  const empty = totalTagged === 0 && untagged.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm animate-[fadeIn_.18s_ease-out]">
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#0F1113] shadow-2xl flex flex-col h-full border-l border-gray-200/60 dark:border-white/5 animate-[slideInRight_.28s_cubic-bezier(.32,.72,0,1)]"
      >
        {/* Header — eyebrow + title, no decorative box */}
        <div className="px-7 pt-6 pb-5 border-b border-gray-100 dark:border-white/5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-edamame-600 dark:text-edamame-400">
                <span className="inline-block w-1 h-1 rounded-full bg-edamame-500" />
                Subclass 820 · Submission Bundle
              </div>
              <h2 className="mt-1.5 text-[22px] leading-tight font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white">
                Per-slot ImmiAccount packages
              </h2>
              <p className="mt-1 text-[13px] text-gray-500 dark:text-slate-400">
                One PDF per aspect · photos folded in · auto-compressed · auto-split at 5 MB
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-1 p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            >
              <X size={18} strokeWidth={2.25} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 py-6 space-y-5">
          {empty && (
            <div className="text-center py-16 px-6 border border-dashed border-gray-200 dark:border-white/10 rounded-2xl">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gray-50 dark:bg-white/5 flex items-center justify-center text-gray-300 dark:text-slate-600">
                <Layers size={20} strokeWidth={1.5} />
              </div>
              <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">Nothing to bundle yet</p>
              <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-1">
                Upload PDFs, photos or Word documents from the Documents tab — filenames are auto-tagged
                where possible.
              </p>
            </div>
          )}

          {/* Untagged — refined left-rule strip */}
          {untagged.length > 0 && (
            <div className="relative rounded-xl bg-amber-50/70 dark:bg-amber-500/[0.06] border border-amber-200/60 dark:border-amber-500/20 overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
              <div className="pl-5 pr-4 py-4">
                <div className="flex items-start gap-2.5">
                  <FileWarning size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-amber-900 dark:text-amber-100">
                      {untagged.length} document{untagged.length === 1 ? '' : 's'} need a tag before bundling
                    </p>
                    <p className="text-xs text-amber-800/80 dark:text-amber-200/70 mt-0.5 leading-relaxed">
                      Tag each file with an aspect from the Documents tab, or sweep them all into Commitment for now.
                    </p>
                    <ul className="mt-2.5 space-y-0.5 font-mono text-[11px] text-amber-900/80 dark:text-amber-200/80">
                      {untagged.slice(0, 4).map(d => (
                        <li key={d.id} className="truncate">— {d.fileName}</li>
                      ))}
                      {untagged.length > 4 && (
                        <li className="text-amber-700/70 dark:text-amber-300/60 italic">+ {untagged.length - 4} more</li>
                      )}
                    </ul>
                    <button
                      type="button"
                      onClick={tagAllUntaggedAsMisc}
                      className="mt-3 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                    >
                      Sweep into Commitment
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Slot rows — binder-tab spine on the left */}
          {!empty && (
            <div className="space-y-2.5">
              {ASPECT_ORDER_820.map(aspect => {
                const meta = ASPECTS_820[aspect];
                const docs = grouped[aspect];
                const state = slotState[aspect];
                const totalSize = docs.reduce((sum, d) => sum + d.fileSize, 0);
                const overTarget = totalSize > TARGET_BYTES;
                const willSplit = overTarget && docs.length > 1;
                const isEmpty = docs.length === 0;
                const isProcessing = state.status === 'processing';
                const isDone = state.status === 'done';

                return (
                  <div
                    key={aspect}
                    className={`relative rounded-xl border overflow-hidden transition-all ${
                      isDone
                        ? 'border-edamame-200 dark:border-edamame-700/40 bg-white dark:bg-[#13161A]'
                        : isEmpty
                          ? 'border-gray-150 dark:border-white/[0.06] bg-gray-50/40 dark:bg-white/[0.015]'
                          : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#13161A] hover:border-gray-300 dark:hover:border-white/15'
                    }`}
                  >
                    {/* Binder-tab spine */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-[3px]"
                      style={{
                        backgroundColor: meta.color,
                        opacity: isEmpty ? 0.25 : 1,
                      }}
                    />

                    <div className="flex items-center gap-4 pl-5 pr-4 py-4">
                      <div className="flex-1 min-w-0">
                        {/* Eyebrow: ImmiAccount field name */}
                        <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500 truncate">
                          {meta.immiSlot}
                        </div>
                        {/* Aspect label */}
                        <div className="mt-1 flex items-baseline gap-2.5 flex-wrap">
                          <span
                            className="text-[15px] font-extrabold tracking-tight"
                            style={{ color: isEmpty ? undefined : meta.color }}
                          >
                            {meta.label}
                          </span>
                          <span className="font-mono text-[11px] text-gray-400 dark:text-slate-500">
                            {docs.length} doc{docs.length === 1 ? '' : 's'} · {formatBytes(totalSize)}
                          </span>
                          {willSplit && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                              auto-split
                            </span>
                          )}
                          {overTarget && !willSplit && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                              auto-compress
                            </span>
                          )}
                        </div>
                        {/* Hint when empty */}
                        {isEmpty && (
                          <p className="mt-1 text-[11.5px] text-gray-400 dark:text-slate-500 italic">
                            {meta.hint}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => buildSlot(aspect)}
                        disabled={isEmpty || isProcessing || blocked}
                        className={`flex-shrink-0 inline-flex items-center justify-center min-w-[78px] text-[11px] font-bold uppercase tracking-[0.08em] px-3.5 py-2 rounded-lg transition-all ${
                          isEmpty || blocked
                            ? 'bg-gray-100 dark:bg-white/[0.04] text-gray-300 dark:text-slate-600 cursor-not-allowed'
                            : isDone
                              ? 'bg-white dark:bg-white/5 border border-edamame-300 dark:border-edamame-700/50 text-edamame-700 dark:text-edamame-300 hover:bg-edamame-50 dark:hover:bg-edamame-500/10'
                              : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-edamame-600 dark:hover:bg-edamame-500 dark:hover:text-white shadow-sm'
                        }`}
                      >
                        {isProcessing ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : isDone ? 'Rebuild' : 'Build'}
                      </button>
                    </div>

                    {/* Per-slot state strip */}
                    {isProcessing && (
                      <div className="pl-5 pr-4 pb-3 -mt-1.5 text-[11.5px] text-gray-500 dark:text-slate-400 flex items-center gap-2 font-mono">
                        <Loader2 size={11} className="animate-spin text-edamame-500" />
                        {state.progress}
                      </div>
                    )}
                    {state.status === 'error' && state.error && (
                      <div className="pl-5 pr-4 pb-3 -mt-1.5 text-[11.5px] text-red-600 dark:text-red-400 flex items-start gap-2">
                        <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
                        {state.error}
                      </div>
                    )}
                    {isDone && state.results && (
                      <div className="border-t border-dashed border-gray-200 dark:border-white/10 px-5 py-2.5">
                        {state.results.map((r, idx) => (
                          <div
                            key={r.filename}
                            className={`group flex items-center gap-3 py-1.5 ${
                              idx > 0 ? 'border-t border-gray-100 dark:border-white/5' : ''
                            }`}
                          >
                            {r.flagged ? (
                              <AlertCircle size={12} className="text-amber-500 flex-shrink-0" strokeWidth={2.5} />
                            ) : (
                              <CheckCircle size={12} className="text-edamame-500 flex-shrink-0" strokeWidth={2.5} />
                            )}
                            <span className="font-mono text-[11.5px] text-gray-700 dark:text-slate-200 truncate flex-1">
                              {r.filename}
                            </span>
                            {r.standalone && (
                              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-slate-400 flex-shrink-0">
                                separate
                              </span>
                            )}
                            <span className="font-mono text-[11px] text-gray-400 dark:text-slate-500 flex-shrink-0 tabular-nums">
                              {formatBytes(r.size)}
                            </span>
                            <button
                              type="button"
                              onClick={() => triggerDownload(r.url, r.filename)}
                              title="Download"
                              className="p-1.5 rounded text-gray-400 hover:text-edamame-600 dark:hover:text-edamame-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                            >
                              <Download size={13} />
                            </button>
                          </div>
                        ))}
                        {state.warnings && state.warnings.length > 0 && (
                          <ul className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-white/5 space-y-1">
                            {state.warnings.map((w, i) => (
                              <li
                                key={i}
                                className="text-[11px] text-amber-700 dark:text-amber-300/90 flex items-start gap-1.5"
                              >
                                <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
                                {w}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!empty && (
          <div className="px-7 py-4 border-t border-gray-100 dark:border-white/5 bg-gray-50/60 dark:bg-black/20 backdrop-blur-sm space-y-3">
            {/* One-click package state strip */}
            {packageState.status === 'processing' && (
              <div className="flex items-center gap-2 text-[11.5px] font-mono text-gray-600 dark:text-slate-300">
                <Loader2 size={12} className="animate-spin text-edamame-500" />
                {packageState.progress}
              </div>
            )}
            {packageState.status === 'error' && packageState.error && (
              <div className="flex items-start gap-2 text-[11.5px] text-red-600 dark:text-red-400">
                <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                {packageState.error}
              </div>
            )}
            {packageState.status === 'done' && packageState.url && packageState.filename && (
              <div className="flex items-center gap-3 rounded-lg border border-edamame-200 dark:border-edamame-700/40 bg-white dark:bg-[#13161A] px-3 py-2">
                <FileText size={13} className="text-edamame-500 flex-shrink-0" />
                <span className="font-mono text-[11.5px] text-gray-700 dark:text-slate-200 truncate flex-1">
                  {packageState.filename}
                </span>
                <span className="font-mono text-[11px] text-gray-400 dark:text-slate-500 tabular-nums flex-shrink-0">
                  {formatBytes(packageState.size ?? 0)}
                </span>
                <button
                  type="button"
                  onClick={() => triggerDownload(packageState.url!, packageState.filename!)}
                  title="Download again"
                  className="p-1.5 rounded text-gray-400 hover:text-edamame-600 dark:hover:text-edamame-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                >
                  <Download size={13} />
                </button>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">
                  Ready to package
                </div>
                <div className="mt-0.5 font-mono text-[12px] text-gray-700 dark:text-slate-300 tabular-nums">
                  {totalTagged} doc{totalTagged === 1 ? '' : 's'} · {populatedSlots} slot{populatedSlots === 1 ? '' : 's'}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-[12px] font-semibold px-3 py-2 rounded-lg text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={buildAll}
                disabled={blocked || totalTagged === 0 || packageState.status === 'processing'}
                className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] px-3.5 py-2 rounded-lg border border-gray-300 dark:border-white/15 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-white/5 disabled:text-gray-300 dark:disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                title={blocked ? 'Resolve untagged documents first' : 'Build each populated slot separately, downloading one at a time'}
              >
                <Layers size={13} strokeWidth={2.25} />
                Build All
              </button>
              <button
                type="button"
                onClick={generateSubmissionBundle}
                disabled={blocked || totalTagged === 0 || packageState.status === 'processing'}
                className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] px-4 py-2 rounded-lg bg-edamame-500 text-white hover:bg-edamame-600 disabled:bg-gray-200 dark:disabled:bg-white/[0.04] disabled:text-gray-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed transition-colors shadow-sm shadow-edamame-500/25 disabled:shadow-none"
                title={
                  blocked
                    ? 'Resolve untagged documents first'
                    : 'Build every slot, generate the index + upload manifest, and download it all as one ZIP'
                }
              >
                {packageState.status === 'processing' ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Package size={13} strokeWidth={2.25} />
                )}
                Generate Submission Bundle
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideInRight { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
      `}</style>
    </div>
  );
};
