import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

type Audience = 'lawyer' | 'agency';

const AUDIENCE_LINE: Record<Audience, string> = {
  lawyer: 'Built for AU and NZ immigration law firms.',
  agency: 'Built for AU and NZ study-abroad agencies.',
};
const DEFAULT_LINE = 'Built for AU and NZ immigration lawyers and study-abroad agencies.';

function isAudience(value: string | null): value is Audience {
  return value === 'lawyer' || value === 'agency';
}

const CASE_CARDS = [
  { label: 'Partner 820', tone: 'accent', chaos: 'translate(-70px, -46px) rotate(-16deg)' },
  { label: 'Student 500', tone: 'warm', chaos: 'translate(58px, -12px) rotate(11deg)' },
  { label: 'Skilled 190', tone: 'ink', chaos: 'translate(-24px, 40px) rotate(-8deg)' },
  { label: 'Visitor 600', tone: 'accent', chaos: 'translate(84px, 30px) rotate(18deg)' },
  { label: 'Graduate 485', tone: 'warm', chaos: 'translate(8px, -4px) rotate(-3deg)' },
];
const CASE_RESOLVED = (i: number) => {
  const mid = (CASE_CARDS.length - 1) / 2;
  // A tidy fanned stack, not a spread row — keeps the resolved footprint
  // small so it never invades the text column beside it.
  return `translate(${(i - mid) * 7}px, ${(i - mid) * 40}px) rotate(0deg)`;
};

const VERDICTS = [
  { name: 'Student Visa', code: 'SC-500', status: 'Strong match', tone: 'good', fill: 88, reason: 'Confirmed enrolment in a CRICOS-registered course.' },
  { name: 'Skilled Independent', code: 'SC-190', status: 'Possible', tone: 'maybe', fill: 60, reason: 'Occupation is on the relevant skilled list; points test not yet confirmed.' },
  { name: 'Partner Visa', code: 'SC-820/801', status: 'Unlikely', tone: 'bad', fill: 25, reason: 'Relationship does not yet meet the minimum duration.' },
];

const TASK_ROWS = [
  { title: 'Collect employment references', when: 'Skilled 190' },
  { title: 'Lodge Form 47SP', when: 'Partner 820' },
  { title: 'Submit medical examination', when: 'Student 500' },
];

const FAQS = [
  { q: 'Can I keep my data on my own machine?', a: 'Yes. Local mode links a real folder on disk (works well inside Dropbox, OneDrive or iCloud Drive) and every case is a plain file in it. Nothing is uploaded unless you switch to cloud mode.' },
  { q: 'Does this work for both AU and NZ?', a: 'Yes, both jurisdictions are supported with their own workflow templates and terminology, not one generic template stretched across both.' },
  { q: 'Can my whole team use one account?', a: 'Yes. Team members share cases, an activity feed, and document checklists, whether you’re on local or cloud storage.' },
  { q: 'What happens to my local data if I switch to cloud later?', a: 'Switching modes copies every case, client, and document across for you. Your local folder is left untouched afterward, so it stays as a backup.' },
];

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type ObjectDef = { id: string; eyebrow: string; name: string; spec: string; fact: string };

