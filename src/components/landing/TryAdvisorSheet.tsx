import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { validateNewPassword } from '@/lib/passwordValidation';
import type { EligibilityAssessmentInputs } from '@/types';
import {
  EligibilityWizardFields,
  purposeLabels,
  type WizardClasses,
  type WizardStep,
} from '@/components/visa-advisor/EligibilityWizardFields';
import { saveTrialScenario, type TrialAudience } from '@/lib/trialCarryOver';
import { useTurnstile } from '@/lib/useTurnstile';
import {
  isFullMatch,
  recordTrialEvent,
  runTrialCheck,
  TrialError,
  type TrialErrorCode,
  type TrialMatch,
  type TrialResult,
  type TrialVerdict,
} from '@/services/tryAdvisorService';

/**
 * "Try out our Visa Advisor": the homepage's signed-out trial, in a sheet over Chapter I
 * (docs/plans/public-visa-advisor-trial.md, VA.2b; design: the canvas linked from the plan).
 *
 * The sheet is a case file being filled in: the left column ("This scenario") fills in as the
 * visitor answers, and becomes "Comes with your account" at sign-up, so they can see their answers
 * are kept. The one motion is the result writing in with its colour arriving last, the same move as
 * Chapter I's docket. Everything is built from the homepage's own fl-* pieces, inside its `.fl` root.
 *
 * Nothing is saved on the server except rate-limit counters. The answers (no name, no date of birth)
 * are kept in localStorage for 24 h so the full Visa Advisor can pick them up after sign-up.
 */

type Screen = 'audience' | 'questions' | 'checking' | 'result' | 'signup' | 'login' | 'confirm' | 'problem';

const EMPTY_ANSWERS: EligibilityAssessmentInputs = {
  clientInfo: { fullName: '', dob: '', age: null, nationality: '', inAustralia: false, currentVisaStatus: '' },
  goals: { primaryPurpose: '', intendedDuration: '' },
  details: {},
  supportingFactors: { englishProficiency: '', healthConcerns: false, criminalHistory: false },
};

/** The ten subclasses every check considers (api/_lib/tryAdvisor.ts), with short names. */
const SUBCLASSES: { code: string; name: string }[] = [
  { code: '189', name: 'Skilled Independent' },
  { code: '190', name: 'Skilled Nominated' },
  { code: '482', name: 'Skills in Demand' },
  { code: '186', name: 'Employer Nomination' },
  { code: '500', name: 'Student' },
  { code: '820', name: 'Partner' },
  { code: '485', name: 'Temporary Graduate' },
  { code: '600', name: 'Visitor' },
  { code: '417', name: 'Working Holiday' },
  { code: '491', name: 'Skilled Work Regional' },
];

const VERDICT_LABEL: Record<TrialVerdict, string> = {
  qualifies: 'Qualifies',
  possibly_qualifies: 'Possibly',
  unlikely: 'Unlikely',
  needs_more_info: 'Needs more info',
};
const VERDICT_TONE: Record<TrialVerdict, 'good' | 'maybe' | 'bad' | 'info'> = {
  qualifies: 'good',
  possibly_qualifies: 'maybe',
  unlikely: 'bad',
  needs_more_info: 'info',
};
const DURATION_LABEL: Record<string, string> = { short: 'Under 3 months', medium: '3 to 12 months', years: '1 to 4 years', permanent: 'Permanently' };
const ENGLISH_LABEL: Record<string, string> = { none: 'None', basic: 'Basic', intermediate: 'Intermediate', proficient: 'Proficient', fluent: 'Fluent' };

/** OMARA's public register (verify before launch: search results disagree slightly on the path). */
const AGENT_REGISTER_URL = 'https://www.mara.gov.au/search-the-register-of-migration-agents/';

const STEP_TITLES: Record<TrialAudience, string[]> = {
  client: ['About your client', 'What your client wants', 'What your client brings'],
  self: ['About you', 'What you want', 'What you bring'],
};
const STEP_SUBS = [
  'Enough to establish age and citizenship.',
  'The purpose decides which visas are worth checking.',
  'English level, and anything that could affect the health or character checks.',
];

const WIZARD_CLASSES: WizardClasses = {
  chip: (active) => (active ? 'fl-try__chip is-on' : 'fl-try__chip'),
  input: 'fl-input',
  label: 'fl-try__label',
  checkLabel: 'fl-try__check',
  checkbox: 'fl-try__checkbox',
  section: 'fl-try__section',
  sectionLabel: 'fl-try__sectionlabel',
  error: 'fl-try__error',
  stack: 'fl-try__stack',
  stackLoose: 'fl-try__stack fl-try__stack--loose',
};

