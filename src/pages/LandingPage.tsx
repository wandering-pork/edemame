import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

type Audience = 'lawyer' | 'agency';

const AUDIENCE_COPY: Record<Audience, { headline: string; sub: string }> = {
  lawyer: {
    headline: 'Every case. Every deadline. Actually organized.',
    sub: 'Built for AU and NZ immigration law firms. Describe a case, and AI drafts the schedule, the eligibility read, and the paper trail behind it.',
  },
  agency: {
    headline: 'Every student. Every deadline. Actually organized.',
    sub: 'Built for AU and NZ study-abroad agencies. Describe a case, and AI drafts the schedule, the eligibility read, and the paper trail behind it.',
  },
};

const DEFAULT_COPY = {
  headline: 'Every case. Every deadline. Actually organized.',
  sub: 'Built for AU and NZ immigration lawyers and study-abroad agencies. Describe a case, and AI drafts the schedule, the eligibility read, and the paper trail behind it.',
};

function isAudience(value: string | null): value is Audience {
  return value === 'lawyer' || value === 'agency';
}

const CASE_CARDS = [
  { label: 'Partner 820', tone: 'accent', chaos: 'translate(-38px, -18px) rotate(-14deg)' },
  { label: 'Student 500', tone: 'warm', chaos: 'translate(30px, 6px) rotate(9deg)' },
  { label: 'Skilled 190', tone: 'ink', chaos: 'translate(-10px, 34px) rotate(-6deg)' },
  { label: 'Visitor 600', tone: 'accent', chaos: 'translate(46px, -30px) rotate(16deg)' },
  { label: 'Graduate 485', tone: 'warm', chaos: 'translate(4px, -4px) rotate(-2deg)' },
];

const BADGES = ['AU + NZ jurisdictions', 'Local or cloud — your choice', '5 visa workflow templates', 'Built for teams'];

type Feature = { icon: React.ReactNode; title: string; body: string; featured?: boolean };

const FEATURES: Feature[] = [
  {
    featured: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 4 6.5v5c0 4.7 3.2 8.4 8 9.5 4.8-1.1 8-4.8 8-9.5v-5L12 3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
    title: 'Ask it before you file it',
    body: 'Enter what the client has told you. The AI Visa Advisor reads it against real visa criteria and returns a verdict for each pathway, with the reasoning attached, not just a score.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M3.5 9.5h17M8 3v4M16 3v4" />
        <path d="M8 14h2M8 17h5" />
      </svg>
    ),
    title: 'Describe the case, get the schedule',
    body: 'Every workflow is matched to the visa subclass, so a Student 500 case and a Partner 820/801 case never share a template they shouldn’t.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      </svg>
    ),
    title: 'Local storage',
    body: 'A real folder on disk, synced through Dropbox or OneDrive. Nothing leaves your machine unless you choose to.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9a4.5 4.5 0 0 1 .5 9H7Z" />
      </svg>
    ),
    title: 'Cloud storage',
    body: 'Any device, one account. Your firm’s data only, isolated from every other account by row-level access rules.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 11a4 4 0 1 0-8 0M2 20c0-3 3-5 6-5s6 2 6 5M13 15c2.5.3 5 1.8 5 5M13 6a3 3 0 1 1 4 2.8" />
      </svg>
    ),
    title: 'One team, one file',
    body: 'Shared cases and an activity feed. No more emailing a PDF back and forth.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 12.5V6a3 3 0 0 1 6 0v9a4.5 4.5 0 0 1-9 0V7" />
      </svg>
    ),
    title: 'Attachments',
    body: 'Upload once. Every file lands on the right checklist item, matched to its document type automatically.',
  },
];

const VERDICTS = [
  { name: 'Student Visa', code: 'SC-500', status: 'Strong match', tone: 'good', fill: 88, reason: 'Confirmed enrolment in a CRICOS-registered course.' },
  { name: 'Skilled Independent', code: 'SC-190', status: 'Possible', tone: 'maybe', fill: 60, reason: 'Occupation is on the relevant skilled list; points test not yet confirmed.' },
  { name: 'Partner Visa', code: 'SC-820/801', status: 'Unlikely', tone: 'bad', fill: 25, reason: 'Relationship does not yet meet the minimum duration.' },
];

