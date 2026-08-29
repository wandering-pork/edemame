import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  X,
  Calculator,
  AlertTriangle,
  Info,
  Paperclip,
  Plus,
  FileText,
  Download,
  Copy,
  FolderPlus,
  ChevronLeft,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import type { CasePointsClaim, Document, PointsClaimEntry } from '../../types';
import { useRepositories } from '../../contexts/RepositoryContext';
import {
  POINTS_PASS_MARK,
  POINTS_SUBCLASSES,
  POINTS_TEST_AUTHORED_ON,
  POINTS_TEST_DISCLAIMER,
  calculatePoints,
  criteriaForSubclass,
  emptyPointsClaim,
  isPointsSubclass,
  suggestEvidenceForCriterion,
  type PointsSubclass,
} from '../../lib/pointsTest';
import {
  buildPointsBreakdownPdf,
  buildPointsCoverLetter,
  pointsBreakdownFileName,
  pointsCoverLetterFileName,
  type PointsExportMeta,
} from '../../lib/pointsExport';
import { createDownloadUrl, triggerDownload } from '../../lib/pdfBundle';

/** Document Type code the exported summaries are filed under (lib/documentTypes.ts). */
const POINTS_CLAIM_DOC_TYPE_CODE = 'PTSCLM';

interface PointsCalculatorProps {
  caseId: string;
  caseTitle: string;
  clientName: string;
  /** Visa applicant, when the case records one separately from the client. */
  applicantName?: string;
  /** The case's visa subclass — pre-selects the points table when it is points-tested. */
  visaSubclass?: string;
  /** Case Files, for linking evidence to a claim. */
  documents: Document[];
  onClose: () => void;
  /** Called after a summary is filed into Case Files so the caller can refresh. */
  onSaved?: () => void;
}

type Stage = 'criteria' | 'letter';

/**
 * Points Calculator + Evidence Mapper — built-in Workspace Tool (issue #36).
 *
 * The screen exists to make one distinction impossible to miss: what the
 * client *claims*, what the case file can *prove*, and what is therefore still
 * *outstanding*. A criterion counts as proven when at least one Case File is
 * linked to it — see `lib/pointsTest.ts` for why that, rather than a separate
 * sign-off flag, is the rule.
 *
 * Nothing here is a compliance guarantee: the points table is authored
 * reference data (not a live read of the Department's tables) and both exports
 * are drafts for a human to review. The copy must keep saying so.
 */