const PROBLEM_COPY: Record<TrialErrorCode, { title: string; body: string }> = {
  trial_limit: {
    title: 'You’ve used today’s free checks.',
    body: 'There are 3 free checks a day. With an account you can run as many as you need, with the full report each time. Your answers stay here.',
  },
  trial_paused: {
    title: 'The free trial is paused.',
    body: 'Create an account to use the Visa Advisor. Your answers stay here.',
  },
  challenge_failed: {
    title: 'We couldn’t verify you’re human.',
    body: 'Try again. If it keeps happening, refresh the page.',
  },
  ai_busy: {
    title: 'The check didn’t finish.',
    body: 'The AI service is busy. Your answers are still here, and this attempt didn’t use one of your free checks.',
  },
  ai_error: {
    title: 'The check didn’t finish.',
    body: 'Something went wrong on our side. Your answers are still here, and this attempt didn’t use one of your free checks.',
  },
  network: {
    title: 'Couldn’t reach Edamame.',
    body: 'Check your connection and try again. Your answers are still here.',
  },
};

interface TryAdvisorSheetProps {
  open: boolean;
  onClose: () => void;
}

export const TryAdvisorSheet: React.FC<TryAdvisorSheetProps> = ({ open, onClose }) => {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [screen, setScreen] = useState<Screen>('audience');
  const [audience, setAudience] = useState<TrialAudience>('client');
  const [step, setStep] = useState<WizardStep>(1);
  const [reached, setReached] = useState(0); // furthest step finished, for the scenario column
  const [answers, setAnswers] = useState<EligibilityAssessmentInputs>(EMPTY_ANSWERS);
  const [result, setResult] = useState<TrialResult | null>(null);
  const [problem, setProblem] = useState<TrialErrorCode | null>(null);
  const [slow, setSlow] = useState(false);
  const [asideOpen, setAsideOpen] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const { token, failed: turnstileFailed, reset: resetTurnstile } = useTurnstile(turnstileRef, open);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;
  const failedRef = useRef(false);
  failedRef.current = turnstileFailed;

  /* ------------------------------------------------- dialog behaviour */
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = (): HTMLElement[] =>
      panel ? (Array.prototype.slice.call(panel.querySelectorAll<HTMLElement>(selector)) as HTMLElement[]) : [];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = focusables();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !panel?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Each screen change moves focus to its heading, so a screen reader announces where they are.
  useEffect(() => {
    if (!open) return;
    const heading = panelRef.current?.querySelector<HTMLElement>('[data-try-heading]');
    heading?.focus({ preventScroll: true });
    panelRef.current?.querySelector('.fl-try__main')?.scrollTo?.({ top: 0 });
  }, [open, screen, step]);

  /* ------------------------------------------------------- the check */
  const waitForToken = async (): Promise<string | null> => {
    const started = Date.now();
    while (!tokenRef.current && !failedRef.current && Date.now() - started < 10_000) {
      await new Promise((r) => setTimeout(r, 200));
    }
    return tokenRef.current;
  };

  const runCheck = async () => {
    setScreen('checking');
    setSlow(false);
    const slowTimer = window.setTimeout(() => setSlow(true), 15_000);
    try {
      const turnstileToken = await waitForToken();
      const res = await runTrialCheck({ audience, answers, turnstileToken });
      setResult(res);
      saveTrialScenario(answers, audience);
      setScreen('result');
    } catch (error) {
      setProblem(error instanceof TrialError ? error.code : 'ai_error');
      setScreen('problem');
    } finally {
      window.clearTimeout(slowTimer);
      resetTurnstile(); // tokens are single-use
    }
  };

  const next = () => {
    setReached((r) => Math.max(r, step));
    if (step < 3) setStep((s) => (s + 1) as WizardStep);
    else void runCheck();
  };
  const back = () => {
    if (step > 1) setStep((s) => (s - 1) as WizardStep);
    else setScreen('audience');
  };
  const startOver = () => {
    setAnswers(EMPTY_ANSWERS);
    setResult(null);
    setReached(0);
    setStep(1);
    setScreen('audience');
  };

  /* ----------------------------------------------------- the scenario */
  const rows = useMemo(() => {
    const ci = answers.clientInfo;
    const sf = answers.supportingFactors;
    const pastAudience = screen !== 'audience' || reached > 0;
    return [
      { k: 'For', v: pastAudience ? (audience === 'self' ? 'Myself' : 'A client') : '' },
      { k: 'Age', v: ci.age != null ? String(ci.age) : '' },
      { k: 'Citizenship', v: ci.nationality },
      { k: 'In Australia', v: reached >= 1 ? (ci.inAustralia ? 'Yes' : 'No') : '' },
      { k: 'Purpose', v: answers.goals.primaryPurpose ? purposeLabels[answers.goals.primaryPurpose] ?? '' : '' },
      { k: 'Stay', v: DURATION_LABEL[answers.goals.intendedDuration] ?? '' },
      { k: 'English', v: ENGLISH_LABEL[sf.englishProficiency] ?? '' },
      { k: 'Health and character', v: reached >= 3 ? (sf.healthConcerns || sf.criminalHistory ? 'Something to declare' : 'Nothing declared') : '' },
    ];
  }, [answers, audience, reached, screen]);
  const answered = rows.filter((r) => r.v).length;
  const asideTitle = screen === 'signup' || screen === 'login' || screen === 'confirm' ? 'Comes with your account' : 'This scenario';

  if (!open) return null;

  return (
    <div className="fl-sheet fl-sheet--try" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{TRY_CSS}</style>
      <div ref={panelRef} className="fl-try" role="dialog" aria-modal="true" aria-labelledby="fl-try-heading">
        <button type="button" className="fl-sheet__x" onClick={onClose} aria-label="Close">×</button>

        <aside className={asideOpen ? 'fl-try__aside is-open' : 'fl-try__aside'} aria-label={asideTitle}>
          <div className="fl-try__asidehead">
            <h3 className="fl-try__asidetitle">{asideTitle}</h3>
            <span className="fl-try__asidecount">{answered} of {rows.length} answered</span>
            <button type="button" className="fl-link fl-try__asidetoggle" onClick={() => setAsideOpen((o) => !o)} aria-expanded={asideOpen}>
              {asideOpen ? 'Hide' : 'Show'}
            </button>
          </div>
          <dl className="fl-try__rows">
            {rows.map((r) => (
              <div key={r.k}>
                <dt>{r.k}</dt>
                {r.v ? <dd>{r.v}</dd> : <dd className="fl-try__blank" aria-label="Not answered yet" />}
              </div>
            ))}
          </dl>
          <p className="fl-try__disclaimer">General information only, not immigration advice.</p>
        </aside>

        <div className="fl-try__main">
          {screen === 'audience' && (
            <>
              <h2 id="fl-try-heading" data-try-heading tabIndex={-1} className="fl-try__h">Who is this check for?</h2>
              <p className="fl-try__sub">Answer a few questions and see which Australian visa fits best. It takes about two minutes.</p>
              <div role="radiogroup" aria-label="Who is this check for?" className="fl-try__choices">
                {([
                  { id: 'client', title: 'A client', desc: 'I’m a migration agent or lawyer checking a client’s options.' },
                  { id: 'self', title: 'Myself', desc: 'I’m thinking about applying for an Australian visa.' },
                ] as const).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={audience === a.id}
                    className={audience === a.id ? 'fl-try__choice is-on' : 'fl-try__choice'}
                    onClick={() => setAudience(a.id)}
                  >
                    <span className="fl-try__choicetext">
                      <span className="fl-try__choicetitle">{a.title}</span>
                      <span className="fl-try__choicedesc">{a.desc}</span>
                    </span>
                    <span className="fl-try__ring" aria-hidden="true" />
                  </button>
                ))}
              </div>
              <div className="fl-try__bar">
                <span />
                <button type="button" className="fl-btn" onClick={() => { recordTrialEvent('started', audience); setStep(1); setScreen('questions'); }}>Continue</button>
              </div>
            </>
          )}

          {screen === 'questions' && (
            <>
              <h2 id="fl-try-heading" data-try-heading tabIndex={-1} className="fl-try__h">{STEP_TITLES[audience][step - 1]}</h2>
              <p className="fl-try__sub">{STEP_SUBS[step - 1]}</p>
              <EligibilityWizardFields
                step={step}
                value={answers}
                onChange={setAnswers}
                variant="trial"
                audience={audience}
                classes={WIZARD_CLASSES}
                idPrefix="try"
              />
              <div className="fl-try__bar">
                <span className="fl-try__barleft">
                  <button type="button" className="fl-link" onClick={back}>Back</button>
                  <span className="fl-try__stepnote">Step {step} of 3</span>
                </span>
                <button type="button" className="fl-btn" onClick={next}>{step === 3 ? 'Check eligibility' : 'Continue'}</button>
              </div>
            </>
          )}

          {screen === 'checking' && (
            <>
              <h2 id="fl-try-heading" data-try-heading tabIndex={-1} className="fl-try__h">Checking 10 visas against this scenario.</h2>
              <p className="fl-try__sub">This usually takes 10 to 30 seconds. Keep this open while it works.</p>
              <div className="fl-try__skeleton" aria-hidden="true">
                <div className="fl-try__skeletontop"><span /><span /><span /></div>
                <div className="fl-try__skeletonrule"><span /></div>
              </div>
              <p role="status" className="fl-try__status">
                {slow ? 'Still working. This can take up to a minute.' : 'Reading the purpose, length of stay and English level.'}
              </p>
            </>
          )}

          {screen === 'result' && result?.audience === 'client' && (
            <ClientResult
              match={result.result}
              remaining={result.remainingToday}
              onCreateAccount={() => setScreen('signup')}
              onLogIn={() => setScreen('login')}
              onStartOver={startOver}
            />
          )}

          {screen === 'result' && result?.audience === 'self' && (
            <SelfResult result={result} onStartOver={startOver} />
          )}

          {screen === 'signup' && (
            <SignUpForm
              onDone={() => navigate('/visa-advisor')}
              onNeedsConfirmation={() => setScreen('confirm')}
              onLogIn={() => setScreen('login')}
              onBack={() => setScreen(result ? 'result' : 'audience')}
              signUp={signUp}
            />
          )}

          {screen === 'login' && (
            <LogInForm
              onDone={() => navigate('/visa-advisor')}
              onSignUp={() => setScreen('signup')}
              onBack={() => setScreen(result ? 'result' : 'audience')}
              signIn={signIn}
            />
          )}

          {screen === 'confirm' && (
            <>
              <h2 id="fl-try-heading" data-try-heading tabIndex={-1} className="fl-try__h">Check your email.</h2>
              <p className="fl-try__sub">
                We’ve sent you a link to confirm your account. Open it on this device and the Visa Advisor will
                offer to continue with this scenario. It’s kept here for 24 hours.
              </p>
              <div className="fl-try__bar"><span /><button type="button" className="fl-btn" onClick={onClose}>Done</button></div>
            </>
          )}

          {screen === 'problem' && problem && (
            <>
              <h2 id="fl-try-heading" data-try-heading tabIndex={-1} className="fl-try__h">{PROBLEM_COPY[problem].title}</h2>
              <p className="fl-try__sub" role="alert">{PROBLEM_COPY[problem].body}</p>
              <div className="fl-try__actions">
                {problem === 'trial_limit' || problem === 'trial_paused' ? (
                  audience === 'self' ? (
                    <a className="fl-btn" href={AGENT_REGISTER_URL} target="_blank" rel="noopener noreferrer" onClick={() => recordTrialEvent('register_click', 'self')}>Find a registered agent</a>
                  ) : (
                    <>
                      <button type="button" className="fl-btn" onClick={() => setScreen('signup')}>Create account</button>
                      <button type="button" className="fl-link" onClick={() => setScreen('login')}>Log in</button>
                    </>
                  )
                ) : (
                  <>
                    <button type="button" className="fl-btn" onClick={() => void runCheck()}>Try again</button>
                    <button type="button" className="fl-link" onClick={() => { setStep(3); setScreen('questions'); }}>Edit answers</button>
                  </>
                )}
              </div>
            </>
          )}

          {/* Turnstile: empty unless Cloudflare wants a visible check. */}
          <div ref={turnstileRef} className="fl-try__turnstile" />
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------ results */

