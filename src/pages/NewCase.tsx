import React, { useState, useMemo, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { generateTasksFromCase } from '../services/geminiService';
import { WorkflowTemplate, Task, Client, Case } from '../types';
import { Sparkles, Calendar, Loader2, Save, User, ChevronDown, ChevronUp, List, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface NewCaseProps {
  templates: WorkflowTemplate[];
  clients: Client[];
  suggestedTemplateKeyword?: string | null;
  onTasksConfirmed: (tasks: Task[], newCase: Case) => void;
  onChangeView: (view: any) => void;
}

// Contextual placeholder hints keyed by visa subclass.
// Client bio (name, DOB, nationality, passport) is auto-injected — don't ask for those here.
const DESCRIPTION_HINTS: Record<string, string> = {
  '186': `What to include for Subclass 186 (ENS):
• Current visa status & expiry date (onshore / offshore?)
• Pathway: Direct Entry or Temporary Residence Transition (TRT)?
• Employer name, industry, and nominated occupation (ANZSCO code)
• How long has the applicant worked for this employer?
• Skills assessment status — body, lodgement date, outcome (if known)
• English test — type (IELTS/PTE/TOEFL), score, date sat
• Any prior visa refusals or character issues
• Dependants to include (names, ages, relationship)`,

  '482': `What to include for Subclass 482 (TSS):
• Current visa status & expiry date (onshore / offshore?)
• Stream: Short-term, Medium-term, or Labour Agreement?
• Employer name and whether they hold an approved sponsorship (SBS)
• Nominated occupation (ANZSCO code) and job title
• Labour Market Testing evidence — has employer advertised locally?
• English test — type (IELTS/PTE), score, date sat
• Skills assessment required? (occupation-dependent)
• Preferred visa duration (1–4 years) and pathway to PR intent
• Dependants to include (names, ages, relationship)`,

  '490': `What to include for Subclass 490 (Skilled Regional):
• Current visa status & expiry date (onshore / offshore?)
• Nominated occupation (ANZSCO code) and current points score
• Skills assessment — body (TRA/ACS/Engineers Australia/etc.), status, outcome
• English test — type (IELTS/PTE), score (higher = more points)
• Target state/territory for nomination and reason (family, job offer, etc.)
• SkillSelect EOI — submitted? Profile ID?
• Family sponsor in regional Australia? (if taking that pathway)
• Dependants to include (names, ages, relationship)`,

  '820': `What to include for Subclass 820/801 (Partner — Onshore):
• Current visa status & expiry (must be onshore at lodgement)
• Sponsor details: name, Australian citizenship / PR / NZ citizen status
• How long have applicant and sponsor been in a relationship?
• De facto or married? Date of marriage / commencement of de facto
• Cohabitation — living together? Since when? Same address on docs?
• Evidence ready: joint bank accounts, lease/mortgage, photos, travel together
• Any prior visa refusals, character issues, or previous relationships (sponsor)
• Dependants to include on application`,

  // Fallback for custom/unknown subclasses
  default: `What to include for best AI results:
• Current visa status & expiry date (onshore or offshore?)
• Specific immigration goal and why this visa subclass
• Key prerequisites already completed (skills assessment, English test, EOI, etc.)
• Any hard deadlines — course start date, job offer expiry, bridging visa expiry
• Known complications — prior refusals, health issues, character matters
• Dependants to include (names, ages, relationship)`,
};

// Short guided-prompt chips shown once a template is selected — same substance
// as DESCRIPTION_HINTS, condensed to a glanceable badge per topic.
const GUIDED_CHIPS: Record<string, string[]> = {
  '186': ['Current visa + expiry', 'Stream: TRT or DE?', 'Employer + tenure', 'English evidence', 'Deadlines or complications'],
  '482': ['Current visa + expiry', 'Stream: ST/MT/LA?', 'Employer + sponsorship', 'English evidence', 'Deadlines or complications'],
  '490': ['Current visa + expiry', 'Occupation + points', 'Skills assessment', 'English evidence', 'Deadlines or complications'],
  '820': ['Current visa + expiry', 'Sponsor details', 'Relationship length', 'Cohabitation evidence', 'Deadlines or complications'],
  default: ['Current visa + expiry', 'Immigration goal', 'Key prerequisites done', 'Deadlines or complications'],
};

function getDescriptionPlaceholder(template: WorkflowTemplate | undefined): string {
  if (!template) {
    return 'Select a workflow template above, then describe the case — current visa status, goals, deadlines, and any complications...';
  }
  const key = template.visaSubclass ?? 'default';
  return DESCRIPTION_HINTS[key] ?? DESCRIPTION_HINTS['default'];
}

function getGuidedChips(template: WorkflowTemplate | undefined): string[] {
  if (!template) return [];
  const key = template.visaSubclass ?? 'default';
  return GUIDED_CHIPS[key] ?? GUIDED_CHIPS['default'];
}

// Time between each task row streaming into view during the "generating" phase.
const REVEAL_DELAY_MS = 220;

export const NewCase: React.FC<NewCaseProps> = ({ templates, clients, suggestedTemplateKeyword, onTasksConfirmed, onChangeView: onGoBack }) => {
  const [step, setStep] = useState<'input' | 'generating' | 'review'>('input');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [clientId, setClientId] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

  // Client/applicant split
  const [splitRoles, setSplitRoles] = useState(false);
  const [applicantId, setApplicantId] = useState('');
  const [isApplicantDropdownOpen, setIsApplicantDropdownOpen] = useState(false);
  const [applicantSearchTerm, setApplicantSearchTerm] = useState('');

  // Steps preview
  const [stepsExpanded, setStepsExpanded] = useState(false);

  // Custom Select State
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState('');

  const [generatedTasks, setGeneratedTasks] = useState<Partial<Task>[]>([]);
  // Rows revealed so far during the "generating" phase's stream-in animation.
  const [revealedTasks, setRevealedTasks] = useState<Partial<Task>[]>([]);
  const revealTimers = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      revealTimers.current.forEach(id => window.clearTimeout(id));
    };
  }, []);

  // Auto-select suggested template if provided
  useEffect(() => {
    if (suggestedTemplateKeyword) {
      const suggestedTemplate = templates.find(t =>
        t.visaSubclass?.includes(suggestedTemplateKeyword) ||
        t.title?.includes(suggestedTemplateKeyword)
      );
      if (suggestedTemplate) {
        setTemplateId(suggestedTemplate.id);
      }
    }
  }, [suggestedTemplateKeyword, templates]);

  // Filter clients for dropdown
  const filteredClients = useMemo(() => {
    return clients.filter(c =>
      c.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(clientSearchTerm.toLowerCase())
    );
  }, [clients, clientSearchTerm]);

  const filteredApplicants = useMemo(() => {
    return clients.filter(c =>
      c.name.toLowerCase().includes(applicantSearchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(applicantSearchTerm.toLowerCase())
    );
  }, [clients, applicantSearchTerm]);

  const selectedClient = clients.find(c => c.id === clientId);
  const selectedApplicant = clients.find(c => c.id === applicantId);
  const selectedTemplate = templates.find(t => t.id === templateId);
  const guidedChips = getGuidedChips(selectedTemplate);

  // Reveals the already-fetched tasks into the UI one at a time, then
  // advances to the review phase. The tasks themselves are the real API
  // response — only the reveal pacing is client-side.
  const streamInTasks = (tasks: Partial<Task>[]) => {
    revealTimers.current.forEach(id => window.clearTimeout(id));
    revealTimers.current = [];
    setRevealedTasks([]);

    if (tasks.length === 0) {
      setStep('review');
      return;
    }

    tasks.forEach((task, i) => {
      const timerId = window.setTimeout(() => {
        setRevealedTasks(prev => [...prev, task]);
        if (i === tasks.length - 1) {
          const finalTimer = window.setTimeout(() => setStep('review'), 400);
          revealTimers.current.push(finalTimer);
        }
      }, i * REVEAL_DELAY_MS);
      revealTimers.current.push(timerId);
    });
  };

  const handleAnalyze = async () => {
    if (!description || !templateId || !clientId) return;

    setErrorMessage(null);
    setIsLoading(true);
    setGeneratedTasks([]);
    setRevealedTasks([]);
    setStep('generating');

    // Build rich client context — the more the LLM knows, the more specific the tasks
    const applicant = splitRoles && selectedApplicant ? selectedApplicant : selectedClient;
    const clientLines: string[] = [];
    if (selectedClient && splitRoles && selectedApplicant) {
      clientLines.push(`Engaging Party (Client): ${selectedClient.name}`);
      clientLines.push(`Visa Applicant: ${applicant?.name}`);
    } else if (selectedClient) {
      clientLines.push(`Name: ${selectedClient.name}`);
    }
    if (applicant) {
      if (applicant.dob)            clientLines.push(`Date of Birth: ${applicant.dob}`);
      if (applicant.nationality)    clientLines.push(`Nationality: ${applicant.nationality}`);
      if (applicant.passportNumber) clientLines.push(`Passport Number: ${applicant.passportNumber}`);
      if (applicant.passportExpiry) clientLines.push(`Passport Expiry: ${applicant.passportExpiry}`);
      if (applicant.gender)         clientLines.push(`Gender: ${applicant.gender}`);
    }
    const clientContext = clientLines.length
      ? `CLIENT PROFILE:\n${clientLines.join('\n')}\n\nCASE NOTES:\n`
      : '';

    try {
      const tasks = await generateTasksFromCase(
        clientContext + description,
        selectedTemplate?.description || '',
        startDate,
        selectedTemplate?.visaSubclass,
        selectedTemplate?.title,
        selectedTemplate?.steps,
      );
      setGeneratedTasks(tasks);
      streamInTasks(tasks);
    } catch (e) {
      setErrorMessage("Failed to generate tasks. Please check your connection or try again.");
      setStep('input');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!selectedClient) return;

    const newCaseId = uuidv4();

    const newCase: Case = {
      id: newCaseId,
      clientId: selectedClient.id,
      applicantId: splitRoles && applicantId ? applicantId : undefined,
      title: `${selectedTemplate?.title} - ${selectedClient.name}`,
      description: description,
      templateId: templateId,
      status: 'open',
      startDate: startDate,
      createdAt: new Date().toISOString()
    };

    const finalTasks: Task[] = generatedTasks.map((t, index) => ({
      id: uuidv4(),
      title: t.title || 'Untitled Task',
      description: t.description || '',
      date: t.date || startDate,
      isCompleted: false,
      priorityOrder: index,
      generatedByAi: true,
      caseId: newCaseId,
    }));

    onTasksConfirmed(finalTasks, newCase);
    onGoBack('cases');
  };

  const updateGeneratedTask = (index: number, field: string, value: string) => {
    const updated = [...generatedTasks];
    updated[index] = { ...updated[index], [field]: value };
    setGeneratedTasks(updated);
  };

  const removeGeneratedTask = (index: number) => {
    setGeneratedTasks(prev => prev.filter((_, i) => i !== index));
  };

  const handleSelectClient = (client: Client) => {
    setClientId(client.id);
    setClientSearchTerm(client.name);
    setIsClientDropdownOpen(false);
  };

  const handleSelectApplicant = (client: Client) => {
    setApplicantId(client.id);
    setApplicantSearchTerm(client.name);
    setIsApplicantDropdownOpen(false);
  };

  const canGenerate = !isLoading && !!description && !!templateId && !!clientId;

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-gray-50 dark:bg-slate-950 min-h-screen transition-colors duration-200">
      <style>{`
        @keyframes rowStreamIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .row-stream-in { animation: rowStreamIn 0.3s ease forwards; }
      `}</style>
      <div className="max-w-[720px] mx-auto page-enter">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight text-gray-900 dark:text-white">New Case Intake</h1>
            <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-1">Select a client and let AI plan the workflow.</p>
          </div>
          <button
            onClick={() => onGoBack('cases')}
            className="text-[13px] font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* PHASE 1 — Form                                                   */}
        {/* ---------------------------------------------------------------- */}
        {step === 'input' && (
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm p-6 space-y-5">

            <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-4">
              {/* Custom Client Selector */}
              <div className="relative focus-ring rounded-lg">
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">Client</label>
                <div
                  className="relative"
                  onClick={() => setIsClientDropdownOpen(true)}
                >
                  <User className="absolute left-3 top-2.5 text-gray-400 dark:text-slate-500" size={17} />
                  <input
                    type="text"
                    value={clientSearchTerm}
                    onChange={(e) => {
                      setClientSearchTerm(e.target.value);
                      setIsClientDropdownOpen(true);
                      if (clientId && e.target.value !== clients.find(c => c.id === clientId)?.name) {
                        setClientId(''); // Clear selection if typing
                      }
                    }}
                    onFocus={() => setIsClientDropdownOpen(true)}
                    className="w-full pl-9 pr-9 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-[13px] focus:ring-2 focus:ring-edamame-500 dark:focus:ring-edamame-600 focus:border-edamame-500 dark:focus:border-edamame-600 text-gray-900 dark:text-white outline-none"
                    placeholder="Search client…"
                  />
                  <ChevronDown className="absolute right-3 top-3 text-gray-400 dark:text-slate-500 pointer-events-none" size={15} />
                </div>

                {isClientDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsClientDropdownOpen(false)}
                    ></div>
                    <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredClients.length === 0 ? (
                        <div className="p-3 text-[13px] text-gray-500 dark:text-slate-500 italic">No clients found.</div>
                      ) : (
                        filteredClients.map(c => (
                          <div
                            key={c.id}
                            onClick={() => handleSelectClient(c)}
                            className="p-3 hover:bg-edamame-50 dark:hover:bg-slate-700 cursor-pointer border-b border-gray-100 dark:border-slate-700 last:border-0"
                          >
                            <div className="font-medium text-[13px] text-gray-900 dark:text-white">{c.name}</div>
                            <div className="flex gap-2 text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                              <span>DOB: {c.dob || 'N/A'}</span>
                              <span>•</span>
                              <span>{c.phone || c.email || 'No Contact Info'}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="focus-ring rounded-lg">
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">Start Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 text-gray-400 dark:text-slate-500" size={17} />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-[13px] focus:ring-2 focus:ring-edamame-500 dark:focus:ring-edamame-600 focus:border-edamame-500 dark:focus:border-edamame-600 text-gray-900 dark:text-white outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Client/applicant split toggle */}
            <div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div
                  onClick={() => { setSplitRoles(v => !v); if (splitRoles) { setApplicantId(''); setApplicantSearchTerm(''); } }}
                  className={`relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${splitRoles ? 'bg-edamame-500' : 'bg-gray-300 dark:bg-slate-600'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${splitRoles ? 'translate-x-4' : ''}`} />
                </div>
                <span className="text-[12.5px] font-medium text-gray-600 dark:text-slate-300">
                  Client and applicant are different people
                </span>
              </label>
              {splitRoles && (
                <p className="mt-1 ml-[46px] text-[11px] text-gray-400 dark:text-slate-500">
                  Client = the engaging/paying party. Applicant = the person named on the visa.
                </p>
              )}
            </div>

            {/* Applicant picker (when roles split) */}
            {splitRoles && (
              <div className="relative focus-ring rounded-lg">
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">Applicant (visa applicant)</label>
                <div className="relative" onClick={() => setIsApplicantDropdownOpen(true)}>
                  <User className="absolute left-3 top-2.5 text-gray-400 dark:text-slate-500" size={17} />
                  <input
                    type="text"
                    value={applicantSearchTerm}
                    onChange={(e) => {
                      setApplicantSearchTerm(e.target.value);
                      setIsApplicantDropdownOpen(true);
                      if (applicantId && e.target.value !== clients.find(c => c.id === applicantId)?.name) {
                        setApplicantId('');
                      }
                    }}
                    onFocus={() => setIsApplicantDropdownOpen(true)}
                    className="w-full pl-9 pr-9 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-[13px] focus:ring-2 focus:ring-edamame-500 dark:focus:ring-edamame-600 focus:border-edamame-500 dark:focus:border-edamame-600 text-gray-900 dark:text-white outline-none"
                    placeholder="Search applicant…"
                  />
                  <ChevronDown className="absolute right-3 top-3 text-gray-400 dark:text-slate-500 pointer-events-none" size={15} />
                </div>
                {isApplicantDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsApplicantDropdownOpen(false)} />
                    <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredApplicants.length === 0 ? (
                        <div className="p-3 text-[13px] text-gray-500 dark:text-slate-500 italic">No clients found.</div>
                      ) : (
                        filteredApplicants.map(c => (
                          <div
                            key={c.id}
                            onClick={() => handleSelectApplicant(c)}
                            className="p-3 hover:bg-edamame-50 dark:hover:bg-slate-700 cursor-pointer border-b border-gray-100 dark:border-slate-700 last:border-0"
                          >
                            <div className="font-medium text-[13px] text-gray-900 dark:text-white">{c.name}</div>
                            <div className="flex gap-2 text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                              <span>DOB: {c.dob || 'N/A'}</span>
                              <span>•</span>
                              <span>{c.phone || c.email || 'No Contact Info'}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="focus-ring rounded-lg">
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">Workflow Template</label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-[13px] focus:ring-2 focus:ring-edamame-500 dark:focus:ring-edamame-600 focus:border-edamame-500 dark:focus:border-edamame-600 text-gray-900 dark:text-white outline-none"
              >
                <option value="">— Choose a workflow —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              {/* Steps preview */}
              {selectedTemplate?.steps && selectedTemplate.steps.length > 0 && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setStepsExpanded(v => !v)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 hover:text-edamame-600 dark:hover:text-edamame-400 transition-colors"
                  >
                    <List size={13} />
                    This template includes {selectedTemplate.steps.length} steps
                    {stepsExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  {stepsExpanded && (
                    <ol className="mt-2 space-y-1 pl-1">
                      {selectedTemplate.steps.map((s, i) => (
                        <li key={i} className="flex gap-2 text-[11px] text-gray-600 dark:text-slate-400">
                          <span className="flex-shrink-0 font-bold text-gray-400 dark:text-slate-500 w-4">{i + 1}.</span>
                          <div>
                            <span className="font-semibold text-gray-700 dark:text-slate-300">{s.title}</span>
                            {s.description && <span className="text-gray-400 dark:text-slate-500"> — {s.description}</span>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">
                  Case Notes
                </label>
                <span className="text-[10.5px] text-gray-400 dark:text-slate-500">
                  {templateId
                    ? 'Placeholder shows what to include for this visa type'
                    : 'Select a template to see guided prompts'}
                </span>
              </div>

              {guidedChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {guidedChips.map((chip, i) => (
                    <span
                      key={i}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-edamame-50 dark:bg-edamame-900/20 text-edamame-700 dark:text-edamame-400 border border-edamame-200 dark:border-edamame-800/50"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              )}

              <div className="focus-ring rounded-lg">
                <textarea
                  rows={8}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-edamame-500 dark:focus:ring-edamame-600 focus:border-edamame-500 dark:focus:border-edamame-600 text-gray-900 dark:text-white outline-none transition-all resize-y text-[13px] leading-relaxed"
                  placeholder={getDescriptionPlaceholder(selectedTemplate)}
                />
              </div>
            </div>

            {errorMessage && (
              <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-[13px]">
                {errorMessage}
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleAnalyze}
                disabled={!canGenerate}
                className={`btn-press flex items-center gap-2 bg-edamame-500 hover:bg-edamame-700 text-white px-5 py-2.5 rounded-lg text-[13.5px] font-bold transition-all shadow-sm ${!canGenerate ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Analyzing Workflow…
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Generate Plan with AI
                  </>
                )}
              </button>
            </div>

          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* PHASE 2 — Generating                                             */}
        {/* ---------------------------------------------------------------- */}
        {step === 'generating' && (
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="w-[34px] h-[34px] rounded-[10px] bg-edamame-50 dark:bg-edamame-900/20 flex items-center justify-center text-edamame-600 dark:text-edamame-400 flex-shrink-0">
                <Sparkles className="animate-spin" size={18} />
              </div>
              <div>
                <div className="text-[14.5px] font-bold tracking-tight text-gray-900 dark:text-white">Drafting your task plan…</div>
                <div className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
                  {selectedTemplate?.title} · {selectedClient?.name} ·{' '}
                  {generatedTasks.length > 0
                    ? `task ${revealedTasks.length} of ${generatedTasks.length}`
                    : 'analyzing case details…'}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 mt-5">
              {revealedTasks.map((task, idx) => (
                <div
                  key={idx}
                  className="row-stream-in flex items-center gap-3 px-3.5 py-2.5 border border-gray-100 dark:border-slate-800 rounded-[10px] bg-gray-50 dark:bg-slate-800/50"
                >
                  <span className="w-5 h-5 rounded-md bg-edamame-100 dark:bg-edamame-900/30 text-edamame-700 dark:text-edamame-400 text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white truncate">{task.title}</span>
                  <span className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 flex-shrink-0">
                    {task.date ? format(new Date(task.date), 'MMM d') : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* PHASE 3 — Review                                                 */}
        {/* ---------------------------------------------------------------- */}
        {step === 'review' && (
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2.5">
              <Sparkles className="text-edamame-600 dark:text-edamame-400 flex-shrink-0" size={18} />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-bold tracking-tight text-gray-900 dark:text-white">Review generated plan</div>
                <div className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5 truncate">
                  {selectedTemplate?.title} · {selectedClient?.name} · edit or remove tasks before saving
                </div>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-edamame-50 dark:bg-edamame-900/20 text-edamame-700 dark:text-edamame-400 flex-shrink-0">
                {generatedTasks.length} tasks
              </span>
            </div>

            <div className="flex flex-col gap-2 mt-4">
              {generatedTasks.map((task, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3.5 border border-gray-200 dark:border-slate-800 rounded-[10px] hover:border-edamame-300 dark:hover:border-edamame-700 transition-colors"
                >
                  <span className="w-5 h-5 mt-0.5 rounded-md bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={task.title}
                      onChange={(e) => updateGeneratedTask(idx, 'title', e.target.value)}
                      className="w-full text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white border-none bg-transparent p-0 focus:ring-0 placeholder-gray-400"
                      placeholder="Task Title"
                    />
                    <input
                      type="text"
                      value={(task.description || '').split(/(?<=[.!?])\s/)[0] || ''}
                      onChange={(e) => updateGeneratedTask(idx, 'description', e.target.value)}
                      className="w-full text-[11px] text-gray-500 dark:text-slate-400 border-none bg-transparent p-0 mt-0.5 focus:ring-0 placeholder-gray-300 dark:placeholder-slate-600"
                      placeholder="Description"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input
                      type="date"
                      value={task.date}
                      onChange={(e) => updateGeneratedTask(idx, 'date', e.target.value)}
                      className="text-[11px] font-semibold px-2 py-1 rounded-md bg-gray-100 dark:bg-slate-800 border-none text-gray-600 dark:text-slate-300 focus:ring-2 focus:ring-edamame-500"
                    />
                    <button
                      onClick={() => removeGeneratedTask(idx)}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 dark:text-slate-500 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                      aria-label="Remove task"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-5">
              <button
                onClick={handleAnalyze}
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 text-[12.5px] font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                ↺ Regenerate
              </button>
              <button
                onClick={handleConfirm}
                className="btn-press flex items-center gap-2 px-5 py-2.5 rounded-lg bg-edamame-500 hover:bg-edamame-700 text-white text-[13.5px] font-bold transition-colors shadow-sm"
              >
                <Save size={16} />
                Save case
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
