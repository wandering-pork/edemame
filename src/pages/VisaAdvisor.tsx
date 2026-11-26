import React, { useState, useMemo } from 'react';
import { normalizeCountry } from '../lib/countries';
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
import { OpenCasePanel, OpenCasePanelResult } from '../components/visa-advisor/OpenCasePanel';
import type { OpenCaseParams, OpenCaseOutcome, OpenCaseStage } from '../lib/openCaseFromAdvisor';
import { PathwayCard } from '../components/visa-advisor/PathwayCard';
import { EligibilityWizardFields, isWizardStepValid, purposeLabels, type WizardStep } from '../components/visa-advisor/EligibilityWizardFields';
import { verdictColors, verdictLabels, verdictRank, verdictIcon } from '../components/visa-advisor/verdictStyles';
import { buildEligibilitySummary } from '../lib/eligibilitySummary';
import { aiErrorMessage, throwForAiResponse } from '../lib/aiErrors';
import { authJsonHeaders } from '../lib/authHeaders';
import { buildEligibilityRequest } from '../lib/eligibilityRequest';

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

interface VisaAdvisorProps {
  clients: Client[];
  templates: WorkflowTemplate[];
  cases: Case[];
  onOpenNewCase: (params: OpenCaseParams) => Promise<OpenCaseOutcome>;
  onEligibilityChecked?: (usage: EligibilityUsage) => void;
}

const stepLabels = ['Prospect', 'Intent', 'Background'];
const stepHeadings = ['Who are we assessing?', 'What do they want?', 'What are they bringing?'];
const stepSubheadings = [
  'Enough to establish age and citizenship',
  'Purpose drives which pathways are even relevant',
  'English, qualifications and any final considerations',
];

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
      // A client's stored nationality may be a passport code ("IND") or demonym ("Indian"); show it as the country.
      nationality: normalizeCountry(prefilledClient?.nationality),
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

  const isStep1Valid = isWizardStepValid(
    {
      clientInfo: wizardState.clientInfo,
      goals: wizardState.goals,
      details: wizardState.details,
      supportingFactors: wizardState.supportingFactors,
    },
    1,
  );

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
      // Age instead of date of birth, and no name: the AI doesn't need either (VA.0). The full
      // answers are still saved locally in the assessment's `inputs` below.
      const response = await fetch('/api/check-eligibility', {
        method: 'POST',
        headers: await authJsonHeaders(),
        body: JSON.stringify(buildEligibilityRequest({
          clientInfo: wizardState.clientInfo,
          goals: wizardState.goals,
          details: wizardState.details,
          supportingFactors: wizardState.supportingFactors,
        })),
      });

      if (!response.ok) await throwForAiResponse(response, 'Failed to check eligibility');
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
      toast.error(aiErrorMessage(error, 'Could not assess eligibility. Please try again.'));
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
        visaSubstream: result.visaSubstream,
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

              <EligibilityWizardFields
                step={wizardState.currentStep as WizardStep}
                value={{
                  clientInfo: wizardState.clientInfo,
                  goals: wizardState.goals,
                  details: wizardState.details,
                  supportingFactors: wizardState.supportingFactors,
                }}
                onChange={(next) =>
                  setWizardState((prev) => ({
                    ...prev,
                    clientInfo: next.clientInfo,
                    goals: next.goals as WizardState['goals'],
                    details: next.details,
                    supportingFactors: next.supportingFactors,
                  }))
                }
              />
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