const VerdictRow: React.FC<{ name: React.ReactNode; code?: string; verdict: TrialVerdict; rank?: number; size?: 'lg' | 'sm' }> = ({
  name,
  code,
  verdict,
  rank,
  size = 'lg',
}) => (
  <div className={`fl-try__verdict fl-try__verdict--${VERDICT_TONE[verdict]} fl-try__verdict--${size}`}>
    <div className="fl-try__verdictink">
      <div className="fl-try__verdicttop">
        {rank != null && <span className="fl-try__rank">{rank}</span>}
        <span className="fl-try__verdictname">{name}</span>
        {code && <span className="fl-try__verdictcode">{code}</span>}
        <span className="fl-try__verdictstatus">{VERDICT_LABEL[verdict]}</span>
      </div>
    </div>
    <div className="fl-try__verdictrule" />
  </div>
);

const ClientResult: React.FC<{
  match: TrialMatch;
  remaining: number;
  onCreateAccount: () => void;
  onLogIn: () => void;
  onStartOver: () => void;
}> = ({ match, remaining, onCreateAccount, onLogIn, onStartOver }) => {
  const label = `${match.visaName} visa (${match.visaSubclass})`;
  const title =
    match.verdict === 'qualifies'
      ? `${label} looks like the best fit.`
      : match.verdict === 'possibly_qualifies'
      ? `${label} could be the best fit.`
      : 'No strong match from these answers.';
  const sub =
    match.verdict === 'qualifies'
      ? 'From these answers, your client qualifies for this one. The full report explains why, and checks nine more.'
      : match.verdict === 'possibly_qualifies'
      ? 'Your client may qualify for this one. The full report shows what’s still missing, and checks nine more.'
      : 'The closest is below. The full report shows what’s missing for each of the 10 visas.';
  const others = SUBCLASSES.filter((s) => s.code !== match.visaSubclass);
  return (
    <>
      <h2 id="fl-try-heading" data-try-heading tabIndex={-1} className="fl-try__h">{title}</h2>
      <p className="fl-try__sub">{sub}</p>
      <div role="status">
        <VerdictRow name={match.visaName} code={match.visaSubclass} verdict={match.verdict} />
      </div>
      <h3 className="fl-try__h3">The full report also checks</h3>
      <ul className="fl-try__others">
        {others.map((o) => (
          <li key={o.code}><span className="fl-try__othercode">{o.code}</span><span>{o.name}</span></li>
        ))}
      </ul>
      <div className="fl-try__cta">
        <p>Create a free account to see why it fits, what’s missing, and how the other nine compare. Your answers come with you.</p>
        <div className="fl-try__actions">
          <button type="button" className="fl-btn" onClick={onCreateAccount}>Create account</button>
          <button type="button" className="fl-link" onClick={onLogIn}>Log in</button>
        </div>
      </div>
      <p className="fl-try__foot">
        {remaining === 1 ? '1 free check left today.' : `${remaining} free checks left today.`}{' '}
        <button type="button" className="fl-try__inline" onClick={onStartOver}>Try another scenario</button>
      </p>
    </>
  );
};

