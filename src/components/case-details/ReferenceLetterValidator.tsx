import React, { useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import {
  X,
  Upload,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FolderPlus,
  Info,
} from 'lucide-react';
import type { Client, Document, WorkflowTemplate } from '../../types';
import { useRepositories } from '../../contexts/RepositoryContext';
import {
  REFERENCE_LETTER_AUTHORITIES,
  buildReferenceLetterTemplate,
  referenceLetterFileName,
  requirementsForAuthority,
  validateAgainstAuthority,
  type ReferenceLetterAuthorityId,
  type ReferenceLetterFieldKey,
  type ReferenceLetterValues,
} from '../../lib/referenceLetterRequirements';
import {
  extractReferenceLetterFields,
  REFERENCE_LETTER_ACCEPTED_TYPES,
  REFERENCE_LETTER_FORMATS_LABEL,
} from '../../services/referenceLetterService';

/** Document Type code the finished draft is filed under (see lib/documentTypes.ts). */
const REFERENCE_LETTER_DOC_TYPE_CODE = 'REFLTR';

type Stage = 'select' | 'processing' | 'review' | 'template';

interface ReferenceLetterValidatorProps {
  caseId: string;
  /** Visa applicant — pre-fills the employee name on the generated draft. */
  applicant: Client;
  /** Employer/sponsor party on the case, when one is recorded — pre-fills employer details. */
  employer?: Client;
  /** The case's workflow template — its title is offered as the nominated occupation hint. */
  workflowTemplate?: WorkflowTemplate;
  onClose: () => void;
  /** Called after a draft is saved into Case Files so the caller can refresh. */
  onSaved?: () => void;
}

/**
 * Reference Letter Validator + Generator — built-in Workspace Tool (issue #32).
 *
 * Step 1 pick an assessing authority and (optionally) upload an existing
 * letter; step 2 review and correct what the AI read out of it against that
 * authority's requirement set, with the missing required fields called out;
 * step 3 produce a pre-filled draft the employer completes on their own
 * letterhead, which can be copied, downloaded, or filed into Case Files.
 *
 * Everything here is framed as AI-suggested drafting help. The requirement sets
 * in `lib/referenceLetterRequirements.ts` are authored best-effort rules, not a
 * compliance guarantee — the copy in this component must not claim otherwise.
 */
export const ReferenceLetterValidator: React.FC<ReferenceLetterValidatorProps> = ({
  caseId,
  applicant,
  employer,
  workflowTemplate,
  onClose,
  onSaved,
}) => {
  const repos = useRepositories();
  const [stage, setStage] = useState<Stage>('select');
  const [authorityId, setAuthorityId] = useState<ReferenceLetterAuthorityId | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [values, setValues] = useState<ReferenceLetterValues>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const authority = authorityId ? REFERENCE_LETTER_AUTHORITIES.find(a => a.id === authorityId)! : null;

  /** Everything the case already knows, before the AI or the user adds anything. */
  const casePrefill = useMemo<ReferenceLetterValues>(() => {
    const prefill: ReferenceLetterValues = { employeeName: applicant.name };
    if (employer) {
      prefill.companyName = employer.name;
      if (employer.address) prefill.companyAddress = employer.address;
      const contact = [employer.phone, employer.email].filter(Boolean).join(' · ');
      if (contact) prefill.companyContact = contact;
    }
    // The nominated occupation isn't a tracked field on Case today, so it stays
    // a placeholder — the case's workflow template is surfaced as a hint on the
    // review step instead of being guessed at here.
    return prefill;
  }, [applicant, employer]);

  const requirements = useMemo(
    () => (authorityId ? requirementsForAuthority(authorityId) : []),
    [authorityId],
  );

  const validation = useMemo(
    () => (authorityId ? validateAgainstAuthority(authorityId, values) : null),
    [authorityId, values],
  );

  const runExtraction = async (file: File) => {
    if (!authorityId) return;
    setFileName(file.name);
    setError(null);
    setStage('processing');
    const result = await extractReferenceLetterFields(file, authorityId);
    if (result.success && result.values) {
      // Case data fills only what the letter didn't provide — never overwrite
      // what the document actually says.
      setValues({ ...casePrefill, ...stripEmpty(result.values) });
      setStage('review');
    } else {
      setError(result.error || 'Could not read the reference letter.');
      setStage('select');
    }
  };

  const skipUpload = () => {
    if (!authorityId) return;
    setFileName(null);
    setError(null);
    setValues(casePrefill);
    setStage('review');
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted: File[]) => { if (accepted.length > 0) runExtraction(accepted[0]); },
    accept: REFERENCE_LETTER_ACCEPTED_TYPES,
    maxFiles: 1,
    multiple: false,
    disabled: !authorityId,
  } as any);

  const setValue = (key: ReferenceLetterFieldKey, v: string) =>
    setValues(prev => ({ ...prev, [key]: v }));

  const template = useMemo(
    () => (authorityId ? buildReferenceLetterTemplate(authorityId, values) : ''),
    [authorityId, values],
  );

  const draftFileName = useMemo(
    () => (authorityId ? referenceLetterFileName(authorityId, applicant.name, new Date()) : 'reference-letter-draft.txt'),
    [authorityId, applicant.name],
  );

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Could not copy to the clipboard. Use Download instead.');
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([template], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = draftFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const saveToCaseFiles = async () => {
    if (!authority) return;
    setSaving(true);
    setError(null);
    try {
      const blob = new Blob([template], { type: 'text/plain' });
      const doc: Document = {
        id: uuidv4(),
        caseId,
        fileName: draftFileName,
        filePath: `documents/${caseId}/${draftFileName}`,
        fileType: 'text/plain',
        fileSize: blob.size,
        uploadedAt: new Date().toISOString(),
        documentTypeCode: REFERENCE_LETTER_DOC_TYPE_CODE,
        evidenceNote: `${authority.shortName} reference letter draft — for the employer to complete on letterhead`,
      };
      await repos.documents.create(doc, blob);
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the draft to Case Files.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden border border-gray-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-edamame/10 dark:bg-edamame/15 flex items-center justify-center">
              <FileCheck2 size={15} className="text-edamame" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-gray-900 dark:text-white leading-tight">Reference Letter Validator</h3>
              <p className="text-[11px] text-gray-400 dark:text-slate-500">
                {stage === 'template'
                  ? 'Step 3 of 3 — Draft template'
                  : stage === 'review'
                    ? 'Step 2 of 3 — Review extracted fields'
                    : 'Step 1 of 3 — Authority & letter'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Standing disclaimer — this tool is drafting help, not compliance advice. */}
        <div className="mx-5 mt-4 flex items-start gap-2 text-[11.5px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/[0.08] border border-amber-200 dark:border-amber-500/25 rounded-lg px-3 py-2">
          <Info size={13} className="flex-shrink-0 mt-0.5" />
          <span>
            AI-suggested — review before use. The per-authority requirements below are a best-effort
            summary, not legal advice, and do not guarantee an authority will accept the letter. Always
            check the authority's current published guidance.
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          {error && (
            <div className="mb-4 flex items-start gap-2 text-[12px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ── STEP 1 — authority + upload ── */}
          {stage === 'select' && (
            <div className="space-y-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500 mb-2">
                  Assessing authority
                </div>
                <div className="space-y-2">
                  {REFERENCE_LETTER_AUTHORITIES.map(a => {
                    const isSelected = authorityId === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAuthorityId(a.id)}
                        className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-colors ${
                          isSelected
                            ? 'border-edamame bg-edamame/[0.06] dark:bg-edamame/[0.08]'
                            : 'border-gray-200 dark:border-slate-700 hover:border-edamame/50'
                        }`}
                      >
                        <div className="text-[13px] font-bold text-gray-800 dark:text-slate-200">{a.name}</div>
                        <div className="text-[11px] text-gray-400 dark:text-slate-500">{a.occupationScope}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {authority && (
                <p className="text-[11.5px] leading-relaxed text-gray-500 dark:text-slate-400 border-l-2 border-edamame/40 pl-3">
                  {authority.guidance}
                </p>
              )}

              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500 mb-2">
                  Existing reference letter (optional)
                </div>
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                    !authorityId
                      ? 'border-gray-200 dark:border-slate-800 opacity-50 cursor-not-allowed'
                      : isDragActive
                        ? 'border-edamame bg-edamame/[0.06] cursor-pointer'
                        : 'border-gray-300 dark:border-slate-700 hover:border-edamame/60 hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-pointer'
                  }`}
                >
                  <input {...getInputProps()} />
                  <Upload size={28} className="mx-auto mb-2 text-gray-400 dark:text-slate-500" />
                  <p className="text-[12.5px] font-semibold text-gray-700 dark:text-slate-300">
                    {!authorityId
                      ? 'Pick an authority first'
                      : isDragActive
                        ? 'Drop the reference letter here'
                        : 'Drag & drop the reference letter, or click to browse'}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">
                    Supports {REFERENCE_LETTER_FORMATS_LABEL} · the file is sent to Gemini for reading and is not stored on our servers
                  </p>
                </div>
                <button
                  type="button"
                  onClick={skipUpload}
                  disabled={!authorityId}
                  className="mt-2 text-[11.5px] font-bold text-gray-500 dark:text-slate-400 hover:text-edamame disabled:opacity-40 transition-colors"
                >
                  No letter yet — go straight to a blank draft →
                </button>
              </div>
            </div>
          )}

          {/* ── Processing ── */}
          {stage === 'processing' && (
            <div className="py-16 text-center">
              <Loader2 size={34} className="mx-auto mb-3 text-edamame animate-spin" />
              <p className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">
                Reading {fileName}…
              </p>
              <p className="text-[11.5px] text-gray-400 dark:text-slate-500 mt-1">
                Extracting the fields {authority?.shortName} looks for.
              </p>
            </div>
          )}

          {/* ── STEP 2 — review ── */}
          {stage === 'review' && authority && validation && (
            <div className="space-y-4">
              <div
                className={`rounded-xl border px-4 py-3 ${
                  validation.missingRequired.length === 0
                    ? 'border-edamame/40 bg-edamame/[0.06]'
                    : 'border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/[0.07]'
                }`}
              >
                <div className="flex items-center gap-2">
                  {validation.missingRequired.length === 0
                    ? <CheckCircle2 size={15} className="text-edamame" />
                    : <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />}
                  <span className="text-[13px] font-bold text-gray-800 dark:text-slate-100">
                    {validation.missingRequired.length === 0
                      ? `No missing fields detected for ${authority.shortName}`
                      : `${validation.missingRequired.length} field${validation.missingRequired.length === 1 ? '' : 's'} ${authority.shortName} usually expects ${validation.missingRequired.length === 1 ? 'is' : 'are'} missing`}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-gray-500 dark:text-slate-400 tabular-nums">
                    {validation.completeness}%
                  </span>
                </div>
                {validation.missingRequired.length > 0 && (
                  <ul className="mt-2 text-[11.5px] text-amber-900/90 dark:text-amber-200/90 space-y-0.5">
                    {validation.missingRequired.map(f => <li key={f.key}>— {f.label}</li>)}
                  </ul>
                )}
                {validation.missingRecommended.length > 0 && (
                  <p className="mt-2 text-[11px] text-gray-500 dark:text-slate-400">
                    Also worth adding: {validation.missingRecommended.map(f => f.label).join(', ')}.
                  </p>
                )}
              </div>

              <p className="text-[11.5px] text-gray-500 dark:text-slate-400">
                {fileName
                  ? 'These values were read from the letter by AI and may be wrong — correct anything that is off before generating the draft.'
                  : 'Fill in whatever you already know. Anything left blank becomes a placeholder in the draft.'}
              </p>

              <div className="space-y-3">
                {requirements.map(({ field, required }) => {
                  const filled = (values[field.key] || '').trim().length > 0;
                  const isLong = field.key === 'duties';
                  return (
                    <div key={field.key}>
                      <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-1">
                        {field.label}
                        {required
                          ? <span className={`text-[9.5px] px-1.5 py-px rounded ${filled ? 'bg-edamame/15 text-edamame-700 dark:text-edamame-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'}`}>
                              {filled ? 'found' : 'missing'}
                            </span>
                          : <span className="text-[9.5px] px-1.5 py-px rounded bg-gray-500/10 text-gray-500 dark:text-slate-400">optional</span>}
                      </label>
                      {isLong ? (
                        <textarea
                          rows={4}
                          value={values[field.key] || ''}
                          onChange={e => setValue(field.key, e.target.value)}
                          placeholder={field.hint}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-edamame text-gray-900 dark:text-white outline-none text-[12.5px]"
                        />
                      ) : (
                        <input
                          type="text"
                          value={values[field.key] || ''}
                          onChange={e => setValue(field.key, e.target.value)}
                          placeholder={field.hint}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-edamame text-gray-900 dark:text-white outline-none text-[12.5px]"
                        />
                      )}
                      {field.key === 'nominatedOccupation' && workflowTemplate?.title && (
                        <p className="mt-1 text-[10.5px] text-gray-400 dark:text-slate-500">
                          This case runs on the “{workflowTemplate.title}” workflow — state the occupation
                          (and ANZSCO code) the experience is being claimed against.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── STEP 3 — template ── */}
          {stage === 'template' && authority && (
            <div className="space-y-3">
              <p className="text-[11.5px] text-gray-500 dark:text-slate-400">
                A draft for the employer to complete, check and reproduce on their own company letterhead
                before signing. It is not a submittable document — replace every <code className="font-mono">[INSERT …]</code> placeholder first.
              </p>
              <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-gray-800 dark:text-slate-200 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl p-4 max-h-[45vh] overflow-y-auto">
                {template}
              </pre>
              {saved && (
                <div className="flex items-center gap-2 text-[12px] text-edamame-700 dark:text-edamame-400">
                  <CheckCircle2 size={13} />
                  Added to Case Files as “{draftFileName}”.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-shrink-0">
          {stage === 'review' || stage === 'template' ? (
            <button
              onClick={() => setStage(stage === 'template' ? 'review' : 'select')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              <ChevronLeft size={15} /> Back
            </button>
          ) : <span />}

          {stage === 'review' && (
            <button
              onClick={() => setStage('template')}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-xl shadow-lg shadow-edamame/20 transition-all"
            >
              Generate Draft <ChevronRight size={15} />
            </button>
          )}

          {stage === 'template' && (
            <div className="flex items-center gap-2">
              <button
                onClick={copyTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-bold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Copy size={14} /> {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={downloadTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-bold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Download size={14} /> Download
              </button>
              <button
                onClick={saveToCaseFiles}
                disabled={saving || saved}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-edamame hover:bg-edamame-600 disabled:opacity-40 text-white font-bold rounded-xl text-[12.5px] shadow-lg shadow-edamame/20 transition-all"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
                {saved ? 'Added to Case Files' : 'Add to Case Files'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Drops empty values so case pre-fill can show through where the letter was silent. */
function stripEmpty(values: ReferenceLetterValues): ReferenceLetterValues {
  const out: ReferenceLetterValues = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === 'string' && v.trim()) out[k as ReferenceLetterFieldKey] = v.trim();
  }
  return out;
}

export default ReferenceLetterValidator;
