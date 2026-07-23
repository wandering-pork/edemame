import React, { useState, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { format, parse } from 'date-fns';
import { Client, WorkflowTemplate } from '../types';
import {
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Check,
  Lock,
  Target,
  Sparkles,
} from 'lucide-react';

interface WizardState {
  step: 'input' | 'report';
  currentStep: number; // 1-4
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

interface EligibilityReport {
  visaOptions: Array<{
    visaSubclass: string;
    visaName: string;
    verdict: 'qualifies' | 'possibly_qualifies' | 'unlikely' | 'needs_more_info';
    reasons: string[];
    gaps: string[];
  }>;
  summary: string;
  primaryRecommendation: string;
  suggestedTemplateKeyword: string;
}

interface VisaAdvisorProps {
  clients: Client[];
  templates: WorkflowTemplate[];
  onOpenNewCase: (templateKeyword: string) => void;
}

// Verdict language per design spec: Strong match (green) / Possible (amber) / Unlikely (red),
// plus a neutral treatment for "needs more info" which has no equivalent in the prototype.
const verdictColors: Record<
  string,
  { cardBg: string; cardBorder: string; badgeBg: string; badgeText: string; titleText: string; bar: string }
> = {
  qualifies: {
    cardBg: 'bg-emerald-50/70 dark:bg-emerald-500/[0.06]',
    cardBorder: 'border-emerald-200 dark:border-emerald-800/60',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-500/15',
    badgeText: 'text-[#047857] dark:text-emerald-400',
    titleText: 'text-slate-900 dark:text-white',
    bar: 'bg-[#10B981]',
  },
  possibly_qualifies: {
    cardBg: 'bg-amber-50/70 dark:bg-amber-500/[0.06]',
    cardBorder: 'border-amber-200 dark:border-amber-800/60',
    badgeBg: 'bg-amber-100 dark:bg-amber-500/15',
    badgeText: 'text-[#B45309] dark:text-amber-400',
    titleText: 'text-slate-900 dark:text-white',
    bar: 'bg-[#F59E0B]',
  },
  unlikely: {
    cardBg: 'bg-red-50/70 dark:bg-red-500/[0.06]',
    cardBorder: 'border-red-200 dark:border-red-800/60',
    badgeBg: 'bg-red-100 dark:bg-red-500/15',
    badgeText: 'text-[#B91C1C] dark:text-red-400',
    titleText: 'text-slate-900 dark:text-white',
    bar: 'bg-[#EF4444]',
  },
  needs_more_info: {
    cardBg: 'bg-slate-50 dark:bg-slate-800/40',
    cardBorder: 'border-slate-200 dark:border-slate-700',
    badgeBg: 'bg-slate-100 dark:bg-slate-700/60',
    badgeText: 'text-slate-600 dark:text-slate-300',
    titleText: 'text-slate-900 dark:text-white',
    bar: 'bg-slate-400',
  },
};

const verdictLabels: Record<string, string> = {
  qualifies: 'Strong match',
  possibly_qualifies: 'Possible',
  unlikely: 'Unlikely',
  needs_more_info: 'Needs more info',
};

// Only used to render a match-strength bar when we can infer one from the verdict
// (the API doesn't return a numeric score, so this is a coarse visual proxy, not a real %).
const verdictBarWidth: Record<string, string> = {
  qualifies: '88%',
  possibly_qualifies: '60%',
  unlikely: '25%',
  needs_more_info: '0%',
};

const stepLabels = ['Personal', 'Goals', 'Details', 'Support'];

// Shared chip styling for single-select pill groups (brand fill when active).
const chipClass = (active: boolean) =>
  `px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all btn-press ${
    active
      ? 'bg-edamame-500 border-edamame-500 text-white'
      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-edamame-400 dark:hover:border-edamame-500'
  }`;

const inputClass =
  'w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-[13.5px] text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all';

const labelClass =
  'block text-[10px] font-bold uppercase tracking-[0.11em] text-slate-500 dark:text-slate-400 mb-2';

export const VisaAdvisor: React.FC<VisaAdvisorProps> = ({
  clients,
  templates,
  onOpenNewCase,
}) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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

  const handleNext = () => {
    if (wizardState.currentStep < 4) {
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
      const data: EligibilityReport = await response.json();
      setReport(data);
      setWizardState((prev) => ({ ...prev, step: 'report' }));
    } catch (error) {
      alert('Error: Could not assess eligibility. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartOver = () => {
    setReport(null);
    setWizardState((prev) => ({
      ...prev,
      step: 'input',
      currentStep: 1,
    }));
  };

  const handleOpenCase = (templateKeyword: string) => {
    // Navigate to /cases and pass the template keyword via state
    navigate('/cases', { state: { suggestedTemplateKeyword: templateKeyword } });
  };

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-white dark:bg-slate-900 min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-[860px] mx-auto">
        {/* Input stage */}
        {wizardState.step === 'input' && (
          <>
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-[26px] md:text-[27px] font-extrabold tracking-tight text-slate-900 dark:text-white">
                Visa Eligibility Advisor
              </h1>
              <p className="text-[13px] text-slate-600 dark:text-slate-400 mt-1">
                Discover which Australian visa pathways you may qualify for
              </p>
            </div>

            {/* Visual progress indicator */}
            <div className="mb-8 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-3">
                  {[1, 2, 3, 4].map(step => (
                    <div key={step} className="relative flex flex-col items-center">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-[13px] transition-all ${
                          step < wizardState.currentStep
                            ? 'bg-edamame-500 text-white'
                            : step === wizardState.currentStep
                            ? 'bg-edamame-500/15 border-2 border-edamame-500 text-edamame-600 dark:text-edamame-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {step < wizardState.currentStep ? <Check size={16} /> : step}
                      </div>
                      <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400 mt-2 whitespace-nowrap">
                        {stepLabels[step - 1]}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold text-slate-900 dark:text-white">
                    Step {wizardState.currentStep} of 4
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {Math.round((wizardState.currentStep / 4) * 100)}% complete
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="progress-fill h-full bg-edamame-500 rounded-full"
                  style={{ width: `${(wizardState.currentStep / 4) * 100}%` }}
                />
              </div>
            </div>

            {/* Form card */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-6">
              {/* Step label */}
              <div className="mb-6">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {wizardState.currentStep === 1 && 'Personal Information'}
                  {wizardState.currentStep === 2 && 'Immigration Goals'}
                  {wizardState.currentStep === 3 && 'Additional Details'}
                  {wizardState.currentStep === 4 && 'Supporting Factors'}
                </h2>
                <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-1">
                  {wizardState.currentStep === 1 && 'Tell us about yourself'}
                  {wizardState.currentStep === 2 && 'What brings you to Australia?'}
                  {wizardState.currentStep === 3 && 'Let\'s get into the specifics'}
                  {wizardState.currentStep === 4 && 'Final considerations'}
                </p>
              </div>

              {/* Step 1: Personal Info */}
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

              {/* Step 2: Immigration Goals */}
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
                </div>
              )}

              {/* Step 3: Conditional Details */}
              {wizardState.currentStep === 3 && (
                <div className="space-y-4">
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
                        <label className="flex items-center gap-2 text-[12.5px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
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
                        <label className="flex items-center gap-2 text-[12.5px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
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
                        <label className="flex items-center gap-2 text-[12.5px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
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

                  {!wizardState.goals.primaryPurpose && (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-600">
                      <p className="text-[13px]">Please select a primary purpose in Step 2 to continue.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Step 4: Supporting Factors */}
              {wizardState.currentStep === 4 && (
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
                    <label className="flex items-center gap-2 text-[12.5px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
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
                    <label className="flex items-center gap-2 text-[12.5px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
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
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 flex justify-between gap-3">
              <button
                onClick={handleBack}
                disabled={wizardState.currentStep === 1}
                className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors btn-press"
              >
                <ChevronLeft size={15} />
                Back
              </button>

              <button
                onClick={handleNext}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2 text-[13.5px] font-bold text-white bg-edamame-500 hover:bg-edamame-600 rounded-lg disabled:bg-slate-400 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-all btn-press"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    {wizardState.currentStep === 4 ? (
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
        {wizardState.step === 'report' && report && (
          <div className="space-y-8">
            {/* Header */}
            <div className="text-center mb-4">
              <h1 className="text-[26px] md:text-[27px] font-extrabold tracking-tight text-slate-900 dark:text-white">
                Your Visa Eligibility Results
              </h1>
              <p className="text-[13px] text-slate-600 dark:text-slate-400 mt-1">
                Based on your information, here are the visa pathways you may qualify for
              </p>
            </div>

            {/* Summary section */}
            <div className="bg-edamame-50 dark:bg-edamame-900/10 rounded-xl border border-edamame-200 dark:border-edamame-800/60 p-6">
              <div className="flex items-start gap-3 mb-3">
                <Target className="w-5 h-5 text-edamame-600 dark:text-edamame-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Our Recommendation
                  </h2>
                  <p className="text-[13.5px] text-slate-700 dark:text-slate-300 mt-1.5 leading-relaxed">
                    {report.primaryRecommendation}
                  </p>
                </div>
              </div>
              <p className="text-[12.5px] text-slate-600 dark:text-slate-400 leading-relaxed">
                {report.summary}
              </p>
            </div>

            {/* Visa options */}
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
                Visa Eligibility Breakdown
              </h3>
              <div className="flex flex-col gap-3">
                {report.visaOptions.map((visa) => {
                  const colors = verdictColors[visa.verdict] ?? verdictColors.needs_more_info;
                  const isQualified = visa.verdict === 'qualifies' || visa.verdict === 'possibly_qualifies';
                  return (
                    <div
                      key={visa.visaSubclass}
                      className={`card-lift rounded-xl border p-5 transition-all ${colors.cardBg} ${colors.cardBorder}`}
                    >
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className={`text-[14.5px] font-bold tracking-tight ${colors.titleText}`}>
                          {visa.visaName}
                        </span>
                        <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                          SC-{visa.visaSubclass}
                        </span>
                        <span
                          className={`ml-auto text-[10.5px] font-bold px-2.5 py-1 rounded-md whitespace-nowrap ${colors.badgeBg} ${colors.badgeText}`}
                        >
                          {verdictLabels[visa.verdict] ?? visa.verdict}
                        </span>
                      </div>

                      {/* Match strength bar — no numeric score comes back from the API,
                          so this reflects the verdict tier rather than an exact percentage. */}
                      {visa.verdict !== 'needs_more_info' && (
                        <div className="flex items-center gap-2.5 mt-3">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                            <div
                              className={`progress-fill h-full rounded-full ${colors.bar}`}
                              style={{ width: verdictBarWidth[visa.verdict] }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="space-y-3 mt-3.5">
                        <div>
                          <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400 mb-1.5">
                            Why
                          </p>
                          <ul className="space-y-1">
                            {visa.reasons.map((reason, i) => (
                              <li
                                key={i}
                                className="text-[12.5px] text-slate-600 dark:text-slate-300 flex items-start gap-2 leading-relaxed"
                              >
                                <span className="text-edamame-500 flex-shrink-0">·</span>
                                {reason}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {visa.gaps.length > 0 && (
                          <div>
                            <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400 mb-1.5">
                              Gaps to Address
                            </p>
                            <ul className="space-y-1">
                              {visa.gaps.map((gap, i) => (
                                <li
                                  key={i}
                                  className="text-[12.5px] text-slate-600 dark:text-slate-300 flex items-start gap-2 leading-relaxed"
                                >
                                  <span className="text-amber-500 flex-shrink-0">!</span>
                                  {gap}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {isQualified && (
                          <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                            <button
                              onClick={() => handleOpenCase(visa.visaSubclass)}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-edamame-500 hover:bg-edamame-600 text-white text-[12.5px] font-bold rounded-lg transition-colors btn-press"
                            >
                              Open New Case <ArrowRight size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
              <button
                onClick={handleStartOver}
                className="px-5 py-2.5 text-[13px] font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors btn-press"
              >
                Start Over
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