const SelfResult: React.FC<{ result: Extract<TrialResult, { audience: 'self' }>; onStartOver: () => void }> = ({ result, onStartOver }) => {
  const best = result.best;
  const verdicts = [best.verdict, ...result.others.map((o) => o.verdict)];
  const anyFit = verdicts.some((v) => v === 'qualifies' || v === 'possibly_qualifies');
  const title = result.hidden ? 'Your best match is ready.' : anyFit ? 'These visas could suit you.' : 'No strong match from these answers.';
  const sub = result.hidden
    ? 'Your best match is kept for the full report. Your other matches are below.'
    : 'Best fit first, based on your answers. A registered migration agent can tell you which one to apply for.';
  return (
    <>
      <h2 id="fl-try-heading" data-try-heading tabIndex={-1} className="fl-try__h">{title}</h2>
      <p className="fl-try__sub">{sub}</p>
      <ol role="status" className="fl-try__matches">
        <li>
          {isFullMatch(best) ? (
            <VerdictRow rank={1} name={best.visaName} code={best.visaSubclass} verdict={best.verdict} size="sm" />
          ) : (
            // The paid report (VA.5) will offer the unlock here; until then the server never hides it.
            <VerdictRow rank={1} name="Best match, in the full report" verdict={best.verdict} size="sm" />
          )}
        </li>
        {result.others.map((m, i) => (
          <li key={m.visaSubclass}>
            <VerdictRow rank={i + 2} name={m.visaName} code={m.visaSubclass} verdict={m.verdict} size="sm" />
          </li>
        ))}
      </ol>
      <div className="fl-try__box">
        <h3 className="fl-try__boxtitle">Get help with your application</h3>
        <p>
          Only a registered migration agent or an immigration lawyer can advise you on your situation. You can
          search the government’s register of registered agents.
        </p>
        <a className="fl-btn" href={AGENT_REGISTER_URL} target="_blank" rel="noopener noreferrer" onClick={() => recordTrialEvent('register_click', 'self')}>Find a registered agent</a>
      </div>
      <p className="fl-try__foot">
        {result.remainingToday === 1 ? '1 free check left today.' : `${result.remainingToday} free checks left today.`}{' '}
        <button type="button" className="fl-try__inline" onClick={onStartOver}>Try another scenario</button>
      </p>
    </>
  );
};

