import React, { useState } from 'react';
import { X, Clock } from 'lucide-react';
import { format } from 'date-fns';
import type { Case, TeamMember, Task } from '../types';
import { PersonPicker } from './PersonPicker';
import { useFirm } from '../contexts/FirmContext';
import { firmJobTitleLabel } from '../lib/firmDirectory';
import type { PersonPickerPerson } from '../lib/personPicker';

interface AssignCaseDialogProps {
  caseItem: Case;
  teamMembers: TeamMember[];
  cases: Case[];
  tasks: Task[];
  currentUserId?: string;
  onClose: () => void;
  onConfirm: (caseId: string, newOwnerId: string, note?: string) => void;
}

const ROLE_LABEL: Record<TeamMember['role'], string> = {
  partner: 'Partner',
  lawyer: 'Lawyer',
  assistant: 'Assistant',
};

/**
 * The one "Assign Case" dialog — replaces the near-identical modals that used
 * to live separately in pages/CaseManager.tsx and pages/TeamDashboard.tsx.
 * Uses the shared PersonPicker for search/keyboard nav instead of a plain
 * card list, so it stays usable at 20+ members.
 */
export const AssignCaseDialog: React.FC<AssignCaseDialogProps> = ({
  caseItem, teamMembers, cases, tasks, currentUserId, onClose, onConfirm,
}) => {
  // useFirm() returns firm: null / empty directory in local mode — this
  // still works there, it just falls back to TeamMember's cosmetic role/name.
  const { allMembers, memberNameFor } = useFirm();
  const [target, setTarget] = useState<string | undefined>(caseItem.caseOwner);
  const [note, setNote] = useState('');

  const people: PersonPickerPerson[] = teamMembers.map(m => {
    const row = allMembers.find(r => r.userId === m.id);
    const jobTitle = (row && firmJobTitleLabel(row.jobTitle)) || ROLE_LABEL[m.role];
    return { id: m.id, name: m.name, email: m.email, avatar: m.avatar, jobTitle, status: m.status };
  });

  const nameFor = (id?: string): string | null => {
    if (!id) return null;
    return memberNameFor(id) || teamMembers.find(m => m.id === id)?.name || null;
  };

  const history = caseItem.assignmentHistory || [];
  const canConfirm = !!target && target !== caseItem.caseOwner;

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4 z-50 modal-backdrop">
      <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl max-w-md w-full modal-content flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-ink/15 dark:border-plate-ink/20 flex-shrink-0">
          <h2 className="text-lg font-bold text-ink dark:text-plate-ink">Assign Case</h2>
          <button
            onClick={onClose}
            className="p-1 text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate-card rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-semibold text-ink-soft dark:text-plate-ink-soft mb-2">Team member</label>
            {teamMembers.length === 0 ? (
              <p className="text-sm text-ink-soft dark:text-plate-ink-soft">No team members yet. Add some in Team Members.</p>
            ) : (
              <PersonPicker
                people={people}
                cases={cases}
                tasks={tasks}
                value={target}
                onChange={id => setTarget(id)}
                currentUserId={currentUserId}
                autoFocus
                onEscape={onClose}
                aria-label="Assign case to"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-ink-soft dark:text-plate-ink-soft mb-2">
              Note <span className="font-normal text-ink-faint dark:text-plate-ink-faint">(optional — added to the case's assignment history)</span>
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Context for the reassignment..."
              rows={2}
              className="focus-ring w-full px-4 py-2 rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper dark:bg-plate-card text-ink dark:text-plate-ink placeholder-ink-soft/50 dark:placeholder-plate-ink-soft/50 outline-none transition-all resize-none"
            />
          </div>

          {history.length > 0 && (
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-ink-faint dark:text-plate-ink-faint mb-2">
                Assignment history
              </p>
              <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                {history.slice().reverse().map(ev => {
                  const fromName = nameFor(ev.fromOwnerId);
                  const toName = nameFor(ev.toOwnerId);
                  return (
                    <div key={ev.id} className="text-xs text-ink-soft dark:text-plate-ink-soft">
                      <div className="flex items-center gap-2">
                        <Clock size={12} strokeWidth={1.8} className="flex-shrink-0" />
                        <span>
                          {fromName ? `${fromName} → ` : 'Assigned to '}
                          <span className="font-semibold text-ink-soft dark:text-plate-ink-soft">{toName || 'Unknown'}</span>
                          <span className="ml-2 text-ink-faint dark:text-plate-ink-faint">{format(new Date(ev.changedAt), 'MMM d')}</span>
                        </span>
                      </div>
                      {ev.note && <p className="ml-5 mt-0.5 italic text-ink-faint dark:text-plate-ink-faint">{ev.note}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 p-6 border-t border-ink/15 dark:border-plate-ink/20 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate-card rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { if (!target) return; onConfirm(caseItem.id, target, note || undefined); }}
            disabled={!canConfirm}
            className="btn-press ml-auto px-4 py-2 text-sm font-semibold text-white bg-edamame-500 hover:bg-edamame-600 disabled:bg-ink/20 dark:disabled:bg-plate-ink/20 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Confirm assignment
          </button>
        </div>
      </div>
    </div>
  );
};
