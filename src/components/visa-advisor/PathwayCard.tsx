import React from 'react';
import type { EligibilityAssessmentOption } from '../../types';
import { verdictColors, verdictLabels, verdictBarWidth } from './verdictStyles';

interface PathwayCardProps {
  visa: EligibilityAssessmentOption;
  /** Extra content rendered under the reasons/gaps, e.g. an "Open Case" button. Omitted in read-only views. */
  action?: React.ReactNode;
}

/**
 * One assessed pathway card — subclass badge, verdict badge, match-strength
 * bar, reasons, and gaps. Shared by the live report in `pages/VisaAdvisor.tsx`
 * and the read-only stored-assessment view opened from a case
 * (`pages/CaseDetails.tsx`'s "View eligibility assessment").
 */
export const PathwayCard: React.FC<PathwayCardProps> = ({ visa, action }) => {
  const colors = verdictColors[visa.verdict] ?? verdictColors.needs_more_info;

  return (
    <div className={`card-lift rounded-xl border p-5 transition-all ${colors.cardBg} ${colors.cardBorder}`}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className={`text-[14.5px] font-bold tracking-tight ${colors.titleText}`}>{visa.visaName}</span>
        <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-md bg-paper-2 dark:bg-plate-card/60 text-ink-soft dark:text-plate-ink-soft uppercase tracking-wide">
          SC-{visa.visaSubclass}
        </span>
        <span className={`ml-auto text-[10.5px] font-bold px-2.5 py-1 rounded-md whitespace-nowrap ${colors.badgeBg} ${colors.badgeText}`}>
          {verdictLabels[visa.verdict] ?? visa.verdict}
        </span>
      </div>

      {/* Match strength bar — no numeric score comes back from the API,
          so this reflects the verdict tier rather than an exact percentage. */}
      {visa.verdict !== 'needs_more_info' && (
        <div className="flex items-center gap-2.5 mt-3">
          <div className="flex-1 h-1.5 rounded-full bg-paper-2 dark:bg-plate-card/60 overflow-hidden">
            <div className={`progress-fill h-full rounded-full ${colors.bar}`} style={{ width: verdictBarWidth[visa.verdict] }} />
          </div>
        </div>
      )}

      <div className="space-y-3 mt-3.5">
        {visa.reasons.length > 0 && (
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-soft dark:text-plate-ink-soft mb-1.5">Why</p>
            <ul className="space-y-1">
              {visa.reasons.map((reason, i) => (
                <li key={i} className="text-[12.5px] text-ink-soft dark:text-plate-ink-soft flex items-start gap-2 leading-relaxed">
                  <span className="text-edamame-500 flex-shrink-0">·</span>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {visa.gaps.length > 0 && (
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-soft dark:text-plate-ink-soft mb-1.5">Gaps to Address</p>
            <ul className="space-y-1">
              {visa.gaps.map((gap, i) => (
                <li key={i} className="text-[12.5px] text-ink-soft dark:text-plate-ink-soft flex items-start gap-2 leading-relaxed">
                  <span className="text-amber-500 flex-shrink-0">!</span>
                  {gap}
                </li>
              ))}
            </ul>
          </div>
        )}

        {action && <div className="pt-3 border-t border-ink/15 dark:border-plate-ink/20">{action}</div>}
      </div>
    </div>
  );
};