/* -------------------------------------------------------- account forms */

const SignUpForm: React.FC<{
  signUp: ReturnType<typeof useAuth>['signUp'];
  onDone: () => void;
  onNeedsConfirmation: () => void;
  onLogIn: () => void;
  onBack: () => void;
}> = ({ signUp, onDone, onNeedsConfirmation, onLogIn, onBack }) => {
  const [first, setFirst] = useState('');
  const [surname, setSurname] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const passwordError = validateNewPassword(password, confirm);
    if (passwordError) return setError(passwordError);
    if (!first.trim() || !surname.trim()) return setError('First name and surname cannot be empty.');
    setBusy(true);
    const { error: err, needsEmailConfirmation } = await signUp(email, password, `${first.trim()} ${surname.trim()}`, {
      company: company.trim() || undefined,
    });
    setBusy(false);
    if (err) return setError(err);
    if (needsEmailConfirmation) onNeedsConfirmation();
    else onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="fl-try__form">
      <h2 id="fl-try-heading" data-try-heading tabIndex={-1} className="fl-try__h">Create your account</h2>
      <p className="fl-try__sub">It’s free. The full report for this scenario opens as soon as you’re in.</p>
      <div className="fl-try__two">
        <div className="fl-field"><label htmlFor="try-first">First name</label><input id="try-first" className="fl-input" autoComplete="given-name" maxLength={100} value={first} onChange={(e) => setFirst(e.target.value)} /></div>
        <div className="fl-field"><label htmlFor="try-surname">Surname</label><input id="try-surname" className="fl-input" autoComplete="family-name" maxLength={100} value={surname} onChange={(e) => setSurname(e.target.value)} /></div>
      </div>
      <div className="fl-field"><label htmlFor="try-company">Firm or company <span className="fl-field__opt">(optional)</span></label><input id="try-company" className="fl-input" autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} /></div>
      <div className="fl-field"><label htmlFor="try-email">Email</label><input id="try-email" className="fl-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="fl-try__two">
        <div className="fl-field"><label htmlFor="try-pw">Password</label><input id="try-pw" className="fl-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /><span className="fl-field__hint">At least 6 characters.</span></div>
        <div className="fl-field"><label htmlFor="try-pw2">Confirm password</label><input id="try-pw2" className="fl-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
      </div>
      <div aria-live="polite">{error && <p className="fl-note fl-note--bad">{error}</p>}</div>
      <button type="submit" className="fl-btn fl-form__go" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      <p className="fl-try__foot">
        Already have an account? <button type="button" className="fl-try__inline" onClick={onLogIn}>Log in</button>. Or go{' '}
        <button type="button" className="fl-try__inline" onClick={onBack}>back to your result</button>.
      </p>
    </form>
  );
};

