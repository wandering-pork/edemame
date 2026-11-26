import React from 'react';
import { CountryCombobox } from '../CountryCombobox';
import type { EligibilityAssessmentInputs } from '../../types';

// The Visa Advisor's question fields, one step at a time, shared by the signed-in advisor
// (pages/VisaAdvisor.tsx) and the homepage's public trial (docs/plans/public-visa-advisor-trial.md,
// VA.2a/VA.2b), so the two can never ask different questions.
//
// Only the fields live here. Each surface keeps its own frame (headings, progress, buttons) and
// passes its own look through `classes`: the app's Tailwind classes by default, the homepage's
// fl-* classes for the trial.
//
// `variant: 'trial'` asks for an age instead of a name and date of birth (the trial never collects
// either) and words the questions for `audience`: "your client" or "you".

export type WizardVariant = 'app' | 'trial';
export type WizardAudience = 'client' | 'self';
export type WizardStep = 1 | 2 | 3;

export interface WizardClasses {
  /** A single-select chip, active or not. */
  chip: (active: boolean) => string;
  input: string;
  label: string;
  /** A label wrapping a checkbox and its text. */
  checkLabel: string;
  checkbox: string;
  /** The divider + heading above the purpose-specific questions. */
  section: string;
  sectionLabel: string;
  error: string;
  /** Wrappers for a step's fields: the space between fields. */
  stack: string;
  stackLoose: string;
}

export const APP_WIZARD_CLASSES: WizardClasses = {
  chip: (active) =>
    `px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all btn-press ${
      active
        ? 'bg-edamame-500 border-edamame-500 text-white'
        : 'bg-paper-2 dark:bg-plate-card border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft hover:border-edamame-400 dark:hover:border-edamame-500'
    }`,
  input:
    'w-full px-3.5 py-2.5 border border-ink/15 dark:border-plate-ink/20 rounded-lg bg-paper-2 dark:bg-plate-card/60 text-[13.5px] text-ink dark:text-plate-ink outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all',
  label: 'block text-[10px] font-bold uppercase tracking-[0.11em] text-ink-soft dark:text-plate-ink-soft mb-2',
  checkLabel: 'flex items-center gap-2 text-[12.5px] font-medium text-ink-soft dark:text-plate-ink-soft cursor-pointer',
  checkbox: 'w-4 h-4 rounded accent-edamame-500',
  section: 'pt-1 border-t border-ink/10 dark:border-plate-ink/15/60 space-y-4',
  sectionLabel: 'text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-soft dark:text-plate-ink-soft pt-4',
  error: 'text-[11px] text-red-500 dark:text-red-400 mt-1.5',
  stack: 'space-y-4',
  stackLoose: 'space-y-5',
};

export const PURPOSE_OPTIONS = [
  { val: 'work', label: 'Work / Employment' },
  { val: 'study', label: 'Study' },
  { val: 'family', label: 'Family Reunification' },
  { val: 'pr', label: 'Permanent Residence' },
  { val: 'visit', label: 'Visit / Tourism' },
] as const;

export const purposeLabels: Record<string, string> = Object.fromEntries(PURPOSE_OPTIONS.map((p) => [p.val, p.label]));

const DURATION_OPTIONS = [
  { val: 'short', label: '< 3 months' },
  { val: 'medium', label: '3–12 months' },
  { val: 'years', label: '1–4 years' },
  { val: 'permanent', label: 'Permanently' },
];

/** Whether the visitor can move past `step`. The app needs a name on step 1; the trial needs nothing. */
export function isWizardStepValid(value: EligibilityAssessmentInputs, step: WizardStep, variant: WizardVariant = 'app'): boolean {
  if (variant === 'app' && step === 1) return value.clientInfo.fullName.trim().length > 0;
  return true;
}

/** The question wording that differs between the app and the trial's two audiences. */
function wording(variant: WizardVariant, audience: WizardAudience) {
  if (variant === 'app') {
    return {
      age: 'Age',
      citizenship: 'Country of Citizenship',
      inAustralia: 'Currently in Australia?',
      visaStatus: 'Current Visa/Status in Australia',
      purpose: 'Primary Purpose',
      duration: 'Intended Duration of Stay',
      english: 'English Proficiency',
      health: 'Any significant health conditions requiring medical clearance?',
      criminal: 'Any criminal history or prior visa refusals?',
    };
  }
  const self = audience === 'self';
  return {
    age: self ? 'Your age' : 'Client’s age',
    citizenship: 'Country of citizenship',
    inAustralia: self ? 'Are you in Australia now?' : 'In Australia now?',
    visaStatus: self ? 'Your current visa' : 'Current visa',
    purpose: 'Main purpose',
    duration: 'How long',
    english: 'English level',
    health: 'Any health conditions that could affect a visa medical?',
    criminal: 'Any criminal convictions or past visa refusals?',
  };
}

