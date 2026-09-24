import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { EligibilityAssessment } from '../../types';
import { PathwayCard } from './PathwayCard';

interface EligibilityAssessmentModalProps {
  assessment: EligibilityAssessment;
  onClose: () => void;
}

const purposeLabels: Record<string, string> = {
  work: 'Work / Employment',
  study: 'Study',
  family: 'Family Reunification',
  pr: 'Permanent Residence',
  visit: 'Visit / Tourism',
};

/**
 * Read-only view of a stored `EligibilityAssessment` — opened from a case's
 * "View eligibility assessment" entry point (`pages/CaseDetails.tsx`). Reuses
 * `PathwayCard` (no action slot — nothing can be opened/changed from here)
 * rather than duplicating the verdict/reasons/gaps rendering from
 * `pages/VisaAdvisor.tsx`.
 */
export const EligibilityAssessmentModal: React.FC<EligibilityAssessmentModalProps> = ({ assessment, onClose }) => {
  const { clientInfo, goals } = assessment.inputs;
  const sortedOptions = [...assessment.options].sort((a, b) =>
    a.visaSubclass === assessment.selectedSubclass ? -1 : b.visaSubclass === assessment.selectedSubclass ? 1 : 0
  );

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-ink/10 dark:border-plate-ink/15">
        <div className="px-6 py-4 border-b border-ink/10 dark:border-plate-ink/15 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-[15px] text-ink dark:text-plate-ink">Eligibility Assessment</h3>
            <p className="text-[12px] text-ink-soft dark:text-plate-ink-soft mt-0.5">
              Assessed {new Date(assessment.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              {clientInfo.fullName ? ` — ${clientInfo.fullName}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="text-[12.5px] text-ink-soft dark:text-plate-ink-soft space-y-1">
            <p>
              <strong className="text-ink dark:text-plate-ink">In Australia:</strong> {clientInfo.inAustralia ? 'Yes' : 'No'}
              {clientInfo.currentVisaStatus ? ` (${clientInfo.currentVisaStatus})` : ''}
            </p>
            {goals.primaryPurpose && (
              <p>
                <strong className="text-ink dark:text-plate-ink">Primary purpose:</strong>{' '}
                {purposeLabels[goals.primaryPurpose] ?? goals.primaryPurpose}
              </p>
            )}
            {assessment.selectedSubclass && (
              <p>
                <strong className="text-ink dark:text-plate-ink">Pathway selected for this case:</strong> subclass {assessment.selectedSubclass}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {sortedOptions.map((visa) => (
              <PathwayCard key={visa.visaSubclass} visa={visa} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
