import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clearTrialScenario, peekTrialScenario } from '../lib/trialCarryOver';

/**
 * Offers to continue with the scenario a visitor tried in the homepage's Visa Advisor trial, for
 * when they land somewhere other than the Visa Advisor after signing up (an email-confirmation link,
 * onboarding, firm setup). docs/plans/public-visa-advisor-trial.md, VA.2b. The Visa Advisor itself
 * picks the scenario up on its own, so the banner hides there.
 */
export const TrialScenarioBanner: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [hasScenario, setHasScenario] = useState(() => peekTrialScenario() !== null);

  if (!hasScenario || location.pathname.startsWith('/visa-advisor')) return null;

  return (
    <div
      role="status"
      className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edamame-500/30 bg-edamame-500/10 px-4 py-3 text-sm text-ink dark:text-plate-ink"
    >
      <span>You tried the Visa Advisor on the homepage. Your answers are ready for the full report.</span>
      <span className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate('/visa-advisor')}
          className="rounded-lg bg-edamame-500 px-3.5 py-1.5 font-semibold text-white hover:bg-edamame-600"
        >
          Continue in the Visa Advisor
        </button>
        <button
          type="button"
          onClick={() => {
            clearTrialScenario();
            setHasScenario(false);
          }}
          className="font-semibold text-ink-soft underline underline-offset-2 dark:text-plate-ink-soft"
        >
          Dismiss
        </button>
      </span>
    </div>
  );
};
