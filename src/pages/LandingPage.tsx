import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Edamame landing page — take four, "edamame-folio".
 *
 * Grammar: chaptered editorial (scroll-craft uniqueness.md §2.2). Vertical
 * scroll only, no lateral pan, no scroll-jacking. Hard cuts between chapters on
 * their own opaque grounds, a folio in the left margin instead of a fixed
 * marketing bar, a type-only title page, and a colophon close.
 *
 * Brief, feeling curve, score table and fingerprint gate:
 *   scrollcraft/builds/edamame-folio/BRIEF.md
 *
 * The signature move ("the docket sorts itself") lives in Chapter I: scattered
 * case files snap one at a time into a ruled docket as that chapter's own scroll
 * progress advances, the docket rules drawing to meet them, and three real visa
 * verdicts writing in afterwards with their colour arriving last. Every value is
 * a pure function of chapter progress, so scrolling back up plays it backwards.
 */

type Audience = 'lawyer' | 'agency';

const AUDIENCE_LINE: Record<Audience, string> = {
  lawyer: 'Built for AU and NZ immigration law firms.',
  agency: 'Built for AU and NZ study-abroad agencies.',
};
const DEFAULT_LINE = 'Built for AU and NZ immigration lawyers and study-abroad agencies.';

function isAudience(value: string | null): value is Audience {
  return value === 'lawyer' || value === 'agency';
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Mild overshoot, so a case file snaps into its docket row instead of gliding. */
function easeOutBack(t: number) {
  const c1 = 1.02;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

/* ---------------------------------------------------------------- content */

type CaseFile = { label: string; note: string; dx: number; dy: number; rot: number };

/** The five workflow templates the app actually ships with. */
const CASE_FILES: CaseFile[] = [
  { label: 'Partner 820/801', note: 'Onshore', dx: -48, dy: 128, rot: -13 },
  { label: 'Student 500', note: 'CRICOS', dx: 52, dy: 32, rot: 10 },
  { label: 'Skilled 190', note: 'Nominated', dx: -34, dy: -28, rot: 15 },
  { label: 'Visitor 600', note: 'Tourist', dx: 46, dy: 142, rot: -8 },
  { label: 'Graduate 485', note: 'Post-study', dx: -14, dy: 70, rot: 21 },
];

/**
 * The advisor's four possible verdicts are qualifies / possibly / unlikely /
 * needs_more_info (api/check-eligibility.ts). Three are shown here.
 */
const VERDICTS = [
  { name: 'Student', code: '500', status: 'Qualifies', tone: 'good', fill: 88, reason: 'Confirmed enrolment in a CRICOS-registered course.' },
  { name: 'Skilled Nominated', code: '190', status: 'Possibly', tone: 'maybe', fill: 58, reason: 'Occupation is on the relevant skilled list. Points test not yet confirmed.' },
  { name: 'Partner', code: '820/801', status: 'Unlikely', tone: 'bad', fill: 22, reason: 'Relationship does not yet meet the minimum duration.' },
];

/** /api/generate-tasks returns titled tasks with a day offset; the app dates them. */
const TASK_ROWS = [
  { day: 'Day 0', title: 'Open file and confirm identity documents' },
  { day: 'Day 4', title: 'Request CRICOS confirmation of enrolment' },
  { day: 'Day 11', title: 'Book immigration medical examination' },
  { day: 'Day 26', title: 'Assemble and lodge the application' },
];

/** Real seeded document-type codes from src/lib/documentTypes.ts. */
const DOC_CHIPS = [
  { code: 'PPT', label: 'Passport, all pages' },
  { code: 'MEDEX', label: 'Medical examination' },
  { code: 'AFPCHK', label: 'AFP police check' },
  { code: 'BIRTH', label: 'Birth certificate' },
];

const FAQS = [
  { q: 'Can I keep my data on my own machine?', a: 'Yes. Local mode links a real folder on disk (works well inside Dropbox, OneDrive or iCloud Drive) and every case is a plain file in it. Nothing is uploaded unless you switch to cloud mode.' },
  { q: 'Does this work for both AU and NZ?', a: 'Yes, both jurisdictions are supported with their own workflow templates and terminology, not one generic template stretched across both.' },
  { q: 'Can my whole team use one account?', a: 'Yes. Team members share cases, an activity feed, and document checklists, whether you’re on local or cloud storage.' },
  { q: 'What happens to my local data if I switch to cloud later?', a: 'Switching modes copies every case, client, and document across for you. Your local folder is left untouched afterward, so it stays as a backup.' },
];

type Chapter = { id: string; numeral: string; short: string; title: string };

const CHAPTERS: Chapter[] = [
  { id: 'advisor', numeral: 'I', short: 'Advisor', title: 'AI Visa Advisor' },
  { id: 'planner', numeral: 'II', short: 'Planner', title: 'AI Task Planner' },
  { id: 'local', numeral: 'III', short: 'On disk', title: 'Local storage' },
  { id: 'cloud', numeral: 'IV', short: 'In cloud', title: 'Cloud storage' },
  { id: 'team', numeral: 'V', short: 'Your team', title: 'Team and attachments' },
  { id: 'faq', numeral: 'VI', short: 'Questions', title: 'Common questions' },
];

/**
 * The last chapter is the account form itself, so the page ends where you
 * start rather than handing off to a separate screen. Hidden once signed in.
 */
const START_CHAPTER: Chapter = { id: 'start', numeral: 'VII', short: 'Start', title: 'Create your account' };

const NAME_MAX_LENGTH = 100;

/* ------------------------------------------------------------------ hooks */

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    const mq = matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/* -------------------------------------------------------------- component */

export default function LandingPage() {
  const { user, signIn, signUp, resetPassword } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const audienceParam = searchParams.get('for');
  const audienceLine = isAudience(audienceParam) ? AUDIENCE_LINE[audienceParam] : DEFAULT_LINE;

  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)');

  const chapters = useMemo(() => (user ? CHAPTERS : [...CHAPTERS, START_CHAPTER]), [user]);

  const [activeChapter, setActiveChapter] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  /* ---------------------------------------------------------------- auth */
  // Where ProtectedRoute wanted to send them before it bounced them here.
  const from = (location.state as { from?: string } | null)?.from || '/dashboard';

  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetOpenerRef = useRef<HTMLElement | null>(null);

  const [inEmail, setInEmail] = useState('');
  const [inPassword, setInPassword] = useState('');
  const [inBusy, setInBusy] = useState(false);
  const [inError, setInError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [company, setCompany] = useState('');
  const [upEmail, setUpEmail] = useState('');
  const [upPassword, setUpPassword] = useState('');
  const [upConfirm, setUpConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [upBusy, setUpBusy] = useState(false);
  const [upError, setUpError] = useState<string | null>(null);
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const openSheet = useCallback((e?: React.MouseEvent<HTMLElement>) => {
    sheetOpenerRef.current = (e?.currentTarget as HTMLElement) ?? null;
    setInError(null);
    setResetSent(false);
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    // hand focus back to whatever opened it
    sheetOpenerRef.current?.focus();
    sheetOpenerRef.current = null;
  }, []);

  const handleLogIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setInError(null);
    setInBusy(true);
    const { error } = await signIn(inEmail, inPassword);
    setInBusy(false);
    if (error) {
      setInError(error);
      return;
    }
    navigate(from, { replace: true });
  };

  const handleResetLink = async () => {
    if (!inEmail) {
      setInError('Enter your email address above, then ask for the reset link.');
      return;
    }
    setInError(null);
    const { error } = await resetPassword(inEmail);
    if (error) {
      setInError(error);
      return;
    }
    setResetSent(true);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpError(null);

    if (upPassword.length < 6) {
      setUpError('Password must be at least 6 characters.');
      return;
    }
    if (upPassword !== upConfirm) {
      setUpError('The two passwords do not match.');
      return;
    }
    const trimmedFirst = firstName.trim();
    const trimmedSurname = surname.trim();
    if (!trimmedFirst || !trimmedSurname) {
      setUpError('First name and surname cannot be empty.');
      return;
    }

    const fullName = `${trimmedFirst} ${trimmedSurname}`.trim();
    const trimmedCompany = company.trim();

    setUpBusy(true);
    const { error, needsEmailConfirmation } = await signUp(upEmail, upPassword, fullName, {
      company: trimmedCompany || undefined,
    });
    setUpBusy(false);

    if (error) {
      setUpError(error);
      return;
    }
    if (needsEmailConfirmation) {
      setConfirmSentTo(upEmail);
      return;
    }
    navigate('/dashboard', { replace: true });
  };

  /* --- /login and /register keep working as deep links into this page --- */
  useEffect(() => {
    if (user) return;
    if (location.pathname === '/login') {
      sheetOpenerRef.current = null;
      setSheetOpen(true);
    } else if (location.pathname === '/register') {
      const el = document.getElementById('start');
      // .fl-ch carries scroll-margin-top below 1024px so the chapter clears the
      // sticky folio strip.
      el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      // preventScroll: focusing would otherwise scroll the field into view and
      // undo the placement above, dropping the chapter heading under the strip.
      window.setTimeout(
        () => firstFieldRef.current?.focus({ preventScroll: true }),
        reduced ? 0 : 420
      );
    }
  }, [location.pathname, user, reduced]);

  /* --- the sheet is a real dialog: Esc, focus trap, focus restore --- */
  useEffect(() => {
    if (!sheetOpen) return;
    const panel = sheetRef.current;
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    // Array.prototype.slice, not Array.from: under this project's tsconfig the
    // latter widens a NodeList to unknown[].
    const focusables = (): HTMLElement[] =>
      panel ? (Array.prototype.slice.call(panel.querySelectorAll<HTMLElement>(selector)) as HTMLElement[]) : [];

    // land on the first field, not the close button
    (panel?.querySelector<HTMLElement>('input') ?? focusables()[0])?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSheet();
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
  }, [sheetOpen, closeSheet]);

  // scroll-driven nodes
  const heroRuleRef = useRef<HTMLSpanElement>(null);
  const colophonRuleRef = useRef<HTMLSpanElement>(null);
  const advisorRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRefs = useRef<Array<HTMLDivElement | null>>([]);
  const ruleRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const verdictRefs = useRef<Array<HTMLDivElement | null>>([]);
  const verdictBarRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const verdictStatusRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const localMediaRef = useRef<HTMLDivElement>(null);
  const plateRefs = useRef<Array<HTMLDivElement | null>>([]);
  const cloudMediaRef = useRef<HTMLDivElement>(null);
  const cloudWipeRef = useRef<HTMLDivElement>(null);
  const cloudThreadRef = useRef<HTMLSpanElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);

  /* --- the scroll spine: ordinary vertical scroll, read, never hijacked --- */
  useEffect(() => {
    if (reduced) return;
    let raf = 0;

    // progress across an element's own scrollable travel (used by the tall
    // Chapter I, whose media column is sticky)
    const travelProgress = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const total = Math.max(el.offsetHeight - innerHeight, 1);
      return clamp(-rect.top / total);
    };
    // progress across an element's whole visible life (used for parallax/wipes)
    const viewProgress = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      return clamp((innerHeight - rect.top) / (innerHeight + rect.height));
    };

    const paint = () => {
      // hero rule draws as the first screen is left behind
      if (heroRuleRef.current) {
        const p = clamp(scrollY / (innerHeight * 0.65));
        heroRuleRef.current.style.transform = `scaleX(${p})`;
      }
      if (colophonRuleRef.current) {
        const p = viewProgress(colophonRuleRef.current.parentElement as HTMLElement);
        colophonRuleRef.current.style.transform = `scaleX(${clamp(p * 4)})`;
      }

      /* ---- Chapter I · the signature move ---- */
      if (advisorRef.current) {
        // Desktop pins the media column, so the chapter's own scroll travel is
        // the playhead. Below 1024px there is no pinned column (pinning a
        // 500px docket on a phone would eat the screen), so the docket's own
        // pass through the viewport drives it instead.
        const wide = innerWidth >= 1024;
        const p = wide || !stageRef.current
          ? travelProgress(advisorRef.current)
          : viewProgress(stageRef.current);
        const sortP = clamp(p / 0.5);
        const readP = clamp((p - 0.34) / 0.5);

        fileRefs.current.forEach((el, i) => {
          if (!el) return;
          const f = CASE_FILES[i];
          const t = clamp((sortP - i * 0.055) / 0.34);
          const e = t <= 0 ? 0 : t >= 1 ? 1 : easeOutBack(t);
          const k = 1 - e;
          el.style.transform =
            `translate3d(${(f.dx * k).toFixed(2)}px, ${(f.dy * k).toFixed(2)}px, 0)` +
            ` rotate(${(f.rot * k).toFixed(2)}deg) scale(${lerp(0.86, 1, e).toFixed(3)})`;
          el.style.opacity = String(lerp(0.34, 1, clamp(t * 2)).toFixed(3));
        });

        ruleRefs.current.forEach((el, i) => {
          if (!el) return;
          el.style.transform = `scaleX(${clamp((sortP - i * 0.055 + 0.055) / 0.16).toFixed(3)})`;
        });

        verdictRefs.current.forEach((el, i) => {
          if (!el) return;
          const t = clamp((readP - i * 0.18) / 0.34);
          el.style.clipPath = `inset(0 ${((1 - t) * 100).toFixed(2)}% 0 0)`;
          el.style.opacity = String(lerp(0.18, 1, clamp(t * 2.4)).toFixed(3));
          // colour arrives last: the answer lands after the words are readable
          const late = clamp((t - 0.55) / 0.45);
          const bar = verdictBarRefs.current[i];
          if (bar) bar.style.transform = `scaleX(${late.toFixed(3)})`;
          const status = verdictStatusRefs.current[i];
          if (status) status.style.opacity = late.toFixed(3);
        });
      }

      /* ---- Chapter III · parallax plates ---- */
      if (localMediaRef.current) {
        const p = viewProgress(localMediaRef.current);
        const rates = [-1.0, -0.45, 0.55];
        plateRefs.current.forEach((el, i) => {
          if (!el) return;
          el.style.transform = `translate3d(0, ${(rates[i] * (p - 0.5) * 100).toFixed(2)}px, 0)`;
        });
      }

      /* ---- Chapter IV · the wipe ---- */
      if (cloudMediaRef.current) {
        const p = clamp((viewProgress(cloudMediaRef.current) - 0.38) / 0.32);
        if (cloudWipeRef.current) {
          cloudWipeRef.current.style.clipPath = `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)`;
        }
        if (cloudThreadRef.current) {
          cloudThreadRef.current.style.transform = `scaleX(${p.toFixed(3)})`;
        }
      }
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        paint();
      });
    };

    paint();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
    };
  }, [reduced]);

  /* --- reveal on entry, once, for the flow chapters --- */
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-in]'));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-in', 'shown');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  /* --- the folio marks the chapter you are in --- */
  useEffect(() => {
    const sections = chapters.map((c) => document.getElementById(c.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveChapter(entry.target.id);
        });
      },
      { rootMargin: '-45% 0px -45% 0px' }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [chapters]);

  /* --- Chapter V · the one place the page answers the pointer --- */
  const onTilt = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!finePointer || reduced) return;
      const el = tiltRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateY(${(x * 7).toFixed(2)}deg) rotateX(${(-y * 6).toFixed(2)}deg)`;
    },
    [finePointer, reduced]
  );
  const onTiltLeave = useCallback(() => {
    if (tiltRef.current) tiltRef.current.style.transform = 'perspective(900px) rotateY(0deg) rotateX(0deg)';
  }, []);

  // Signed out, every call to action points at the form on this page rather
  // than at another screen; signed in, it points at the app.
  const ctaLabel = user ? 'Go to Dashboard' : 'Create account';
  const renderCta = (className: string) =>
    user ? (
      <Link className={className} to="/dashboard">{ctaLabel}</Link>
    ) : (
      <a className={className} href="#start">{ctaLabel}</a>
    );

  const fileStyle = (i: number): React.CSSProperties => {
    if (reduced) return {};
    const f = CASE_FILES[i];
    return {
      transform: `translate3d(${f.dx}px, ${f.dy}px, 0) rotate(${f.rot}deg) scale(0.86)`,
      opacity: 0.34,
    };
  };

  return (
    <div className="fl">
      <style>{`
        .fl {
          /* Signal palette. The three verdict colours are the product's own
             vocabulary (qualifies / possibly / unlikely), so they carry the
             page's colour rather than one green doing every job. Each has a
             -fill (backgrounds, bars, rules) and an -ink (text) value: the
             bright greens read at ~2.6:1 as text and would fail, so anything
             that has to be READ uses the deep variant. */
          --paper: #F1F3EF;
          --paper-2: #E7EBE4;
          --card: #FAFAF7;
          --ink: #101614;
          --ink-soft: #56635C;
          --accent: #12B76A;      /* fills only */
          --accent-ink: #0B6B3F;  /* 5.9:1 on paper */
          --accent-press: #0FA35E;
          --signal-yes-fill: #12B76A;
          --signal-yes-ink: #0B6B3F;
          --signal-maybe-fill: #F5B324;
          --signal-maybe-ink: #8F5A03;
          --signal-no-fill: #EF5350;
          --signal-no-ink: #B42318;
          --plate: #0D1A13;
          --rule: rgba(16,22,20,0.16);
          --rule-soft: rgba(16,22,20,0.09);
          --shadow: 0 18px 40px -26px rgba(16,32,24,0.45), 0 2px 6px -3px rgba(16,32,24,0.12);
          --display: 'Fraunces', Georgia, 'Times New Roman', serif;
          --text: 'Archivo', 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif;
          --mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          --ease: cubic-bezier(0.23, 1, 0.32, 1);
          --rail: 208px;
          /* A near-invisible fiber grain, layered with multiply so the flat
             --paper/--paper-2 fills read as real stock rather than a CSS
             color. Never applied to --ch--plate: that chapter is deliberately
             a dark screen, not paper. */
          --grain: url('/images/paper-grain.webp');
          background: var(--paper);
          color: var(--ink);
          font-family: var(--text);
          position: relative;
        }
        .fl *, .fl *::before, .fl *::after { box-sizing: border-box; }
        .fl ::selection { background: rgba(18,183,106,0.26); }
        /* focus ring uses the deep green: the bright fill green is 2.6:1 on
           paper, too weak to be a reliable focus indicator */
        .fl :focus-visible { outline: 2px solid var(--accent-ink); outline-offset: 3px; border-radius: 3px; }

        /* ---------------------------------------------------------- folio */
        .fl-folio {
          position: fixed; inset: 0 auto 0 0; width: var(--rail); z-index: 40;
          display: flex; flex-direction: column; padding: 30px 22px 26px 30px;
          border-right: 1px solid var(--rule-soft);
          background-color: var(--paper); background-image: var(--grain);
          background-size: 480px 480px; background-blend-mode: multiply;
        }
        .fl-folio__mark {
          font-family: var(--display); font-weight: 700; font-size: 17px;
          letter-spacing: -0.01em; text-decoration: none; color: var(--ink);
        }
        .fl-folio__mark span { color: var(--accent-ink); }
        .fl-folio__list { list-style: none; margin: auto 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
        .fl-folio__link {
          display: grid; grid-template-columns: 26px 1fr; align-items: baseline; gap: 8px;
          padding: 6px 0; text-decoration: none; color: var(--ink-soft);
          font-size: 13px; letter-spacing: 0.01em;
          transition: color 140ms var(--ease);
        }
        .fl-folio__link em {
          font-family: var(--mono); font-style: normal; font-size: 11px;
          letter-spacing: 0.02em; color: var(--ink-soft);
          transition: color 140ms var(--ease);
        }
        .fl-folio__link:hover { color: var(--ink); }
        .fl-folio__link[aria-current="true"] { color: var(--ink); }
        .fl-folio__link[aria-current="true"] em { color: var(--accent-ink); }
        .fl-folio__link[aria-current="true"]::after {
          content: ''; grid-column: 2; display: block; height: 1px; background: var(--accent-ink);
        }
        .fl-folio__foot { font-size: 12.5px; color: var(--ink-soft); line-height: 1.7; }
        .fl-folio__foot a { color: var(--ink); text-underline-offset: 3px; text-decoration-thickness: 1px; }
        .fl-folio__foot a:hover { color: var(--accent-ink); }
        .fl-folio__signin {
          background: none; border: none; padding: 0; cursor: pointer;
          font-family: var(--text); font-size: 12.5px; color: var(--ink);
          text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px;
        }
        .fl-folio__signin:hover { color: var(--accent-ink); }

        .fl-topfolio { display: none; }

        /* ---------------------------------------------------------- shell */
        .fl-body { margin-left: var(--rail); }
        .fl-ch { padding: clamp(84px, 12vh, 150px) clamp(24px, 5vw, 84px); position: relative; }
        .fl-ch--paper {
          background-color: var(--paper); background-image: var(--grain);
          background-size: 480px 480px; background-blend-mode: multiply;
        }
        .fl-ch--paper2 {
          background-color: var(--paper-2); background-image: var(--grain);
          background-size: 480px 480px; background-blend-mode: multiply;
        }
        /* The inverted spread re-points every token, including --accent-ink:
           the deep green that carries text on paper is unreadable on plate, so
           the "text" green here is a light one (12.3:1). */
        .fl-ch--plate {
          background: var(--plate);
          --ink: #EDF2EC; --ink-soft: #A2B7AA; --rule: rgba(237,242,236,0.2);
          --rule-soft: rgba(237,242,236,0.12);
          --accent: #4FE09A; --accent-ink: #7CEBB4; --card: #17251E;
          color: #EDF2EC;
        }
        .fl-wrap { max-width: 1120px; margin: 0 auto; }

        .fl-open { display: flex; align-items: baseline; gap: 16px; margin-bottom: 30px; }
        .fl-open__num {
          font-family: var(--text); font-weight: 600; font-size: 11.5px; letter-spacing: 0.16em;
          text-transform: uppercase; color: var(--accent-ink); flex-shrink: 0;
        }
        .fl-open__num b { font-family: var(--mono); font-weight: 500; letter-spacing: 0.04em; }
        .fl-open__sub {
          font-family: var(--text); font-weight: 500; font-size: 13px; letter-spacing: 0.01em;
          color: var(--ink-soft); flex-shrink: 0;
        }
        .fl-open__line { flex: 1; height: 1px; background: var(--rule); }

        /* Fraunces is variable on optical size and weight, so headings carry
           real 600/700 weights and the loaded italic axis covers the hero. */
        .fl-h2 {
          font-family: var(--display); font-weight: 600;
          font-size: clamp(2.05rem, 4.2vw, 3.15rem); line-height: 1.03;
          letter-spacing: -0.018em; margin: 0 0 20px; text-wrap: balance;
          max-width: 16ch;
        }
        .fl-lede { font-size: clamp(1.05rem, 1.5vw, 1.22rem); line-height: 1.55; margin: 0 0 18px; max-width: 34ch; }
        .fl-p { font-size: 16px; line-height: 1.68; color: var(--ink-soft); margin: 0 0 16px; max-width: 46ch; text-wrap: pretty; }
        .fl-p strong { color: var(--ink); font-weight: 600; }
        .fl-cap {
          font-size: 12.5px; line-height: 1.55; color: var(--ink-soft);
          border-top: 1px solid var(--rule-soft); padding-top: 10px; margin: 18px 0 0; max-width: 40ch;
        }

        /* ------------------------------------------------------ title page */
        .fl-title {
          min-height: 100svh; display: flex; flex-direction: column; justify-content: center;
          padding: clamp(96px, 14vh, 170px) clamp(24px, 5vw, 84px) clamp(60px, 9vh, 110px);
          background-color: var(--paper); background-image: var(--grain);
          background-size: 480px 480px; background-blend-mode: multiply;
        }
        .fl-title__masthead {
          font-size: 12.5px; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--ink-soft); margin: 0 0 clamp(24px, 4vh, 44px);
        }
        .fl-h1 {
          font-family: var(--display); font-weight: 600;
          font-size: clamp(2.7rem, 7.4vw, 5.6rem); line-height: 0.98;
          letter-spacing: -0.028em; margin: 0; max-width: 15ch; text-wrap: balance;
        }
        .fl-h1 i { font-style: italic; color: var(--accent-ink); margin-right: 0.14em; }
        .fl-h1__accent { color: var(--accent-ink); }
        .fl-title__track {
          display: block; height: 2px; background: var(--rule-soft);
          margin: clamp(26px, 4vh, 44px) 0 0; max-width: 760px; overflow: hidden;
        }
        .fl-title__rule {
          display: block; height: 100%; background: var(--ink);
          transform: scaleX(0); transform-origin: left; will-change: transform;
        }
        .fl-title__deck {
          font-size: clamp(1.05rem, 1.6vw, 1.28rem); line-height: 1.55;
          max-width: 44ch; margin: 26px 0 0; color: var(--ink);
        }
        .fl-title__sub { font-size: 15px; line-height: 1.6; color: var(--ink-soft); max-width: 46ch; margin: 12px 0 0; }
        .fl-title__acts { display: flex; flex-wrap: wrap; align-items: center; gap: 18px; margin-top: clamp(28px, 4vh, 42px); }

        .fl-title__grid { display: grid; grid-template-columns: minmax(0, 1fr); }
        .fl-title__figure {
          margin: clamp(48px, 7vh, 64px) 0 0; max-width: 560px;
          animation: fl-hero-figure-in 800ms var(--ease) 260ms both;
        }
        .fl-title__map { display: block; width: 100%; height: auto; overflow: visible; }
        .fl-title__mapRoutes {
          fill: none; stroke: var(--ink-soft); stroke-width: 1;
          stroke-dasharray: 1 5; stroke-linecap: round; opacity: 0.8;
        }
        .fl-title__mapPins { fill: var(--ink-soft); }
        .fl-title__mapPins text {
          font-family: var(--mono); font-size: 11px; letter-spacing: 0.03em;
          fill: var(--ink-soft); text-transform: uppercase;
        }
        .fl-title__mapDest { fill: var(--accent-ink); }
        .fl-title__mapStampRing { fill: none; stroke: var(--accent-ink); }
        .fl-title__mapDest text {
          font-family: var(--mono); font-weight: 600; font-size: 12px; letter-spacing: 0.04em;
          fill: var(--accent-ink); text-transform: uppercase;
        }
        .fl-title__mapStamp {
          font-family: var(--mono); font-weight: 500; font-size: 9px; letter-spacing: 0.03em;
          fill: var(--accent-ink); text-transform: uppercase;
        }
        @keyframes fl-hero-figure-in {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .fl-title__figure { animation: none; }
        }
        @media (min-width: 1024px) {
          .fl-title__grid { grid-template-columns: minmax(0, 0.95fr) minmax(360px, 620px); gap: clamp(32px, 6vw, 96px); align-items: center; }
          .fl-title__figure { margin: 0; }
        }

        /* Ink on the bright green, not white: white reads 2.6:1 there and
           fails, ink reads 7.0:1. */
        .fl-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 12px 24px; border-radius: 2px; border: 1px solid var(--accent);
          background: var(--accent); color: var(--ink); text-decoration: none;
          font-family: var(--text); font-weight: 600; font-size: 15px; letter-spacing: 0.01em;
          cursor: pointer;
          transition: background 150ms var(--ease), border-color 150ms var(--ease), transform 110ms var(--ease);
        }
        .fl-btn:hover { background: var(--accent-press); border-color: var(--accent-press); }
        .fl-btn:active { transform: translateY(1px); }
        .fl-btn[disabled] { opacity: 0.55; cursor: not-allowed; }
        .fl-btn[disabled]:hover { background: var(--accent); border-color: var(--accent); }
        .fl-link {
          color: var(--ink); font-size: 15px; font-weight: 500;
          background: none; border: none; padding: 0; cursor: pointer; font-family: var(--text);
          text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 1px;
          transition: color 140ms var(--ease);
        }
        .fl-link:hover { color: var(--accent-ink); }

        /* ------------------------------------------------- I · the advisor */
        .fl-advisor__grid { display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(0, 1fr); gap: clamp(32px, 5vw, 76px); align-items: stretch; }
        .fl-advisor__prose > * + * { margin-top: 62vh; }
        .fl-advisor__col { position: relative; }
        .fl-advisor__media { position: sticky; top: 11vh; }
        .fl-quote {
          font-family: var(--display); font-weight: 400; font-size: clamp(1.35rem, 2.3vw, 1.85rem);
          line-height: 1.28; letter-spacing: -0.012em; margin: 0; max-width: 22ch;
          border-left: 2px solid var(--accent); padding-left: 20px;
        }

        .fl-stage { position: relative; }
        .fl-docket {
          position: relative; background: var(--card); border: 1px solid var(--rule-soft);
          border-radius: 4px; box-shadow: var(--shadow); padding: 18px 20px 22px;
        }
        .fl-docket__head {
          display: flex; align-items: baseline; justify-content: space-between;
          font-size: 11.5px; letter-spacing: 0.13em; text-transform: uppercase;
          color: var(--ink-soft); border-bottom: 1px solid var(--rule); padding-bottom: 10px; margin-bottom: 12px;
        }
        .fl-docket__head b { font-family: var(--mono); font-weight: 500; letter-spacing: 0.04em; }
        .fl-rows { position: relative; height: 258px; }
        .fl-rowrule {
          position: absolute; left: 0; right: 0; height: 1px; background: var(--rule-soft);
          transform: scaleX(0); transform-origin: left; will-change: transform;
        }
        .fl-file {
          position: absolute; left: 0; right: 0; height: 44px;
          display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 12px;
          background: var(--card); border: 1px solid var(--rule-soft); border-radius: 3px;
          padding: 0 12px; box-shadow: 0 8px 20px -14px rgba(20,32,25,0.5);
          will-change: transform, opacity;
        }
        .fl-file__n { font-family: var(--mono); font-size: 11.5px; color: var(--ink-soft); }
        .fl-file__label { font-size: 13.5px; font-weight: 600; letter-spacing: -0.005em; }
        .fl-file__note { font-family: var(--mono); font-size: 10.5px; color: var(--ink-soft); letter-spacing: 0.04em; text-transform: uppercase; }

        .fl-verdicts { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
        .fl-verdict {
          background: var(--card); border: 1px solid var(--rule-soft); border-radius: 3px;
          padding: 12px 14px; overflow: hidden;
        }
        .fl-verdict__ink { will-change: clip-path, opacity; }
        .fl-verdict__top { display: flex; align-items: baseline; gap: 8px; margin-bottom: 5px; }
        .fl-verdict__name { font-size: 13px; font-weight: 600; }
        .fl-verdict__code { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); letter-spacing: 0.02em; }
        /* the four verdict values are the advisor's own enum, so they are set
           as values, not prose */
        .fl-verdict__status {
          margin-left: auto; font-family: var(--mono); font-size: 10.5px; font-weight: 500;
          letter-spacing: 0.08em; text-transform: uppercase;
        }
        .fl-verdict--good .fl-verdict__status { color: var(--signal-yes-ink); }
        .fl-verdict--maybe .fl-verdict__status { color: var(--signal-maybe-ink); }
        .fl-verdict--bad .fl-verdict__status { color: var(--signal-no-ink); }
        .fl-verdict__track { height: 3px; background: var(--rule-soft); border-radius: 2px; overflow: hidden; margin-bottom: 7px; }
        .fl-verdict__bar { display: block; height: 100%; transform-origin: left; will-change: transform; }
        .fl-verdict--good .fl-verdict__bar { background: var(--signal-yes-fill); }
        .fl-verdict--maybe .fl-verdict__bar { background: var(--signal-maybe-fill); }
        .fl-verdict--bad .fl-verdict__bar { background: var(--signal-no-fill); }
        .fl-verdict p { margin: 0; font-size: 12px; line-height: 1.5; color: var(--ink-soft); }

        /* ------------------------------------------------- II · the planner */
        .fl-mask { display: block; overflow: hidden; }
        .fl-mask > span { display: block; transform: translateY(108%); transition: transform 720ms var(--ease); }
        [data-in="shown"] .fl-mask > span { transform: translateY(0); }
        [data-in="shown"] .fl-mask:nth-of-type(2) > span { transition-delay: 90ms; }

        .fl-planner__grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: clamp(32px, 5vw, 72px); align-items: center; }
        .fl-sched { background: var(--card); border: 1px solid var(--rule-soft); border-radius: 4px; box-shadow: var(--shadow); padding: 8px 0; }
        .fl-sched__row {
          display: grid; grid-template-columns: 74px 1fr; gap: 14px; align-items: baseline;
          padding: 13px 20px; border-bottom: 1px solid var(--rule-soft);
          opacity: 0; transform: translateY(14px);
          transition: opacity 560ms var(--ease), transform 560ms var(--ease);
        }
        .fl-sched__row:last-child { border-bottom: none; }
        [data-in="shown"] .fl-sched__row { opacity: 1; transform: none; }
        .fl-sched__day { font-family: var(--mono); font-size: 12px; letter-spacing: 0.02em; color: var(--accent-ink); }
        .fl-sched__title { font-size: 14.5px; line-height: 1.45; }

        /* --------------------------------------------------- III · on disk */
        .fl-local__grid { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: clamp(32px, 5vw, 72px); align-items: center; }
        .fl-plates { position: relative; height: 380px; }
        .fl-plate { position: absolute; will-change: transform; }
        .fl-plate--back { left: 8%; top: 8%; right: 22%; }
        .fl-plate--mid { left: 0; top: 30%; right: 12%; }
        .fl-plate--front { left: 26%; top: 62%; right: 0; }
        .fl-chip {
          background: var(--card); border: 1px solid var(--rule-soft); border-radius: 3px;
          box-shadow: var(--shadow); padding: 13px 16px;
          font-size: 13px; display: flex; align-items: center; gap: 10px;
        }
        .fl-chip code { font-family: var(--mono); font-size: 12px; color: var(--ink-soft); }
        .fl-folder {
          background-color: var(--card);
          background-image:
            linear-gradient(100deg, var(--card) 42%, rgba(250,250,247,0.5) 76%, rgba(250,250,247,0.08) 100%),
            url('/images/folder-texture.webp');
          background-size: cover, cover; background-position: left, right;
          background-repeat: no-repeat, no-repeat;
          border: 1px solid var(--rule-soft); border-radius: 4px;
          box-shadow: var(--shadow); padding: 22px 24px;
        }
        .fl-folder__name { font-family: var(--mono); font-weight: 500; font-size: 16px; margin: 0 0 4px; }
        .fl-folder__meta { font-size: 12.5px; color: var(--ink-soft); margin: 0; }
        .fl-folder__ic { display: block; width: 34px; height: 34px; color: var(--accent-ink); margin-bottom: 14px; }
        .fl-folder__ic svg { width: 100%; height: 100%; }

        /* ------------------------------------------------ IV · in the cloud */
        .fl-cloud__grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: clamp(32px, 5vw, 72px); align-items: center; }
        .fl-cloud__pair { display: grid; grid-template-columns: 1fr 34px 1fr; align-items: center; gap: 10px; }
        /* min-width:0 or the mono record name sets a floor wider than the
           column and the second card runs off the spread */
        .fl-cloud__pair > * { min-width: 0; }
        .fl-device {
          background: var(--card); border: 1px solid var(--rule); border-radius: 4px; padding: 16px;
          min-height: 148px; display: flex; flex-direction: column; gap: 7px; min-width: 0;
        }
        .fl-device__tag { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-soft); }
        .fl-device__name { font-family: var(--mono); font-size: 13px; font-weight: 500; overflow-wrap: anywhere; }
        .fl-device__line { height: 6px; border-radius: 2px; background: var(--rule-soft); }
        .fl-device__line--a { width: 84%; }
        .fl-device__line--b { width: 62%; }
        .fl-device__line--c { width: 71%; }
        .fl-device--two { will-change: clip-path; }
        .fl-thread { display: block; height: 1px; background: var(--accent); transform: scaleX(0); transform-origin: left; will-change: transform; }

        /* ------------------------------------------------- V · together */
        .fl-team__grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: clamp(32px, 5vw, 72px); align-items: center; }
        .fl-checklist {
          background: var(--card); border: 1px solid var(--rule-soft); border-radius: 4px;
          box-shadow: var(--shadow); padding: 20px 22px;
          transition: transform 260ms var(--ease);
        }
        .fl-checklist__head { font-size: 11.5px; letter-spacing: 0.13em; text-transform: uppercase; color: var(--ink-soft); margin: 0 0 14px; }
        .fl-doc {
          display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px;
          padding: 11px 0; border-top: 1px solid var(--rule-soft);
          opacity: 0; transform: translateY(10px);
          transition: opacity 520ms var(--ease), transform 520ms var(--ease);
        }
        [data-in="shown"] .fl-doc { opacity: 1; transform: none; }
        [data-in="shown"] .fl-doc:nth-child(4) { transition-delay: 70ms; }
        [data-in="shown"] .fl-doc:nth-child(5) { transition-delay: 140ms; }
        [data-in="shown"] .fl-doc:nth-child(6) { transition-delay: 210ms; }
        .fl-doc__code {
          font-family: var(--mono); font-size: 11px; font-weight: 500; letter-spacing: 0.02em;
          color: var(--accent-ink); background: rgba(18,183,106,0.13); padding: 4px 8px; border-radius: 2px;
        }
        .fl-doc__label { font-size: 13.5px; }
        .fl-doc__state { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-soft); }
        .fl-feed { margin: 0 0 18px; padding: 0; list-style: none; }
        .fl-feed li {
          display: grid; grid-template-columns: 24px 1fr; gap: 10px; align-items: center;
          font-size: 13px; line-height: 1.45; padding: 5px 0;
          opacity: 0; transform: translateY(8px);
          transition: opacity 500ms var(--ease), transform 500ms var(--ease);
        }
        [data-in="shown"] .fl-feed li { opacity: 1; transform: none; }
        [data-in="shown"] .fl-feed li:nth-child(2) { transition-delay: 80ms; }
        .fl-feed__who {
          width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center;
          background: rgba(18,183,106,0.15); color: var(--accent-ink);
          font-family: var(--mono); font-size: 10px; font-weight: 500;
        }
        .fl-feed__what strong { font-weight: 600; }

        /* --------------------------------------------------- VI · questions */
        .fl-faq { max-width: 700px; }
        .fl-faqitem { border-top: 1px solid var(--rule-soft); }
        .fl-faqitem:last-child { border-bottom: 1px solid var(--rule-soft); }
        .fl-faqitem button {
          width: 100%; display: flex; align-items: baseline; justify-content: space-between; gap: 20px;
          background: none; border: none; cursor: pointer; padding: 18px 2px; text-align: left;
          font-family: var(--display); font-weight: 600; font-size: 17px; line-height: 1.35;
          letter-spacing: -0.01em; color: var(--ink);
        }
        .fl-faqitem button:hover { color: var(--accent-ink); }
        .fl-faqitem__sign { font-family: var(--text); font-size: 16px; color: var(--accent-ink); flex-shrink: 0; }
        .fl-faqitem__body { overflow: hidden; max-height: 0; transition: max-height 260ms var(--ease); }
        .fl-faqitem[data-open="true"] .fl-faqitem__body { max-height: 260px; }
        .fl-faqitem__body p { margin: 0; padding: 0 2px 20px; font-size: 15px; line-height: 1.65; color: var(--ink-soft); max-width: 58ch; }

        /* ------------------------------------------- VII · the form itself */
        .fl-start__grid { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1fr); gap: clamp(32px, 5vw, 76px); align-items: start; }
        .fl-form {
          background: var(--card); border: 1px solid var(--rule-soft); border-radius: 4px;
          box-shadow: var(--shadow); padding: clamp(22px, 3vw, 32px);
        }
        .fl-form__row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .fl-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
        /* descendant, not child: the password label sits inside a legend row
           next to its reset-link button and must still look like a label */
        .fl-field label {
          font-size: 12px; font-weight: 600; letter-spacing: 0.04em;
          text-transform: uppercase; color: var(--ink-soft);
        }
        .fl-field__opt { font-weight: 400; text-transform: none; letter-spacing: 0; }
        .fl-input {
          width: 100%; font-family: var(--text); font-size: 15px; color: var(--ink);
          background: var(--paper); border: 1px solid var(--rule); border-radius: 2px;
          padding: 11px 13px; transition: border-color 140ms var(--ease);
        }
        .fl-input::placeholder { color: var(--ink-soft); opacity: 0.72; }
        .fl-input:focus { border-color: var(--accent-ink); outline: none; box-shadow: 0 0 0 3px rgba(18,183,106,0.16); }
        .fl-field__wrap { position: relative; display: flex; }
        .fl-field__peek {
          position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; padding: 4px 6px;
          font-family: var(--text); font-size: 11.5px; font-weight: 600;
          letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-soft);
        }
        .fl-field__peek:hover { color: var(--accent-ink); }
        .fl-field__hint { font-size: 12px; color: var(--ink-soft); }
        .fl-note {
          font-size: 13.5px; line-height: 1.5; border-radius: 2px;
          padding: 10px 12px; margin: 0 0 14px;
        }
        .fl-note--bad { color: var(--signal-no-ink); background: rgba(239,83,80,0.10); border: 1px solid rgba(239,83,80,0.34); }
        .fl-note--good { color: var(--accent-ink); background: rgba(18,183,106,0.11); border: 1px solid rgba(18,183,106,0.34); }
        .fl-form__go { width: 100%; margin-top: 4px; }
        .fl-form__foot { font-size: 13px; color: var(--ink-soft); margin: 14px 0 0; line-height: 1.6; }
        .fl-sent { display: flex; flex-direction: column; gap: 10px; }
        .fl-sent__mail { font-family: var(--mono); font-size: 13px; color: var(--ink); word-break: break-all; }

        /* ------------------------------------------------- the login sheet */
        .fl-sheet {
          position: fixed; inset: 0; z-index: 90; display: grid; place-items: center;
          padding: 20px; background: rgba(10,16,13,0.52);
          animation: fl-fade 180ms var(--ease);
        }
        @keyframes fl-fade { from { opacity: 0; } to { opacity: 1; } }
        .fl-sheet__panel {
          position: relative; width: 100%; max-width: 404px; background: var(--paper);
          border: 1px solid var(--rule); border-radius: 4px; padding: clamp(24px, 4vw, 34px);
          box-shadow: 0 40px 90px -40px rgba(10,20,15,0.7);
          animation: fl-rise 220ms var(--ease);
        }
        @keyframes fl-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .fl-sheet__title { font-family: var(--display); font-weight: 600; font-size: 27px; line-height: 1.1; margin: 0 0 6px; letter-spacing: -0.018em; }
        .fl-sheet__sub { font-size: 14px; color: var(--ink-soft); margin: 0 0 22px; line-height: 1.55; }
        .fl-sheet__x {
          position: absolute; top: 12px; right: 12px; width: 30px; height: 30px;
          display: grid; place-items: center; background: none; border: none; cursor: pointer;
          color: var(--ink-soft); font-size: 19px; line-height: 1; border-radius: 2px;
        }
        .fl-sheet__x:hover { color: var(--ink); }
        .fl-sheet__legend { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
        @media (prefers-reduced-motion: reduce) {
          .fl-sheet, .fl-sheet__panel { animation: none; }
        }

        /* ------------------------------------------------------- colophon */
        .fl-colophon {
          background: var(--paper-2); padding: clamp(70px, 10vh, 120px) clamp(24px, 5vw, 84px) clamp(46px, 6vh, 70px);
        }
        .fl-colophon__rule { display: block; height: 2px; background: var(--ink); transform: scaleX(0); transform-origin: left; will-change: transform; margin-bottom: 26px; }
        .fl-colophon__mark { font-family: var(--display); font-weight: 700; font-size: 20px; letter-spacing: -0.01em; margin: 0 0 10px; }
        .fl-colophon__ask { font-size: 16.5px; line-height: 1.7; margin: 0; max-width: 52ch; }
        .fl-colophon__ask a, .fl-colophon__ask button {
          color: var(--accent-ink); font-weight: 600; font-size: inherit; font-family: var(--text);
          background: none; border: none; padding: 0; cursor: pointer;
          text-decoration: underline; text-underline-offset: 4px;
        }
        .fl-colophon__ask a:hover, .fl-colophon__ask button:hover { color: var(--ink); }
        .fl-colophon__fine { margin: 26px 0 0; font-size: 12px; color: var(--ink-soft); }

        /* ------------------------------------------------------ reveal base */
        [data-in] .fl-rise { opacity: 0; transform: translateY(14px); transition: opacity 620ms var(--ease), transform 620ms var(--ease); }
        [data-in="shown"] .fl-rise { opacity: 1; transform: none; }
        [data-in="shown"] .fl-rise:nth-child(2) { transition-delay: 60ms; }
        [data-in="shown"] .fl-rise:nth-child(3) { transition-delay: 120ms; }

        /* ------------------------------------------------------- responsive */
        @media (max-width: 1023px) {
          .fl { --rail: 0px; }
          .fl-folio { display: none; }
          /* the top strip is sticky here, so anything scrollIntoView() targets
             has to clear it or the chapter opens with its heading underneath */
          .fl-ch, .fl-form { scroll-margin-top: 64px; }
          .fl-topfolio {
            display: flex; position: sticky; top: 0; z-index: 40; gap: 12px;
            align-items: baseline; justify-content: space-between;
            padding: 11px clamp(18px, 5vw, 28px);
            background: var(--paper); border-bottom: 1px solid var(--rule-soft);
          }
          .fl-topfolio__mark { font-family: var(--display); font-weight: 700; font-size: 15px; color: var(--ink); text-decoration: none; }
          .fl-topfolio__mark span { color: var(--accent-ink); }
          .fl-topfolio__now { font-family: var(--mono); font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-soft); }
          .fl-topfolio__acts { display: flex; align-items: center; gap: 14px; }
          .fl-body { margin-left: 0; }
          .fl-planner__grid, .fl-local__grid, .fl-cloud__grid, .fl-team__grid,
          .fl-start__grid { grid-template-columns: minmax(0, 1fr); }
          .fl-start__grid > :first-child { margin-bottom: 30px; }
          .fl-advisor__grid { display: flex; flex-direction: column; }
          .fl-advisor__col { order: -1; }
          .fl-advisor__media { position: static; margin-bottom: 30px; }
          .fl-advisor__prose > * + * { margin-top: 48px; }
          .fl-verdict { padding: 11px 13px; }
          .fl-planner__grid > :first-child, .fl-local__grid > :first-child,
          .fl-cloud__grid > :first-child, .fl-team__grid > :first-child { margin-bottom: 30px; }
          .fl-plates { height: 330px; }
        }
        @media (max-width: 640px) {
          .fl-open { flex-wrap: wrap; row-gap: 6px; }
          .fl-open__sub { order: 3; flex-basis: 100%; }
          .fl-h1 { font-size: clamp(2.2rem, 10vw, 2.9rem); }
          .fl-title { min-height: 0; padding-top: 54px; padding-bottom: 60px; }
          .fl-cloud__pair { grid-template-columns: 1fr; gap: 14px; }
          .fl-form__row { grid-template-columns: 1fr; gap: 0; }
          .fl-thread { height: 1px; }
          .fl-rows { height: 258px; }
          .fl-advisor__prose > * + * { margin-top: 28px; }
        }

        /* ------------------------------------------------- reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .fl-title__rule, .fl-colophon__rule, .fl-rowrule, .fl-thread { transform: scaleX(1) !important; }
          .fl-file { position: relative; top: auto !important; transform: none !important; opacity: 1 !important; margin-bottom: 10px; }
          .fl-rows { height: auto; }
          .fl-rowrule { display: none; }
          .fl-verdict__ink { clip-path: none !important; opacity: 1 !important; }
          .fl-verdict__bar { transform: scaleX(1) !important; }
          .fl-verdict__status { opacity: 1 !important; }
          .fl-plate { position: relative; left: auto; right: auto; top: auto; transform: none !important; margin-bottom: 12px; }
          .fl-plates { height: auto; }
          .fl-device--two { clip-path: none !important; }
          .fl-checklist { transform: none !important; }
          /* keep the opacity that carries comprehension, drop position changes */
          .fl-mask > span { transform: none; transition: none; }
          [data-in] .fl-rise, .fl-sched__row, .fl-doc, .fl-feed li { transform: none !important; transition: opacity 400ms linear; }
        }
      `}</style>

      {/* ------------------------------------------------------------ folio */}
      <nav className="fl-folio" aria-label="Contents">
        <a className="fl-folio__mark" href="#top">Edamame<span>.</span></a>
        <ol className="fl-folio__list">
          {chapters.map((c) => (
            <li key={c.id}>
              <a
                className="fl-folio__link"
                href={`#${c.id}`}
                aria-current={activeChapter === c.id}
              >
                <em>{c.numeral}</em>
                {c.short}
              </a>
            </li>
          ))}
        </ol>
        <p className="fl-folio__foot">
          {user ? (
            <Link to="/dashboard">Dashboard</Link>
          ) : (
            <>
              Already have an account?<br />
              <button type="button" className="fl-folio__signin" onClick={openSheet}>Log in</button>
            </>
          )}
        </p>
      </nav>

      <div className="fl-topfolio">
        <a className="fl-topfolio__mark" href="#top">Edamame<span>.</span></a>
        <span className="fl-topfolio__acts">
          <span className="fl-topfolio__now">
            {activeChapter
              ? `${chapters.find((c) => c.id === activeChapter)?.numeral} · ${chapters.find((c) => c.id === activeChapter)?.short}`
              : 'Contents'}
          </span>
          {user ? (
            <Link className="fl-link" to="/dashboard">Dashboard</Link>
          ) : (
            <button type="button" className="fl-link" onClick={openSheet}>Log in</button>
          )}
        </span>
      </div>

      <div className="fl-body" id="top">

        {/* ------------------------------------------------------ title page */}
        <header className="fl-title">
          <div className="fl-title__grid">
            <div>
              <h1 className="fl-h1">
                Your immigration case, <span className="fl-h1__accent">sorted.</span>
              </h1>
              <span className="fl-title__track" aria-hidden="true">
                <span ref={heroRuleRef} className="fl-title__rule" />
              </span>
              <p className="fl-title__deck">{audienceLine}</p>
              <p className="fl-title__sub">
                Assess a pathway and open the case with its workflow already attached.
                Keep every file on your own disk, or sync it to your account — your
                choice.
              </p>
              <div className="fl-title__acts">
                {renderCta('fl-btn')}
                {!user && (
                  <button type="button" className="fl-link" onClick={openSheet}>Log in</button>
                )}
              </div>
            </div>

            <figure className="fl-title__figure">
              <svg className="fl-title__map" viewBox="0 0 520 400" aria-hidden="true">
                <defs>
                  <filter id="fl-stamp-rough">
                    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" />
                  </filter>
                </defs>

                <g className="fl-title__mapRoutes">
                  <path d="M50,70 Q235,110 420,300" />
                  <path d="M330,60 Q400,120 420,300" />
                  <path d="M200,130 Q330,150 420,300" />
                  <path d="M360,150 Q410,180 420,300" />
                </g>

                <g className="fl-title__mapPins">
                  <circle cx="50" cy="70" r="3" />
                  <circle cx="330" cy="60" r="3" />
                  <circle cx="200" cy="130" r="3" />
                  <circle cx="360" cy="150" r="3" />
                  <text x="58" y="66">London</text>
                  <text x="338" y="56">Guangzhou</text>
                  <text x="192" y="150" textAnchor="end">Mumbai</text>
                  <text x="368" y="144">Manila</text>
                </g>

                <g className="fl-title__mapDest">
                  <circle cx="420" cy="300" r="4.5" />
                  <text x="432" y="296">AU / NZ</text>
                  <g transform="translate(462,338) rotate(-8)">
                    <circle cx="0" cy="0" r="24" className="fl-title__mapStampRing" strokeWidth="3" filter="url(#fl-stamp-rough)" />
                    <text x="0" y="4" textAnchor="middle" className="fl-title__mapStamp">Filed</text>
                  </g>
                </g>
              </svg>
              <figcaption className="fl-cap">
                Every case starts somewhere. This is where it's going.
              </figcaption>
            </figure>
          </div>
        </header>

        {/* ------------------------------------------- I · AI Visa Advisor */}
        <section
          id="advisor"
          ref={advisorRef}
          className="fl-ch fl-ch--paper fl-advisor"
          aria-labelledby="advisor-title"
        >
          <div className="fl-wrap">
            <div className="fl-open">
              <span className="fl-open__num">Chapter <b>I</b></span>
              <span className="fl-open__sub">Check eligibility before you open a case</span>
              <span className="fl-open__line" />
            </div>

            <div className="fl-advisor__grid">
              <div className="fl-advisor__prose">
                <div>
                  <h2 id="advisor-title" className="fl-h2">The AI Visa Advisor</h2>
                  <p className="fl-lede">
                    It reads the client’s facts against real visa criteria, and it
                    answers per pathway rather than with a single score.
                  </p>
                  <p className="fl-p">
                    A four-step intake collects the personal details, the immigration
                    goal, the conditional specifics that goal implies, and the
                    supporting factors. Then it assesses.
                  </p>
                </div>

                <div>
                  <h3 className="fl-h2" style={{ fontSize: 'clamp(1.4rem, 2.3vw, 1.9rem)' }}>
                    Nine subclasses, assessed at once
                  </h3>
                  <p className="fl-p">
                    Skilled Independent 189, Skilled Nominated 190, Temporary Skill
                    Shortage 482, Employer Nomination 186, Student 500, Partner
                    820/801, Temporary Graduate 485, Visitor 600, and Working
                    Holiday 417.
                  </p>
                </div>

                <div>
                  <p className="fl-quote">
                    Four verdicts: qualifies, possibly, unlikely, or needs more
                    information.
                  </p>
                  <p className="fl-p" style={{ marginTop: 22 }}>
                    Every verdict carries its <strong>reasons</strong> and its{' '}
                    <strong>gaps</strong>, so a “possibly” tells you what is still
                    missing instead of leaving you to guess.
                  </p>
                </div>

                <div>
                  <h3 className="fl-h2" style={{ fontSize: 'clamp(1.4rem, 2.3vw, 1.9rem)' }}>
                    And then it opens the case
                  </h3>
                  <p className="fl-p">
                    From a qualifying verdict, open a new case with the matching
                    workflow template already selected. The assessment is where the
                    file starts, not a separate errand.
                  </p>
                  <p style={{ margin: '22px 0 0' }}>{renderCta('fl-btn')}</p>
                </div>

                <p className="fl-cap" style={{ marginTop: 8, maxWidth: '46ch' }}>
                  Built for registered migration agents and immigration lawyers.
                  It is not a substitute for professional migration advice —
                  AU and NZ immigration advice is regulated.
                </p>
              </div>

              <div className="fl-advisor__col">
              <figure className="fl-advisor__media" style={{ margin: 0 }}>
                <div className="fl-stage" ref={stageRef}>
                  <div className="fl-docket">
                    <div className="fl-docket__head">
                      <span>Docket</span>
                      <b>5 open</b>
                    </div>
                    <div className="fl-rows">
                      {CASE_FILES.map((f, i) => (
                        <span
                          key={`rule-${f.label}`}
                          ref={(el) => { ruleRefs.current[i] = el; }}
                          className="fl-rowrule"
                          style={{ top: i * 50 + 48, ...(reduced ? {} : { transform: 'scaleX(0)' }) }}
                          aria-hidden="true"
                        />
                      ))}
                      {CASE_FILES.map((f, i) => (
                        <div
                          key={f.label}
                          ref={(el) => { fileRefs.current[i] = el; }}
                          className="fl-file"
                          style={{ top: i * 50, zIndex: 5 - i, ...fileStyle(i) }}
                        >
                          <span className="fl-file__n">{i + 1}</span>
                          <span className="fl-file__label">{f.label}</span>
                          <span className="fl-file__note">{f.note}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="fl-verdicts">
                    {VERDICTS.map((v, i) => (
                      <div key={v.code} className={`fl-verdict fl-verdict--${v.tone}`}>
                        <div
                          className="fl-verdict__ink"
                          ref={(el) => { verdictRefs.current[i] = el; }}
                          style={reduced ? undefined : { clipPath: 'inset(0 100% 0 0)', opacity: 0.18 }}
                        >
                          <div className="fl-verdict__top">
                            <span className="fl-verdict__name">{v.name}</span>
                            <span className="fl-verdict__code">{v.code}</span>
                            <span
                              className="fl-verdict__status"
                              ref={(el) => { verdictStatusRefs.current[i] = el; }}
                              style={reduced ? undefined : { opacity: 0 }}
                            >
                              {v.status}
                            </span>
                          </div>
                          <div className="fl-verdict__track">
                            <span
                              className="fl-verdict__bar"
                              ref={(el) => { verdictBarRefs.current[i] = el; }}
                              style={{ width: `${v.fill}%`, ...(reduced ? {} : { transform: 'scaleX(0)' }) }}
                            />
                          </div>
                          <p>{v.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <figcaption className="fl-cap">
                  Sample assessment. Five open files on the docket, three pathways
                  answered, with the reasoning attached.
                </figcaption>
              </figure>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------- II · AI Task Planner */}
        <section id="planner" className="fl-ch fl-ch--paper2" aria-labelledby="planner-title" data-in="">
          <div className="fl-wrap">
            <div className="fl-open">
              <span className="fl-open__num">Chapter <b>II</b></span>
              <span className="fl-open__sub">Turn a case into a dated task schedule</span>
              <span className="fl-open__line" />
            </div>
            <div className="fl-planner__grid">
              <div>
                <h2 id="planner-title" className="fl-h2">
                  <span className="fl-mask"><span>The schedule</span></span>
                  <span className="fl-mask"><span>writes itself.</span></span>
                </h2>
                <p className="fl-lede">
                  Give it the case description, the workflow guide, and a start date.
                </p>
                <p className="fl-p">
                  It returns titled tasks with day offsets, and the app turns those
                  into real dates on your calendar. A Student 500 matter and a
                  Partner 820/801 matter never share a template they shouldn’t.
                </p>
                <p className="fl-p">
                  Five Australian workflow templates ship with the app: Student 500,
                  Skilled 190, Partner 820/801, Visitor 600 and Graduate 485. Write
                  your own alongside them.
                </p>
              </div>
              <figure style={{ margin: 0 }}>
                <div className="fl-sched">
                  {TASK_ROWS.map((t) => (
                    <div key={t.title} className="fl-sched__row">
                      <span className="fl-sched__day">{t.day}</span>
                      <span className="fl-sched__title">{t.title}</span>
                    </div>
                  ))}
                </div>
                <figcaption className="fl-cap">
                  A generated schedule for a Student 500 matter, shown with the day
                  offsets the model returns before they are dated.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ III · On disk */}
        <section id="local" className="fl-ch fl-ch--paper" aria-labelledby="local-title" data-in="">
          <div className="fl-wrap">
            <div className="fl-open">
              <span className="fl-open__num">Chapter <b>III</b></span>
              <span className="fl-open__sub">Your data, one file per case</span>
              <span className="fl-open__line" />
            </div>
            <div className="fl-local__grid">
              <figure ref={localMediaRef} style={{ margin: 0 }}>
                <div className="fl-plates">
                  <div className="fl-plate fl-plate--back" ref={(el) => { plateRefs.current[0] = el; }}>
                    <div className="fl-chip">Your data, one file per case</div>
                  </div>
                  <div className="fl-plate fl-plate--mid" ref={(el) => { plateRefs.current[1] = el; }}>
                    <div className="fl-folder">
                      <span className="fl-folder__ic" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
                        </svg>
                      </span>
                      <p className="fl-folder__name">edamame-cases/</p>
                      <p className="fl-folder__meta">Linked folder · synced through Dropbox</p>
                    </div>
                  </div>
                  <div className="fl-plate fl-plate--front" ref={(el) => { plateRefs.current[2] = el; }}>
                    <div className="fl-chip"><code>activity-events/</code> append-only</div>
                  </div>
                </div>
                <figcaption className="fl-cap">
                  Local mode links a folder directly on your computer — currently
                  requires Chrome or Edge.
                </figcaption>
              </figure>
              <div>
                <h2 id="local-title" className="fl-h2 fl-rise">Your data, on your disk.</h2>
                <p className="fl-lede fl-rise">
                  Local mode links a real folder. Not a database in the browser, and
                  not our server.
                </p>
                <p className="fl-p fl-rise">
                  Every record is written as its own file: <strong>clients/</strong>,{' '}
                  <strong>cases/</strong>, <strong>tasks/</strong>,{' '}
                  <strong>activity-events/</strong>. Point the app at a folder inside
                  Dropbox, OneDrive or iCloud Drive and that folder is your data,
                  portable between machines with no server in the middle.
                </p>
                <p className="fl-p fl-rise">
                  One file per record is a deliberate choice. If two machines write
                  at once through a sync client, the conflict is scoped to a single
                  case instead of your whole practice.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------- IV · In the cloud */}
        <section id="cloud" className="fl-ch fl-ch--plate" aria-labelledby="cloud-title" data-in="">
          <div className="fl-wrap">
            <div className="fl-open">
              <span className="fl-open__num">Chapter <b>IV</b></span>
              <span className="fl-open__sub">Access the same case from any device</span>
              <span className="fl-open__line" />
            </div>
            <div className="fl-cloud__grid">
              <div>
                <h2 id="cloud-title" className="fl-h2 fl-rise">The same case, any device.</h2>
                <p className="fl-lede fl-rise">
                  Cloud mode keeps your practice in Postgres tables and your
                  documents in a private bucket.
                </p>
                <p className="fl-p fl-rise">
                  Every case is scoped to your account at the database level, so
                  no other firm can read or write it. Document files are stored
                  under your own path prefix, with the same rule applied at the
                  storage layer.
                </p>
                <p className="fl-p fl-rise">
                  Choose either mode at sign-up and change your mind later. Switching
                  copies every case, client and document across for you, and leaves
                  the local folder untouched as a backup.
                </p>
              </div>
              <figure ref={cloudMediaRef} style={{ margin: 0 }}>
                <div className="fl-cloud__pair">
                  <div className="fl-device">
                    <span className="fl-device__tag">Office</span>
                    <span className="fl-device__name">Ng · Partner 820</span>
                    <span className="fl-device__line fl-device__line--a" />
                    <span className="fl-device__line fl-device__line--b" />
                    <span className="fl-device__line fl-device__line--c" />
                  </div>
                  <span ref={cloudThreadRef} className="fl-thread" aria-hidden="true" />
                  <div
                    ref={cloudWipeRef}
                    className="fl-device fl-device--two"
                    style={reduced ? undefined : { clipPath: 'inset(0 100% 0 0)' }}
                  >
                    <span className="fl-device__tag">Laptop, in transit</span>
                    <span className="fl-device__name">Ng · Partner 820</span>
                    <span className="fl-device__line fl-device__line--a" />
                    <span className="fl-device__line fl-device__line--b" />
                    <span className="fl-device__line fl-device__line--c" />
                  </div>
                </div>
                <figcaption className="fl-cap">
                  One account, two machines, one row. Nothing is copied by hand.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- V · Together */}
        <section id="team" className="fl-ch fl-ch--paper2" aria-labelledby="team-title" data-in="">
          <div className="fl-wrap">
            <div className="fl-open">
              <span className="fl-open__num">Chapter <b>V</b></span>
              <span className="fl-open__sub">Share cases and track who did what</span>
              <span className="fl-open__line" />
            </div>
            <div className="fl-team__grid">
              <div>
                <h2 id="team-title" className="fl-h2 fl-rise">Shared work, filed correctly.</h2>
                <p className="fl-lede fl-rise">
                  Team members share cases, an activity feed, and a document
                  checklist per matter. Local or cloud, the same.
                </p>
                <p className="fl-p fl-rise">
                  Uploads carry a document type from a firm-wide reference list.
                  About ninety are seeded for Australian immigration matters, and
                  you can add your own on top. Nothing uploads without one.
                </p>
                <p className="fl-p fl-rise">
                  When a checklist item and a document share a type, the checklist
                  links them for you. Verified and waived items are never touched,
                  and a stale link is repointed rather than left wrong.
                </p>
              </div>
              <figure style={{ margin: 0 }}>
                <div
                  ref={tiltRef}
                  className="fl-checklist"
                  onPointerMove={onTilt}
                  onPointerLeave={onTiltLeave}
                >
                  <p className="fl-checklist__head">Chen, Skilled 190</p>
                  <ul className="fl-feed">
                    <li>
                      <span className="fl-feed__who" aria-hidden="true">PR</span>
                      <span className="fl-feed__what"><strong>Priya</strong> uploaded the medical examination</span>
                    </li>
                    <li>
                      <span className="fl-feed__who" aria-hidden="true">TM</span>
                      <span className="fl-feed__what"><strong>Tom</strong> is still waiting on the birth certificate</span>
                    </li>
                  </ul>
                  {DOC_CHIPS.map((d, i) => (
                    <div key={d.code} className="fl-doc">
                      <span className="fl-doc__code">{d.code}</span>
                      <span className="fl-doc__label">{d.label}</span>
                      <span className="fl-doc__state">{i === 3 ? 'Awaiting' : 'Linked'}</span>
                    </div>
                  ))}
                </div>
                <figcaption className="fl-cap">
                  Sample case. The activity feed says who did what; the document type
                  codes are how an upload finds the checklist item it satisfies.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ VI · Questions */}
        <section id="faq" className="fl-ch fl-ch--paper" aria-labelledby="faq-title" data-in="">
          <div className="fl-wrap">
            <div className="fl-open">
              <span className="fl-open__num">Chapter <b>VI</b></span>
              <span className="fl-open__sub">Answers to what people ask first</span>
              <span className="fl-open__line" />
            </div>
            <h2 id="faq-title" className="fl-h2 fl-rise">Common questions.</h2>
            <div className="fl-faq" style={{ marginTop: 30 }}>
              {FAQS.map((item, i) => {
                const open = openFaq === i;
                return (
                  <div key={item.q} className="fl-faqitem" data-open={open}>
                    <button type="button" aria-expanded={open} onClick={() => setOpenFaq(open ? null : i)}>
                      {item.q}
                      <span className="fl-faqitem__sign" aria-hidden="true">{open ? '−' : '+'}</span>
                    </button>
                    <div className="fl-faqitem__body"><p>{item.a}</p></div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- VII · Start */}
        {!user && (
          <section id="start" className="fl-ch fl-ch--paper2" aria-labelledby="start-title" data-in="">
            <div className="fl-wrap">
              <div className="fl-open">
                <span className="fl-open__num">Chapter <b>VII</b></span>
                <span className="fl-open__sub">Set up storage and open your first case</span>
                <span className="fl-open__line" />
              </div>
              <div className="fl-start__grid">
                <div>
                  <h2 id="start-title" className="fl-h2 fl-rise">Open your first case.</h2>
                  <p className="fl-lede fl-rise">
                    The account is the whole setup. You choose local or cloud storage
                    on the next screen, and either can be changed later.
                  </p>
                  <p className="fl-p fl-rise">
                    Already have one?{' '}
                    <button type="button" className="fl-link" onClick={openSheet}>Log in instead</button>.
                  </p>
                </div>

                <div className="fl-form">
                  {confirmSentTo ? (
                    <div className="fl-sent" aria-live="polite">
                      <h3 className="fl-sheet__title" style={{ fontSize: 26 }}>Account created.</h3>
                      <p className="fl-p" style={{ margin: 0 }}>
                        Confirm your address to finish. The link went to:
                      </p>
                      <p className="fl-sent__mail">{confirmSentTo}</p>
                      <p className="fl-form__foot">
                        Once it is confirmed,{' '}
                        <button type="button" className="fl-link" onClick={openSheet}>log in</button>.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleCreateAccount} noValidate>
                      <div className="fl-form__row">
                        <div className="fl-field">
                          <label htmlFor="fl-first">First name</label>
                          <input
                            id="fl-first"
                            ref={firstFieldRef}
                            className="fl-input"
                            type="text"
                            required
                            autoComplete="given-name"
                            maxLength={NAME_MAX_LENGTH}
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                          />
                        </div>
                        <div className="fl-field">
                          <label htmlFor="fl-surname">Surname</label>
                          <input
                            id="fl-surname"
                            className="fl-input"
                            type="text"
                            required
                            autoComplete="family-name"
                            maxLength={NAME_MAX_LENGTH}
                            value={surname}
                            onChange={(e) => setSurname(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="fl-field">
                        <label htmlFor="fl-company">
                          Firm or agency <span className="fl-field__opt">(optional)</span>
                        </label>
                        <input
                          id="fl-company"
                          className="fl-input"
                          type="text"
                          autoComplete="organization"
                          maxLength={NAME_MAX_LENGTH}
                          value={company}
                          onChange={(e) => setCompany(e.target.value)}
                          placeholder="Or leave blank if it is just you"
                        />
                      </div>

                      <div className="fl-field">
                        <label htmlFor="fl-email">Email</label>
                        <input
                          id="fl-email"
                          className="fl-input"
                          type="email"
                          required
                          autoComplete="email"
                          value={upEmail}
                          onChange={(e) => setUpEmail(e.target.value)}
                        />
                      </div>

                      <div className="fl-field">
                        <label htmlFor="fl-pw">Password</label>
                        <span className="fl-field__wrap">
                          <input
                            id="fl-pw"
                            className="fl-input"
                            type={showPassword ? 'text' : 'password'}
                            required
                            autoComplete="new-password"
                            minLength={6}
                            aria-describedby="fl-pw-hint"
                            value={upPassword}
                            onChange={(e) => setUpPassword(e.target.value)}
                          />
                          <button
                            type="button"
                            className="fl-field__peek"
                            onClick={() => setShowPassword((v) => !v)}
                          >
                            {showPassword ? 'Hide' : 'Show'}
                          </button>
                        </span>
                        <span id="fl-pw-hint" className="fl-field__hint">At least 6 characters.</span>
                      </div>

                      <div className="fl-field">
                        <label htmlFor="fl-pw2">Confirm password</label>
                        <span className="fl-field__wrap">
                          <input
                            id="fl-pw2"
                            className="fl-input"
                            type={showConfirm ? 'text' : 'password'}
                            required
                            autoComplete="new-password"
                            aria-describedby={upError ? 'fl-up-error' : undefined}
                            value={upConfirm}
                            onChange={(e) => setUpConfirm(e.target.value)}
                          />
                          <button
                            type="button"
                            className="fl-field__peek"
                            onClick={() => setShowConfirm((v) => !v)}
                          >
                            {showConfirm ? 'Hide' : 'Show'}
                          </button>
                        </span>
                      </div>

                      <div aria-live="polite">
                        {upError && (
                          <p id="fl-up-error" className="fl-note fl-note--bad">{upError}</p>
                        )}
                      </div>

                      <button type="submit" className="fl-btn fl-form__go" disabled={upBusy}>
                        {upBusy ? 'Creating account…' : 'Create account'}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* -------------------------------------------------------- colophon */}
        <footer className="fl-colophon">
          <div className="fl-wrap">
            <span ref={colophonRuleRef} className="fl-colophon__rule" aria-hidden="true" />
            <p className="fl-colophon__mark">Edamame Legal Flow</p>
            <p className="fl-colophon__ask">
              Case and task management for immigration practice in Australia and New
              Zealand. Start with one case:{' '}
              {user ? (
                <Link to="/dashboard">go to dashboard</Link>
              ) : (
                <>
                  <a href="#start">create account</a>, or{' '}
                  <button type="button" onClick={openSheet}>log in</button> if you have
                  been here before
                </>
              )}.
            </p>
            <p className="fl-colophon__fine">&copy; 2026 Edamame Legal Flow. All rights reserved.</p>
          </div>
        </footer>
      </div>

      {/* --------------------------------------------------- the login sheet */}
      {sheetOpen && !user && (
        <div
          className="fl-sheet"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeSheet(); }}
        >
          <div
            className="fl-sheet__panel"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="fl-sheet-title"
          >
            <button type="button" className="fl-sheet__x" onClick={closeSheet} aria-label="Close">
              ×
            </button>
            <h2 id="fl-sheet-title" className="fl-sheet__title">Welcome back.</h2>
            <p className="fl-sheet__sub">Log in to pick up where your files left off.</p>

            <form onSubmit={handleLogIn} noValidate>
              <div className="fl-field">
                <label htmlFor="fl-in-email">Email</label>
                <input
                  id="fl-in-email"
                  className="fl-input"
                  type="email"
                  required
                  autoComplete="email"
                  value={inEmail}
                  onChange={(e) => setInEmail(e.target.value)}
                />
              </div>

              <div className="fl-field">
                <span className="fl-sheet__legend">
                  <label htmlFor="fl-in-pw">Password</label>
                  <button type="button" className="fl-link" style={{ fontSize: 12.5 }} onClick={handleResetLink}>
                    Send reset link
                  </button>
                </span>
                <input
                  id="fl-in-pw"
                  className="fl-input"
                  type="password"
                  required
                  autoComplete="current-password"
                  aria-describedby={inError ? 'fl-in-error' : undefined}
                  value={inPassword}
                  onChange={(e) => setInPassword(e.target.value)}
                />
              </div>

              <div aria-live="polite">
                {resetSent && (
                  <p className="fl-note fl-note--good">
                    Reset link sent. Check your inbox for the message.
                  </p>
                )}
                {inError && <p id="fl-in-error" className="fl-note fl-note--bad">{inError}</p>}
              </div>

              <button type="submit" className="fl-btn fl-form__go" disabled={inBusy}>
                {inBusy ? 'Logging in…' : 'Log in'}
              </button>
            </form>

            <p className="fl-form__foot">
              No account yet?{' '}
              <button
                type="button"
                className="fl-link"
                onClick={() => {
                  closeSheet();
                  document.getElementById('start')?.scrollIntoView({
                    behavior: reduced ? 'auto' : 'smooth',
                    block: 'start',
                  });
                }}
              >
                Create one
              </button>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
