import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X, Loader2, AlertTriangle, ExternalLink, Sparkles } from 'lucide-react';
import { Case, Client, WorkflowTemplate } from '../../types';
import { resolveAdvisorClient } from '../../lib/resolveAdvisorClient';
import { matchTemplate } from '../../lib/matchTemplate';
import { findOpenCaseForSubclass } from '../../lib/findOpenCaseForSubclass';
import { displayCaseNumber } from '../../lib/caseNumber';

export type OpenCaseClientChoice =
  | { kind: 'existing'; id: string }
  | {
      kind: 'new';
      fullName: string;
      dob: string;
      nationality: string;
      email?: string;
      phone?: string;
      inAustralia: boolean;
      currentVisaStatus: string;
    };

export interface OpenCasePanelResult {
  client: OpenCaseClientChoice;
  templateId: string | null;
  title: string;
  generateTasks: boolean;
  /** Whether to create one fixed (non-AI) task per gap — see the "Add a task for each gap" checkbox below. */
  gapTasks: boolean;
}

// Sentinel used only inside the <select> to represent "create a new client" —
// never leaks outside this component.
const NEW_CLIENT_OPTION = '__new_client__';
// Sentinel for the explicit "No template (general case)" choice, distinct from
// "nothing chosen yet" (undefined), which keeps Confirm disabled until the
// user makes a deliberate pick when there was no exact-subclass match.
const NO_TEMPLATE_OPTION = '__no_template__';

export type OpenCaseStage = 'plan' | 'client' | 'finalizing';

const stageLabels: Record<OpenCaseStage, string> = {
  plan: 'Drafting task plan with AI…',
  client: 'Setting up client…',
  finalizing: 'Finalizing case…',
};

interface OpenCasePanelProps {
  visaSubclass: string;
  visaName: string;
  /** Gaps from the assessed pathway — drives the optional "Add a task for each gap" checkbox. */
  gaps: string[];
  clientInfo: {
    fullName: string;
    dob: string;
    nationality: string;
    inAustralia: boolean;
    currentVisaStatus: string;
  };
  prefilledClientId?: string;
  clients: Client[];
  templates: WorkflowTemplate[];
  cases: Case[];
  isSubmitting: boolean;
  stage: OpenCaseStage;
  onConfirm: (result: OpenCasePanelResult) => void;
  onCancel: () => void;
}

const labelClass =
  'block text-[10px] font-bold uppercase tracking-[0.11em] text-ink-soft dark:text-plate-ink-soft mb-1.5';
const inputClass =
  'w-full px-3.5 py-2.5 border border-ink/15 dark:border-plate-ink/20 rounded-lg bg-paper-2 dark:bg-plate-card/60 text-[13.5px] text-ink dark:text-plate-ink outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed';

/**
 * Confirmation step between clicking "Open Case" on a Visa Advisor pathway
 * and actually creating the client/case. Lets the lawyer review (and change)
 * the client it will use, the workflow template, the case title, and whether
 * an AI task plan is generated — and warns before creating what may be a
 * duplicate case for the same client + subclass.
 */
