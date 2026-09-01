import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Sparkles, Briefcase, FileText, ScanLine, Users, Globe, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// Lightweight, no-AI personalization: swaps the hero headline/subhead based on
// a `?for=` query param (e.g. an ad campaign link), so different audiences see
// copy that speaks to them without any server round-trip.
type Audience = 'lawyer' | 'agency';

const AUDIENCE_COPY: Record<Audience, { headline: string; sub: string }> = {
  lawyer: {
    headline: 'AI-Powered Case Management for Immigration Law Firms',
    sub: 'Replace fragmented tools with intelligent automation built for AU/NZ practices. Manage cases, generate task schedules, and keep every visa subclass on track.',
  },
  agency: {
    headline: 'AI-Powered Case Management for Study Abroad Agencies',
    sub: 'Give students a self-service portal while AI handles the task schedules behind the scenes — from application to visa approval.',
  },
};

const DEFAULT_COPY = {
  headline: 'AI-Powered Case Management for Immigration Professionals',
  sub: 'Replace fragmented tools with intelligent automation. Describe a case, select a workflow, and let AI generate your task schedule.',
};

function isAudience(value: string | null): value is Audience {
  return value === 'lawyer' || value === 'agency';
}

const problems = [
  { title: 'Fragmented Tools', text: 'Immigration practitioners juggle multiple disconnected systems with no single source of truth.' },
  { title: 'Manual Task Planning', text: 'Hours spent creating task schedules for each case manually, prone to errors and missed deadlines.' },
  { title: 'No Client Self-Service', text: "Clients can't check their case status or upload documents themselves, creating constant back-and-forth." },
];

const features = [
  { icon: Sparkles, title: 'AI Task Generation', text: 'AI generates structured task schedules from case descriptions and workflow templates.' },
  { icon: Briefcase, title: 'Case Management', text: 'Track cases from intake to completion with full visibility across your practice.' },
  { icon: FileText, title: 'Workflow Templates', text: 'Pre-built templates for Student 500, Skilled 190, Partner 820/801, and more.' },
  { icon: ScanLine, title: 'Document Processing', text: 'OCR-powered passport scanning and intelligent document management.' },
  { icon: Users, title: 'Client Portal', text: 'Self-service portal for clients to check status and upload documents.' },
  { icon: Globe, title: 'Multi-Jurisdiction', text: 'Support for Australian and New Zealand immigration workflows.' },
];

const hiw = [
  { n: 1, title: 'Describe Your Case', text: 'Enter case details and select the client.' },
  { n: 2, title: 'Choose a Template', text: 'Pick from pre-built visa workflow templates.' },
  { n: 3, title: 'AI Generates Tasks', text: 'AI creates a structured task schedule with dates and priorities.' },
];

// Illustrative recreations of the real Dashboard and Visa Advisor screens (not
// live screenshots — this app requires a real login, so there's nothing to
// screenshot from a marketing page). Sample data only: case numbers instead
// of client names, no fabricated stats.
const weekBoard: { day: string; date: string; today?: boolean; task: { kind: string; title: string; tone: 'blue' | 'green' | 'red' } | null }[] = [
  { day: 'MON', date: '1', task: { kind: 'Task', title: 'Collect employment references', tone: 'blue' } },
  { day: 'TUE', date: '2', task: { kind: 'Filing', title: 'Lodge Form 47SP', tone: 'green' } },
  { day: 'WED', date: '3', today: true, task: { kind: 'Deadline', title: 'Submit medical exam', tone: 'red' } },
  { day: 'THU', date: '4', task: null },
  { day: 'FRI', date: '5', task: { kind: 'Filing', title: 'Biometrics appointment', tone: 'green' } },
];

const taskCardTone: Record<'blue' | 'green' | 'red', string> = {
  blue: 'bg-blue-50 border-blue-500',
  green: 'bg-edamame-50 border-edamame-500',
  red: 'bg-red-50 border-red-500',
};