const OBJECTS: ObjectDef[] = [
  { id: 'advisor', eyebrow: 'Object 01', name: 'AI Visa Advisor', spec: 'Reads the client’s facts against real visa criteria.', fact: 'Returns a verdict per pathway, with the reasoning attached, not just a score.' },
  { id: 'planner', eyebrow: 'Object 02', name: 'AI Task Planner', spec: 'Matches the workflow to the visa subclass.', fact: 'A Student 500 case and a Partner 820/801 case never share a template they shouldn’t.' },
  { id: 'local', eyebrow: 'Object 03', name: 'Local storage', spec: 'A real folder on disk, synced through Dropbox or OneDrive.', fact: 'Nothing leaves your machine unless you choose to.' },
  { id: 'cloud', eyebrow: 'Object 04', name: 'Cloud storage', spec: 'Any device, one account.', fact: 'Your firm’s data only, isolated from every other account by row-level access rules.' },
  { id: 'team', eyebrow: 'Object 05', name: 'Team & attachments', spec: 'Shared cases, an activity feed, and document checklists.', fact: 'Every upload lands on the right checklist item, matched to its document type automatically.' },
  { id: 'close', eyebrow: 'Object 06', name: 'Bring the next case in', spec: 'Set up your practice in minutes.', fact: 'No pricing tiers to weigh first, just the workspace.' },
];

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = matchMedia(query);
    setMatches(mq.matches);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export default function LandingPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const audienceParam = searchParams.get('for');
  const audienceLine = isAudience(audienceParam) ? AUDIENCE_LINE[audienceParam] : DEFAULT_LINE;

  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const isNarrow = useMediaQuery('(max-width: 860px)');
  const panDisabled = reducedMotion || isNarrow;

  const dashboardHref = user ? '/dashboard' : '/register';
  const dashboardLabel = user ? 'Go to Dashboard' : 'Get started';

  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const caseCardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const verdictRefs = useRef<Array<HTMLDivElement | null>>([]);
  const taskRowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const localCardRef = useRef<HTMLDivElement>(null);
  const cloudIconRef = useRef<HTMLDivElement>(null);
  const teamCardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const navRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const revealRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [revealed, setRevealed] = useState<boolean[]>(() => OBJECTS.map(() => false));

  // ---- the pan spine: vertical scroll drives horizontal movement through
  // the six objects. Disabled on touch/narrow viewports (scroll-jacking a
  // vertical touch gesture into horizontal movement is a real usability
  // problem on phones) and under reduced motion, both of which fall back to
  // a plain vertical stack driven by IntersectionObserver instead.
  useEffect(() => {
    if (panDisabled) return;
    const wrap = wrapRef.current;
    const track = trackRef.current;
    if (!wrap || !track) return;

    let raf = 0;
    // Each object gets an equal 1/n slice of the scroll track. Object 0 has
    // no incoming pan (it's already centered at p=0), so its whole slice is
    // "dwell": the signature move runs across it. Every later object's slice
    // splits into a short pan-in (TRANS) where translateX moves and nothing
    // else animates, then a dwell where translateX holds still and that
    // object's own effect runs 0->1. Without this split, panning and
    // revealing happened at the same time and objects never held still long
    // enough to actually read.
    const TRANS = 0.32;
    const objectLocal = (objIndex: number, currentIndex: number, segLocal: number) => {
      if (objIndex < currentIndex) return 1;
      if (objIndex > currentIndex) return 0;
      if (objIndex === 0) return segLocal;
      return segLocal < TRANS ? 0 : clamp((segLocal - TRANS) / (1 - TRANS));
    };

    const applyProgress = (p: number) => {
      const n = OBJECTS.length;
      const panelWidth = innerWidth;
      const segF = clamp(p, 0, 1) * n;
      const currentIndex = clamp(Math.floor(segF), 0, n - 1);
      const segLocal = clamp(segF - currentIndex, 0, 1);

      let translateX: number;
      if (currentIndex === 0) {
        translateX = 0;
      } else if (segLocal < TRANS) {
        translateX = lerp(-(currentIndex - 1) * panelWidth, -currentIndex * panelWidth, segLocal / TRANS);
      } else {
        translateX = -currentIndex * panelWidth;
      }
      track.style.transform = `translate3d(${translateX}px,0,0)`;

      setActiveIndex((prev) => (prev === currentIndex ? prev : currentIndex));

      // object 0 · Visa Advisor: signature move + verdict reveal
      const lp0 = objectLocal(0, currentIndex, segLocal);
      caseCardRefs.current.forEach((el, i) => {
        if (!el) return;
        const chaos = CASE_CARDS[i].chaos;
        const resolved = CASE_RESOLVED(i);
        el.style.transform = lp0 < 1 ? chaos : resolved;
        el.style.opacity = String(lerp(0.55, 1, lp0));
        // interpolate by blending via CSS custom easing isn't native, so we
        // cross-fade transforms using a weighted intermediate transform when
        // partially resolved, computed as a simple translate/rotate lerp.
        if (lp0 > 0 && lp0 < 1) {
          const chaosMatch = /translate\(([-.\d]+)px, ?([-.\d]+)px\) rotate\(([-.\d]+)deg\)/.exec(chaos);
          const resolvedMatch = /translate\(([-.\d]+)px, ?([-.\d]+)px\) rotate\(([-.\d]+)deg\)/.exec(resolved);
          if (chaosMatch && resolvedMatch) {
            const x = lerp(parseFloat(chaosMatch[1]), parseFloat(resolvedMatch[1]), lp0);
            const y = lerp(parseFloat(chaosMatch[2]), parseFloat(resolvedMatch[2]), lp0);
            const r = lerp(parseFloat(chaosMatch[3]), parseFloat(resolvedMatch[3]), lp0);
            el.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg)`;
          }
        }
      });
      verdictRefs.current.forEach((el, i) => {
        if (!el) return;
        const threshold = (i + 0.5) / (VERDICTS.length + 1);
        const local = clamp((lp0 - threshold) * 3.2);
        el.style.clipPath = `inset(0 ${(1 - local) * 100}% 0 0)`;
        el.style.opacity = String(lerp(0.15, 1, local));
      });

      // object 1 · Task Planner: staggered line entrance
      const lp1 = objectLocal(1, currentIndex, segLocal);
      taskRowRefs.current.forEach((el, rowI) => {
        if (!el) return;
        const local = clamp((lp1 - rowI * 0.18) * 2.2);
        el.style.opacity = String(local);
        el.style.transform = `translateY(${(1 - local) * 16}px)`;
      });

      // object 2 · Local storage: settle tilt
      const lp2 = objectLocal(2, currentIndex, segLocal);
      if (localCardRef.current) {
        localCardRef.current.style.transform = `perspective(700px) rotateX(${(1 - lp2) * 10}deg) rotateY(${(1 - lp2) * -14}deg)`;
      }

      // object 3 · Cloud storage: icon/card parallax
      const lp3 = objectLocal(3, currentIndex, segLocal);
      if (cloudIconRef.current) {
        cloudIconRef.current.style.transform = `translateX(${(lp3 - 0.5) * 26}px)`;
      }

      // object 4 · Team & attachments: wipe-in sub-cards
      const lp4 = objectLocal(4, currentIndex, segLocal);
      teamCardRefs.current.forEach((el, cardI) => {
        if (!el) return;
        const local = clamp((lp4 - cardI * 0.25) * 2.6);
        el.style.clipPath = `inset(0 0 0 ${(1 - local) * 100}%)`;
        el.style.opacity = String(lerp(0.2, 1, local));
      });

      navRefs.current.forEach((btn, navI) => btn?.setAttribute('aria-current', String(navI === currentIndex)));
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = wrap.getBoundingClientRect();
        const total = wrap.offsetHeight - innerHeight;
        const p = clamp(total > 0 ? -rect.top / total : 0);
        applyProgress(p);
      });
    };

    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
    };
  }, [panDisabled]);

  // ---- fallback: plain vertical stack, reveal-on-view, no horizontal pan
  useEffect(() => {
    if (!panDisabled) return;
    const observers = revealRefs.current.map((el, i) => {
      if (!el) return null;
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setRevealed((prev) => {
              if (prev[i]) return prev;
              const next = prev.slice();
              next[i] = true;
              return next;
            });
          }
        },
        { threshold: 0.3 }
      );
      io.observe(el);
      return io;
    });
    return () => observers.forEach((io) => io?.disconnect());
  }, [panDisabled]);

  const gotoObject = (i: number) => {
    if (panDisabled) {
      revealRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const wrap = wrapRef.current;
    if (!wrap) return;
    const total = wrap.offsetHeight - innerHeight;
    const top = wrap.offsetTop + (i / OBJECTS.length) * total + 2;
    scrollTo({ top, behavior: 'smooth' });
  };

  return (
    <div className="el2">
      <style>{`
        .el2 {
          --canvas: #0B0F0D; --surface: #141B18; --surface-2: #1B2420;
          --ink: #F4F7F3; --ink-soft: #8FA396;
          --accent: #2FD673; --accent-ink: #04150A; --accent-warm: #FFB648;
          --line: rgba(244,247,243,0.10);
          --font-display: 'Space Grotesk', 'Archivo', system-ui, sans-serif;
          --font-body: 'Manrope', 'Archivo', system-ui, sans-serif;
          background: var(--canvas); color: var(--ink); font-family: var(--font-body);
          overflow-x: clip;
        }
        .el2 * { box-sizing: border-box; }
        .el2-shell { max-width: 1180px; margin: 0 auto; padding: 0 24px; }

        .el2-nav {
          position: sticky; top: 0; z-index: 50;
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          padding: 12px 20px;
          background: rgba(11,15,13,0.88); backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .el2-mark { display: flex; align-items: center; gap: 8px; font-family: var(--font-display); font-weight: 700; font-size: 14.5px; flex-shrink: 0; }
        .el2-mark__box { width: 26px; height: 26px; border-radius: 8px; background: var(--accent); color: var(--accent-ink); display: flex; align-items: center; justify-content: center; font-weight: 800; }
        .el2-index { display: flex; align-items: center; gap: 4px; overflow-x: auto; scrollbar-width: none; flex: 1 1 auto; min-width: 0; }
        .el2-index::-webkit-scrollbar { display: none; }
        .el2-index button {
          flex-shrink: 0; background: none; border: none; cursor: pointer;
          font-family: var(--font-display); font-weight: 600; font-size: 12px; letter-spacing: 0.02em;
          color: var(--ink-soft); padding: 7px 11px; border-radius: 999px; white-space: nowrap;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .el2-index button[aria-current="true"] { background: rgba(47,214,115,0.14); color: var(--accent); }
        .el2-navcta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        @media (max-width: 640px) {
          .el2-nav { flex-wrap: wrap; row-gap: 10px; }
          .el2-index { order: 3; flex-basis: 100%; width: 100%; }
        }
        .el2-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 9px 18px; border-radius: 999px;
          font-family: var(--font-display); font-weight: 600; font-size: 13.5px;
          text-decoration: none; border: 1px solid transparent; cursor: pointer;
          transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
        }
        .el2-btn:active { transform: scale(0.97); }
        .el2-btn--accent { background: var(--accent); color: var(--accent-ink); }
        .el2-btn--accent:hover { background: #40e084; }
        .el2-btn--ghost { color: var(--ink); border-color: var(--line); }

        /* ---- the pan spine ---- */
        .el2-wrap { position: relative; height: 600vh; }
        .el2-stage { position: sticky; top: 0; height: 100vh; overflow: hidden; }
        .el2-track { display: flex; height: 100%; width: 600vw; will-change: transform; }
        .el2-panel { width: 100vw; height: 100%; flex-shrink: 0; display: flex; align-items: center; padding: 0 clamp(24px, 6vw, 96px); position: relative; }
        .el2-panel__inner { max-width: 620px; }
        .el2-panel--right .el2-panel__inner { margin-left: auto; text-align: right; }
        .el2-eyebrow { display: inline-block; font-family: var(--font-display); font-weight: 600; font-size: 11.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent-warm); margin-bottom: 14px; }
        .el2-name { font-family: var(--font-display); font-weight: 700; letter-spacing: -0.02em; font-size: clamp(1.8rem, 3.4vw, 2.7rem); line-height: 1.08; margin: 0 0 14px; }
        .el2-spec { font-size: 16px; line-height: 1.55; color: var(--ink); margin: 0 0 8px; max-width: 40ch; }
        .el2-fact { font-size: 14px; line-height: 1.6; color: var(--ink-soft); margin: 0 0 26px; max-width: 42ch; }

        /* fallback stack (reduced motion / narrow) */
        .el2-stack-mode .el2-wrap { height: auto; }
        .el2-stack-mode .el2-stage { position: static; height: auto; overflow: visible; }
        .el2-stack-mode .el2-track { display: block; width: auto; }
        .el2-stack-mode .el2-panel { width: auto; height: auto; display: block; padding: 72px 24px; border-bottom: 1px solid var(--line); }
        .el2-stack-mode .el2-panel__inner { max-width: 620px; margin: 0 auto; text-align: left !important; }
        .el2-stack-mode .el2-scene { margin: 28px auto 0; }
        .el2-panel[data-revealed="false"] { }
        .el2-stack-mode .el2-panel[data-revealed="true"] .el2-reveal { opacity: 1; transform: none; }
        .el2-stack-mode .el2-reveal { opacity: 0; transform: translateY(14px); transition: opacity 0.5s ease, transform 0.5s ease; }

        .el2-scene { position: relative; height: 260px; display: flex; align-items: center; justify-content: center; }

        .el2-casecard {
          position: absolute; width: 128px; padding: 12px 14px;
          background: var(--surface); border: 1px solid var(--line); border-radius: 13px;
          box-shadow: 0 16px 32px -18px rgba(0,0,0,0.6);
          transition: opacity 0.2s ease;
        }
        .el2-casecard__dot { width: 8px; height: 8px; border-radius: 999px; margin-bottom: 8px; }
        .el2-casecard__dot--accent { background: var(--accent); }
        .el2-casecard__dot--warm { background: var(--accent-warm); }
        .el2-casecard__dot--ink { background: var(--ink-soft); }
        .el2-casecard__label { font-family: var(--font-display); font-weight: 600; font-size: 12.5px; }

        .el2-verdicts { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 320px; }
        .el2-vcard { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; overflow: hidden; }
        .el2-vcard__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
        .el2-vcard__name { font-family: var(--font-display); font-weight: 600; font-size: 13px; }
        .el2-vcard__code { font-size: 9.5px; font-weight: 700; color: var(--ink-soft); background: rgba(244,247,243,0.06); padding: 2px 6px; border-radius: 5px; }
        .el2-vcard__status { font-weight: 700; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
        .el2-vcard--good .el2-vcard__status { color: var(--accent); }
        .el2-vcard--maybe .el2-vcard__status { color: var(--accent-warm); }
        .el2-vcard--bad .el2-vcard__status { color: #FF7A7A; }
        .el2-vcard__bar { height: 4px; border-radius: 999px; background: rgba(244,247,243,0.08); overflow: hidden; margin-bottom: 8px; }
        .el2-vcard__fill { height: 100%; border-radius: 999px; }
        .el2-vcard--good .el2-vcard__fill { background: var(--accent); }
        .el2-vcard--maybe .el2-vcard__fill { background: var(--accent-warm); }
        .el2-vcard--bad .el2-vcard__fill { background: #FF7A7A; }
        .el2-vcard p { color: var(--ink-soft); font-size: 11.5px; line-height: 1.45; margin: 0; }

        .el2-taskboard { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 340px; }
        .el2-taskrow { display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; }
        .el2-taskrow__dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }
        .el2-taskrow__title { font-size: 12.5px; font-weight: 600; flex: 1; }
        .el2-taskrow__when { font-size: 10.5px; color: var(--ink-soft); }

        .el2-foldercard {
          width: 190px; padding: 22px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px;
          box-shadow: 0 20px 40px -20px rgba(0,0,0,0.6);
        }
        .el2-foldericon { width: 40px; height: 40px; border-radius: 11px; background: rgba(47,214,115,0.14); color: var(--accent); display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
        .el2-foldericon svg { width: 22px; height: 22px; }

        .el2-cloudcard { width: 220px; padding: 22px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 20px 40px -20px rgba(0,0,0,0.6); }
        .el2-cloudicon { width: 40px; height: 40px; border-radius: 11px; background: rgba(255,182,72,0.14); color: var(--accent-warm); display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
        .el2-cloudicon svg { width: 22px; height: 22px; }

        .el2-teamgrid { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 300px; }
        .el2-teamcard { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; opacity: 1; }
        .el2-teamcard strong { font-family: var(--font-display); font-size: 12.5px; display: block; margin-bottom: 3px; }
        .el2-teamcard span { font-size: 11.5px; color: var(--ink-soft); }

        .el2-faq { max-width: 720px; margin: 0 auto; padding: 84px 24px; }
        .el2-faq h2 { font-family: var(--font-display); font-weight: 700; letter-spacing: -0.015em; font-size: clamp(1.6rem, 3vw, 2.1rem); margin: 0 0 34px; text-align: center; }
        .el2-faqitem { border-bottom: 1px solid var(--line); }
        .el2-faqitem button { width: 100%; text-align: left; background: none; border: none; cursor: pointer; padding: 18px 4px; display: flex; align-items: center; justify-content: space-between; gap: 16px; font-family: var(--font-display); font-weight: 600; font-size: 15px; color: var(--ink); }
        .el2-faqitem__plus { font-size: 20px; color: var(--accent); flex-shrink: 0; transition: transform 0.2s ease; line-height: 1; }
        .el2-faqitem[data-open="true"] .el2-faqitem__plus { transform: rotate(45deg); }
        .el2-faqitem__body { overflow: hidden; max-height: 0; transition: max-height 0.28s ease; }
        .el2-faqitem[data-open="true"] .el2-faqitem__body { max-height: 220px; }
        .el2-faqitem__body p { padding: 0 4px 18px; color: var(--ink-soft); font-size: 14px; line-height: 1.6; margin: 0; }

        .el2-footer { border-top: 1px solid var(--line); padding: 22px; text-align: center; color: var(--ink-soft); font-size: 12px; }
      `}</style>

      <nav className="el2-nav">
        <span className="el2-mark"><span className="el2-mark__box">E</span>Edamame</span>
        <div className="el2-index" role="list" aria-label="Feature index">
          {OBJECTS.map((o, i) => (
            <button
              key={o.id}
              type="button"
              ref={(el) => { navRefs.current[i] = el; }}
              aria-current={i === activeIndex}
              onClick={() => gotoObject(i)}
            >
              {o.name}
            </button>
          ))}
        </div>
        <div className="el2-navcta">
          {user ? (
            <Link className="el2-btn el2-btn--accent" to="/dashboard">Dashboard</Link>
          ) : (
            <>
              <Link className="el2-btn el2-btn--ghost" to="/login">Log in</Link>
              <Link className="el2-btn el2-btn--accent" to="/register">Get started</Link>
            </>
          )}
        </div>
      </nav>

      <div ref={wrapRef} className={`el2-wrap ${panDisabled ? 'el2-stack-mode' : ''}`}>
        <div className="el2-stage">
        <div ref={trackRef} className="el2-track">

          {/* 0 · AI VISA ADVISOR (peak, signature move) */}
          <div
            className="el2-panel"
            ref={(el) => { revealRefs.current[0] = el; }}
            data-revealed={revealed[0]}
          >
            <div className="el2-panel__inner">
              <span className="el2-eyebrow">{OBJECTS[0].eyebrow}</span>
              <h1 className="el2-name">{OBJECTS[0].name}</h1>
              <p className="el2-spec">{audienceLine} {OBJECTS[0].spec}</p>
              <p className="el2-fact">{OBJECTS[0].fact}</p>
              <div className="el2-cta-row" style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                <Link className="el2-btn el2-btn--accent" to={dashboardHref}>{dashboardLabel}</Link>
              </div>
            </div>
            <div className="el2-scene el2-reveal">
              <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
                <div style={{ position: 'relative', width: 180, height: 140 }}>
                  {CASE_CARDS.map((c, i) => (
                    <div
                      key={c.label}
                      ref={(el) => { caseCardRefs.current[i] = el; }}
                      className="el2-casecard"
                      style={{ transform: panDisabled ? CASE_RESOLVED(i) : c.chaos, left: '50%', top: '50%', marginLeft: -64, marginTop: -34, zIndex: i }}
                    >
                      <span className={`el2-casecard__dot el2-casecard__dot--${c.tone}`} />
                      <div className="el2-casecard__label">{c.label}</div>
                    </div>
                  ))}
                </div>
                <div className="el2-verdicts">
                  {VERDICTS.map((v, i) => (
                    <div
                      key={v.code}
                      ref={(el) => { verdictRefs.current[i] = el; }}
                      className={`el2-vcard el2-vcard--${v.tone}`}
                      style={panDisabled ? undefined : { clipPath: 'inset(0 100% 0 0)', opacity: 0.15 }}
                    >
                      <div className="el2-vcard__head">
                        <span className="el2-vcard__name">{v.name}</span>
                        <span className="el2-vcard__code">{v.code}</span>
                      </div>
                      <div className="el2-vcard__status">{v.status}</div>
                      <div className="el2-vcard__bar"><div className="el2-vcard__fill" style={{ width: `${v.fill}%` }} /></div>
                      <p>{v.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 1 · AI TASK PLANNER */}
          <div className="el2-panel el2-panel--right" ref={(el) => { revealRefs.current[1] = el; }} data-revealed={revealed[1]}>
            <div className="el2-panel__inner">
              <span className="el2-eyebrow">{OBJECTS[1].eyebrow}</span>
              <h2 className="el2-name">{OBJECTS[1].name}</h2>
              <p className="el2-spec">{OBJECTS[1].spec}</p>
              <p className="el2-fact">{OBJECTS[1].fact}</p>
              <div className="el2-scene el2-reveal" style={{ justifyContent: 'flex-end' }}>
                <div className="el2-taskboard">
                  {TASK_ROWS.map((t, i) => (
                    <div
                      key={t.title}
                      ref={(el) => { taskRowRefs.current[i] = el; }}
                      className="el2-taskrow"
                      style={panDisabled ? undefined : { opacity: 0, transform: 'translateY(16px)' }}
                    >
                      <span className={`el2-taskrow__dot`} style={{ background: i === 0 ? 'var(--accent)' : i === 1 ? 'var(--accent-warm)' : '#7aa0ff' }} />
                      <span className="el2-taskrow__title">{t.title}</span>
                      <span className="el2-taskrow__when">{t.when}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 2 · LOCAL STORAGE */}
          <div className="el2-panel" ref={(el) => { revealRefs.current[2] = el; }} data-revealed={revealed[2]}>
            <div className="el2-panel__inner">
              <span className="el2-eyebrow">{OBJECTS[2].eyebrow}</span>
              <h2 className="el2-name">{OBJECTS[2].name}</h2>
              <p className="el2-spec">{OBJECTS[2].spec}</p>
              <p className="el2-fact">{OBJECTS[2].fact}</p>
              <div className="el2-scene el2-reveal">
                <div ref={localCardRef} className="el2-foldercard" style={panDisabled ? undefined : { transform: 'perspective(700px) rotateX(10deg) rotateY(-14deg)' }}>
                  <div className="el2-foldericon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>
                  </div>
                  <strong style={{ fontFamily: 'var(--font-display)', fontSize: 14, display: 'block', marginBottom: 4 }}>edamame-cases/</strong>
                  <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Synced via Dropbox</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3 · CLOUD STORAGE */}
          <div className="el2-panel el2-panel--right" ref={(el) => { revealRefs.current[3] = el; }} data-revealed={revealed[3]}>
            <div className="el2-panel__inner">
              <span className="el2-eyebrow">{OBJECTS[3].eyebrow}</span>
              <h2 className="el2-name">{OBJECTS[3].name}</h2>
              <p className="el2-spec">{OBJECTS[3].spec}</p>
              <p className="el2-fact">{OBJECTS[3].fact}</p>
              <div className="el2-scene el2-reveal" style={{ justifyContent: 'flex-end' }}>
                <div className="el2-cloudcard">
                  <div ref={cloudIconRef} className="el2-cloudicon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9a4.5 4.5 0 0 1 .5 9H7Z" /></svg>
                  </div>
                  <strong style={{ fontFamily: 'var(--font-display)', fontSize: 14, display: 'block', marginBottom: 4 }}>Synced to your account</strong>
                  <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Row-level isolated</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4 · TEAM & ATTACHMENTS */}
          <div className="el2-panel" ref={(el) => { revealRefs.current[4] = el; }} data-revealed={revealed[4]}>
            <div className="el2-panel__inner">
              <span className="el2-eyebrow">{OBJECTS[4].eyebrow}</span>
              <h2 className="el2-name">{OBJECTS[4].name}</h2>
              <p className="el2-spec">{OBJECTS[4].spec}</p>
              <p className="el2-fact">{OBJECTS[4].fact}</p>
              <div className="el2-scene el2-reveal">
                <div className="el2-teamgrid">
                  {[
                    { t: 'Activity feed', s: 'Every change, logged per case' },
                    { t: 'Attachments', s: 'Matched to the right checklist item' },
                  ].map((c, i) => (
                    <div
                      key={c.t}
                      ref={(el) => { teamCardRefs.current[i] = el; }}
                      className="el2-teamcard"
                      style={panDisabled ? undefined : { clipPath: 'inset(0 0 0 100%)', opacity: 0.2 }}
                    >
                      <strong>{c.t}</strong>
                      <span>{c.s}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 5 · CLOSE (inquiry plate, deliberately quiet) */}
          <div className="el2-panel el2-panel--right" ref={(el) => { revealRefs.current[5] = el; }} data-revealed={revealed[5]}>
            <div className="el2-panel__inner">
              <span className="el2-eyebrow">{OBJECTS[5].eyebrow}</span>
              <h2 className="el2-name">{OBJECTS[5].name}</h2>
              <p className="el2-spec">{OBJECTS[5].spec}</p>
              <p className="el2-fact">{OBJECTS[5].fact}</p>
              <Link className="el2-btn el2-btn--accent" to={dashboardHref}>{dashboardLabel}</Link>
            </div>
          </div>

        </div>
        </div>
      </div>

      <div className="el2-faq">
        <h2>Questions worth asking</h2>
        {FAQS.map((item, i) => {
          const open = openFaq === i;
          return (
            <div key={item.q} className="el2-faqitem" data-open={open}>
              <button type="button" onClick={() => setOpenFaq(open ? null : i)} aria-expanded={open}>
                {item.q}
                <span className="el2-faqitem__plus">+</span>
              </button>
              <div className="el2-faqitem__body"><p>{item.a}</p></div>
            </div>
          );
        })}
      </div>

      <footer className="el2-footer">&copy; 2026 Edamame Legal Flow. All rights reserved.</footer>
    </div>
  );
}
