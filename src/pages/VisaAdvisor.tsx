import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { Client, WorkflowTemplate, Case, EligibilityAssessment, EligibilityAssessmentOption } from '../types';
import { useRepositories } from '../contexts/RepositoryContext';
import {
  ChevronRight,
  ChevronLeft,
  Loader2,
  HelpCircle,
  ArrowRight,
  Check,
  Sparkles,
} from 'lucide-react';
import {
  OpenCasePanel,
  OpenCaseClientChoice,
  OpenCasePanelResult,
  OpenCaseStage,
} from '../components/visa-advisor/OpenCasePanel';
import { PathwayCard } from '../components/visa-advisor/PathwayCard';
import { verdictColors, verdictLabels, verdictRank, verdictIcon } from '../components/visa-advisor/verdictStyles';
import { buildEligibilitySummary } from '../lib/eligibilitySummary';

export type { OpenCaseStage, OpenCaseClientChoice };

interface WizardState {
  step: 'input' | 'report';
  currentStep: number; // 1-3
  clientInfo: {
    fullName: string;
    dob: string;
    nationality: string;
    inAustralia: boolean;
    currentVisaStatus: string;
  };
  goals: {
    primaryPurpose: 'work' | 'study' | 'family' | 'pr' | 'visit' | '';
    intendedDuration: string;
  };
  details: Record<string, any>;
  supportingFactors: {
    englishProficiency: string;
    healthConcerns: boolean;
    criminalHistory: boolean;
  };
}

// Structurally identical to EligibilityAssessmentOption (types.ts) — aliased
// here since the wizard/report code predates that shared type.
type VisaOption = EligibilityAssessmentOption;

interface EligibilityReport {
  visaOptions: VisaOption[];
  summary: string;
  primaryRecommendation: string;
  suggestedTemplateKeyword: string;
}

interface EligibilityUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

// Everything the confirmation panel decided, executed exactly as confirmed —
// no re-resolution of the client happens once this reaches the caller. Stage
// order reflects the actual sequence handleOpenNewCase runs in: the AI task
// plan (if requested) is drafted first (so nothing has to be rolled back if it
// fails), then the client is resolved/created, then the case itself is saved.
export interface OpenCaseParams {
  client: OpenCaseClientChoice;
  /** Workflow template id to use, or `null` for "No template (general case)". */
  templateId: string | null;
  title: string;
  /** When false, the 'plan' stage is skipped entirely and no tasks are generated. */
  generateTasks: boolean;
  visaSubclass: string;
  visaName: string;
  caseDescription: string;
  /** When true, App.tsx creates one fixed (non-AI) task per entry in `gaps`. */
  gapTasks: boolean;
  /** The selected pathway's gaps — used both to build gap tasks and to tell
   *  AI task generation not to duplicate them (see `excludeItems`). */
  gaps: string[];
  onProgress: (stage: OpenCaseStage) => void;
}

/** Result of a successful case creation, so the caller can link the saved assessment to it. */
export interface OpenCaseOutcome {
  caseId: string;
  clientId: string;
}

interface VisaAdvisorProps {
  clients: Client[];
  templates: WorkflowTemplate[];
  cases: Case[];
  onOpenNewCase: (params: OpenCaseParams) => Promise<OpenCaseOutcome>;
  onEligibilityChecked?: (usage: EligibilityUsage) => void;
}

const purposeLabels: Record<string, string> = {
  work: 'Work / Employment',
  study: 'Study',
  family: 'Family Reunification',
  pr: 'Permanent Residence',
  visit: 'Visit / Tourism',
};

const stepLabels = ['Prospect', 'Intent', 'Background'];
const stepHeadings = ['Who are we assessing?', 'What do they want?', 'What are they bringing?'];
const stepSubheadings = [
  'Enough to establish age and citizenship',
  'Purpose drives which pathways are even relevant',
  'English, qualifications and any final considerations',
];

// Shared chip styling for single-select pill groups (brand fill when active).
const chipClass = (active: boolean) =>
  `px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all btn-press ${
    active
      ? 'bg-edamame-500 border-edamame-500 text-white'
      : 'bg-paper-2 dark:bg-plate-card border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft hover:border-edamame-400 dark:hover:border-edamame-500'
  }`;