const FAQS = [
  {
    q: 'Can I keep my data on my own machine?',
    a: 'Yes. Local mode links a real folder on disk (works well inside Dropbox, OneDrive or iCloud Drive) and every case is a plain file in it. Nothing is uploaded unless you switch to cloud mode.',
  },
  {
    q: 'Does this work for both AU and NZ?',
    a: 'Yes, both jurisdictions are supported with their own workflow templates and terminology, not one generic template stretched across both.',
  },
  {
    q: 'Can my whole team use one account?',
    a: 'Yes. Team members share cases, an activity feed, and document checklists, whether you’re on local or cloud storage.',
  },
  {
    q: 'What happens to my local data if I switch to cloud later?',
    a: 'Switching modes copies every case, client, and document across for you. Your local folder is left untouched afterward, so it stays as a backup.',
  },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function useRevealOnView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}

export default function LandingPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const audienceParam = searchParams.get('for');
  const { headline, sub } = isAudience(audienceParam) ? AUDIENCE_COPY[audienceParam] : DEFAULT_COPY;
  const reducedMotion = useReducedMotion();
  const [settled, setSettled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const showcase = useRevealOnView<HTMLDivElement>();

  const dashboardHref = user ? '/dashboard' : '/register';
  const dashboardLabel = user ? 'Go to Dashboard' : 'Get started';

  useEffect(() => {
    if (reducedMotion) { setSettled(true); return; }
    const t = setTimeout(() => setSettled(true), 260);
    return () => clearTimeout(t);
  }, [reducedMotion]);

  return (
    <div className="edamame-landing">
      <style>{`
        .edamame-landing {
          --canvas: #0B0F0D;
          --surface: #141B18;
          --surface-2: #1B2420;
          --ink: #F4F7F3;
          --ink-soft: #8FA396;
          --accent: #2FD673;
          --accent-ink: #04150A;
          --accent-warm: #FFB648;
          --line: rgba(244,247,243,0.10);
          --font-display: 'Space Grotesk', 'Archivo', system-ui, sans-serif;
          --font-body: 'Manrope', 'Archivo', system-ui, sans-serif;
          background: var(--canvas);
          color: var(--ink);
          font-family: var(--font-body);
          overflow-x: clip;
        }
        .edamame-landing * { box-sizing: border-box; }
        .el-shell { max-width: 1180px; margin: 0 auto; padding: 0 24px; }

        .el-nav {
          position: sticky; top: 0; z-index: 40;
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 24px;
          background: rgba(11,15,13,0.86);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .el-mark { display: flex; align-items: center; gap: 8px; font-family: var(--font-display); font-weight: 700; font-size: 15px; }
        .el-mark__box { width: 28px; height: 28px; border-radius: 9px; background: var(--accent); color: var(--accent-ink); display: flex; align-items: center; justify-content: center; font-weight: 800; }
        .el-navlinks { display: flex; align-items: center; gap: 10px; }
        .el-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 20px; border-radius: 999px;
          font-family: var(--font-display); font-weight: 600; font-size: 14px;
          text-decoration: none; border: 1px solid transparent; cursor: pointer;
          transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
        }
        .el-btn:active { transform: scale(0.97); }
        .el-btn--accent { background: var(--accent); color: var(--accent-ink); }
        .el-btn--accent:hover { background: #40e084; }
        .el-btn--ghost { color: var(--ink); border-color: var(--line); }
        .el-btn--ghost:hover { border-color: rgba(244,247,243,0.28); }

        .el-hero {
          position: relative;
          padding: 88px 24px 72px;
          overflow: hidden;
        }
        .el-hero::before {
          content: '';
          position: absolute; inset: -20% -10% auto -10%; height: 70%;
          background: radial-gradient(60% 60% at 30% 20%, rgba(47,214,115,0.16) 0%, transparent 70%),
                      radial-gradient(45% 45% at 85% 10%, rgba(255,182,72,0.10) 0%, transparent 70%);
          pointer-events: none;
        }
        .el-hero__grid { position: relative; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 48px; align-items: center; }
        @media (max-width: 900px) { .el-hero__grid { grid-template-columns: 1fr; } }

        .el-eyebrow {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: var(--font-display); font-weight: 600; font-size: 12px;
          letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent);
          padding: 6px 14px; border-radius: 999px; border: 1px solid rgba(47,214,115,0.35);
          background: rgba(47,214,115,0.08); margin-bottom: 20px;
        }
        .el-h1 {
          font-family: var(--font-display); font-weight: 700; letter-spacing: -0.02em;
          font-size: clamp(2.2rem, 4.6vw, 3.6rem); line-height: 1.05; margin: 0 0 20px;
        }
        .el-lede { font-size: 17px; line-height: 1.6; color: var(--ink-soft); max-width: 46ch; margin: 0 0 32px; }
        .el-cta-row { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 36px; }
        .el-badgerow { display: flex; flex-wrap: wrap; gap: 10px; }
        .el-badge {
          font-size: 12.5px; font-weight: 600; color: var(--ink-soft);
          border: 1px solid var(--line); border-radius: 999px; padding: 7px 14px;
        }

        .el-stack {
          position: relative; height: 300px; display: flex; align-items: center; justify-content: center;
        }
        .el-casecard {
          position: absolute; width: 190px; padding: 16px 18px;
          background: var(--surface); border: 1px solid var(--line); border-radius: 16px;
          box-shadow: 0 20px 40px -20px rgba(0,0,0,0.6);
          transition: transform 0.75s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .el-casecard__dot { width: 9px; height: 9px; border-radius: 999px; margin-bottom: 10px; }
        .el-casecard__dot--accent { background: var(--accent); }
        .el-casecard__dot--warm { background: var(--accent-warm); }
        .el-casecard__dot--ink { background: var(--ink-soft); }
        .el-casecard__label { font-family: var(--font-display); font-weight: 600; font-size: 14.5px; }
        .el-casecard__fold {
          position: absolute; top: 0; right: 0; width: 0; height: 0;
          border-style: solid; border-width: 0 16px 16px 0; border-color: transparent var(--canvas) transparent transparent;
        }

        .el-strip { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 18px 24px; }
        .el-strip__row { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }

        .el-section { padding: 84px 24px; }
        .el-section__head { max-width: 640px; margin: 0 auto 44px; text-align: center; }
        .el-h2 { font-family: var(--font-display); font-weight: 700; letter-spacing: -0.015em; font-size: clamp(1.7rem, 3vw, 2.3rem); margin: 0 0 14px; }
        .el-section__sub { color: var(--ink-soft); font-size: 15.5px; line-height: 1.6; }

        .el-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        @media (max-width: 860px) { .el-grid { grid-template-columns: 1fr; } }
        .el-card {
          position: relative; overflow: hidden;
          background: var(--surface); border: 1px solid var(--line); border-radius: 20px;
          padding: 26px; transition: transform 0.2s ease, border-color 0.2s ease;
        }
        .el-card:hover { transform: translateY(-3px); border-color: rgba(244,247,243,0.2); }
        .el-card--featured { grid-column: 1 / -1; padding: 34px; }
        .el-card__blob {
          position: absolute; width: 160px; height: 160px; border-radius: 50%;
          top: -50px; right: -50px; filter: blur(30px); opacity: 0.35;
          background: radial-gradient(circle at 30% 30%, var(--accent), transparent 70%);
        }
        .el-card--featured .el-card__blob { background: radial-gradient(circle at 30% 30%, var(--accent-warm), transparent 70%); }
        .el-card__icon {
          width: 42px; height: 42px; border-radius: 12px; margin-bottom: 16px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(47,214,115,0.12); color: var(--accent);
        }
        .el-card__icon svg { width: 22px; height: 22px; }
        .el-card h3 { font-family: var(--font-display); font-weight: 600; font-size: 17px; margin: 0 0 8px; }
        .el-card--featured h3 { font-size: 22px; }
        .el-card p { color: var(--ink-soft); font-size: 14.5px; line-height: 1.6; margin: 0; max-width: 52ch; }

        .el-showcase { background: var(--surface-2); border-radius: 28px; padding: 44px; }
        .el-verdicts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 30px; }
        @media (max-width: 780px) { .el-verdicts { grid-template-columns: 1fr; } }
        .el-vcard {
          background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 20px;
          opacity: 0; transform: translateY(18px);
          transition: opacity 0.55s ease, transform 0.55s ease;
          transition-delay: calc(var(--i) * 110ms);
        }
        .el-showcase.is-visible .el-vcard { opacity: 1; transform: translateY(0); }
        @media (prefers-reduced-motion: reduce) { .el-vcard { opacity: 1; transform: none; transition: none; } }
        .el-vcard__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .el-vcard__name { font-family: var(--font-display); font-weight: 600; font-size: 14.5px; }
        .el-vcard__code { font-size: 10.5px; font-weight: 700; color: var(--ink-soft); background: rgba(244,247,243,0.06); padding: 2px 7px; border-radius: 6px; }
        .el-vcard__status { font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; }
        .el-vcard--good .el-vcard__status { color: var(--accent); }
        .el-vcard--maybe .el-vcard__status { color: var(--accent-warm); }
        .el-vcard--bad .el-vcard__status { color: #FF7A7A; }
        .el-vcard__bar { height: 5px; border-radius: 999px; background: rgba(244,247,243,0.08); overflow: hidden; margin-bottom: 10px; }
        .el-vcard__fill { height: 100%; border-radius: 999px; }
        .el-vcard--good .el-vcard__fill { background: var(--accent); }
        .el-vcard--maybe .el-vcard__fill { background: var(--accent-warm); }
        .el-vcard--bad .el-vcard__fill { background: #FF7A7A; }
        .el-vcard p { color: var(--ink-soft); font-size: 13px; line-height: 1.5; margin: 0; }

        .el-faq { max-width: 720px; margin: 0 auto; }
        .el-faqitem { border-bottom: 1px solid var(--line); }
        .el-faqitem button {
          width: 100%; text-align: left; background: none; border: none; cursor: pointer;
          padding: 20px 4px; display: flex; align-items: center; justify-content: space-between; gap: 16px;
          font-family: var(--font-display); font-weight: 600; font-size: 16px; color: var(--ink);
        }
        .el-faqitem__plus { font-size: 22px; color: var(--accent); flex-shrink: 0; transition: transform 0.2s ease; line-height: 1; }
        .el-faqitem[data-open="true"] .el-faqitem__plus { transform: rotate(45deg); }
        .el-faqitem__body {
          overflow: hidden; max-height: 0; transition: max-height 0.28s ease;
        }
        .el-faqitem[data-open="true"] .el-faqitem__body { max-height: 220px; }
        .el-faqitem__body p { padding: 0 4px 20px; color: var(--ink-soft); font-size: 14.5px; line-height: 1.6; margin: 0; }

        .el-close {
          text-align: center; padding: 80px 24px 96px;
          background: radial-gradient(60% 80% at 50% 0%, rgba(47,214,115,0.14) 0%, transparent 70%);
        }
        .el-close .el-h2 { font-size: clamp(1.9rem, 4vw, 2.6rem); }
        .el-close p { color: var(--ink-soft); font-size: 15.5px; max-width: 46ch; margin: 0 auto 30px; }

        .el-footer { border-top: 1px solid var(--line); padding: 24px; text-align: center; color: var(--ink-soft); font-size: 12.5px; }
      `}</style>

      <nav className="el-nav">
        <span className="el-mark"><span className="el-mark__box">E</span>Edamame</span>
        <div className="el-navlinks">
          {user ? (
            <Link className="el-btn el-btn--accent" to="/dashboard">Go to Dashboard</Link>
          ) : (
            <>
              <Link className="el-btn el-btn--ghost" to="/login">Log in</Link>
              <Link className="el-btn el-btn--accent" to="/register">Get started</Link>
            </>
          )}
        </div>
      </nav>

      <header className="el-hero">
        <div className="el-shell el-hero__grid">
          <div>
            <span className="el-eyebrow">Case management for immigration work</span>
            <h1 className="el-h1">{headline}</h1>
            <p className="el-lede">{sub}</p>
            <div className="el-cta-row">
              <Link className="el-btn el-btn--accent" to={dashboardHref}>{dashboardLabel}</Link>
              {!user && <Link className="el-btn el-btn--ghost" to="/login">Log in</Link>}
            </div>
            <div className="el-badgerow">
              {BADGES.map((b) => <span key={b} className="el-badge">{b}</span>)}
            </div>
          </div>

          <div className="el-stack" aria-hidden="true">
            {CASE_CARDS.map((c, i) => {
              const mid = (CASE_CARDS.length - 1) / 2;
              const settledTransform = `translateY(${(i - mid) * 58}px) translateX(${(i - mid) * 10}px) rotate(0deg)`;
              return (
                <div
                  key={c.label}
                  className="el-casecard"
                  style={{
                    transform: settled ? settledTransform : c.chaos,
                    zIndex: i,
                  }}
                >
                  <div className="el-casecard__fold" />
                  <span className={`el-casecard__dot el-casecard__dot--${c.tone}`} />
                  <div className="el-casecard__label">{c.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <section className="el-section" id="features">
        <div className="el-shell">
          <div className="el-section__head">
            <h2 className="el-h2">Everything the case actually needs</h2>
            <p className="el-section__sub">One system instead of five disconnected ones.</p>
          </div>
          <div className="el-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className={`el-card ${f.featured ? 'el-card--featured' : ''}`}>
                <div className="el-card__blob" />
                <div className="el-card__icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="el-section" ref={showcase.ref}>
        <div className="el-shell">
          <div className={`el-showcase ${showcase.visible ? 'is-visible' : ''}`}>
            <div className="el-section__head" style={{ marginBottom: 0 }}>
              <h2 className="el-h2">Scroll past the guesswork.</h2>
              <p className="el-section__sub">Enter what the client has told you. The advisor reads it against real visa criteria and returns a verdict for each pathway, with the reasoning attached.</p>
            </div>
            <div className="el-verdicts">
              {VERDICTS.map((v, i) => (
                <div key={v.code} className={`el-vcard el-vcard--${v.tone}`} style={{ ['--i' as any]: i }}>
                  <div className="el-vcard__head">
                    <span className="el-vcard__name">{v.name}</span>
                    <span className="el-vcard__code">{v.code}</span>
                  </div>
                  <div className="el-vcard__status">{v.status}</div>
                  <div className="el-vcard__bar"><div className="el-vcard__fill" style={{ width: `${v.fill}%` }} /></div>
                  <p>{v.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="el-section">
        <div className="el-shell el-faq">
          <div className="el-section__head">
            <h2 className="el-h2">Questions worth asking</h2>
          </div>
          {FAQS.map((item, i) => {
            const open = openFaq === i;
            return (
              <div key={item.q} className="el-faqitem" data-open={open}>
                <button type="button" onClick={() => setOpenFaq(open ? null : i)} aria-expanded={open}>
                  {item.q}
                  <span className="el-faqitem__plus">+</span>
                </button>
                <div className="el-faqitem__body">
                  <p>{item.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="el-close">
        <h2 className="el-h2">Bring the next case in.</h2>
        <p>Set up your practice in minutes. No pricing tiers to weigh first, just the workspace.</p>
        <Link className="el-btn el-btn--accent" to={dashboardHref}>{dashboardLabel}</Link>
      </section>

      <footer className="el-footer">&copy; 2026 Edamame Legal Flow. All rights reserved.</footer>
    </div>
  );
}
