import React, { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

// Lightweight, no-AI personalization: swaps the hero headline/subhead based on
// a `?for=` query param (e.g. an ad campaign link), so different audiences see
// copy that speaks to them without any server round-trip.
type Audience = 'lawyer' | 'agency';

const AUDIENCE_COPY: Record<Audience, { headline: string; sub: string }> = {
  lawyer: {
    headline: 'Every case, every deadline, in one place your firm can trust.',
    sub: 'Edamame is built for AU and NZ immigration law firms: describe a case, and AI drafts the schedule, the eligibility read, and the paper trail behind it.',
  },
  agency: {
    headline: 'Every student, every deadline, in one place your agency can trust.',
    sub: 'Edamame is built for AU and NZ study-abroad agencies: describe a case, and AI drafts the schedule, the eligibility read, and the paper trail behind it.',
  },
};

const DEFAULT_COPY = {
  headline: 'Every case, every deadline, in one place your firm can trust.',
  sub: 'Edamame is built for AU and NZ immigration lawyers and study-abroad agencies: describe a case, and AI drafts the schedule, the eligibility read, and the paper trail behind it.',
};

function isAudience(value: string | null): value is Audience {
  return value === 'lawyer' || value === 'agency';
}

// Dynamically load a stylesheet/script and resolve once it's ready. Scoped to
// this component's lifecycle (see the effect below) rather than imported at
// module scope, because scrollcraft.css carries page-wide resets (body,
// h1-h6, :focus-visible, ::selection, :root tokens) that must apply only
// while this route is actually mounted, not bleed into the rest of the app's
// Tailwind-based routes.
function loadStylesheet(href: string): Promise<HTMLLinkElement> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLLinkElement>(`link[data-edamame-ascent][href="${href}"]`);
    if (existing) { resolve(existing); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.edamameAscent = 'true';
    link.onload = () => resolve(link);
    link.onerror = () => reject(new Error(`Failed to load stylesheet: ${href}`));
    document.head.appendChild(link);
  });
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).ScrollCraft) { resolve(); return; }
    const existing = document.querySelector<HTMLScriptElement>(`script[data-edamame-ascent][src="${src}"]`);
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const script = document.createElement('script');
    script.src = src;
    script.dataset.edamameAscent = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