const inputClass =
  'w-full px-3.5 py-2.5 border border-ink/15 dark:border-plate-ink/20 rounded-lg bg-paper-2 dark:bg-plate-card/60 text-[13.5px] text-ink dark:text-plate-ink outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all';

const labelClass =
  'block text-[10px] font-bold uppercase tracking-[0.11em] text-ink-soft dark:text-plate-ink-soft mb-2';

export const VisaAdvisor: React.FC<VisaAdvisorProps> = ({
  clients,
  templates,
  cases,
  onOpenNewCase,
  onEligibilityChecked,
}) => {
  const repos = useRepositories();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get('clientId');
  const prefilledClient = clientId
    ? clients.find((c) => c.id === clientId)
    : undefined;

  const [wizardState, setWizardState] = useState<WizardState>(() => ({
    step: 'input',
    currentStep: 1,
    clientInfo: {
      fullName: prefilledClient?.name || '',
      dob: prefilledClient?.dob || '',
      nationality: prefilledClient?.nationality || '',
      inAustralia: false,
      currentVisaStatus: '',
    },
    goals: {
      primaryPurpose: '',
      intendedDuration: '',
    },
    details: {},
    supportingFactors: {
      englishProficiency: '',
      healthConcerns: false,
      criminalHistory: false,
    },
  }));

  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<EligibilityReport | null>(null);
  const [showAllPathways, setShowAllPathways] = useState(false);
  const [openingCaseSubclass, setOpeningCaseSubclass] = useState<string | null>(null);
  const [openingCaseStage, setOpeningCaseStage] = useState<OpenCaseStage>('client');
  // The pathway a user clicked "Open Case" on, pending confirmation in the panel.
  // `null` while no panel is open — separate from `openingCaseSubclass`, which
  // only becomes non-null once the user actually confirms and creation starts.
  const [pendingVisa, setPendingVisa] = useState<VisaOption | null>(null);
  // The persisted EligibilityAssessment for the current report — created as
  // soon as the report comes back (whether or not a case is ever opened from
  // it), then updated with caseId/clientId/selectedSubclass once one is.
  const [assessment, setAssessment] = useState<EligibilityAssessment | null>(null);

  const sortedOptions = useMemo(() => {
    if (!report) return [];
    return [...report.visaOptions].sort(
      (a, b) => (verdictRank[b.verdict] ?? -1) - (verdictRank[a.verdict] ?? -1)
    );
  }, [report]);

  const isStep1Valid = wizardState.clientInfo.fullName.trim().length > 0;

  const handleNext = () => {
    if (wizardState.currentStep === 1 && !isStep1Valid) return;
    if (wizardState.currentStep < 3) {
      setWizardState((prev) => ({
        ...prev,
        currentStep: prev.currentStep + 1,
      }));
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (wizardState.currentStep > 1) {
      setWizardState((prev) => ({
        ...prev,
        currentStep: prev.currentStep - 1,
      }));
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/check-eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientInfo: wizardState.clientInfo,
          goals: wizardState.goals,
          details: wizardState.details,
          supportingFactors: wizardState.supportingFactors,
        }),
      });

      if (!response.ok) throw new Error('Failed to check eligibility');
      const data: { result: EligibilityReport; usage: EligibilityUsage | null } = await response.json();
      setReport(data.result);
      setShowAllPathways(false);
      setWizardState((prev) => ({ ...prev, step: 'report' }));
      if (data.usage) onEligibilityChecked?.(data.usage);

      // Save the assessment as soon as the report comes back, whether or not
      // a case is ever opened from it — a failure here shouldn't block the
      // report from showing, so it's logged rather than surfaced as a toast.
      const newAssessment: EligibilityAssessment = {
        id: uuidv4(),
        clientId: prefilledClient?.id,
        createdAt: new Date().toISOString(),
        inputs: {
          clientInfo: wizardState.clientInfo,
          goals: wizardState.goals,
          details: wizardState.details,
          supportingFactors: wizardState.supportingFactors,
        },
        options: data.result.visaOptions,
      };
      try {
        await repos.eligibility.create(newAssessment);
        setAssessment(newAssessment);
      } catch (saveError) {
        console.error('Failed to save eligibility assessment:', saveError);
      }
    } catch (error) {
      toast.error('Could not assess eligibility. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartOver = () => {
    setReport(null);
    setShowAllPathways(false);
    setAssessment(null);
    setWizardState((prev) => ({
      ...prev,
      step: 'input',
      currentStep: 1,
    }));
  };

  // Clicking "Open Case" just opens the confirmation panel — nothing is
  // created until the user reviews and confirms in handleConfirmOpenCase.
  const handleOpenCase = (visa: VisaOption) => {
    setPendingVisa(visa);
  };

  const handleConfirmOpenCase = async (result: OpenCasePanelResult) => {
    if (!pendingVisa) return;
    const visa = pendingVisa;
    setOpeningCaseSubclass(visa.visaSubclass);
    setOpeningCaseStage(result.generateTasks ? 'plan' : 'client');
    try {
      const outcome = await onOpenNewCase({
        client: result.client,
        templateId: result.templateId,
        title: result.title,
        generateTasks: result.generateTasks,
        visaSubclass: visa.visaSubclass,
        visaName: visa.visaName,
        caseDescription: buildEligibilitySummary(
          visa,
          wizardState.goals.primaryPurpose ? purposeLabels[wizardState.goals.primaryPurpose] : undefined
        ),
        gapTasks: result.gapTasks,
        gaps: visa.gaps,
        onProgress: setOpeningCaseStage,
      });
      // On success the parent navigates away — no need to reset the "opening"
      // state here, and doing so would flash the idle button for a frame
      // before unmount. Link the saved assessment to the case that was just
      // opened from it, though — that's local state only the parent doesn't have.
      if (assessment) {
        const updated: EligibilityAssessment = {
          ...assessment,
          caseId: outcome.caseId,
          clientId: outcome.clientId,
          selectedSubclass: visa.visaSubclass,
        };
        try {
          await repos.eligibility.update(updated);
          setAssessment(updated);
        } catch (linkError) {
          console.error('Failed to link the eligibility assessment to the new case:', linkError);
        }
      }
    } catch (error) {
      // Keep the panel open with the user's choices intact so they can retry
      // without re-entering everything.
      toast.error('Could not create the case. Please try again.');
      setOpeningCaseSubclass(null);
    }
  };

  const first = wizardState.clientInfo.fullName ? wizardState.clientInfo.fullName.split(' ')[0] : null;
  const best = sortedOptions[0];
  const second = sortedOptions[1];
  const top3 = sortedOptions.slice(0, 3);
  const rest = sortedOptions.slice(3);
  const viableCount = sortedOptions.filter(
    (v) => v.verdict === 'qualifies' || v.verdict === 'possibly_qualifies'
  ).length;

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-paper-2 dark:bg-plate-card min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-[860px] mx-auto">
        {/* Input stage */}
        {wizardState.step === 'input' && (
          <>
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-[26px] md:text-[27px] font-extrabold tracking-tight text-ink dark:text-plate-ink">
                Visa Eligibility Advisor
              </h1>
              <p className="text-[13px] text-ink-soft dark:text-plate-ink-soft mt-1">
                Three steps, then a report you can walk a client through
              </p>
            </div>

            {/* Visual progress indicator */}
            <div className="mb-8 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-3">
                  {[1, 2, 3].map(step => (
                    <div key={step} className="relative flex flex-col items-center">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-[13px] transition-all ${
                          step < wizardState.currentStep
                            ? 'bg-edamame-500 text-white'
                            : step === wizardState.currentStep
                            ? 'bg-edamame-500/15 border-2 border-edamame-500 text-edamame-600 dark:text-edamame-400'
                            : 'bg-paper-2 dark:bg-plate-card text-ink-faint dark:text-plate-ink-faint'
                        }`}
                      >
                        {step < wizardState.currentStep ? <Check size={16} /> : step}
                      </div>
                      <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-soft dark:text-plate-ink-soft mt-2 whitespace-nowrap">
                        {stepLabels[step - 1]}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold text-ink dark:text-plate-ink">
                    Step {wizardState.currentStep} of 3
                  </p>
                  <p className="text-[11px] text-ink-soft dark:text-plate-ink-soft mt-0.5">
                    {Math.round((wizardState.currentStep / 3) * 100)}% complete
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-paper-2 dark:bg-plate-card rounded-full overflow-hidden">
                <div
                  className="progress-fill h-full bg-edamame-500 rounded-full"
                  style={{ width: `${(wizardState.currentStep / 3) * 100}%` }}
                />
              </div>
            </div>

            {/* Form card */}
            <div className="bg-paper-2 dark:bg-plate-card rounded-xl shadow-sm border border-ink/15 dark:border-plate-ink/20 overflow-hidden">
              <div className="p-6">
              {/* Step label */}
              <div className="mb-6">
                <h2 className="text-base font-bold text-ink dark:text-plate-ink">
                  {stepHeadings[wizardState.currentStep - 1]}
                </h2>
                <p className="text-[12.5px] text-ink-soft dark:text-plate-ink-soft mt-1">
                  {stepSubheadings[wizardState.currentStep - 1]}
                </p>
              </div>

              {/* Step 1: Who are we assessing? */}
              {wizardState.currentStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Full Name</label>
                    <input
                      type="text"
                      value={wizardState.clientInfo.fullName}
                      onChange={(e) =>
                        setWizardState((prev) => ({
                          ...prev,
                          clientInfo: { ...prev.clientInfo, fullName: e.target.value },
                        }))
                      }
                      className={inputClass}
                      placeholder="e.g. John Doe"
                    />
                    {!isStep1Valid && (
                      <p className="text-[11px] text-red-500 dark:text-red-400 mt-1.5">
                        A name is required to continue.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Date of Birth</label>
                    <input
                      type="date"
                      value={wizardState.clientInfo.dob}
                      onChange={(e) =>
                        setWizardState((prev) => ({
                          ...prev,
                          clientInfo: { ...prev.clientInfo, dob: e.target.value },
                        }))
                      }
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Country of Citizenship</label>
                    <input
                      type="text"
                      value={wizardState.clientInfo.nationality}
                      onChange={(e) =>
                        setWizardState((prev) => ({
                          ...prev,
                          clientInfo: { ...prev.clientInfo, nationality: e.target.value },
                        }))
                      }
                      className={inputClass}
                      placeholder="e.g. Indian, British"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Currently in Australia?</label>
                    <div className="flex flex-wrap gap-2">
                      {['Yes', 'No'].map((opt) => (
                        <button
                          key={opt}
                          onClick={() =>
                            setWizardState((prev) => ({
                              ...prev,
                              clientInfo: {
                                ...prev.clientInfo,
                                inAustralia: opt === 'Yes',
                              },
                            }))
                          }
                          className={chipClass(
                            (opt === 'Yes' && wizardState.clientInfo.inAustralia) ||
                              (opt === 'No' && !wizardState.clientInfo.inAustralia)
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {wizardState.clientInfo.inAustralia && (
                    <div>
                      <label className={labelClass}>Current Visa/Status in Australia</label>
                      <select
                        value={wizardState.clientInfo.currentVisaStatus}
                        onChange={(e) =>
                          setWizardState((prev) => ({
                            ...prev,
                            clientInfo: {
                              ...prev.clientInfo,
                              currentVisaStatus: e.target.value,
                            },
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="">-- Select --</option>
                        <option value="tourist">Tourist/Visitor Visa</option>
                        <option value="student">Student Visa</option>
                        <option value="work">Work Visa</option>
                        <option value="pr">Permanent Resident</option>
                        <option value="citizen">Australian Citizen</option>
                        <option value="overstay">Overstaying</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: What do they want? (purpose + duration + purpose-specific details) */}
              {wizardState.currentStep === 2 && (
                <div className="space-y-5">
                  <div>
                    <label className={labelClass}>Primary Purpose</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { val: 'work', label: 'Work / Employment' },
                        { val: 'study', label: 'Study' },
                        { val: 'family', label: 'Family Reunification' },
                        { val: 'pr', label: 'Permanent Residence' },
                        { val: 'visit', label: 'Visit / Tourism' },
                      ].map(({ val, label }) => (
                        <button
                          key={val}
                          onClick={() =>
                            setWizardState((prev) => ({
                              ...prev,
                              goals: { ...prev.goals, primaryPurpose: val as any },
                              details: {}, // Reset conditional details
                            }))
                          }
                          className={chipClass(wizardState.goals.primaryPurpose === val)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Intended Duration of Stay</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { val: 'short', label: '< 3 months' },
                        { val: 'medium', label: '3–12 months' },
                        { val: 'years', label: '1–4 years' },
                        { val: 'permanent', label: 'Permanently' },
                      ].map(({ val, label }) => (
                        <button
                          key={val}
                          onClick={() =>
                            setWizardState((prev) => ({
                              ...prev,
                              goals: { ...prev.goals, intendedDuration: val },
                            }))
                          }
                          className={chipClass(wizardState.goals.intendedDuration === val)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {wizardState.goals.primaryPurpose && (
                    <div className="pt-1 border-t border-ink/10 dark:border-plate-ink/15/60 space-y-4">
                      <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-soft dark:text-plate-ink-soft pt-4">
                        Specifics for this pathway
                      </p>

                      {wizardState.goals.primaryPurpose === 'work' && (
                        <>
                          <div>
                            <label className={labelClass}>Occupation</label>
                            <input
                              type="text"
                              value={wizardState.details.occupation || ''}
                              onChange={(e) =>
                                setWizardState((prev) => ({
                                  ...prev,
                                  details: { ...prev.details, occupation: e.target.value },
                                }))
                              }
                              placeholder="e.g. Software Engineer"
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Years of Experience</label>
                            <input
                              type="number"
                              value={wizardState.details.yearsExperience || ''}
                              onChange={(e) =>
                                setWizardState((prev) => ({
                                  ...prev,
                                  details: {
                                    ...prev.details,
                                    yearsExperience: parseInt(e.target.value) || 0,
                                  },
                                }))
                              }
                              min="0"
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-soft dark:text-plate-ink-soft cursor-pointer">
                              <input
                                type="checkbox"
                                checked={wizardState.details.skillsAssessment || false}
                                onChange={(e) =>
                                  setWizardState((prev) => ({
                                    ...prev,
                                    details: {
                                      ...prev.details,
                                      skillsAssessment: e.target.checked,
                                    },
                                  }))
                                }
                                className="w-4 h-4 rounded accent-edamame-500"
                              />
                              Skills assessment completed?
                            </label>
                          </div>
                        </>
                      )}

                      {wizardState.goals.primaryPurpose === 'study' && (
                        <>
                          <div>
                            <label className={labelClass}>Course Level</label>
                            <select
                              value={wizardState.details.courseLevel || ''}
                              onChange={(e) =>
                                setWizardState((prev) => ({
                                  ...prev,
                                  details: { ...prev.details, courseLevel: e.target.value },
                                }))
                              }
                              className={inputClass}
                            >
                              <option value="">-- Select --</option>
                              <option value="secondary">Secondary/Foundation</option>
                              <option value="vocation">Vocational (VET)</option>
                              <option value="bachelor">Bachelor Degree</option>
                              <option value="master">Master Degree</option>
                              <option value="phd">PhD/Research</option>
                            </select>
                          </div>
                          <div>
                            <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-soft dark:text-plate-ink-soft cursor-pointer">
                              <input
                                type="checkbox"
                                checked={wizardState.details.financialSupport || false}
                                onChange={(e) =>
                                  setWizardState((prev) => ({
                                    ...prev,
                                    details: {
                                      ...prev.details,
                                      financialSupport: e.target.checked,
                                    },
                                  }))
                                }
                                className="w-4 h-4 rounded accent-edamame-500"
                              />
                              Financial support confirmed?
                            </label>
                          </div>
                        </>
                      )}

                      {wizardState.goals.primaryPurpose === 'family' && (
                        <>
                          <div>
                            <label className={labelClass}>Relationship Type</label>
                            <select
                              value={wizardState.details.relationshipType || ''}
                              onChange={(e) =>
                                setWizardState((prev) => ({
                                  ...prev,
                                  details: { ...prev.details, relationshipType: e.target.value },
                                }))
                              }
                              className={inputClass}
                            >
                              <option value="">-- Select --</option>
                              <option value="spouse">Spouse / Partner</option>
                              <option value="child">Dependent Child</option>
                              <option value="parent">Parent</option>
                              <option value="sibling">Sibling</option>
                              <option value="other">Other Family Member</option>
                            </select>
                          </div>
                          <div>
                            <label className={labelClass}>Sponsor's AU Status</label>
                            <select
                              value={wizardState.details.sponsorStatus || ''}
                              onChange={(e) =>
                                setWizardState((prev) => ({
                                  ...prev,
                                  details: { ...prev.details, sponsorStatus: e.target.value },
                                }))
                              }
                              className={inputClass}
                            >
                              <option value="">-- Select --</option>
                              <option value="citizen">Australian Citizen</option>
                              <option value="pr">Permanent Resident</option>
                              <option value="none">None / Not Available</option>
                            </select>
                          </div>
                        </>
                      )}

                      {wizardState.goals.primaryPurpose === 'pr' && (
                        <>
                          <div>
                            <label className={labelClass}>Self-Assessed Points Score</label>
                            <select
                              value={wizardState.details.pointsScore || ''}
                              onChange={(e) =>
                                setWizardState((prev) => ({
                                  ...prev,
                                  details: { ...prev.details, pointsScore: e.target.value },
                                }))
                              }
                              className={inputClass}
                            >
                              <option value="">-- Select --</option>
                              <option value="under65">Under 65 points</option>
                              <option value="65-79">65–79 points</option>
                              <option value="80-95">80–95 points</option>
                              <option value="95plus">95+ points</option>
                            </select>
                          </div>
                          <div>
                            <label className={labelClass}>Preferred State</label>
                            <input
                              type="text"
                              value={wizardState.details.statePreference || ''}
                              onChange={(e) =>
                                setWizardState((prev) => ({
                                  ...prev,
                                  details: { ...prev.details, statePreference: e.target.value },
                                }))
                              }
                              placeholder="e.g. NSW, VIC"
                              className={inputClass}
                            />
                          </div>
                        </>
                      )}

                      {wizardState.goals.primaryPurpose === 'visit' && (
                        <>
                          <div>
                            <label className={labelClass}>Trip Duration</label>
                            <input
                              type="text"
                              value={wizardState.details.tripDuration || ''}
                              onChange={(e) =>
                                setWizardState((prev) => ({
                                  ...prev,
                                  details: { ...prev.details, tripDuration: e.target.value },
                                }))
                              }
                              placeholder="e.g. 2 weeks, 3 months"
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-soft dark:text-plate-ink-soft cursor-pointer">
                              <input
                                type="checkbox"
                                checked={wizardState.details.strongTies || false}
                                onChange={(e) =>
                                  setWizardState((prev) => ({
                                    ...prev,
                                    details: {
                                      ...prev.details,
                                      strongTies: e.target.checked,
                                    },
                                  }))
                                }
                                className="w-4 h-4 rounded accent-edamame-500"
                              />
                              Strong ties to home country (property, job, family)?
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: What are they bringing? */}
              {wizardState.currentStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>English Proficiency</label>
                    <select
                      value={wizardState.supportingFactors.englishProficiency}
                      onChange={(e) =>
                        setWizardState((prev) => ({
                          ...prev,
                          supportingFactors: {
                            ...prev.supportingFactors,
                            englishProficiency: e.target.value,
                          },
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="">-- Select --</option>
                      <option value="none">No English proficiency</option>
                      <option value="basic">Basic (IELTS 5.0–5.5)</option>
                      <option value="intermediate">Intermediate (IELTS 6.0–6.5)</option>
                      <option value="proficient">Proficient (IELTS 7.0–8.0)</option>
                      <option value="fluent">Fluent (IELTS 8.5+) / Native</option>
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-soft dark:text-plate-ink-soft cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wizardState.supportingFactors.healthConcerns}
                        onChange={(e) =>
                          setWizardState((prev) => ({
                            ...prev,
                            supportingFactors: {
                              ...prev.supportingFactors,
                              healthConcerns: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 rounded accent-edamame-500"
                      />
                      Any significant health conditions requiring medical clearance?
                    </label>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-soft dark:text-plate-ink-soft cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wizardState.supportingFactors.criminalHistory}
                        onChange={(e) =>
                          setWizardState((prev) => ({
                            ...prev,
                            supportingFactors: {
                              ...prev.supportingFactors,
                              criminalHistory: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 rounded accent-edamame-500"
                      />
                      Any criminal history or prior visa refusals?
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Footer with buttons */}
            <div className="px-6 py-4 bg-paper-2 dark:bg-plate-card/60 border-t border-ink/15 dark:border-plate-ink/20 flex justify-between gap-3">
              <button
                onClick={handleBack}
                disabled={wizardState.currentStep === 1}
                className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate-card rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors btn-press"
              >
                <ChevronLeft size={15} />
                Back
              </button>

              <button
                onClick={handleNext}
                disabled={isLoading || (wizardState.currentStep === 1 && !isStep1Valid)}
                className="flex items-center gap-2 px-5 py-2 text-[13.5px] font-bold text-white bg-edamame-500 hover:bg-edamame-600 rounded-lg disabled:bg-ink/20 dark:disabled:bg-plate-ink/20 disabled:cursor-not-allowed transition-all btn-press"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    {wizardState.currentStep === 3 ? (
                      <>
                        <Sparkles size={15} />
                        Get Assessment
                      </>
                    ) : (
                      <>
                        Continue
                        <ChevronRight size={15} />
                      </>
                    )}
                  </>
                )}
              </button>
            </div>
          </div>
          </>
        )}

        {/* Report stage */}
        {wizardState.step === 'report' && report && best && (
          <div className="space-y-8">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-[26px] md:text-[27px] font-extrabold tracking-tight text-ink dark:text-plate-ink">
                  Assessment for {wizardState.clientInfo.fullName || 'this prospect'}
                </h1>
                <p className="text-[13px] text-ink-soft dark:text-plate-ink-soft mt-1">
                  {viableCount} of {sortedOptions.length} pathways viable · assessed{' '}
                  {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <button
                onClick={handleStartOver}
                disabled={openingCaseSubclass !== null || pendingVisa !== null}
                title={openingCaseSubclass !== null ? 'A case is being created — hang tight' : undefined}
                className="px-4 py-2 text-[13px] font-semibold text-ink-soft dark:text-plate-ink-soft bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 hover:bg-paper-2 dark:hover:bg-plate-card rounded-lg transition-colors btn-press disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Start Over
              </button>
            </div>

            {/* Hero: recommended pathway */}
            {(() => {
              const colors = verdictColors[best.verdict] ?? verdictColors.needs_more_info;
              const HeroIcon = verdictIcon[best.verdict] ?? HelpCircle;
              const isQualified = best.verdict === 'qualifies' || best.verdict === 'possibly_qualifies';
              return (
                <div className={`rounded-xl border p-6 flex items-center gap-6 flex-wrap ${colors.cardBg} ${colors.cardBorder}`}>
                  <HeroIcon size={52} strokeWidth={1.5} className={`flex-shrink-0 ${colors.iconText}`} />
                  <div className="min-w-[240px] flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-soft dark:text-plate-ink-soft">
                        Recommended pathway
                      </span>
                      <span
                        className={`text-[10.5px] font-bold px-2.5 py-1 rounded-md whitespace-nowrap ${colors.badgeBg} ${colors.badgeText}`}
                      >
                        {verdictLabels[best.verdict]}
                      </span>
                    </div>
                    <h2 className="text-[20px] font-extrabold tracking-tight text-ink dark:text-plate-ink mt-1.5">
                      {best.visaName} visa — subclass {best.visaSubclass}
                    </h2>
                    <p className="text-[13.5px] leading-relaxed text-ink-soft dark:text-plate-ink-soft mt-1.5">
                      {best.reasons.slice(0, 2).join('. ')}
                      {best.reasons.length > 0 ? '.' : ''}
                    </p>
                  </div>
                  {isQualified && (
                    <div className="flex flex-col items-end gap-1.5">
                      {best.verdict === 'possibly_qualifies' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap bg-amber-100 dark:bg-amber-500/15 text-[#B45309] dark:text-amber-400">
                          Possible match
                        </span>
                      )}
                      <button
                        onClick={() => handleOpenCase(best)}
                        disabled={openingCaseSubclass !== null || pendingVisa !== null}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-edamame-500 hover:bg-edamame-600 text-white text-[13px] font-bold rounded-lg transition-colors btn-press whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed min-w-[172px]"
                      >
                        Open Case <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Client summary — plain language */}
            <div className="bg-paper-2 dark:bg-plate-card rounded-xl shadow-sm border border-ink/15 dark:border-plate-ink/20 p-6">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-soft dark:text-plate-ink-soft mb-3">
                Client summary — plain language
              </p>
              <div className="text-[13.5px] leading-relaxed text-ink-soft dark:text-plate-ink-soft space-y-3">
                <p>
                  Based on what you have told us, the strongest pathway for {first || 'the applicant'} is the{' '}
                  <strong className="text-ink dark:text-plate-ink">
                    {best.visaName} visa (subclass {best.visaSubclass})
                  </strong>
                  . {best.reasons[0] || ''}
                </p>
                {second && (
                  <p>
                    A second option worth keeping open is the{' '}
                    <strong className="text-ink dark:text-plate-ink">
                      {second.visaName} visa (subclass {second.visaSubclass})
                    </strong>
                    . {second.reasons[0] || ''}
                  </p>
                )}
                {best.gaps.length > 0 && (
                  <div>
                    <p className="mb-1.5">Before lodging, these need attention:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {best.gaps.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[12px] text-ink-soft dark:text-plate-ink-soft pt-1">
                  This summary is general information about visa pathways, not immigration advice. Eligibility is
                  assessed by the Department of Home Affairs at lodgement.
                </p>
              </div>
            </div>

            {/* Visa options */}
            <div>
              <h3 className="text-base font-bold text-ink dark:text-plate-ink mb-4">
                Visa Eligibility Breakdown
              </h3>
              <div className="flex flex-col gap-3">
                {(showAllPathways ? sortedOptions : top3).map((visa) => {
                  const isQualified = visa.verdict === 'qualifies' || visa.verdict === 'possibly_qualifies';
                  return (
                    <PathwayCard
                      key={visa.visaSubclass}
                      visa={visa}
                      action={
                        isQualified ? (
                          <>
                            {visa.verdict === 'possibly_qualifies' && (
                              <div className="flex justify-end mb-1.5">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap bg-amber-100 dark:bg-amber-500/15 text-[#B45309] dark:text-amber-400">
                                  Possible match
                                </span>
                              </div>
                            )}
                            <button
                              onClick={() => handleOpenCase(visa)}
                              disabled={openingCaseSubclass !== null || pendingVisa !== null}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-edamame-500 hover:bg-edamame-600 text-white text-[12.5px] font-bold rounded-lg transition-colors btn-press disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              Open Case <ArrowRight size={13} />
                            </button>
                          </>
                        ) : undefined
                      }
                    />
                  );
                })}
              </div>

              {rest.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllPathways((s) => !s)}
                  className="flex items-center gap-1.5 mt-4 text-[13px] font-semibold text-edamame-600 dark:text-edamame-400 hover:text-edamame-700 dark:hover:text-edamame-300"
                >
                  <ChevronRight
                    size={15}
                    className={`transition-transform ${showAllPathways ? 'rotate-90' : ''}`}
                  />
                  {showAllPathways ? 'Hide' : 'Show'} the other {rest.length} pathway{rest.length === 1 ? '' : 's'} assessed
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {pendingVisa && (
        <OpenCasePanel
          visaSubclass={pendingVisa.visaSubclass}
          visaName={pendingVisa.visaName}
          gaps={pendingVisa.gaps}
          clientInfo={wizardState.clientInfo}
          prefilledClientId={prefilledClient?.id}
          clients={clients}
          templates={templates}
          cases={cases}
          isSubmitting={openingCaseSubclass === pendingVisa.visaSubclass}
          stage={openingCaseStage}
          onConfirm={handleConfirmOpenCase}
          onCancel={() => setPendingVisa(null)}
        />
      )}
    </div>
  );
};
