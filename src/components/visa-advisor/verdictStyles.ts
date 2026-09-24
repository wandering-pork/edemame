import type React from 'react';
import { CheckCircle, AlertCircle, XCircle, HelpCircle } from 'lucide-react';

// Verdict language per design spec: Strong match (green) / Possible (amber) / Unlikely (red),
// plus a neutral treatment for "needs more info" which has no equivalent in the prototype.
// Shared between the live report in `pages/VisaAdvisor.tsx` and the read-only
// stored-assessment view on a case (`components/visa-advisor/PathwayCard.tsx`).
export const verdictColors: Record<
  string,
  { cardBg: string; cardBorder: string; badgeBg: string; badgeText: string; titleText: string; bar: string; iconText: string }
> = {
  qualifies: {
    cardBg: 'bg-emerald-50/70 dark:bg-emerald-500/[0.06]',
    cardBorder: 'border-emerald-200 dark:border-emerald-800/60',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-500/15',
    badgeText: 'text-[#047857] dark:text-emerald-400',
    titleText: 'text-ink dark:text-plate-ink',
    bar: 'bg-[#10B981]',
    iconText: 'text-emerald-600 dark:text-emerald-400',
  },
  possibly_qualifies: {
    cardBg: 'bg-amber-50/70 dark:bg-amber-500/[0.06]',
    cardBorder: 'border-amber-200 dark:border-amber-800/60',
    badgeBg: 'bg-amber-100 dark:bg-amber-500/15',
    badgeText: 'text-[#B45309] dark:text-amber-400',
    titleText: 'text-ink dark:text-plate-ink',
    bar: 'bg-[#F59E0B]',
    iconText: 'text-amber-600 dark:text-amber-400',
  },
  unlikely: {
    cardBg: 'bg-red-50/70 dark:bg-red-500/[0.06]',
    cardBorder: 'border-red-200 dark:border-red-800/60',
    badgeBg: 'bg-red-100 dark:bg-red-500/15',
    badgeText: 'text-[#B91C1C] dark:text-red-400',
    titleText: 'text-ink dark:text-plate-ink',
    bar: 'bg-[#EF4444]',
    iconText: 'text-red-600 dark:text-red-400',
  },
  needs_more_info: {
    cardBg: 'bg-paper-2 dark:bg-plate-card/40',
    cardBorder: 'border-ink/15 dark:border-plate-ink/20',
    badgeBg: 'bg-paper-2 dark:bg-plate-card/60',
    badgeText: 'text-ink-soft dark:text-plate-ink-soft',
    titleText: 'text-ink dark:text-plate-ink',
    bar: 'bg-slate-400',
    iconText: 'text-ink-soft dark:text-plate-ink-soft',
  },
};

export const verdictLabels: Record<string, string> = {
  qualifies: 'Strong match',
  possibly_qualifies: 'Possible',
  unlikely: 'Unlikely',
  needs_more_info: 'Needs more info',
};

// Only used to render a match-strength bar when we can infer one from the verdict
// (the API doesn't return a numeric score, so this is a coarse visual proxy, not a real %).
export const verdictBarWidth: Record<string, string> = {
  qualifies: '88%',
  possibly_qualifies: '60%',
  unlikely: '25%',
  needs_more_info: '0%',
};

// Ordering used to pick the "best" pathway and sort the report — mirrors the
// confidence implied by verdictBarWidth above, not a real numeric score.
export const verdictRank: Record<string, number> = {
  qualifies: 3,
  possibly_qualifies: 2,
  unlikely: 1,
  needs_more_info: 0,
};

export const verdictIcon: Record<string, React.ElementType> = {
  qualifies: CheckCircle,
  possibly_qualifies: AlertCircle,
  unlikely: XCircle,
  needs_more_info: HelpCircle,
};
