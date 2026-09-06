import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
  { id: 'cloud', numeral: 'IV', short: 'In the cloud', title: 'Cloud storage' },
  { id: 'team', numeral: 'V', short: 'Together', title: 'Team and attachments' },
  { id: 'faq', numeral: 'VI', short: 'Questions', title: 'Questions worth asking' },
];

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
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const audienceParam = searchParams.get('for');
  const audienceLine = isAudience(audienceParam) ? AUDIENCE_LINE[audienceParam] : DEFAULT_LINE;

  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)');

  const ctaHref = user ? '/dashboard' : '/register';
  const ctaLabel = user ? 'Go to Dashboard' : 'Get started';

  const [activeChapter, setActiveChapter] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

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
    const sections = CHAPTERS.map((c) => document.getElementById(c.id)).filter(Boolean) as HTMLElement[];
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
  }, []);

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
          --paper: #F4F5F1;
          --paper-2: #E9ECE4;
          --ink: #14181A;
          --ink-soft: #5A6560;
          --accent: #1E7A46;
          --accent-2: #29B767;
          --plate: #142019;
          --rule: rgba(20,24,26,0.16);
          --rule-soft: rgba(20,24,26,0.09);
          --card: #FFFFFF;
          --shadow: 0 18px 40px -26px rgba(20,32,25,0.45), 0 2px 6px -3px rgba(20,32,25,0.12);
          --display: 'Fraunces', Georgia, 'Times New Roman', serif;
          --text: 'Archivo', 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif;
          --ease: cubic-bezier(0.23, 1, 0.32, 1);
          --rail: 208px;
          background: var(--paper);
          color: var(--ink);
          font-family: var(--text);
          position: relative;
        }
        .fl *, .fl *::before, .fl *::after { box-sizing: border-box; }
        .fl ::selection { background: rgba(41,183,103,0.28); }
        .fl :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 3px; }

        /* ---------------------------------------------------------- folio */
        .fl-folio {
          position: fixed; inset: 0 auto 0 0; width: var(--rail); z-index: 40;
          display: flex; flex-direction: column; padding: 30px 22px 26px 30px;
          border-right: 1px solid var(--rule-soft);
          background: var(--paper);
        }
        .fl-folio__mark {
          font-family: var(--display); font-weight: 700; font-size: 17px;
          letter-spacing: -0.01em; text-decoration: none; color: var(--ink);
        }
        .fl-folio__mark span { color: var(--accent); }
        .fl-folio__list { list-style: none; margin: auto 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
        .fl-folio__link {
          display: grid; grid-template-columns: 26px 1fr; align-items: baseline; gap: 8px;
          padding: 6px 0; text-decoration: none; color: var(--ink-soft);
          font-size: 13px; letter-spacing: 0.01em;
          transition: color 140ms var(--ease);
        }
        .fl-folio__link em {
          font-family: var(--display); font-style: normal; font-size: 12px;
          letter-spacing: 0.06em; color: var(--ink-soft);
          transition: color 140ms var(--ease);
        }
        .fl-folio__link:hover { color: var(--ink); }
        .fl-folio__link[aria-current="true"] { color: var(--ink); }
        .fl-folio__link[aria-current="true"] em { color: var(--accent); }
        .fl-folio__link[aria-current="true"]::after {
          content: ''; grid-column: 2; display: block; height: 1px; background: var(--accent);
        }
        .fl-folio__foot { font-size: 12.5px; color: var(--ink-soft); line-height: 1.7; }
        .fl-folio__foot a { color: var(--ink); text-underline-offset: 3px; text-decoration-thickness: 1px; }
        .fl-folio__foot a:hover { color: var(--accent); }

        .fl-topfolio { display: none; }

        /* ---------------------------------------------------------- shell */
        .fl-body { margin-left: var(--rail); }
        .fl-ch { padding: clamp(84px, 12vh, 150px) clamp(24px, 5vw, 84px); position: relative; }
        .fl-ch--paper { background: var(--paper); }
        .fl-ch--paper2 { background: var(--paper-2); }
        .fl-ch--plate {
          background: var(--plate);
          --ink: #EDF2EC; --ink-soft: #9DB2A5; --rule: rgba(237,242,236,0.2);
          --rule-soft: rgba(237,242,236,0.12); --accent: #55D68B; --card: #1B2A22;
          color: #EDF2EC;
        }
        .fl-wrap { max-width: 1120px; margin: 0 auto; }

        .fl-open { display: flex; align-items: baseline; gap: 16px; margin-bottom: 30px; }
        .fl-open__num {
          font-family: var(--display); font-size: 13px; letter-spacing: 0.16em;
          text-transform: uppercase; color: var(--accent); flex-shrink: 0;
        }
        .fl-open__line { flex: 1; height: 1px; background: var(--rule); }

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
          background: var(--paper);
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
        .fl-h1 i { font-style: italic; color: var(--accent); margin-right: 0.14em; }
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

        .fl-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 12px 24px; border-radius: 2px; border: 1px solid var(--accent);
          background: var(--accent); color: #FFFFFF; text-decoration: none;
          font-family: var(--text); font-weight: 600; font-size: 15px; letter-spacing: 0.01em;
          transition: background 150ms var(--ease), transform 110ms var(--ease);
        }
        .fl-btn:hover { background: #196239; }
        .fl-btn:active { transform: translateY(1px); }
        .fl-link {
          color: var(--ink); font-size: 15px; font-weight: 500;
          text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 1px;
          transition: color 140ms var(--ease);
        }
        .fl-link:hover { color: var(--accent); }

        /* ------------------------------------------------- I · the advisor */
        .fl-advisor__grid { display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(0, 1fr); gap: clamp(32px, 5vw, 76px); align-items: stretch; }
        .fl-advisor__prose > * + * { margin-top: 62vh; }
        .fl-advisor__col { position: relative; }
        .fl-advisor__media { position: sticky; top: 11vh; }
        .fl-quote {
          font-family: var(--display); font-weight: 400; font-size: clamp(1.35rem, 2.3vw, 1.85rem);
          line-height: 1.28; letter-spacing: -0.012em; margin: 0; max-width: 22ch;
          border-left: 1px solid var(--accent); padding-left: 20px;
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
        .fl-file__n { font-family: var(--display); font-size: 12px; color: var(--ink-soft); }
        .fl-file__label { font-size: 13.5px; font-weight: 600; letter-spacing: -0.005em; }
        .fl-file__note { font-size: 11px; color: var(--ink-soft); letter-spacing: 0.04em; text-transform: uppercase; }
        .fl-file__tick { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-2); }

        .fl-verdicts { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
        .fl-verdict {
          background: var(--card); border: 1px solid var(--rule-soft); border-radius: 3px;
          padding: 12px 14px; overflow: hidden;
        }
        .fl-verdict__ink { will-change: clip-path, opacity; }
        .fl-verdict__top { display: flex; align-items: baseline; gap: 8px; margin-bottom: 5px; }
        .fl-verdict__name { font-size: 13px; font-weight: 600; }
        .fl-verdict__code { font-family: var(--display); font-size: 11.5px; color: var(--ink-soft); letter-spacing: 0.06em; }
        .fl-verdict__status { margin-left: auto; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
        .fl-verdict--good .fl-verdict__status { color: var(--accent); }
        .fl-verdict--maybe .fl-verdict__status { color: #8F5A03; }
        .fl-verdict--bad .fl-verdict__status { color: #A32D24; }
        .fl-verdict__track { height: 3px; background: var(--rule-soft); border-radius: 2px; overflow: hidden; margin-bottom: 7px; }
        .fl-verdict__bar { display: block; height: 100%; transform-origin: left; will-change: transform; }
        .fl-verdict--good .fl-verdict__bar { background: var(--accent-2); }
        .fl-verdict--maybe .fl-verdict__bar { background: #D08A12; }
        .fl-verdict--bad .fl-verdict__bar { background: #C0453A; }
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
        .fl-sched__day { font-family: var(--display); font-size: 12.5px; letter-spacing: 0.05em; color: var(--accent); }
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
        .fl-chip code { font-family: var(--display); font-size: 12.5px; color: var(--ink-soft); }
        .fl-folder {
          background: var(--card); border: 1px solid var(--rule-soft); border-radius: 4px;
          box-shadow: var(--shadow); padding: 22px 24px;
        }
        .fl-folder__name { font-family: var(--display); font-weight: 600; font-size: 18px; margin: 0 0 4px; }
        .fl-folder__meta { font-size: 12.5px; color: var(--ink-soft); margin: 0; }
        .fl-folder__ic { display: block; width: 34px; height: 34px; color: var(--accent); margin-bottom: 14px; }
        .fl-folder__ic svg { width: 100%; height: 100%; }

        /* ------------------------------------------------ IV · in the cloud */
        .fl-cloud__grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: clamp(32px, 5vw, 72px); align-items: center; }
        .fl-cloud__pair { display: grid; grid-template-columns: 1fr 34px 1fr; align-items: center; gap: 10px; }
        .fl-device {
          background: var(--card); border: 1px solid var(--rule); border-radius: 4px; padding: 16px;
          min-height: 148px; display: flex; flex-direction: column; gap: 7px;
        }
        .fl-device__tag { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-soft); }
        .fl-device__name { font-family: var(--display); font-size: 16px; font-weight: 600; }
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
          font-family: var(--display); font-size: 11.5px; font-weight: 600; letter-spacing: 0.06em;
          color: var(--accent); background: rgba(41,183,103,0.11); padding: 4px 8px; border-radius: 2px;
        }
        .fl-doc__label { font-size: 13.5px; }
        .fl-doc__state { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft); }
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
          background: rgba(41,183,103,0.14); color: var(--accent);
          font-family: var(--display); font-size: 11px; font-weight: 700;
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
        .fl-faqitem button:hover { color: var(--accent); }
        .fl-faqitem__sign { font-family: var(--text); font-size: 16px; color: var(--accent); flex-shrink: 0; }
        .fl-faqitem__body { overflow: hidden; max-height: 0; transition: max-height 260ms var(--ease); }
        .fl-faqitem[data-open="true"] .fl-faqitem__body { max-height: 260px; }
        .fl-faqitem__body p { margin: 0; padding: 0 2px 20px; font-size: 15px; line-height: 1.65; color: var(--ink-soft); max-width: 58ch; }

        /* ------------------------------------------------------- colophon */
        .fl-colophon {
          background: var(--paper-2); padding: clamp(70px, 10vh, 120px) clamp(24px, 5vw, 84px) clamp(46px, 6vh, 70px);
        }
        .fl-colophon__rule { display: block; height: 2px; background: var(--ink); transform: scaleX(0); transform-origin: left; will-change: transform; margin-bottom: 26px; }
        .fl-colophon__mark { font-family: var(--display); font-weight: 700; font-size: 20px; letter-spacing: -0.01em; margin: 0 0 10px; }
        .fl-colophon__ask { font-size: 16.5px; line-height: 1.7; margin: 0; max-width: 52ch; }
        .fl-colophon__ask a { color: var(--accent); font-weight: 600; text-decoration: underline; text-underline-offset: 4px; }
        .fl-colophon__ask a:hover { color: var(--ink); }
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
          .fl-topfolio {
            display: flex; position: sticky; top: 0; z-index: 40; gap: 12px;
            align-items: baseline; justify-content: space-between;
            padding: 11px clamp(18px, 5vw, 28px);
            background: var(--paper); border-bottom: 1px solid var(--rule-soft);
          }
          .fl-topfolio__mark { font-family: var(--display); font-weight: 700; font-size: 15px; color: var(--ink); text-decoration: none; }
          .fl-topfolio__mark span { color: var(--accent); }
          .fl-topfolio__now { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft); }
          .fl-body { margin-left: 0; }
          .fl-planner__grid, .fl-local__grid, .fl-cloud__grid, .fl-team__grid { grid-template-columns: minmax(0, 1fr); }
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
          .fl-h1 { font-size: clamp(2.2rem, 10vw, 2.9rem); }
          .fl-title { min-height: 0; padding-top: 54px; padding-bottom: 60px; }
          .fl-cloud__pair { grid-template-columns: 1fr; gap: 14px; }
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
          {CHAPTERS.map((c) => (
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
              <Link to="/login">Log in</Link>
            </>
          )}
        </p>
      </nav>

      <div className="fl-topfolio">
        <a className="fl-topfolio__mark" href="#top">Edamame<span>.</span></a>
        <span className="fl-topfolio__now">
          {activeChapter
            ? `${CHAPTERS.find((c) => c.id === activeChapter)?.numeral} · ${CHAPTERS.find((c) => c.id === activeChapter)?.short}`
            : 'Contents'}
        </span>
      </div>

      <div className="fl-body" id="top">

        {/* ------------------------------------------------------ title page */}
        <header className="fl-title">
          <p className="fl-title__masthead">Edamame Legal Flow</p>
          <h1 className="fl-h1">
            A case system that reads the file <i>before</i> you do.
          </h1>
          <span className="fl-title__track" aria-hidden="true">
            <span ref={heroRuleRef} className="fl-title__rule" />
          </span>
          <p className="fl-title__deck">{audienceLine}</p>
          <div className="fl-title__acts">
            <Link className="fl-btn" to={ctaHref}>{ctaLabel}</Link>
            {!user && <Link className="fl-link" to="/login">Log in</Link>}
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
              <span className="fl-open__num">Chapter I</span>
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
                  <p style={{ margin: '22px 0 0' }}>
                    <Link className="fl-btn" to={ctaHref}>{ctaLabel}</Link>
                  </p>
                </div>
              </div>

              <div className="fl-advisor__col">
              <figure className="fl-advisor__media" style={{ margin: 0 }}>
                <div className="fl-stage" ref={stageRef}>
                  <div className="fl-docket">
                    <div className="fl-docket__head">
                      <span>Docket</span>
                      <span>5 open</span>
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
              <span className="fl-open__num">Chapter II</span>
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
              <span className="fl-open__num">Chapter III</span>
              <span className="fl-open__line" />
            </div>
            <div className="fl-local__grid">
              <figure ref={localMediaRef} style={{ margin: 0 }}>
                <div className="fl-plates">
                  <div className="fl-plate fl-plate--back" ref={(el) => { plateRefs.current[0] = el; }}>
                    <div className="fl-chip"><code>cases/</code> one file per matter</div>
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
                  Local mode uses the File System Access API, so it needs Chrome or
                  Edge.
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
              <span className="fl-open__num">Chapter IV</span>
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
                  Every row carries your account id, and row-level security scopes
                  reads and writes to it. Document files are stored under your own
                  path prefix, with the same rule applied at the storage layer.
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
              <span className="fl-open__num">Chapter V</span>
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
              <span className="fl-open__num">Chapter VI</span>
              <span className="fl-open__line" />
            </div>
            <h2 id="faq-title" className="fl-h2 fl-rise">Questions worth asking.</h2>
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

        {/* -------------------------------------------------------- colophon */}
        <footer className="fl-colophon">
          <div className="fl-wrap">
            <span ref={colophonRuleRef} className="fl-colophon__rule" aria-hidden="true" />
            <p className="fl-colophon__mark">Edamame Legal Flow</p>
            <p className="fl-colophon__ask">
              Case and task management for immigration practice in Australia and New
              Zealand. Start with one case:{' '}
              <Link to={ctaHref}>{ctaLabel.toLowerCase()}</Link>
              {!user && <>, or <Link to="/login">log in</Link> if you have been here before</>}.
            </p>
            <p className="fl-colophon__fine">&copy; 2026 Edamame Legal Flow. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
