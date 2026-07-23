import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Briefcase, FileText, ScanLine, Users, Globe, Check, ArrowRight } from 'lucide-react';

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

const tiers = [
  {
    name: 'Essentials',
    price: 65,
    who: 'For sole practitioners',
    feats: ['Case management', '5 workflow templates', 'Local storage', 'Email support'],
    rec: false,
  },
  {
    name: 'Professional',
    price: 95,
    who: 'For growing firms',
    feats: ['Everything in Essentials', 'Unlimited templates', 'AI task generation', 'Client portal', 'Cloud storage'],
    rec: true,
  },
  {
    name: 'Enterprise',
    price: 135,
    who: 'For large firms',
    feats: ['Everything in Professional', 'Multi-jurisdiction', 'API access', 'Priority support', 'Custom integrations'],
    rec: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Navbar */}
      <nav className="sticky top-0 z-30 flex items-center justify-between px-6 md:px-10 py-3.5 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-edamame-500 flex items-center justify-center text-white font-black text-[13px]">
            E
          </div>
          <span className="font-black text-sm tracking-tight">EDAMAME</span>
        </div>
        <Link
          to="/onboarding"
          className="btn-press px-4 py-2 rounded-[9px] bg-edamame-500 hover:bg-edamame-600 text-white text-[12.5px] font-bold transition-colors"
        >
          Get Started
        </Link>
      </nav>

      {/* Hero */}
      <div className="max-w-[1040px] mx-auto px-6 md:px-8 pt-20 md:pt-[90px] pb-20 md:pb-[100px] text-center">
        <h1 className="text-4xl md:text-[52px] font-extrabold tracking-[-0.04em] leading-[1.06] text-balance text-gray-900">
          AI-Powered Case Management for Immigration Professionals
        </h1>
        <p className="text-base text-gray-500 leading-relaxed max-w-[560px] mx-auto mt-5">
          Replace fragmented tools with intelligent automation. Describe a case, select a workflow, and let AI generate your task schedule.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
          <Link
            to="/onboarding"
            className="btn-press px-6 py-3 rounded-[11px] bg-edamame-500 hover:bg-edamame-600 text-white text-sm font-bold transition-colors inline-flex items-center gap-2"
          >
            Get Started <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#features"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="btn-press px-6 py-3 rounded-[11px] border border-gray-200 text-gray-600 hover:border-edamame-500 hover:text-edamame-600 text-sm font-semibold transition-colors"
          >
            Learn More
          </a>
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

      {/* Pricing */}
      <section className="py-16 md:py-[70px] px-6 md:px-8">
        <div className="max-w-[940px] mx-auto">
          <h2 className="text-2xl md:text-[30px] font-extrabold tracking-[-0.03em] text-center text-gray-900">Simple, Transparent Pricing</h2>
          <p className="text-[13.5px] text-gray-500 text-center mt-2">No hidden fees. Cancel anytime.</p>
          <div className="grid md:grid-cols-3 gap-4 mt-10 items-stretch">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`card-lift relative bg-white rounded-2xl shadow-sm p-[26px] flex flex-col ${
                  tier.rec ? 'border-2 border-edamame-500' : 'border border-gray-200'
                }`}
              >
                {tier.rec && (
                  <span className="absolute -top-[11px] left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-[0.05em] px-3 py-1 rounded-full bg-edamame-500 text-white">
                    Recommended
                  </span>
                )}
                <div className="text-base font-bold tracking-[-0.02em] text-gray-900">{tier.name}</div>
                <div className="text-[11.5px] text-gray-400 mt-1">{tier.who}</div>
                <div className="flex items-baseline gap-1 mt-4">
                  <span className="text-[32px] font-extrabold tracking-[-0.03em] text-gray-900">${tier.price}</span>
                  <span className="text-xs text-gray-400">/user/mo</span>
                </div>
                <div className="flex flex-col gap-2 mt-[18px] flex-1">
                  {tier.feats.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-[12.5px] text-gray-500">
                      <Check className="w-[15px] h-[15px] text-edamame-500 flex-shrink-0" strokeWidth={1.8} />
                      {f}
                    </div>
                  ))}
                </div>
                <Link
                  to="/onboarding"
                  className={`btn-press mt-[22px] text-center rounded-[10px] py-2.5 text-[13px] font-bold transition-colors ${
                    tier.rec
                      ? 'bg-edamame-500 hover:bg-edamame-600 text-white'
                      : 'border border-edamame-500 text-edamame-600 hover:bg-edamame-50'
                  }`}
                >
                  Get Started
                </Link>
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
          to="/onboarding"
          className="btn-press mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-[11px] bg-white hover:bg-edamame-50 text-edamame-600 text-sm font-bold transition-colors"
        >
          Get Started Free <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="py-6 px-6 text-center text-[11.5px] text-gray-400">
        &copy; 2026 Edamame Legal Flow. All rights reserved.
      </footer>
    </div>
  );
}