interface EligibilityWizardFieldsProps {
  value: EligibilityAssessmentInputs;
  onChange: (next: EligibilityAssessmentInputs) => void;
  step: WizardStep;
  variant?: WizardVariant;
  audience?: WizardAudience;
  classes?: WizardClasses;
  /** Prefix for element ids, so two wizards on one page never share an id. */
  idPrefix?: string;
}

export const EligibilityWizardFields: React.FC<EligibilityWizardFieldsProps> = ({
  value,
  onChange,
  step,
  variant = 'app' as WizardVariant,
  audience = 'client' as WizardAudience,
  classes = APP_WIZARD_CLASSES,
  idPrefix = 'advisor',
}) => {
  const c = classes;
  const w = wording(variant, audience);
  const { clientInfo, goals, details, supportingFactors } = value;

  const setClient = (patch: Partial<EligibilityAssessmentInputs['clientInfo']>) =>
    onChange({ ...value, clientInfo: { ...clientInfo, ...patch } });
  const setGoals = (patch: Partial<EligibilityAssessmentInputs['goals']>, resetDetails = false) =>
    onChange({ ...value, goals: { ...goals, ...patch }, details: resetDetails ? {} : details });
  const setDetails = (patch: Record<string, unknown>) => onChange({ ...value, details: { ...details, ...patch } });
  const setFactors = (patch: Partial<EligibilityAssessmentInputs['supportingFactors']>) =>
    onChange({ ...value, supportingFactors: { ...supportingFactors, ...patch } });

  if (step === 1) {
    const nameMissing = variant === 'app' && !isWizardStepValid(value, 1, 'app');
    return (
      <div className={c.stack}>
        {variant === 'app' ? (
          <>
            <div>
              <label className={c.label}>Full Name</label>
              <input
                type="text"
                value={clientInfo.fullName}
                onChange={(e) => setClient({ fullName: e.target.value })}
                className={c.input}
                placeholder="e.g. John Doe"
              />
              {nameMissing && <p className={c.error}>A name is required to continue.</p>}
            </div>

            <div>
              <label className={c.label}>Date of Birth</label>
              <input type="date" value={clientInfo.dob} onChange={(e) => setClient({ dob: e.target.value })} className={c.input} />
            </div>
          </>
        ) : (
          <div>
            <label htmlFor={`${idPrefix}-age`} className={c.label}>{w.age}</label>
            <input
              id={`${idPrefix}-age`}
              type="number"
              inputMode="numeric"
              min={0}
              max={120}
              value={clientInfo.age ?? ''}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setClient({ age: Number.isFinite(n) ? n : null });
              }}
              className={c.input}
            />
          </div>
        )}

        <div>
          <label htmlFor={`${idPrefix}-citizenship`} className={c.label}>{w.citizenship}</label>
          <CountryCombobox
            id={`${idPrefix}-citizenship`}
            value={clientInfo.nationality}
            onChange={(nationality) => setClient({ nationality })}
            inputClassName={c.input}
          />
        </div>

        <div>
          <label className={c.label}>{w.inAustralia}</label>
          <div className="flex flex-wrap gap-2">
            {['Yes', 'No'].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setClient({ inAustralia: opt === 'Yes' })}
                className={c.chip((opt === 'Yes' && clientInfo.inAustralia) || (opt === 'No' && !clientInfo.inAustralia))}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {clientInfo.inAustralia && (
          <div>
            <label className={c.label}>{w.visaStatus}</label>
            <select value={clientInfo.currentVisaStatus} onChange={(e) => setClient({ currentVisaStatus: e.target.value })} className={c.input}>
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
    );
  }

  if (step === 2) {
    return (
      <div className={c.stackLoose}>
        <div>
          <label className={c.label}>{w.purpose}</label>
          <div className="flex flex-wrap gap-2">
            {PURPOSE_OPTIONS.map(({ val, label }) => (
              <button key={val} type="button" onClick={() => setGoals({ primaryPurpose: val }, true)} className={c.chip(goals.primaryPurpose === val)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={c.label}>{w.duration}</label>
          <div className="flex flex-wrap gap-2">
            {DURATION_OPTIONS.map(({ val, label }) => (
              <button key={val} type="button" onClick={() => setGoals({ intendedDuration: val })} className={c.chip(goals.intendedDuration === val)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {goals.primaryPurpose && (
          <div className={c.section}>
            <p className={c.sectionLabel}>Specifics for this pathway</p>

            {goals.primaryPurpose === 'work' && (
              <>
                <div>
                  <label className={c.label}>Occupation</label>
                  <input
                    type="text"
                    value={details.occupation || ''}
                    onChange={(e) => setDetails({ occupation: e.target.value })}
                    placeholder="e.g. Software Engineer"
                    className={c.input}
                  />
                </div>
                <div>
                  <label className={c.label}>Years of Experience</label>
                  <input
                    type="number"
                    value={details.yearsExperience || ''}
                    onChange={(e) => setDetails({ yearsExperience: parseInt(e.target.value) || 0 })}
                    min="0"
                    className={c.input}
                  />
                </div>
                <div>
                  <label className={c.checkLabel}>
                    <input
                      type="checkbox"
                      checked={details.skillsAssessment || false}
                      onChange={(e) => setDetails({ skillsAssessment: e.target.checked })}
                      className={c.checkbox}
                    />
                    Skills assessment completed?
                  </label>
                </div>
              </>
            )}

            {goals.primaryPurpose === 'study' && (
              <>
                <div>
                  <label className={c.label}>Course Level</label>
                  <select value={details.courseLevel || ''} onChange={(e) => setDetails({ courseLevel: e.target.value })} className={c.input}>
                    <option value="">-- Select --</option>
                    <option value="secondary">Secondary/Foundation</option>
                    <option value="vocation">Vocational (VET)</option>
                    <option value="bachelor">Bachelor Degree</option>
                    <option value="master">Master Degree</option>
                    <option value="phd">PhD/Research</option>
                  </select>
                </div>
                <div>
                  <label className={c.checkLabel}>
                    <input
                      type="checkbox"
                      checked={details.financialSupport || false}
                      onChange={(e) => setDetails({ financialSupport: e.target.checked })}
                      className={c.checkbox}
                    />
                    Financial support confirmed?
                  </label>
                </div>
              </>
            )}

            {goals.primaryPurpose === 'family' && (
              <>
                <div>
                  <label className={c.label}>Relationship Type</label>
                  <select value={details.relationshipType || ''} onChange={(e) => setDetails({ relationshipType: e.target.value })} className={c.input}>
                    <option value="">-- Select --</option>
                    <option value="spouse">Spouse / Partner</option>
                    <option value="child">Dependent Child</option>
                    <option value="parent">Parent</option>
                    <option value="sibling">Sibling</option>
                    <option value="other">Other Family Member</option>
                  </select>
                </div>
                <div>
                  <label className={c.label}>Sponsor's AU Status</label>
                  <select value={details.sponsorStatus || ''} onChange={(e) => setDetails({ sponsorStatus: e.target.value })} className={c.input}>
                    <option value="">-- Select --</option>
                    <option value="citizen">Australian Citizen</option>
                    <option value="pr">Permanent Resident</option>
                    <option value="none">None / Not Available</option>
                  </select>
                </div>
              </>
            )}

            {goals.primaryPurpose === 'pr' && (
              <>
                <div>
                  <label className={c.label}>Self-Assessed Points Score</label>
                  <select value={details.pointsScore || ''} onChange={(e) => setDetails({ pointsScore: e.target.value })} className={c.input}>
                    <option value="">-- Select --</option>
                    <option value="under65">Under 65 points</option>
                    <option value="65-79">65–79 points</option>
                    <option value="80-95">80–95 points</option>
                    <option value="95plus">95+ points</option>
                  </select>
                </div>
                <div>
                  <label className={c.label}>Preferred State</label>
                  <input
                    type="text"
                    value={details.statePreference || ''}
                    onChange={(e) => setDetails({ statePreference: e.target.value })}
                    placeholder="e.g. NSW, VIC"
                    className={c.input}
                  />
                </div>
              </>
            )}

            {goals.primaryPurpose === 'visit' && (
              <>
                <div>
                  <label className={c.label}>Trip Duration</label>
                  <input
                    type="text"
                    value={details.tripDuration || ''}
                    onChange={(e) => setDetails({ tripDuration: e.target.value })}
                    placeholder="e.g. 2 weeks, 3 months"
                    className={c.input}
                  />
                </div>
                <div>
                  <label className={c.checkLabel}>
                    <input
                      type="checkbox"
                      checked={details.strongTies || false}
                      onChange={(e) => setDetails({ strongTies: e.target.checked })}
                      className={c.checkbox}
                    />
                    Strong ties to home country (property, job, family)?
                  </label>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={c.stack}>
      <div>
        <label className={c.label}>{w.english}</label>
        <select value={supportingFactors.englishProficiency} onChange={(e) => setFactors({ englishProficiency: e.target.value })} className={c.input}>
          <option value="">-- Select --</option>
          <option value="none">No English proficiency</option>
          <option value="basic">Basic (IELTS 5.0–5.5)</option>
          <option value="intermediate">Intermediate (IELTS 6.0–6.5)</option>
          <option value="proficient">Proficient (IELTS 7.0–8.0)</option>
          <option value="fluent">Fluent (IELTS 8.5+) / Native</option>
        </select>
      </div>

      <div>
        <label className={c.checkLabel}>
          <input
            type="checkbox"
            checked={supportingFactors.healthConcerns}
            onChange={(e) => setFactors({ healthConcerns: e.target.checked })}
            className={c.checkbox}
          />
          {w.health}
        </label>
      </div>

      <div>
        <label className={c.checkLabel}>
          <input
            type="checkbox"
            checked={supportingFactors.criminalHistory}
            onChange={(e) => setFactors({ criminalHistory: e.target.checked })}
            className={c.checkbox}
          />
          {w.criminal}
        </label>
      </div>
    </div>
  );
};
