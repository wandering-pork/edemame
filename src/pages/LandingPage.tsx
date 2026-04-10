import React from 'react';
import { Link } from 'react-router-dom';
import { LogoBrand } from '@/components/LogoBrand';
import { Sparkles, Briefcase, FileText, ScanLine, Users, Globe, Check, ArrowRight } from 'lucide-react';

const features = [
  { icon: Sparkles, title: 'AI Task Generation', desc: 'Gemini AI generates structured task schedules from case descriptions and workflow templates.' },
  { icon: Briefcase, title: 'Case Management', desc: 'Track cases from intake to completion with full visibility across your practice.' },
  { icon: FileText, title: 'Workflow Templates', desc: 'Pre-built templates for Student 500, Skilled 190, Partner 820/801, and more.' },
  { icon: ScanLine, title: 'Document Processing', desc: 'OCR-powered passport scanning and intelligent document management.' },
  { icon: Users, title: 'Client Portal', desc: 'Self-service portal for clients to check status and upload documents.' },
  { icon: Globe, title: 'Multi-Jurisdiction', desc: 'Support for Australian and New Zealand immigration workflows.' },
];

const steps = [
  { num: 1, title: 'Describe Your Case', desc: 'Enter case details and select the client.' },
  { num: 2, title: 'Choose a Template', desc: 'Pick from pre-built visa workflow templates.' },
  { num: 3, title: 'AI Generates Tasks', desc: 'Gemini creates a structured task schedule with dates and priorities.' },
];

const tiers = [
  {
    name: 'Essentials',
    price: 65,
    desc: 'For sole practitioners',
    features: ['Case management', '5 workflow templates', 'Local storage', 'Email support'],
    highlighted: false,
  },
  {
    name: 'Professional',
    price: 95,
    desc: 'For growing firms',
    features: ['Everything in Essentials', 'Unlimited templates', 'AI task generation', 'Client portal', 'Cloud storage'],
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 135,
    desc: 'For large firms',
    features: ['Everything in Professional', 'Multi-jurisdiction', 'API access', 'Priority support', 'Custom integrations'],
    highlighted: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-gray-900 dark:text-gray-100">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/90 dark:bg-slate-950/90 backdrop-blur border-b border-gray-100 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="w-[120px]">
            <LogoBrand />
          </div>
          <Link
            to="/onboarding"
            className="bg-edamame-500 hover:bg-edamame-600 text-white rounded-lg px-5 py-2 font-semibold text-sm transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="font-fredoka text-4xl md:text-5xl lg:text-6xl font-semibold text-gray-900 dark:text-white mb-6 leading-tight">
            AI-Powered Case Management for Immigration Professionals
          </h1>
          <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto">
            Replace fragmented tools with intelligent automation. Describe a case, select a workflow, and let AI generate your task schedule.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/onboarding"
              className="bg-edamame-500 hover:bg-edamame-600 text-white rounded-lg px-8 py-3 font-semibold text-lg transition-colors inline-flex items-center gap-2"
            >
              Get Started <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="border border-edamame-500 text-edamame-600 dark:text-edamame-400 hover:bg-edamame-50 dark:hover:bg-edamame-500/10 rounded-lg px-8 py-3 font-semibold text-lg transition-colors"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* Problem Statement */}
      <section className="py-20 px-4 bg-gray-50 dark:bg-slate-900">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-fredoka text-3xl md:text-4xl font-semibold text-center mb-12">The Problem</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: 'Fragmented Tools', desc: 'Immigration practitioners juggle multiple disconnected systems with no single source of truth.' },
              { title: 'Manual Task Planning', desc: 'Hours spent creating task schedules for each case manually, prone to errors and missed deadlines.' },
              { title: 'No Client Self-Service', desc: "Clients can't check their case status or upload documents themselves, creating constant back-and-forth." },
            ].map((item) => (
              <div key={item.title} className="bg-white dark:bg-slate-800 rounded-xl p-8 shadow-sm border border-gray-100 dark:border-slate-700">
                <h3 className="font-fredoka text-xl font-semibold mb-3 text-gray-900 dark:text-white">{item.title}</h3>
                <p className="text-gray-600 dark:text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-fredoka text-3xl md:text-4xl font-semibold text-center mb-4">Everything You Need</h2>
          <p className="text-gray-600 dark:text-gray-400 text-center mb-12 max-w-2xl mx-auto">
            A complete platform built specifically for immigration professionals.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f) => (
              <div key={f.title} className="bg-white dark:bg-slate-800 rounded-xl p-8 shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-edamame-50 dark:bg-edamame-500/10 flex items-center justify-center mb-5">
                  <f.icon className="w-6 h-6 text-edamame-500" />
                </div>
                <h3 className="font-fredoka text-xl font-semibold mb-3 text-gray-900 dark:text-white">{f.title}</h3>
                <p className="text-gray-600 dark:text-gray-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-gray-50 dark:bg-slate-900">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-fredoka text-3xl md:text-4xl font-semibold text-center mb-16">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line (desktop only) */}
            <div className="hidden md:block absolute top-10 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-0.5 bg-edamame-200 dark:bg-edamame-700" />
            {steps.map((s) => (
              <div key={s.num} className="text-center relative">
                <div className="w-20 h-20 rounded-full bg-edamame-500 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-6 relative z-10">
                  {s.num}
                </div>
                <h3 className="font-fredoka text-xl font-semibold mb-3 text-gray-900 dark:text-white">{s.title}</h3>
                <p className="text-gray-600 dark:text-gray-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-fredoka text-3xl md:text-4xl font-semibold text-center mb-4">Simple, Transparent Pricing</h2>
          <p className="text-gray-600 dark:text-gray-400 text-center mb-12">No hidden fees. Cancel anytime.</p>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-xl p-8 border ${
                  tier.highlighted
                    ? 'border-edamame-500 shadow-lg shadow-edamame-500/10 ring-2 ring-edamame-500 bg-white dark:bg-slate-800'
                    : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm'
                } relative`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-edamame-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Recommended
                  </div>
                )}
                <h3 className="font-fredoka text-2xl font-semibold text-gray-900 dark:text-white">{tier.name}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 mb-6">{tier.desc}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white">${tier.price}</span>
                  <span className="text-gray-500 dark:text-gray-400">/user/mo</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <Check className="w-4 h-4 text-edamame-500 mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/onboarding"
                  className={`block text-center rounded-lg px-6 py-3 font-semibold transition-colors ${
                    tier.highlighted
                      ? 'bg-edamame-500 hover:bg-edamame-600 text-white'
                      : 'border border-edamame-500 text-edamame-600 dark:text-edamame-400 hover:bg-edamame-50 dark:hover:bg-edamame-500/10'
                  }`}
                >
                  Get Started
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="py-20 px-4 bg-edamame-500">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-fredoka text-3xl md:text-4xl font-semibold text-white mb-6">
            Ready to Transform Your Practice?
          </h2>
          <p className="text-edamame-100 text-lg mb-8">
            Join immigration professionals who are saving hours every week with AI-powered task management.
          </p>
          <Link
            to="/onboarding"
            className="bg-white text-edamame-600 hover:bg-gray-100 rounded-lg px-8 py-3 font-semibold text-lg transition-colors inline-flex items-center gap-2"
          >
            Get Started Free <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 bg-gray-50 dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800">
        <div className="max-w-7xl mx-auto text-center text-sm text-gray-500 dark:text-gray-400">
          &copy; 2026 Edamame Legal Flow. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