const LogInForm: React.FC<{
  signIn: ReturnType<typeof useAuth>['signIn'];
  onDone: () => void;
  onSignUp: () => void;
  onBack: () => void;
}> = ({ signIn, onDone, onSignUp, onBack }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await signIn(email, password);
    setBusy(false);
    if (err) return setError(err);
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="fl-try__form">
      <h2 id="fl-try-heading" data-try-heading tabIndex={-1} className="fl-try__h">Log in</h2>
      <p className="fl-try__sub">The full report for this scenario opens as soon as you’re in.</p>
      <div className="fl-field"><label htmlFor="try-in-email">Email</label><input id="try-in-email" className="fl-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="fl-field"><label htmlFor="try-in-pw">Password</label><input id="try-in-pw" className="fl-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <div aria-live="polite">{error && <p className="fl-note fl-note--bad">{error}</p>}</div>
      <button type="submit" className="fl-btn fl-form__go" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      <p className="fl-try__foot">
        No account yet? <button type="button" className="fl-try__inline" onClick={onSignUp}>Create one</button>. Or go{' '}
        <button type="button" className="fl-try__inline" onClick={onBack}>back to your result</button>.
      </p>
    </form>
  );
};

/* ---------------------------------------------------------------- styles */

// Scoped to the sheet; relies on the homepage's tokens (--paper, --ink, --accent…) from its `.fl` root.
const TRY_CSS = `
.fl-sheet--try { padding: 20px; overflow-y: auto; }
.fl-try {
  position: relative; width: 100%; max-width: 760px; max-height: calc(100dvh - 40px);
  display: grid; grid-template-columns: 212px minmax(0, 1fr);
  background: var(--paper); border: 1px solid var(--rule); border-radius: 4px; overflow: hidden;
  box-shadow: 0 40px 90px -40px rgba(10,20,15,0.7); animation: fl-rise 220ms var(--ease);
}
.fl-try .fl-sheet__x { z-index: 2; width: 44px; height: 44px; }
.fl-try__aside { background: var(--paper-2); border-right: 1px solid var(--rule-soft); padding: 30px 22px 24px 24px; display: flex; flex-direction: column; gap: 18px; overflow-y: auto; }
.fl-try__asidehead { display: flex; align-items: baseline; gap: 10px; }
.fl-try__asidetitle { font-family: var(--display); font-weight: 600; font-size: 17px; line-height: 1.2; letter-spacing: -0.01em; margin: 0; }
.fl-try__asidecount, .fl-try__asidetoggle { display: none; }
.fl-try__rows { margin: 0; display: flex; flex-direction: column; gap: 12px; }
.fl-try__rows dt { font-size: 12.5px; color: var(--ink-soft); }
.fl-try__rows dd { margin: 2px 0 0; font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
.fl-try__rows dd.fl-try__blank { margin-top: 10px; width: 44px; height: 1px; background: var(--rule); }
.fl-try__disclaimer { margin: auto 0 0; font-size: 12.5px; line-height: 1.5; color: var(--ink-soft); border-top: 1px solid var(--rule); padding-top: 12px; }
.fl-try__main { padding: 34px 36px 28px; display: flex; flex-direction: column; min-height: 560px; overflow-y: auto; }
.fl-try__h { font-family: var(--display); font-weight: 600; font-size: 28px; line-height: 1.1; letter-spacing: -0.018em; margin: 0 48px 8px 0; text-wrap: balance; outline: none; }
.fl-try__sub { font-size: 15px; line-height: 1.55; color: var(--ink-soft); margin: 0 0 22px; max-width: 46ch; }
.fl-try__h3 { margin: 22px 0 10px; font-size: 14px; font-weight: 600; }
.fl-try__choices { display: flex; flex-direction: column; gap: 10px; }
.fl-try__choice { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; min-height: 76px; padding: 16px 18px; border-radius: 4px; border: 1px solid var(--rule); background: var(--card); cursor: pointer; font-family: inherit; text-align: left; color: var(--ink); transition: border-color 140ms var(--ease), background 140ms var(--ease); }
.fl-try__choice:hover { border-color: var(--accent-ink); }
.fl-try__choice.is-on { border: 1.5px solid var(--accent-ink); background: rgba(18,183,106,0.09); }
.fl-try__choicetext { display: flex; flex-direction: column; gap: 4px; }
.fl-try__choicetitle { font-family: var(--display); font-weight: 600; font-size: 20px; letter-spacing: -0.01em; }
.fl-try__choicedesc { font-size: 14px; line-height: 1.5; color: var(--ink-soft); }
.fl-try__ring { flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid rgba(16,22,20,0.35); box-sizing: border-box; }
.fl-try__choice.is-on .fl-try__ring { border: 6px solid var(--accent-ink); background: var(--card); }
.fl-try__label { display: block; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-soft); margin-bottom: 7px; }
.fl-try__stack > * + * { margin-top: 18px; }
.fl-try__stack--loose > * + * { margin-top: 20px; }
.fl-try__chip { min-height: 44px; padding: 10px 15px; border-radius: 2px; border: 1px solid var(--rule); background: var(--card); color: var(--ink); font-family: var(--text); font-size: 14.5px; font-weight: 500; cursor: pointer; transition: border-color 140ms var(--ease); }
.fl-try__chip:hover { border-color: var(--accent-ink); }
.fl-try__chip.is-on { border-color: var(--accent); background: var(--accent); font-weight: 600; }
.fl-try__check { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 12px; align-items: start; font-size: 14.5px; line-height: 1.5; cursor: pointer; }
.fl-try__checkbox { width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--accent-ink); }
.fl-try__section { border-top: 1px solid var(--rule-soft); }
.fl-try__section > * + * { margin-top: 16px; }
.fl-try__sectionlabel { margin: 16px 0 0; font-size: 13.5px; font-weight: 600; }
.fl-try__error { font-size: 13px; color: var(--signal-no-ink); margin: 6px 0 0; }
.fl-try__bar { margin-top: auto; padding-top: 22px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.fl-try__barleft { display: flex; align-items: center; gap: 18px; }
.fl-try__stepnote { font-size: 13.5px; color: var(--ink-soft); }
.fl-try__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }
.fl-try__status { margin: 14px 0 0; font-size: 13.5px; color: var(--ink-soft); }
.fl-try__skeleton { background: var(--card); border: 1px solid var(--rule-soft); border-radius: 3px; padding: 16px 18px; }
.fl-try__skeletontop { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.fl-try__skeletontop span { height: 12px; border-radius: 2px; background: rgba(16,22,20,0.08); }
.fl-try__skeletontop span:nth-child(1) { width: 96px; } .fl-try__skeletontop span:nth-child(2) { width: 34px; } .fl-try__skeletontop span:nth-child(3) { width: 74px; margin-left: auto; }
.fl-try__skeletonrule { height: 3px; border-radius: 2px; background: var(--rule-soft); overflow: hidden; }
.fl-try__skeletonrule span { display: block; height: 100%; width: 100%; background: rgba(16,22,20,0.22); transform-origin: left; animation: fl-try-think 2.4s var(--ease) infinite alternate; }
@keyframes fl-try-think { from { transform: scaleX(0.08); } to { transform: scaleX(0.85); } }
.fl-try__verdict { background: var(--card); border: 1px solid var(--rule-soft); border-radius: 3px; padding: 16px 18px; overflow: hidden; }
.fl-try__verdict--sm { padding: 12px 16px; }
.fl-try__verdictink { animation: fl-try-ink 560ms var(--ease) both; }
.fl-try__verdicttop { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
.fl-try__rank { font-family: var(--display); font-weight: 600; font-size: 16px; color: var(--ink-soft); width: 16px; }
.fl-try__verdictname { font-size: 17px; font-weight: 600; }
.fl-try__verdict--sm .fl-try__verdictname { font-size: 15px; }
.fl-try__verdictcode { font-family: var(--mono); font-size: 12.5px; color: var(--ink-soft); }
.fl-try__verdictstatus { margin-left: auto; font-family: var(--mono); font-size: 11.5px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
.fl-try__verdictrule { height: 3px; border-radius: 2px; transform-origin: left; animation: fl-try-rule 420ms var(--ease) 520ms both; }
.fl-try__verdict--good .fl-try__verdictstatus { color: var(--signal-yes-ink); } .fl-try__verdict--good .fl-try__verdictrule { background: var(--signal-yes-fill); }
.fl-try__verdict--maybe .fl-try__verdictstatus { color: var(--signal-maybe-ink); } .fl-try__verdict--maybe .fl-try__verdictrule { background: var(--signal-maybe-fill); }
.fl-try__verdict--bad .fl-try__verdictstatus { color: var(--signal-no-ink); } .fl-try__verdict--bad .fl-try__verdictrule { background: var(--signal-no-fill); }
.fl-try__verdict--info .fl-try__verdictstatus { color: var(--ink-soft); } .fl-try__verdict--info .fl-try__verdictrule { background: rgba(16,22,20,0.28); }
@keyframes fl-try-ink { from { clip-path: inset(0 100% 0 0); opacity: 0.2; } to { clip-path: inset(0 0 0 0); opacity: 1; } }
@keyframes fl-try-rule { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.fl-try__matches { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.fl-try__others { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 16px; row-gap: 8px; }
.fl-try__others li { display: flex; align-items: baseline; gap: 8px; border-top: 1px solid var(--rule-soft); padding-top: 8px; font-size: 13px; }
.fl-try__othercode { font-family: var(--mono); font-size: 12px; color: var(--ink-soft); }
.fl-try__cta { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--rule); }
.fl-try__cta p, .fl-try__box p { margin: 0 0 14px; font-size: 15px; line-height: 1.55; max-width: 48ch; }
.fl-try__box { margin-top: 18px; background: var(--paper-2); border-radius: 4px; padding: 20px 22px; }
.fl-try__boxtitle { font-family: var(--display); font-weight: 600; font-size: 21px; letter-spacing: -0.01em; margin: 0 0 6px; }
.fl-try__foot { margin: auto 0 0; padding-top: 20px; font-size: 13.5px; line-height: 1.6; color: var(--ink-soft); }
.fl-try__inline { background: none; border: none; padding: 0; font: inherit; color: var(--ink); font-weight: 500; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.fl-try__inline:hover { color: var(--accent-ink); }
.fl-try__two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
.fl-try__form { display: flex; flex-direction: column; flex: 1; }
.fl-try__turnstile:empty { display: none; }
.fl-try__turnstile { margin-top: 16px; }
@media (max-width: 720px) {
  .fl-sheet--try { padding: 0; }
  .fl-try { max-width: none; max-height: none; min-height: 100dvh; border-radius: 0; border: none; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr; }
  .fl-try__aside { border-right: none; border-bottom: 1px solid var(--rule-soft); padding: 14px 64px 14px 20px; gap: 12px; }
  .fl-try__asidecount, .fl-try__asidetoggle { display: inline; }
  .fl-try__asidecount { font-size: 13.5px; color: var(--ink-soft); }
  .fl-try__asidetoggle { margin-left: auto; font-size: 14px; }
  .fl-try__aside .fl-try__rows, .fl-try__aside .fl-try__disclaimer { display: none; }
  .fl-try__aside.is-open .fl-try__rows, .fl-try__aside.is-open .fl-try__disclaimer { display: flex; }
  .fl-try__main { padding: 24px 20px 28px; min-height: 0; }
  .fl-try__h { font-size: 25px; }
  .fl-try__others { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fl-try__two { grid-template-columns: minmax(0, 1fr); gap: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .fl-try, .fl-try__verdictink, .fl-try__verdictrule, .fl-try__skeletonrule span { animation: none; }
}
`;