export const PointsCalculator: React.FC<PointsCalculatorProps> = ({
  caseId,
  caseTitle,
  clientName,
  applicantName,
  visaSubclass,
  documents,
  onClose,
  onSaved,
}) => {
  const repos = useRepositories();
  const [stage, setStage] = useState<Stage>('criteria');
  const [claim, setClaim] = useState<CasePointsClaim | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [linkPickerFor, setLinkPickerFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'save' | null>(null);
  const [savedToCaseFiles, setSavedToCaseFiles] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Load / persist -----------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    repos.pointsClaims
      .getByCaseId(caseId)
      .then(existing => {
        if (cancelled) return;
        const fallback: PointsSubclass = isPointsSubclass(visaSubclass) ? visaSubclass : '189';
        setClaim(existing ?? emptyPointsClaim(uuidv4(), caseId, fallback));
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        const fallback: PointsSubclass = isPointsSubclass(visaSubclass) ? visaSubclass : '189';
        setClaim(emptyPointsClaim(uuidv4(), caseId, fallback));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, visaSubclass, repos.pointsClaims]);

  const persist = useCallback(
    (next: CasePointsClaim) => {
      setClaim(next);
      repos.pointsClaims.setForCase(caseId, next).catch(() => setError('Could not save the points claim.'));
    },
    [caseId, repos.pointsClaims],
  );

  const updateEntry = useCallback(
    (criterionId: string, mutate: (entry: PointsClaimEntry) => PointsClaimEntry) => {
      setClaim(current => {
        if (!current) return current;
        const existing = current.entries.find(e => e.criterionId === criterionId) ?? { criterionId, documentIds: [] };
        const updated = mutate(existing);
        const next: CasePointsClaim = {
          ...current,
          entries: current.entries.some(e => e.criterionId === criterionId)
            ? current.entries.map(e => (e.criterionId === criterionId ? updated : e))
            : [...current.entries, updated],
          updatedAt: new Date().toISOString(),
        };
        repos.pointsClaims.setForCase(caseId, next).catch(() => setError('Could not save the points claim.'));
        return next;
      });
    },
    [caseId, repos.pointsClaims],
  );

  // ---- Derived ------------------------------------------------------------

  const subclass: PointsSubclass = isPointsSubclass(claim?.subclass) ? claim!.subclass as PointsSubclass : '189';
  const summary = useMemo(
    () => calculatePoints(subclass, claim?.entries ?? [], documents),
    [subclass, claim?.entries, documents],
  );

  const meta: PointsExportMeta = useMemo(
    () => ({ caseTitle, clientName, applicantName }),
    [caseTitle, clientName, applicantName],
  );

  const coverLetter = useMemo(() => buildPointsCoverLetter(summary, meta), [summary, meta]);

  const criteria = useMemo(() => criteriaForSubclass(subclass), [subclass]);

  // ---- Handlers -----------------------------------------------------------

  const changeSubclass = (next: PointsSubclass) => {
    if (!claim) return;
    // Entries for criteria that don't apply to the new subclass are kept, not
    // deleted: switching 190 -> 491 to compare outcomes is a normal thing to
    // do, and silently discarding the nomination claim would lose work.
    persist({ ...claim, subclass: next, updatedAt: new Date().toISOString() });
  };

  const setOption = (criterionId: string, optionId: string) =>
    updateEntry(criterionId, entry => ({ ...entry, optionId: optionId || undefined }));

  const setNote = (criterionId: string, note: string) =>
    updateEntry(criterionId, entry => ({ ...entry, note: note || undefined }));

  const linkDocument = (criterionId: string, documentId: string) =>
    updateEntry(criterionId, entry =>
      entry.documentIds.includes(documentId)
        ? entry
        : { ...entry, documentIds: [...entry.documentIds, documentId] },
    );

  const unlinkDocument = (criterionId: string, documentId: string) =>
    updateEntry(criterionId, entry => ({ ...entry, documentIds: entry.documentIds.filter(id => id !== documentId) }));

  const downloadPdf = async () => {
    setBusy('pdf');
    setError(null);
    try {
      const bytes = await buildPointsBreakdownPdf(summary, meta);
      const { url, filename } = createDownloadUrl(bytes, pointsBreakdownFileName(meta));
      triggerDownload(url, filename);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the PDF.');
    } finally {
      setBusy(null);
    }
  };

  const savePdfToCaseFiles = async () => {
    setBusy('save');
    setError(null);
    try {
      const bytes = await buildPointsBreakdownPdf(summary, meta);
      const fileName = pointsBreakdownFileName(meta);
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      await repos.documents.create(
        {
          id: uuidv4(),
          caseId,
          fileName,
          filePath: `documents/${caseId}/${fileName}`,
          fileType: 'application/pdf',
          fileSize: blob.size,
          uploadedAt: new Date().toISOString(),
          documentTypeCode: POINTS_CLAIM_DOC_TYPE_CODE,
          evidenceNote: `Points test breakdown (draft) — subclass ${subclass}, ${summary.claimedTotal} claimed / ${summary.provenTotal} proven`,
        },
        blob,
      );
      setSavedToCaseFiles(true);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the breakdown to Case Files.');
    } finally {
      setBusy(null);
    }
  };

  const copyCoverLetter = async () => {
    try {
      await navigator.clipboard.writeText(coverLetter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to the clipboard.');
    }
  };

  const downloadCoverLetter = () => {
    const blob = new Blob([coverLetter], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, pointsCoverLetterFileName(meta));
    URL.revokeObjectURL(url);
  };

  // ---- Render -------------------------------------------------------------

  const totals = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg bg-edamame/10 dark:bg-edamame/15">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-edamame-700 dark:text-edamame-400">Claimed</span>
        <span className="text-[15px] font-bold text-edamame-700 dark:text-edamame-400">{summary.claimedTotal}</span>
      </span>
      <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/[0.12]">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-blue-700 dark:text-blue-400">Proven</span>
        <span className="text-[15px] font-bold text-blue-700 dark:text-blue-400">{summary.provenTotal}</span>
      </span>
      <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/[0.13]">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-400">Outstanding</span>
        <span className="text-[15px] font-bold text-amber-700 dark:text-amber-400">{summary.outstandingTotal}</span>
      </span>
      <span
        className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
          summary.meetsPassMark
            ? 'bg-emerald-500/[0.13] text-emerald-700 dark:text-emerald-400'
            : 'bg-slate-500/[0.13] text-slate-600 dark:text-slate-300'
        }`}
      >
        {summary.meetsPassMark ? `At or above the ${POINTS_PASS_MARK}-point minimum` : `Below the ${POINTS_PASS_MARK}-point minimum`}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden border border-gray-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-edamame/10 dark:bg-edamame/15 flex items-center justify-center">
              <Calculator size={15} className="text-edamame" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-gray-900 dark:text-white leading-tight">Points Calculator &amp; Evidence Mapper</h3>
              <p className="text-[11px] text-gray-400 dark:text-slate-500">
                {stage === 'criteria'
                  ? 'Claim each criterion and link the evidence that proves it'
                  : 'Cover letter points summary — draft for review'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Totals + subclass bar */}
        <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 flex-shrink-0 bg-gray-50 dark:bg-slate-800/40">
          {totals}
          <label className="flex items-center gap-2 text-[11.5px] font-semibold text-gray-500 dark:text-slate-400">
            Points table
            <select
              value={subclass}
              onChange={e => changeSubclass(e.target.value as PointsSubclass)}
              className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-[12px] text-gray-800 dark:text-white outline-none focus:border-edamame"
            >
              {POINTS_SUBCLASSES.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          {!loaded ? (
            <div className="flex items-center justify-center py-16 text-gray-400 dark:text-slate-500">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : stage === 'letter' ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/[0.09] border border-amber-500/20">
                <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  This is a <strong>draft</strong> for the responsible agent or lawyer to review, edit and sign — not a
                  submission-ready document. Check every claim and every evidence reference against the file, and
                  against the current Department of Home Affairs points tables, before it goes anywhere.
                </p>
              </div>
              <pre className="whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-gray-700 dark:text-slate-300 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-800 rounded-xl p-4 font-mono">
                {coverLetter}
              </pre>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Disclaimer */}
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/[0.09] border border-amber-500/20">
                <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  {POINTS_TEST_DISCLAIMER} <span className="opacity-80">(Table last authored/reviewed {POINTS_TEST_AUTHORED_ON}.)</span>
                </p>
              </div>

              {summary.capAdjustments
                .filter(c => c.claimedRaw > c.claimedCapped)
                .map(c => (
                  <div key={c.group.id} className="flex items-start gap-2 p-2.5 rounded-xl bg-blue-500/[0.08] border border-blue-500/20">
                    <Info size={13} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
                      {c.group.note} {c.claimedRaw} points claimed across those criteria count as {c.group.max}.
                    </p>
                  </div>
                ))}

              {criteria.map(criterion => {
                const result = summary.results.find(r => r.criterion.id === criterion.id)!;
                const suggestions = suggestEvidenceForCriterion(criterion, documents).filter(
                  d => !result.linkedDocuments.some(l => l.id === d.id),
                );
                const unlinked = documents.filter(d => !result.linkedDocuments.some(l => l.id === d.id));

                return (
                  <div
                    key={criterion.id}
                    className="rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 bg-gray-50 dark:bg-slate-800/40">
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-gray-900 dark:text-white">{criterion.label}</div>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 leading-snug">{criterion.helpText}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[13px] font-bold text-gray-900 dark:text-white">{result.claimedPoints} pts</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            result.status === 'proven'
                              ? 'bg-blue-500/[0.13] text-blue-700 dark:text-blue-400'
                              : result.status === 'outstanding'
                                ? 'bg-amber-500/[0.13] text-amber-700 dark:text-amber-400'
                                : 'bg-slate-500/[0.13] text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {result.status === 'proven' ? 'Proven' : result.status === 'outstanding' ? 'Outstanding' : 'Not claimed'}
                        </span>
                      </div>
                    </div>

                    <div className="px-4 py-3 space-y-2.5">
                      <select
                        value={result.entry?.optionId ?? ''}
                        onChange={e => setOption(criterion.id, e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-[12.5px] text-gray-800 dark:text-white outline-none focus:border-edamame"
                      >
                        <option value="">— Nothing claimed —</option>
                        {criterion.options.map(o => (
                          <option key={o.id} value={o.id}>
                            {o.label} ({o.points} pts)
                          </option>
                        ))}
                      </select>

                      {result.option?.description && (
                        <p className="text-[10.5px] text-gray-400 dark:text-slate-500">{result.option.description}</p>
                      )}

                      {criterion.note && (
                        <p className="text-[10.5px] text-gray-500 dark:text-slate-400 leading-snug">
                          <Info size={11} className="inline mr-1 -mt-0.5 text-gray-400 dark:text-slate-500" />
                          {criterion.note}
                        </p>
                      )}

                      <input
                        value={result.entry?.note ?? ''}
                        onChange={e => setNote(criterion.id, e.target.value)}
                        placeholder="Working note — e.g. dates, employers, test scores…"
                        className="w-full px-3 py-1.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-[11.5px] text-gray-700 dark:text-slate-200 outline-none focus:border-edamame"
                      />

                      {/* Evidence */}
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500 mb-1.5">
                          Evidence
                        </div>

                        {result.linkedDocuments.length === 0 && (
                          <p className="text-[11px] text-gray-500 dark:text-slate-400 mb-1.5">
                            {result.claimedPoints > 0
                              ? `Not proven yet — ${criterion.evidenceHint}`
                              : criterion.evidenceHint}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-1.5">
                          {result.linkedDocuments.map(doc => (
                            <span
                              key={doc.id}
                              className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-blue-500/[0.10] text-[11px] font-semibold text-blue-700 dark:text-blue-400 max-w-full"
                            >
                              <Paperclip size={11} className="flex-shrink-0" />
                              <span className="truncate max-w-[220px]">{doc.fileName}</span>
                              <button
                                onClick={() => unlinkDocument(criterion.id, doc.id)}
                                title="Unlink this file (the file itself stays in Case Files)"
                                className="p-0.5 rounded hover:bg-blue-500/20"
                              >
                                <X size={11} />
                              </button>
                            </span>
                          ))}

                          {suggestions.slice(0, 4).map(doc => (
                            <button
                              key={doc.id}
                              onClick={() => linkDocument(criterion.id, doc.id)}
                              title={`Link "${doc.fileName}" as evidence for this criterion`}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-dashed border-gray-300 dark:border-slate-700 text-[11px] font-semibold text-gray-500 dark:text-slate-400 hover:border-edamame hover:text-edamame transition-colors max-w-full"
                            >
                              <Plus size={11} className="flex-shrink-0" />
                              <span className="truncate max-w-[200px]">{doc.fileName}</span>
                            </button>
                          ))}

                          {unlinked.length > 0 && (
                            <button
                              onClick={() => setLinkPickerFor(linkPickerFor === criterion.id ? null : criterion.id)}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold text-gray-400 dark:text-slate-500 hover:text-edamame transition-colors"
                            >
                              <FileText size={11} /> Link another file…
                            </button>
                          )}
                        </div>

                        {linkPickerFor === criterion.id && (
                          <select
                            autoFocus
                            value=""
                            onChange={e => {
                              if (e.target.value) linkDocument(criterion.id, e.target.value);
                              setLinkPickerFor(null);
                            }}
                            className="mt-2 w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-[11.5px] text-gray-800 dark:text-white outline-none focus:border-edamame"
                          >
                            <option value="">Choose a Case File…</option>
                            {unlinked.map(doc => (
                              <option key={doc.id} value={doc.id}>
                                {doc.documentTypeCode ? `[${doc.documentTypeCode}] ` : ''}
                                {doc.fileName}
                              </option>
                            ))}
                          </select>
                        )}

                        {result.missingDocumentIds.length > 0 && (
                          <p className="text-[10.5px] text-amber-700 dark:text-amber-400 mt-1.5">
                            {result.missingDocumentIds.length} previously linked file
                            {result.missingDocumentIds.length === 1 ? ' is' : 's are'} no longer in Case Files — this
                            criterion is outstanding again.
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => setExpandedSource(expandedSource === criterion.id ? null : criterion.id)}
                        className="text-[10.5px] font-semibold text-gray-400 dark:text-slate-500 hover:text-edamame transition-colors"
                      >
                        {expandedSource === criterion.id ? 'Hide source' : 'Source'}
                      </button>
                      {expandedSource === criterion.id && (
                        <p className="text-[10.5px] text-gray-500 dark:text-slate-400 leading-snug">{criterion.source}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-red-500/[0.09] border border-red-500/20">
              <AlertTriangle size={14} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
          {stage === 'letter' ? (
            <button
              onClick={() => setStage('criteria')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-bold text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              <ChevronLeft size={15} /> Back to criteria
            </button>
          ) : (
            <button
              onClick={() => setStage('letter')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-bold text-edamame hover:text-edamame-600 transition-colors"
            >
              <FileText size={15} /> Cover letter summary
            </button>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {stage === 'letter' ? (
              <>
                <button
                  onClick={copyCoverLetter}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-xl text-[12.5px] font-bold text-gray-600 dark:text-slate-300 hover:border-edamame transition-colors"
                >
                  {copied ? <CheckCircle2 size={14} className="text-edamame" /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy draft'}
                </button>
                <button
                  onClick={downloadCoverLetter}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-xl text-[12.5px] shadow-lg shadow-edamame/20 transition-all"
                >
                  <Download size={14} /> Download draft
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={savePdfToCaseFiles}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-xl text-[12.5px] font-bold text-gray-600 dark:text-slate-300 hover:border-edamame disabled:opacity-40 transition-colors"
                >
                  {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : savedToCaseFiles ? <CheckCircle2 size={14} className="text-edamame" /> : <FolderPlus size={14} />}
                  {savedToCaseFiles ? 'Added to Case Files' : 'Add PDF to Case Files'}
                </button>
                <button
                  onClick={downloadPdf}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-edamame hover:bg-edamame-600 disabled:opacity-40 text-white font-bold rounded-xl text-[12.5px] shadow-lg shadow-edamame/20 transition-all"
                >
                  {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download PDF breakdown
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PointsCalculator;
