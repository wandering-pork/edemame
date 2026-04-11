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

const verdictColors: Record<string, { bg: string; badge: string; text: string }> = {
  qualifies: {
    bg: 'bg-green-50 dark:bg-green-900/15',
    badge: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    text: 'text-green-900 dark:text-green-200',
  },
  possibly_qualifies: {
    bg: 'bg-amber-50 dark:bg-amber-900/15',
    badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    text: 'text-amber-900 dark:text-amber-200',
  },
  unlikely: {
    bg: 'bg-red-50 dark:bg-red-900/15',
    badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    text: 'text-red-900 dark:text-red-200',
  },
  needs_more_info: {
    bg: 'bg-blue-50 dark:bg-blue-900/15',
    badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    text: 'text-blue-900 dark:text-blue-200',
  },
};

const verdictLabels: Record<string, string> = {
  qualifies: 'Likely Qualifies',
  possibly_qualifies: 'Possibly Qualifies',
  unlikely: 'Unlikely',
  needs_more_info: 'Needs More Info',
};

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
      <div className="max-w-3xl mx-auto">
        {/* Input stage */}
        {wizardState.step === 'input' && (
          <>
            {/* Header */}
            <div className="mb-10">
              <h1 className="text-3xl md:text-4xl font-ibm-serif font-bold text-slate-900 dark:text-white mb-2">
                Visa Eligibility Advisor
              </h1>
              <p className="text-base text-slate-600 dark:text-slate-400">
                Discover which Australian visa pathways you may qualify for
              </p>
            </div>

            {/* Visual progress indicator */}
            <div className="mb-10 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map(step => (
                    <div key={step} className="relative flex flex-col items-center">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all ${
                          step < wizardState.currentStep
                            ? 'bg-edamame-500 text-white'
                            : step === wizardState.currentStep
                            ? 'bg-edamame-500/20 border-2 border-edamame-500 text-edamame-600 dark:text-edamame-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {step < wizardState.currentStep ? <Check size={20} /> : step}
                      </div>
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-2 whitespace-nowrap">
                        {['Personal', 'Goals', 'Details', 'Support'][step - 1]}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Step {wizardState.currentStep} of 4
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {Math.round((wizardState.currentStep / 4) * 100)}% complete
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-edamame-500 to-edamame-600 transition-all duration-500 ease-out"
                  style={{ width: `${(wizardState.currentStep / 4) * 100}%` }}
                />
              </div>
            </div>

            {/* Form card */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-8">
              {/* Step label */}
              <div className="mb-8">
                <h2 className="text-2xl font-ibm-serif font-bold text-slate-900 dark:text-white">
                  {wizardState.currentStep === 1 && 'Personal Information'}
                  {wizardState.currentStep === 2 && 'Immigration Goals'}
                  {wizardState.currentStep === 3 && 'Additional Details'}
                  {wizardState.currentStep === 4 && 'Supporting Factors'}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={wizardState.clientInfo.fullName}
                      onChange={(e) =>
                        setWizardState((prev) => ({
                          ...prev,
                          clientInfo: { ...prev.clientInfo, fullName: e.target.value },
                        }))
                      }
                      className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                      placeholder="e.g. John Doe"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={wizardState.clientInfo.dob}
                      onChange={(e) =>
                        setWizardState((prev) => ({
                          ...prev,
                          clientInfo: { ...prev.clientInfo, dob: e.target.value },
                        }))
                      }
                      className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Country of Citizenship
                    </label>
                    <input
                      type="text"
                      value={wizardState.clientInfo.nationality}
                      onChange={(e) =>
                        setWizardState((prev) => ({
                          ...prev,
                          clientInfo: { ...prev.clientInfo, nationality: e.target.value },
                        }))
                      }
                      className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                      placeholder="e.g. Indian, British"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Currently in Australia?
                    </label>
                    <div className="flex gap-3">
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
                          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                            (opt === 'Yes' && wizardState.clientInfo.inAustralia) ||
                            (opt === 'No' && !wizardState.clientInfo.inAustralia)
                              ? 'bg-edamame text-white'
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {wizardState.clientInfo.inAustralia && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Current Visa/Status in Australia
                      </label>
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
                        className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
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
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">
                      Primary Purpose
                    </label>
                    <div className="grid grid-cols-1 gap-2">
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
                          className={`text-left px-4 py-3 rounded-lg border-2 transition-all font-medium ${
                            wizardState.goals.primaryPurpose === val
                              ? 'border-edamame bg-edamame/8 text-edamame-700 dark:text-edamame-400'
                              : 'border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-600'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">
                      Intended Duration of Stay
                    </label>
                    <div className="grid grid-cols-2 gap-3">
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
                          className={`px-3 py-2 rounded-lg border-2 transition-all font-medium text-sm ${
                            wizardState.goals.intendedDuration === val
                              ? 'border-edamame bg-edamame/8 text-edamame-700 dark:text-edamame-400'
                              : 'border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-600'
                          }`}
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                          Occupation
                        </label>
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
                          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                          Years of Experience
                        </label>
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
                          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer">
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
                            className="w-4 h-4 rounded"
                          />
                          Skills assessment completed?
                        </label>
                      </div>
                    </>
                  )}

                  {wizardState.goals.primaryPurpose === 'study' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                          Course Level
                        </label>
                        <select
                          value={wizardState.details.courseLevel || ''}
                          onChange={(e) =>
                            setWizardState((prev) => ({
                              ...prev,
                              details: { ...prev.details, courseLevel: e.target.value },
                            }))
                          }
                          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
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
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer">
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
                            className="w-4 h-4 rounded"
                          />
                          Financial support confirmed?
                        </label>
                      </div>
                    </>
                  )}

                  {wizardState.goals.primaryPurpose === 'family' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                          Relationship Type
                        </label>
                        <select
                          value={wizardState.details.relationshipType || ''}
                          onChange={(e) =>
                            setWizardState((prev) => ({
                              ...prev,
                              details: { ...prev.details, relationshipType: e.target.value },
                            }))
                          }
                          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                          Sponsor's AU Status
                        </label>
                        <select
                          value={wizardState.details.sponsorStatus || ''}
                          onChange={(e) =>
                            setWizardState((prev) => ({
                              ...prev,
                              details: { ...prev.details, sponsorStatus: e.target.value },
                            }))
                          }
                          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                          Self-Assessed Points Score
                        </label>
                        <select
                          value={wizardState.details.pointsScore || ''}
                          onChange={(e) =>
                            setWizardState((prev) => ({
                              ...prev,
                              details: { ...prev.details, pointsScore: e.target.value },
                            }))
                          }
                          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                        >
                          <option value="">-- Select --</option>
                          <option value="under65">Under 65 points</option>
                          <option value="65-79">65–79 points</option>
                          <option value="80-95">80–95 points</option>
                          <option value="95plus">95+ points</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                          Preferred State
                        </label>
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
                          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                        />
                      </div>
                    </>
                  )}

                  {wizardState.goals.primaryPurpose === 'visit' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                          Trip Duration
                        </label>
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
                          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer">
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
                            className="w-4 h-4 rounded"
                          />
                          Strong ties to home country (property, job, family)?
                        </label>
                      </div>
                    </>
                  )}

                  {!wizardState.goals.primaryPurpose && (
                    <div className="text-center py-8 text-gray-400 dark:text-slate-600">
                      <p className="text-sm">Please select a primary purpose in Step 2 to continue.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Step 4: Supporting Factors */}
              {wizardState.currentStep === 4 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">
                      English Proficiency
                    </label>
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
                      className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
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
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer">
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
                        className="w-4 h-4 rounded"
                      />
                      Any significant health conditions requiring medical clearance?
                    </label>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer">
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
                        className="w-4 h-4 rounded"
                      />
                      Any criminal history or prior visa refusals?
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Footer with buttons */}
            <div className="px-8 py-6 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-600 flex justify-between gap-3">
              <button
                onClick={handleBack}
                disabled={wizardState.currentStep === 1}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
                Back
              </button>

              <button
                onClick={handleNext}
                disabled={isLoading}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-edamame-500 hover:bg-edamame-600 rounded-lg disabled:bg-slate-400 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-all shadow-lg shadow-edamame-500/30"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    {wizardState.currentStep === 4 ? 'Get Assessment' : 'Continue'}
                    <ChevronRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
          </>
        )}

        {/* Report stage */}
        {wizardState.step === 'report' && report && (
          <div className="space-y-10">
            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-3xl md:text-4xl font-ibm-serif font-bold text-slate-900 dark:text-white mb-3">
                Your Visa Eligibility Results
              </h1>
              <p className="text-base text-slate-600 dark:text-slate-400">
                Based on your information, here are the visa pathways you may qualify for
              </p>
            </div>

            {/* Summary section */}
            <div className="bg-gradient-to-br from-edamame-50 dark:from-edamame-900/20 to-edamame-100/50 dark:to-edamame-900/10 rounded-2xl border border-edamame-200 dark:border-edamame-800 p-8">
              <div className="flex items-start gap-3 mb-4">
                <Target className="w-6 h-6 text-edamame-600 dark:text-edamame-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-xl font-ibm-serif font-bold text-slate-900 dark:text-white">
                    Our Recommendation
                  </h2>
                  <p className="text-base text-slate-700 dark:text-slate-300 mt-2 leading-relaxed">
                    {report.primaryRecommendation}
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {report.summary}
              </p>
            </div>

            {/* Visa options */}
            <div>
              <h3 className="text-2xl font-ibm-serif font-bold text-slate-900 dark:text-white mb-6">
                Visa Eligibility Breakdown
              </h3>
              <div className="grid gap-6">
                {report.visaOptions.map((visa) => {
                  const colors = verdictColors[visa.verdict];
                  const isQualified = visa.verdict === 'qualifies' || visa.verdict === 'possibly_qualifies';
                  return (
                    <div
                      key={visa.visaSubclass}
                      className={`group relative overflow-hidden rounded-2xl p-6 transition-all border ${colors.bg} ${
                        isQualified
                          ? 'border-slate-300 dark:border-slate-600 hover:shadow-lg hover:scale-[1.02]'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4 gap-4">
                        <div>
                          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-widest">
                            {visa.visaSubclass}
                          </p>
                          <h4 className={`text-xl font-ibm-serif font-bold ${colors.text}`}>
                            {visa.visaName}
                          </h4>
                        </div>
                        <span
                          className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap flex-shrink-0 ${colors.badge}`}
                        >
                          {verdictLabels[visa.verdict]}
                        </span>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-widest mb-2">
                            Why
                          </p>
                          <ul className="space-y-1">
                            {visa.reasons.map((reason, i) => (
                              <li
                                key={i}
                                className="text-sm text-gray-700 dark:text-slate-300 flex items-start gap-2"
                              >
                                <span className="text-edamame flex-shrink-0 mt-1">•</span>
                                {reason}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {visa.gaps.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-widest mb-2">
                              Gaps to Address
                            </p>
                            <ul className="space-y-1">
                              {visa.gaps.map((gap, i) => (
                                <li
                                  key={i}
                                  className="text-sm text-gray-700 dark:text-slate-300 flex items-start gap-2"
                                >
                                  <span className="text-amber-500 flex-shrink-0 mt-1">!</span>
                                  {gap}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {(visa.verdict === 'qualifies' ||
                          visa.verdict === 'possibly_qualifies') && (
                          <div className="pt-3 border-t border-gray-300 dark:border-slate-700">
                            <button
                              onClick={() => handleOpenCase(visa.visaSubclass)}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-edamame hover:bg-edamame-600 text-white text-sm font-semibold rounded-lg transition-colors"
                            >
                              Open New Case <ArrowRight size={14} />
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
            <div className="flex flex-col sm:flex-row justify-center gap-4 pt-8">
              <button
                onClick={handleStartOver}
                className="px-6 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
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