export default function LandingPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const audienceParam = searchParams.get('for');
  const { headline, sub } = isAudience(audienceParam) ? AUDIENCE_COPY[audienceParam] : DEFAULT_COPY;
  const rootRef = useRef<HTMLDivElement>(null);
  const dashboardHref = user ? '/dashboard' : '/register';
  const dashboardLabel = user ? 'Go to Dashboard' : 'Get started';

  useEffect(() => {
    let cancelled = false;
    const cleanupFns: Array<() => void> = [];
    let injectedStylesheets: HTMLLinkElement[] = [];
    let rafId = 0;

    async function boot() {
      const [scrollcraftCss, ascentCss] = await Promise.all([
        loadStylesheet('/scrollcraft.css'),
        loadStylesheet('/edamame-ascent.css'),
      ]);
      injectedStylesheets = [scrollcraftCss, ascentCss];
      await loadScript('/scrollcraft.js');
      if (cancelled || !rootRef.current) return;

      const root = rootRef.current;
      const ScrollCraft = (window as any).ScrollCraft;
      if (!ScrollCraft) return;

      // Compute each leg's own copy window as a fraction of the whole track,
      // inset slightly off the crossfade edges, BEFORE mounting: the engine
      // reads data-sc-window once, at mount.
      const segs: HTMLElement[] = Array.prototype.slice.call(root.querySelectorAll<HTMLElement>('[data-sc-segment]'));
      const weights = segs.map((s) => parseFloat(s.getAttribute('data-sc-w') || '') || 1.3);
      const total = weights.reduce((a, b) => a + b, 0);
      const c0: number[] = [];
      let run = 0;
      weights.forEach((w) => { c0.push(run); run += w; });

      root.querySelectorAll<HTMLElement>('[data-sc-copy][data-leg]').forEach((el) => {
        const i = parseInt(el.getAttribute('data-leg') || '0', 10);
        const w = weights[i];
        const start = c0[i];
        const end = start + w;
        // Inset just enough to clear the crossfade, then hold: tight ramps so
        // the plateau (where the block reads at full opacity) covers most of
        // the leg, not a sliver a coarse scroll sample can miss entirely.
        const inset = w * 0.06;
        const from = (start + inset) / total;
        const to = (end - inset) / total;
        el.setAttribute('data-sc-window', `${from.toFixed(4)} ${to.toFixed(4)} 0.16 0.16`);
      });

      if (cancelled) return;
      ScrollCraft.mount(root);

      // ---- waypoint nav: a clickable map, per the Continuous World grammar --
      const buttons: HTMLButtonElement[] = Array.prototype.slice.call(root.querySelectorAll<HTMLButtonElement>('.waypoints [data-goto]'));
      buttons.forEach((btn, i) => {
        const handler = () => {
          const top = c0[i] * innerHeight + 2;
          scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        };
        btn.addEventListener('click', handler);
        cleanupFns.push(() => btn.removeEventListener('click', handler));
      });

      const world = root.querySelector<HTMLElement>('[data-sc-mode="worldflight"]');
      if (world) {
        const onWaypoint = (e: Event) => {
          const detail = (e as CustomEvent).detail;
          buttons.forEach((btn, i) => {
            const current = i === detail.index;
            btn.setAttribute('aria-current', String(current));
            // On a narrow phone the waypoint list scrolls internally (it's the
            // flexible child now, not the whole nav) — without this, the
            // highlighted button can scroll out of view with no visible sign
            // of which leg you're on.
            if (current) btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
          });
        };
        world.addEventListener('sc:waypoint', onWaypoint);
        cleanupFns.push(() => world.removeEventListener('sc:waypoint', onWaypoint));
      }

      // ---- the Verdict Scanner: bespoke to this page, driven off --sc-segp --
      const scanner = root.querySelector<HTMLElement>('.scanner');
      if (scanner && world) {
        const beam = scanner.querySelector<HTMLElement>('.scanner__beam');
        const cards: HTMLElement[] = Array.prototype.slice.call(scanner.querySelectorAll<HTMLElement>('.verdict-card'));
        const fills = cards.map((c) => c.querySelector<HTMLElement>('.verdict-card__fill'));
        const PEAK_INDEX = 3; // 0-based: Ground, Intake, Planning, Advisory

        const tick = () => {
          if (cancelled) return;
          rafId = requestAnimationFrame(tick);
          const cs = getComputedStyle(world);
          const seg = parseInt(cs.getPropertyValue('--sc-seg'), 10);
          if (seg !== PEAK_INDEX) return;
          const p = parseFloat(cs.getPropertyValue('--sc-segp')) || 0;

          if (beam) beam.style.transform = `translateX(${(p * 420 - 30).toFixed(1)}%)`;

          cards.forEach((card, i) => {
            const threshold = (i + 1) / (cards.length + 1);
            const resolved = p >= threshold;
            if (resolved !== card.classList.contains('is-resolved')) {
              card.classList.toggle('is-resolved', resolved);
              const fill = fills[i];
              if (fill) {
                const target = resolved ? (parseFloat(fill.style.getPropertyValue('--fill')) || 0) / 100 : 0;
                fill.style.transform = `scaleX(${target})`;
              }
            }
          });
        };
        rafId = requestAnimationFrame(tick);
        cleanupFns.push(() => cancelAnimationFrame(rafId));
      }
    }

    boot().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[LandingPage] worldflight failed to mount', err);
    });

    return () => {
      cancelled = true;
      cleanupFns.forEach((fn) => fn());
      // Remove the page-wide stylesheets so navigating to any other route
      // (including /login, /register) is never themed by this page's global
      // resets. The engine script and its `window.ScrollCraft` global are left
      // in place — re-injecting/re-executing it is a no-op cost next visit,
      // and it holds no reference to this component's DOM once it is gone.
      injectedStylesheets.forEach((link) => link.parentNode?.removeChild(link));
    };
  }, []);

  return (
    <div ref={rootRef} className="edamame-ascent">
      <span data-sc-progress />
      <div className="sc-grain" aria-hidden="true" />

      <header className="worldnav">
        <span className="mark"><span className="mark__box">E</span><span className="mark__word">Edamame</span></span>
        <ul className="waypoints" role="list" aria-label="Page sections">
          <li><button type="button" data-goto="0">Ground</button></li>
          <li><button type="button" data-goto="1">Intake</button></li>
          <li><button type="button" data-goto="2">Planning</button></li>
          <li><button type="button" data-goto="3">Advisory</button></li>
          <li><button type="button" data-goto="4">Archive</button></li>
          <li><button type="button" data-goto="5">Vault</button></li>
          <li><button type="button" data-goto="6">Summit</button></li>
        </ul>
        <Link className="navlogin" to={user ? '/dashboard' : '/login'}>{user ? 'Dashboard' : 'Log in'}</Link>
      </header>

      <main id="top" data-sc-mode="worldflight" data-sc-seam="0.14">
        <div data-sc-world>
          <div data-sc-segment data-sc-w="1.6" data-sc-linger="0.3" data-sc-waypoint="Ground">
            <img className="sc-world__poster" src="/landing/p-01-arrival.webp" alt="" decoding="async" />
          </div>
          <div data-sc-segment data-sc-w="1.8" data-sc-linger="0.3" data-sc-waypoint="Intake">
            <img className="sc-world__poster" src="/landing/p-02-intake.webp" alt="" decoding="async" />
          </div>
          <div data-sc-segment data-sc-w="1.9" data-sc-linger="0.35" data-sc-waypoint="Planning">
            <img className="sc-world__poster" src="/landing/p-03-turn.webp" alt="" decoding="async" />
          </div>
          <div data-sc-segment data-sc-w="3.2" data-sc-linger="0.45" data-sc-waypoint="Advisory">
            <img className="sc-world__poster" src="/landing/p-04-peak.webp" alt="" decoding="async" />
          </div>
          <div data-sc-segment data-sc-w="2.4" data-sc-linger="0.35" data-sc-waypoint="Archive">
            <img className="sc-world__poster" src="/landing/p-05-range.webp" alt="" decoding="async" />
          </div>
          <div data-sc-segment data-sc-w="1.6" data-sc-linger="0.3" data-sc-waypoint="Vault">
            <img className="sc-world__poster" src="/landing/p-06-trust.webp" alt="" decoding="async" />
          </div>
          <div data-sc-segment data-sc-w="1.8" data-sc-linger="0.3" data-sc-waypoint="Summit">
            <img className="sc-world__poster" src="/landing/p-07-commitment.webp" alt="" decoding="async" />
          </div>
        </div>

        <div data-sc-world-copy>
          <div className="worldscrim" aria-hidden="true" />

          {/* 0 · ARRIVAL (hero) */}
          <div className="sc-copy sc-copy--lead" data-sc-copy data-sc-window="hero">
            <span className="eyebrow">Case management for immigration practices</span>
            <h1 className="sc-display sc-display--xl" data-sc-kinetic="lines">{headline}</h1>
            <p className="sc-body lede">{sub}</p>
            <div className="cta-row">
              <Link className="btn btn--accent" to={dashboardHref}>{dashboardLabel}</Link>
              {!user && <Link className="btn btn--ghost" to="/login">Log in</Link>}
            </div>
          </div>

          {/* 1 · INTAKE */}
          <div className="sc-copy sc-copy--trail" data-sc-copy data-leg="1">
            <h2 className="sc-display sc-display--lg" data-sc-kinetic="lines">The paperwork was never the hard part. Keeping track of it was.</h2>
            <p className="sc-body sub">Fragmented spreadsheets, sticky notes and manual reminders mean deadlines get missed, not because the work is hard, but because nothing is watching it.</p>
          </div>

          {/* 2 · PLANNING (Turn / Task Planner) */}
          <div className="sc-copy sc-copy--lead" data-sc-copy data-leg="2">
            <span className="eyebrow">AI Task Planner</span>
            <h2 className="sc-display sc-display--lg" data-sc-kinetic="lines">Describe the case. Get the schedule.</h2>
            <p className="sc-body sub">Every workflow is matched to the visa subclass, so a Student 500 case and a Partner 820/801 case never share a template they shouldn't. Dates, priorities and dependencies, generated the moment the case is opened.</p>
            <div className="taskboard">
              <div className="taskrow"><span className="taskrow__dot taskrow__dot--a" /><span className="taskrow__title">Collect employment references</span><span className="taskrow__when">Skilled 190</span></div>
              <div className="taskrow"><span className="taskrow__dot taskrow__dot--b" /><span className="taskrow__title">Lodge Form 47SP</span><span className="taskrow__when">Partner 820</span></div>
              <div className="taskrow"><span className="taskrow__dot taskrow__dot--c" /><span className="taskrow__title">Submit medical examination</span><span className="taskrow__when">Student 500</span></div>
            </div>
          </div>

          {/* 3 · ADVISORY (Peak: Verdict Scanner) */}
          <div className="sc-copy sc-copy--lead sc-copy--wide" data-sc-copy data-leg="3">
            <span className="eyebrow">AI Visa Advisor</span>
            <h2 className="sc-display sc-display--lg" data-sc-kinetic="lines">Scroll, and watch it answer.</h2>
            <p className="sc-body sub">Enter what the client has told you. The advisor reads it against real visa criteria and returns a verdict for each pathway, with the reasoning attached, not just a score.</p>
            <div className="scanner">
              <div className="scanner__track" aria-hidden="true"><div className="scanner__beam" /></div>
              <div className="verdicts">
                <article className="verdict-card verdict-card--strong">
                  <div className="verdict-card__head"><span className="verdict-card__name">Student Visa</span><span className="verdict-card__code">SC-500</span></div>
                  <div className="verdict-card__status">Strong match</div>
                  <div className="verdict-card__bar"><div className="verdict-card__fill" style={{ ['--fill' as any]: '88%' }} /></div>
                  <p className="verdict-card__reason">Confirmed enrolment in a CRICOS-registered course.</p>
                </article>
                <article className="verdict-card verdict-card--maybe">
                  <div className="verdict-card__head"><span className="verdict-card__name">Skilled Independent</span><span className="verdict-card__code">SC-190</span></div>
                  <div className="verdict-card__status">Possible</div>
                  <div className="verdict-card__bar"><div className="verdict-card__fill" style={{ ['--fill' as any]: '60%' }} /></div>
                  <p className="verdict-card__reason">Occupation is on the relevant skilled list; points test not yet confirmed.</p>
                </article>
                <article className="verdict-card verdict-card--unlikely">
                  <div className="verdict-card__head"><span className="verdict-card__name">Partner Visa</span><span className="verdict-card__code">SC-820/801</span></div>
                  <div className="verdict-card__status">Unlikely</div>
                  <div className="verdict-card__bar"><div className="verdict-card__fill" style={{ ['--fill' as any]: '25%' }} /></div>
                  <p className="verdict-card__reason">Relationship does not yet meet the minimum duration.</p>
                </article>
              </div>
            </div>
          </div>

          {/* 4 · ARCHIVE (Range: storage / team / attachments) */}
          <div className="sc-copy sc-copy--lead sc-copy--wide" data-sc-copy data-leg="4">
            <span className="eyebrow">Storage, team and documents</span>
            <h2 className="sc-display sc-display--lg" data-sc-kinetic="lines">Keep it on your own drive, or keep it in the cloud. Either way, it's yours.</h2>
            <div className="rangegrid">
              <div className="rangecard">
                <svg className="rangecard__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>
                <h3>Local storage</h3>
                <p>A real folder on disk, synced through Dropbox or OneDrive. Nothing leaves your machine unless you choose to.</p>
              </div>
              <div className="rangecard">
                <svg className="rangecard__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9a4.5 4.5 0 0 1 .5 9H7Z" /></svg>
                <h3>Cloud storage</h3>
                <p>Any device, one account. Your firm's data only, isolated from every other account by row-level access rules.</p>
              </div>
              <div className="rangecard">
                <svg className="rangecard__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M16 11a4 4 0 1 0-8 0M2 20c0-3 3-5 6-5s6 2 6 5M13 15c2.5.3 5 1.8 5 5M13 6a3 3 0 1 1 4 2.8" /></svg>
                <h3>One team, one file</h3>
                <p>Shared cases and an activity feed. No more emailing a PDF back and forth.</p>
              </div>
              <div className="rangecard">
                <svg className="rangecard__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M8 12.5V6a3 3 0 0 1 6 0v9a4.5 4.5 0 0 1-9 0V7" /></svg>
                <h3>Attachments</h3>
                <p>Upload once. Every file lands on the right checklist item, matched to its document type automatically.</p>
              </div>
            </div>
          </div>

          {/* 5 · VAULT (Trust, quiet) */}
          <div className="sc-copy sc-copy--trail" data-sc-copy data-leg="5">
            <h2 className="sc-display sc-display--lg">Built for how AU and NZ practice actually works.</h2>
            <p className="sc-body sub">Workflow templates, terminology and document checklists that match each jurisdiction, not a generic template stretched across both.</p>
            <div className="badgerow">
              <span className="badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20 6 9 17l-5-5" /></svg>Australia</span>
              <span className="badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20 6 9 17l-5-5" /></svg>New Zealand</span>
            </div>
          </div>

          {/* 6 · SUMMIT (finale) */}
          <div className="sc-copy sc-copy--finale" data-sc-copy data-sc-window="finale">
            <h2 className="sc-display sc-display--lg" data-sc-kinetic="lines">Bring the next case in.</h2>
            <p className="sc-body sub">Set up your practice in minutes. No pricing tiers to weigh first, just the workspace.</p>
            <div className="cta-row" style={{ justifyContent: 'center' }}>
              <Link className="btn btn--accent" to={dashboardHref}>{dashboardLabel}</Link>
            </div>
          </div>
        </div>

        <div data-sc-spacer aria-hidden="true" />
      </main>
    </div>
  );
}