export const OpenCasePanel: React.FC<OpenCasePanelProps> = ({
  visaSubclass,
  visaName,
  gaps,
  clientInfo,
  prefilledClientId,
  clients,
  templates,
  cases,
  isSubmitting,
  stage,
  onConfirm,
  onCancel,
}) => {
  const resolution = useMemo(
    () => resolveAdvisorClient(clients, clientInfo, prefilledClientId),
    // Only re-resolve on mount (clients/clientInfo are effectively fixed for the
    // lifetime of one panel instance — the panel is remounted fresh per Open Case click).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [clientChoice, setClientChoice] = useState<OpenCaseClientChoice>(() =>
    resolution.kind === 'existing' ? { kind: 'existing', id: resolution.client.id } : { kind: 'new', ...clientInfo }
  );
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');

  const selectedExistingClient =
    clientChoice.kind === 'existing' ? clients.find((c) => c.id === clientChoice.id) : undefined;
  const clientDisplayName = selectedExistingClient?.name ?? clientInfo.fullName;

  const matchedTemplate = useMemo(() => matchTemplate(templates, visaSubclass), [templates, visaSubclass]);
  // undefined = nothing chosen yet (only possible when there's no auto-match —
  // Confirm stays disabled until the user picks something explicit).
  const [templateId, setTemplateId] = useState<string | null | undefined>(() =>
    matchedTemplate ? matchedTemplate.id : undefined
  );
  const selectedTemplate = templateId ? templates.find((t) => t.id === templateId) : undefined;

  const defaultTitle = (tpl: WorkflowTemplate | undefined, name: string) =>
    `${tpl?.title || `Subclass ${visaSubclass}`} - ${name}`;
  const [title, setTitle] = useState(() => defaultTitle(matchedTemplate, clientDisplayName));
  const [titleEdited, setTitleEdited] = useState(false);

  useEffect(() => {
    if (titleEdited) return;
    setTitle(defaultTitle(selectedTemplate, clientDisplayName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate?.id, clientDisplayName, titleEdited]);

  const [generateTasks, setGenerateTasks] = useState(true);
  const [gapTasks, setGapTasks] = useState(false);

  const conflictingCase = useMemo(() => {
    if (clientChoice.kind !== 'existing') return null;
    return findOpenCaseForSubclass(cases, templates, clientChoice.id, visaSubclass);
  }, [cases, templates, clientChoice, visaSubclass]);

  const [acknowledgeConflict, setAcknowledgeConflict] = useState(false);
  useEffect(() => {
    setAcknowledgeConflict(false);
  }, [conflictingCase?.id]);

  const templateChosen = templateId !== undefined;
  const canConfirm =
    !isSubmitting &&
    templateChosen &&
    title.trim().length > 0 &&
    (!conflictingCase || acknowledgeConflict);

  const handleConfirm = () => {
    if (!canConfirm) return;
    const client: OpenCaseClientChoice =
      clientChoice.kind === 'existing'
        ? { kind: 'existing', id: clientChoice.id }
        : {
            kind: 'new',
            fullName: clientInfo.fullName,
            dob: clientInfo.dob,
            nationality: clientInfo.nationality,
            email: newClientEmail.trim() || undefined,
            phone: newClientPhone.trim() || undefined,
            inAustralia: clientInfo.inAustralia,
            currentVisaStatus: clientInfo.currentVisaStatus,
          };
    onConfirm({
      client,
      templateId: templateId ?? null,
      title: title.trim(),
      generateTasks,
      gapTasks,
    });
  };

  const handleBackdropClick = () => {
    if (isSubmitting) return;
    onCancel();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSubmitting, onCancel]);

  const panel = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleBackdropClick();
      }}
    >
      <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-ink/10 dark:border-plate-ink/15">
        <div className="px-6 py-4 border-b border-ink/10 dark:border-plate-ink/15 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-[15px] text-ink dark:text-plate-ink">Confirm Open Case</h3>
            <p className="text-[12px] text-ink-soft dark:text-plate-ink-soft mt-0.5">
              {visaName} visa — subclass {visaSubclass}
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Client */}
          <div>
            <label className={labelClass}>Client</label>
            {clientChoice.kind === 'existing' && selectedExistingClient ? (
              <p className="text-[13px] text-ink-soft dark:text-plate-ink-soft">
                Using existing client{' '}
                <strong className="text-ink dark:text-plate-ink">{selectedExistingClient.name}</strong>
                {selectedExistingClient.dob ? ` · DOB ${selectedExistingClient.dob}` : ''}
              </p>
            ) : (
              <p className="text-[13px] text-ink-soft dark:text-plate-ink-soft">
                A new client will be created:{' '}
                <strong className="text-ink dark:text-plate-ink">{clientInfo.fullName}</strong>
              </p>
            )}

            <select
              value={clientChoice.kind === 'existing' ? clientChoice.id : NEW_CLIENT_OPTION}
              onChange={(e) => {
                const v = e.target.value;
                setClientChoice(
                  v === NEW_CLIENT_OPTION ? { kind: 'new', ...clientInfo } : { kind: 'existing', id: v }
                );
              }}
              disabled={isSubmitting}
              className={`${inputClass} mt-2`}
            >
              <option value={NEW_CLIENT_OPTION}>Create new client — {clientInfo.fullName}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.dob ? ` (DOB ${c.dob})` : ''}
                </option>
              ))}
            </select>

            {resolution.kind === 'new' && resolution.sameNameCandidates.length > 0 && clientChoice.kind === 'new' && (
              <div className="mt-2.5 p-3 rounded-lg bg-amber-50/70 dark:bg-amber-500/[0.06] border border-amber-200 dark:border-amber-800/60">
                <p className="text-[11.5px] font-semibold text-[#B45309] dark:text-amber-400 mb-1.5">
                  A client with this name already exists — use one of these instead?
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {resolution.sameNameCandidates.map((cand) => (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => setClientChoice({ kind: 'existing', id: cand.id })}
                      disabled={isSubmitting}
                      className="px-2.5 py-1 rounded-full border border-amber-300 dark:border-amber-700 bg-paper-2 dark:bg-plate-card text-[11.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:border-edamame-400 dark:hover:border-edamame-500 disabled:opacity-50"
                    >
                      {cand.name}
                      {cand.dob ? ` · DOB ${cand.dob}` : ' · no DOB on file'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {clientChoice.kind === 'new' && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Email (optional)</label>
                  <input
                    type="email"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    disabled={isSubmitting}
                    className={inputClass}
                    placeholder="client@example.com"
                  />
                </div>
                <div>
                  <label className={labelClass}>Phone (optional)</label>
                  <input
                    type="tel"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    disabled={isSubmitting}
                    className={inputClass}
                    placeholder="+61 4xx xxx xxx"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Existing-case warning */}
          {conflictingCase && (
            <div className="p-3.5 rounded-lg bg-red-50/70 dark:bg-red-500/[0.06] border border-red-200 dark:border-red-800/60">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-[#B91C1C] dark:text-red-400">
                    This client already has an open case for this pathway
                  </p>
                  <p className="text-[12px] text-ink-soft dark:text-plate-ink-soft mt-1">
                    {displayCaseNumber(conflictingCase)} · {conflictingCase.title}
                  </p>
                  <Link
                    to={`/cases/${conflictingCase.id}`}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-edamame-600 dark:text-edamame-400 hover:text-edamame-700 dark:hover:text-edamame-300 mt-1.5"
                  >
                    View existing case <ExternalLink size={12} />
                  </Link>
                  <label className="flex items-start gap-2 mt-2.5 text-[12px] font-medium text-ink-soft dark:text-plate-ink-soft cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acknowledgeConflict}
                      onChange={(e) => setAcknowledgeConflict(e.target.checked)}
                      disabled={isSubmitting}
                      className="w-4 h-4 mt-0.5 rounded accent-edamame-500 flex-shrink-0"
                    />
                    Create anyway — I understand this may duplicate the existing case.
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Template */}
          <div>
            <label className={labelClass}>Workflow Template</label>
            <select
              value={templateId === undefined ? '' : templateId === null ? NO_TEMPLATE_OPTION : templateId}
              onChange={(e) => {
                const v = e.target.value;
                setTemplateId(v === NO_TEMPLATE_OPTION ? null : v);
              }}
              disabled={isSubmitting}
              className={inputClass}
            >
              {templateId === undefined && <option value="">-- Select a template --</option>}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                  {t.visaSubclass ? ` (SC-${t.visaSubclass})` : ''}
                </option>
              ))}
              <option value={NO_TEMPLATE_OPTION}>No template (general case)</option>
            </select>
            {!matchedTemplate && templateId === undefined && (
              <p className="text-[11px] text-red-500 dark:text-red-400 mt-1.5">
                No template matches subclass {visaSubclass} exactly — pick one, or choose "No template".
              </p>
            )}
          </div>

          {/* Title */}
          <div>
            <label className={labelClass}>Case Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleEdited(true);
              }}
              disabled={isSubmitting}
              className={inputClass}
            />
          </div>

          {/* Generate AI task plan */}
          <div>
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-soft dark:text-plate-ink-soft cursor-pointer">
              <input
                type="checkbox"
                checked={generateTasks}
                onChange={(e) => setGenerateTasks(e.target.checked)}
                disabled={isSubmitting}
                className="w-4 h-4 rounded accent-edamame-500"
              />
              <Sparkles size={14} className="text-edamame-500 flex-shrink-0" />
              Generate AI task plan
            </label>
          </div>

          {/* Add a task for each gap — off by default */}
          {gaps.length > 0 && (
            <div>
              <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-soft dark:text-plate-ink-soft cursor-pointer">
                <input
                  type="checkbox"
                  checked={gapTasks}
                  onChange={(e) => setGapTasks(e.target.checked)}
                  disabled={isSubmitting}
                  className="w-4 h-4 rounded accent-edamame-500"
                />
                Add a task for each gap ({gaps.length})
              </label>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-paper-2 dark:bg-plate-card/50 border-t border-ink/10 dark:border-plate-ink/15 flex items-center justify-end gap-2 flex-shrink-0">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="btn-press px-4 py-2 text-[13px] font-semibold text-ink-soft dark:text-plate-ink-soft border border-ink/15 dark:border-plate-ink/20 hover:bg-white dark:hover:bg-plate-card rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="btn-press flex items-center justify-center gap-2 px-4 py-2 min-w-[172px] text-[13px] font-bold text-white bg-edamame-500 hover:bg-edamame-600 rounded-lg shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin flex-shrink-0" />
                <span className={stage === 'plan' ? 'font-mono-ai' : ''}>{stageLabels[stage]}</span>
              </>
            ) : (
              'Confirm'
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
};