function DashboardPreview() {
  return (
    <div className="min-w-[860px] flex">
      <div className="w-16 bg-edamame-sidebar flex flex-col items-center py-4 gap-3 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-white font-black text-xs">E</div>
        <div className="w-6 h-6 rounded-md bg-white/25" />
        <div className="w-6 h-6 rounded-md bg-white/10" />
        <div className="w-6 h-6 rounded-md bg-white/10" />
        <div className="w-6 h-6 rounded-md bg-white/10" />
      </div>
      <div className="flex-1 p-6 bg-white">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.11em] text-gray-400">Tuesday, 1 September</div>
            <div className="text-[19px] font-extrabold tracking-[-0.03em] text-gray-900 mt-1">Good morning, Alex</div>
          </div>
          <div className="text-[11px] font-bold bg-edamame-500 text-white px-3 py-1.5 rounded-[8px]">+ New Task</div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 mt-4">
          {[
            { label: 'Cases in motion', value: '14', delta: '+3 this month', color: 'text-emerald-600' },
            { label: 'Due this week', value: '9', delta: '2 today', color: 'text-gray-400' },
            { label: 'Overdue', value: '2', delta: 'ARC-2291', color: 'text-red-600' },
            { label: 'Docs outstanding', value: '5', delta: 'Active checklists', color: 'text-amber-600' },
          ].map((s) => (
            <div key={s.label} className="border border-gray-100 rounded-lg px-3 py-2.5">
              <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-gray-400">{s.label}</div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-[17px] font-extrabold text-gray-900">{s.value}</span>
                <span className={`text-[9px] font-semibold truncate ${s.color}`}>{s.delta}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-2 mt-4">
          {weekBoard.map((d) => (
            <div
              key={d.day}
              className={`rounded-lg border p-2 min-h-[92px] ${d.today ? 'bg-edamame-50 border-edamame-200' : 'border-gray-100'}`}
            >
              <div className="text-[8px] font-bold text-gray-400">
                {d.day} <span className="text-gray-900">{d.date}</span>
              </div>
              {d.task && (
                <div className={`mt-1.5 rounded px-1.5 py-1 text-[8.5px] font-semibold text-gray-900 border-l-2 ${taskCardTone[d.task.tone]}`}>
                  {d.task.title}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Denser hero visual (sidebar sliver + stat header + task rows + trend chart +
// a floating "AI toast" badge) — the same illustrative recreation as
// DashboardPreview above, purpose-built at hero card size instead of the wide
// "See It In Action" screenshot width.
function HeroPreviewCard() {
  return (
    <div className="relative w-full max-w-[480px] mx-auto pt-7 sm:pt-8">
      {/* floating AI-toast badge — decorative, hidden on very small screens to avoid overflow/clutter */}
      <div className="hidden sm:flex absolute -top-1 left-2 z-10 w-[220px] items-center gap-2.5 rounded-[14px] bg-white p-3 shadow-[0_18px_34px_-10px_rgba(0,0,0,0.5)] ring-1 ring-edamame-500/20 rotate-3">
        <div className="w-[30px] h-[30px] rounded-[9px] bg-edamame-50 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-edamame-500" strokeWidth={2} />
        </div>
        <div>
          <div className="text-[11.5px] font-bold text-gray-900">Tasks generated</div>
          <div className="text-[10.5px] text-gray-400 mt-0.5">Partner Visa 820 · just now</div>
        </div>
      </div>

      <div className="rounded-[20px] bg-white shadow-[0_0_0_1px_rgba(41,183,103,0.25),0_30px_70px_-14px_rgba(0,0,0,0.55),0_0_60px_-10px_rgba(41,183,103,0.35)] -rotate-1 flex overflow-hidden">
        {/* sidebar sliver */}
        <div className="w-11 bg-gray-50 border-r border-gray-100 flex flex-col items-center gap-4 py-4 flex-shrink-0">
          <div className="w-5 h-5 rounded-[6px] bg-edamame-500" />
          <div className="w-4 h-4 rounded-[5px] bg-gray-200" />
          <div className="w-4 h-4 rounded-[5px] bg-gray-200" />
          <div className="w-4 h-4 rounded-[5px] bg-gray-200" />
        </div>

        <div className="flex-1 p-5">
          <div className="flex items-center justify-between mb-3.5">
            <div className="text-[13px] font-bold text-gray-900">Active Cases</div>
            <div className="text-[11px] font-bold text-amber-700 bg-amber-500/[.14] px-2.5 py-0.5 rounded-full">12 Open</div>
          </div>

          <div className="flex flex-col">
            {[
              { title: 'Partner Visa 820', sub: 'Due in 4 days', pct: '68%', dot: 'bg-edamame-500', pctColor: 'text-edamame-600' },
              { title: 'Student 500', sub: 'Awaiting documents', pct: '32%', dot: 'bg-amber-500', pctColor: 'text-amber-600' },
              { title: 'Skilled 190', sub: 'In review', pct: '54%', dot: 'bg-blue-500', pctColor: 'text-blue-600' },
            ].map((row, i) => (
              <div key={row.title} className={`flex items-center gap-3 py-2.5 ${i < 2 ? 'border-b border-gray-100' : ''}`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${row.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-gray-900 truncate">{row.title}</div>
                  <div className="text-[10.5px] text-gray-400 mt-0.5">{row.sub}</div>
                </div>
                <div className={`text-[11.5px] font-bold ${row.pctColor}`}>{row.pct}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3.5 border-t border-gray-100">
            <div className="text-[10.5px] font-semibold text-gray-400 mb-2">Tasks completed this week</div>
            <div className="flex items-end gap-1.5 h-[38px]">
              {[40, 65, 50, 85, 70, 100, 60].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-[3px]"
                  style={{ height: `${h}%`, background: i === 5 ? '#29B767' : i % 2 === 0 ? '#def9e6' : '#8ee4ae' }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const visaVerdicts = [
  {
    name: 'Student Visa',
    code: 'SC-500',
    label: 'Strong match',
    badge: 'bg-emerald-100 text-emerald-700',
    border: 'border-emerald-200',
    bg: 'bg-emerald-50/70',
    bar: 'bg-emerald-500',
    width: '88%',
    why: 'Confirmed enrolment in a CRICOS-registered course',
  },
  {
    name: 'Skilled Independent Visa',
    code: 'SC-190',
    label: 'Possible',
    badge: 'bg-amber-100 text-amber-700',
    border: 'border-amber-200',
    bg: 'bg-amber-50/70',
    bar: 'bg-amber-500',
    width: '60%',
    why: 'Occupation appears on the relevant skilled occupation list',
    gap: 'Points test result not yet confirmed',
  },
  {
    name: 'Partner Visa',
    code: 'SC-820/801',
    label: 'Unlikely',
    badge: 'bg-red-100 text-red-700',
    border: 'border-red-200',
    bg: 'bg-red-50/70',
    bar: 'bg-red-500',
    width: '25%',
    gap: 'Relationship does not yet meet minimum duration',
  },
];

function VisaAdvisorPreview() {
  return (
    <div className="min-w-[860px] p-7 bg-white">
      <div className="text-center mb-5">
        <div className="text-[17px] font-extrabold tracking-[-0.02em] text-gray-900">Your Visa Eligibility Results</div>
        <div className="text-[11.5px] text-gray-500 mt-1">Based on your information, here are the visa pathways you may qualify for</div>
      </div>
      <div className="bg-edamame-50 border border-edamame-100 rounded-xl p-4 mb-4">
        <div className="text-[12px] font-bold text-gray-900">Our Recommendation</div>
        <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
          The Student visa (500) is your strongest immediate pathway, with Skilled Independent (190) worth preparing for once your points assessment is complete.
        </p>
      </div>
      <div className="space-y-2.5">
        {visaVerdicts.map((v) => (
          <div key={v.code} className={`rounded-xl border p-4 ${v.bg} ${v.border}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12.5px] font-bold text-gray-900">{v.name}</span>
              <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase">{v.code}</span>
              <span className={`ml-auto text-[9.5px] font-bold px-2 py-0.5 rounded ${v.badge}`}>{v.label}</span>
            </div>
            <div className="h-1 rounded-full bg-gray-100 overflow-hidden mt-2">
              <div className={`h-full rounded-full ${v.bar}`} style={{ width: v.width }} />
            </div>
            {v.why && (
              <div className="text-[11px] text-gray-600 mt-2 flex gap-1.5">
                <span className="text-edamame-500">·</span>
                {v.why}
              </div>
            )}
            {v.gap && (
              <div className="text-[11px] text-gray-600 mt-1 flex gap-1.5">
                <span className="text-amber-500">!</span>
                {v.gap}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const audienceParam = searchParams.get('for');
  const { headline, sub } = isAudience(audienceParam) ? AUDIENCE_COPY[audienceParam] : DEFAULT_COPY;
  const [activePreview, setActivePreview] = useState<'dashboard' | 'advisor'>('dashboard');

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Navbar */}
      <nav className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 md:px-10 py-3.5 bg-[#0B0C0E]/90 backdrop-blur border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-edamame-500 flex items-center justify-center text-white font-black text-[13px]">
            E
          </div>
          <span className="font-black text-sm tracking-tight text-white">EDAMAME</span>
        </div>
        {user ? (
          <Link
            to="/dashboard"
            className="btn-press px-4 py-2 rounded-[9px] bg-edamame-500 hover:bg-edamame-600 text-white text-[12.5px] font-bold transition-colors"
          >
            Go to Dashboard
          </Link>
        ) : (
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              to="/login"
              className="text-[12.5px] font-semibold text-white/65 hover:text-white transition-colors"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="btn-press px-4 py-2 rounded-[9px] bg-edamame-500 hover:bg-edamame-600 text-white text-[12.5px] font-bold transition-colors"
            >
              Sign Up
            </Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden bg-[linear-gradient(160deg,#0A0F0C_0%,#0F2118_55%,#0B0C0E_100%)]">
        {/* glow mesh */}
        <div className="pointer-events-none absolute -top-40 -right-32 w-[560px] h-[560px] sm:w-[760px] sm:h-[760px] rounded-full bg-[radial-gradient(circle,rgba(41,183,103,0.38)_0%,rgba(41,183,103,0)_62%)]" />
        <div className="pointer-events-none absolute -bottom-48 -left-36 w-[500px] h-[500px] sm:w-[680px] sm:h-[680px] rounded-full bg-[radial-gradient(circle,rgba(86,206,133,0.20)_0%,rgba(86,206,133,0)_60%)]" />
        {/* fine dot-grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '26px 26px' }}
        />

        <div className="relative grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-14 items-center max-w-[1180px] mx-auto px-6 md:px-10 pt-14 md:pt-24 pb-16 md:pb-24">
          {/* Left: copy */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <div className="inline-flex items-center gap-[7px] px-3 py-1.5 rounded-full bg-edamame-500/10 border border-edamame-500/30 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3ECB7A]" />
              <span className="text-[11px] font-bold tracking-[0.06em] text-[#6EDE9A] uppercase">AI Case Management</span>
            </div>

            <h1 className="text-4xl md:text-[46px] font-extrabold tracking-[-0.03em] leading-[1.08] text-balance text-white max-w-[560px]">
              {headline}
            </h1>
            <p className="text-base text-white/60 leading-relaxed max-w-[460px] mt-4">
              {sub}
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3 mt-8">
              <Link
                to={user ? '/dashboard' : '/register'}
                className="btn-press px-6 py-3 rounded-[11px] bg-edamame-500 hover:bg-edamame-600 text-white text-sm font-bold transition-colors inline-flex items-center gap-2 shadow-[0_0_0_1px_rgba(41,183,103,0.4),0_14px_34px_-8px_rgba(41,183,103,0.55)]"
              >
                {user ? 'Go to Dashboard' : 'Get Started'} <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#features"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="btn-press px-6 py-3 rounded-[11px] border border-white/20 text-white/80 hover:border-white/40 hover:text-white text-sm font-semibold transition-colors"
              >
                Learn More
              </a>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-5 gap-y-2 mt-8 pt-6 border-t border-white/10 w-full">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-[15px] h-[15px] text-[#6EDE9A]" strokeWidth={2} />
                <span className="text-xs font-semibold text-white/55">AI task generation</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Globe className="w-[15px] h-[15px] text-[#6EDE9A]" strokeWidth={2} />
                <span className="text-xs font-semibold text-white/55">AU + NZ jurisdictions</span>
              </div>
              <div className="flex items-center gap-1.5">
                <FileText className="w-[15px] h-[15px] text-[#6EDE9A]" strokeWidth={2} />
                <span className="text-xs font-semibold text-white/55">5 visa templates</span>
              </div>
            </div>
          </div>

          {/* Right: product visual */}
          <HeroPreviewCard />
        </div>
      </div>

      {/* The Problem */}
      <section className="bg-gray-50 border-y border-gray-100 py-16 md:py-[70px] px-6 md:px-8">
        <div className="max-w-[1040px] mx-auto">
          <h2 className="text-2xl md:text-[30px] font-extrabold tracking-[-0.03em] text-center text-gray-900">The Problem</h2>
          <div className="grid md:grid-cols-3 gap-4 mt-9">
            {problems.map((p) => (
              <div key={p.title} className="bg-white border border-gray-100 rounded-xl shadow-sm p-[22px]">
                <div className="text-[14.5px] font-bold tracking-[-0.015em] text-gray-900">{p.title}</div>
                <div className="text-[12.5px] text-gray-500 leading-relaxed mt-2">{p.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Everything You Need */}
      <section id="features" className="py-16 md:py-[70px] px-6 md:px-8">
        <div className="max-w-[1040px] mx-auto">
          <h2 className="text-2xl md:text-[30px] font-extrabold tracking-[-0.03em] text-center text-gray-900">Everything You Need</h2>
          <p className="text-[13.5px] text-gray-500 text-center mt-2">
            A complete platform built specifically for immigration professionals.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-9">
            {features.map((f) => (
              <div key={f.title} className="card-lift bg-white border border-gray-100 rounded-xl shadow-sm p-[22px]">
                <div className="w-[34px] h-[34px] rounded-[10px] bg-edamame-50 text-edamame-500 flex items-center justify-center">
                  <f.icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
                </div>
                <div className="text-[14.5px] font-bold tracking-[-0.015em] text-gray-900 mt-3.5">{f.title}</div>
                <div className="text-[12.5px] text-gray-500 leading-relaxed mt-1.5">{f.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* See It In Action */}
      <section className="py-16 md:py-[70px] px-6 md:px-8">
        <div className="max-w-[1100px] mx-auto">
          <h2 className="text-2xl md:text-[30px] font-extrabold tracking-[-0.03em] text-center text-gray-900">See It In Action</h2>
          <p className="text-[13.5px] text-gray-500 text-center mt-2">A quick look at the workspace your team will actually use.</p>

          <div className="flex items-center justify-center mt-7">
            <div className="flex gap-1 p-[3px] bg-gray-100 rounded-[10px]">
              <button
                onClick={() => setActivePreview('dashboard')}
                className={`px-4 py-1.5 rounded-[7px] text-xs font-semibold transition-colors ${
                  activePreview === 'dashboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setActivePreview('advisor')}
                className={`px-4 py-1.5 rounded-[7px] text-xs font-semibold transition-colors ${
                  activePreview === 'advisor' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Visa Advisor
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              {activePreview === 'dashboard' ? <DashboardPreview /> : <VisaAdvisorPreview />}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gray-50 border-y border-gray-100 py-16 md:py-[70px] px-6 md:px-8">
        <div className="max-w-[860px] mx-auto">
          <h2 className="text-2xl md:text-[30px] font-extrabold tracking-[-0.03em] text-center text-gray-900">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8 md:gap-0 mt-11">
            {hiw.map((s, i) => (
              <div key={s.n} className="text-center relative px-5">
                {i > 0 && (
                  <div className="hidden md:block absolute top-[23px] left-[calc(-50%+44px)] right-[calc(50%+44px)] h-0.5 bg-edamame-500/30" />
                )}
                <div className="w-[46px] h-[46px] rounded-full bg-edamame-500 text-white text-[17px] font-extrabold flex items-center justify-center mx-auto relative z-10">
                  {s.n}
                </div>
                <div className="text-[14.5px] font-bold tracking-[-0.015em] text-gray-900 mt-4">{s.title}</div>
                <div className="text-[12.5px] text-gray-500 leading-relaxed mt-1.5">{s.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Band */}
      <section className="bg-edamame-500 py-16 md:py-[70px] px-6 md:px-8 text-center">
        <h2 className="text-2xl md:text-[30px] font-extrabold tracking-[-0.03em] text-white">
          Ready to Transform Your Practice?
        </h2>
        <p className="text-sm text-white/85 leading-relaxed max-w-[520px] mx-auto mt-3.5">
          Join immigration professionals who are saving hours every week with AI-powered task management.
        </p>
        <Link
          to={user ? '/dashboard' : '/register'}
          className="btn-press mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-[11px] bg-white hover:bg-edamame-50 text-edamame-600 text-sm font-bold transition-colors"
        >
          {user ? 'Go to Dashboard' : 'Get Started'} <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="py-6 px-6 text-center text-[11.5px] text-gray-400">
        &copy; 2026 Edamame Legal Flow. All rights reserved.
      </footer>
    </div>
  );
}
