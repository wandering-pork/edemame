import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Users,
  Activity,
  ChevronRight,
  Filter,
  UserPlus,
  Clock,
  Search,
} from 'lucide-react';
import type { Case, Client, Task, TeamMember, ActivityEvent } from '../types';
import { toLocalISODate } from '../lib/dates';
import { isTaskClosed } from '../lib/taskStatus';
import { CASE_STAGE_LABELS } from '../lib/caseStage';
import { firmJobTitleLabel } from '../lib/firmDirectory';
import { useFirm } from '../contexts/FirmContext';
import { AssignCaseDialog } from '../components/AssignCaseDialog';

// Same palette as components/team/FirmTeamMembers.tsx's availability picker
// — small enough not to be worth sharing a module for.
const availabilityDot: Record<string, string> = {
  available: '#10B981',
  busy: '#F59E0B',
  offline: '#94A3B8',
};

interface TeamDashboardProps {
  teamMembers: TeamMember[];
  cases: Case[];
  clients: Client[];
  tasks: Task[];
  activity: ActivityEvent[];
  currentUserId?: string;
  onAssignCase: (caseId: string, newOwnerId: string, note?: string) => void;
}

const roleLabel: Record<TeamMember['role'], string> = {
  partner: 'Partner',
  lawyer: 'Lawyer',
  assistant: 'Assistant',
};

/** Deterministic 0-360 hue from a string id, for pastel avatar backgrounds — matches Clients/CaseManager. */
const hueFromId = (id: string): number => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
};

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const TeamDashboard: React.FC<TeamDashboardProps> = ({
  teamMembers,
  cases,
  clients,
  tasks,
  activity,
  currentUserId,
  onAssignCase,
}) => {
  const navigate = useNavigate();
  const [filterMemberId, setFilterMemberId] = useState<string>('all');
  const [assignModal, setAssignModal] = useState<{ caseId: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const today = useMemo(() => toLocalISODate(), []);

  // Per-member open tasks, for the 3-column Team View board.
  const memberColumns = useMemo(() => {
    return teamMembers.map(m => {
      const openTasks = tasks
        .filter(t => t.assignedTo === m.id && !isTaskClosed(t))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      return { member: m, openTasks };
    });
  }, [teamMembers, tasks]);

  const filteredCases = useMemo(() => {
    let list = cases;
    if (filterMemberId !== 'all') {
      list = list.filter(c => c.caseOwner === filterMemberId);
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(c => {
        const client = clients.find(cl => cl.id === c.clientId);
        return (
          c.title.toLowerCase().includes(q) ||
          client?.name.toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [cases, clients, filterMemberId, searchTerm]);

  const recentActivity = useMemo(() => {
    return [...activity]
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
      .slice(0, 10);
  }, [activity]);

  const openAssignModal = (caseId: string) => {
    setAssignModal({ caseId });
  };

  const { memberNameFor, allMembers } = useFirm();
  const getMember = (id?: string) => teamMembers.find(m => m.id === id);
  // Step 1 · 1G.7: prefer the real, agent-chosen job title (e.g.
  // "Registered migration agent") from the firm directory over
  // TeamMember.role's cosmetic partner/lawyer/assistant bucket — it's more
  // informative and is exactly what the Team page's own member rows show.
  // Falls back to the cosmetic role in local mode, where there's no firm
  // directory at all.
  const jobTitleLabel = (member: TeamMember): string => {
    const row = allMembers.find(m => m.userId === member.id);
    return (row && firmJobTitleLabel(row.jobTitle)) || roleLabel[member.role];
  };
  const getClient = (id: string) => clients.find(c => c.id === id);

  const caseProgress = (caseId: string) => {
    const t = tasks.filter(x => x.caseId === caseId);
    if (t.length === 0) return 0;
    return Math.round((t.filter(isTaskClosed).length / t.length) * 100);
  };

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-paper-2 dark:bg-plate-card min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-[1440px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-[26px] md:text-[27px] font-extrabold tracking-[-0.035em] text-ink dark:text-plate-ink">
              Team View
            </h1>
            <p className="text-[13px] text-ink-soft dark:text-plate-ink-soft mt-1">
              Open tasks across the practice, by owner
            </p>
          </div>
          <button
            onClick={() => navigate('/team-members')}
            className="btn-press focus-ring inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-[13px] bg-ink dark:bg-plate-ink text-paper dark:text-plate hover:bg-ink/80 dark:hover:bg-plate-ink/90 transition-colors whitespace-nowrap"
          >
            <Users size={16} strokeWidth={1.8} />
            Manage Members
          </button>
        </div>

        {/* Team View: 3 columns per member */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-6 items-start">
          {memberColumns.map(({ member, openTasks }) => {
            const hue = hueFromId(member.id);
            return (
              <div
                key={member.id}
                className="bg-paper-2 dark:bg-plate-card/50 border border-ink/10 dark:border-plate-ink/15 rounded-xl p-3"
              >
                <div className="flex items-center gap-2.5 px-1 pb-3">
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ background: `oklch(0.93 0.05 ${hue})`, color: `oklch(0.42 0.12 ${hue})` }}
                    >
                      {member.avatar || initialsOf(member.name)}
                    </div>
                    <span
                      title={member.status}
                      className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full border-2 border-paper-2 dark:border-plate-card"
                      style={{ background: availabilityDot[member.status] || availabilityDot.offline }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold tracking-[-0.01em] text-ink dark:text-plate-ink truncate">
                      {member.name}
                    </div>
                    <div className="text-[10.5px] text-ink-faint dark:text-plate-ink-faint truncate">{jobTitleLabel(member)}</div>
                  </div>
                  <span className="text-[11px] font-bold text-ink-faint dark:text-plate-ink-faint flex-shrink-0" title="Open tasks">
                    {openTasks.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {openTasks.length === 0 ? (
                    <div className="text-center text-xs text-ink-faint dark:text-plate-ink-faint py-6">No open tasks</div>
                  ) : (
                    openTasks.map(t => {
                      const c = t.caseId ? cases.find(cs => cs.id === t.caseId) : undefined;
                      const overdue = t.date < today;
                      return (
                        <button
                          key={t.id}
                          onClick={() => c && navigate(`/cases/${c.id}`)}
                          className="task-card text-left bg-paper-2 dark:bg-plate-card border border-ink/10 dark:border-plate-ink/15 rounded-[10px] px-3.5 py-3"
                        >
                          <div className="text-[12.5px] font-semibold tracking-[-0.01em] text-ink dark:text-plate-ink leading-snug">
                            {t.title}
                          </div>
                          <div className="text-[11px] text-ink-faint dark:text-plate-ink-faint mt-1 truncate">
                            {c ? c.title : 'No case linked'}
                          </div>
                          <span
                            className={`inline-block text-[10.5px] font-semibold px-2 py-0.5 rounded-md mt-2 ${
                              overdue
                                ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                : 'bg-paper-2 dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft'
                            }`}
                          >
                            {overdue ? 'Overdue · ' : 'Due '}
                            {format(new Date(t.date), 'MMM d')}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
          {memberColumns.length === 0 && (
            <div className="col-span-full text-center text-sm text-ink-faint dark:text-plate-ink-faint py-16">
              No team members yet.
            </div>
          )}
        </div>

        {/* Shared Case Board + Activity Feed */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-10">
          {/* Case Board */}
          <section className="xl:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-bold text-ink dark:text-plate-ink">Shared Case Board</h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint dark:text-plate-ink-faint" size={14} strokeWidth={1.8} />
                  <input
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search..."
                    className="focus-ring pl-9 pr-3 py-2 rounded-lg text-[13px] bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 focus:border-edamame-500 outline-none transition-colors text-ink dark:text-plate-ink placeholder-ink-soft/50 dark:placeholder-plate-ink-soft/50"
                  />
                </div>
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint dark:text-plate-ink-faint pointer-events-none" size={14} strokeWidth={1.8} />
                  <select
                    value={filterMemberId}
                    onChange={e => setFilterMemberId(e.target.value)}
                    className="focus-ring pl-9 pr-8 py-2 rounded-lg text-[13px] bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 focus:border-edamame-500 outline-none text-ink dark:text-plate-ink appearance-none cursor-pointer"
                  >
                    <option value="all">All members</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-paper-2 dark:bg-plate-card border border-ink/10 dark:border-plate-ink/15 rounded-xl shadow-sm divide-y divide-ink/10 dark:divide-plate-ink/15 overflow-hidden">
              {filteredCases.length === 0 && (
                <div className="p-10 text-center text-ink-faint dark:text-plate-ink-faint text-sm">
                  No cases match this filter.
                </div>
              )}
              {filteredCases.map(c => {
                const owner = getMember(c.caseOwner);
                // Step 1 · 1G.6: an owner who's disabled/removed still owns
                // the case — show their name instead of the "Assign" prompt.
                const ownerName = owner ? null : (c.caseOwner ? memberNameFor(c.caseOwner) : null);
                const client = getClient(c.clientId);
                const progress = caseProgress(c.id);
                const hue = hueFromId(client?.id || c.clientId || c.id);
                return (
                  <div
                    key={c.id}
                    className="table-row-hover p-4 hover:bg-paper-2 dark:hover:bg-plate/50 flex items-center gap-4"
                  >
                    <button
                      onClick={() => navigate(`/cases/${c.id}`)}
                      className="flex-1 min-w-0 text-left flex items-center gap-3"
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[10.5px] font-bold flex-shrink-0"
                        style={{ background: `oklch(0.93 0.05 ${hue})`, color: `oklch(0.42 0.12 ${hue})` }}
                      >
                        {initialsOf(client?.name || 'Unknown')}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-ink dark:text-plate-ink text-[13px] tracking-[-0.01em] truncate">
                          {c.title}
                        </h3>
                        <p className="text-[11.5px] text-ink-faint dark:text-plate-ink-faint truncate">
                          {client?.name || 'Unknown client'} &middot; {CASE_STAGE_LABELS[c.stage]}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 h-1 rounded-full bg-paper-2 dark:bg-plate-card overflow-hidden max-w-[160px]">
                            <div className="progress-fill h-full bg-edamame-500 rounded-full" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-[10px] font-semibold text-ink-faint dark:text-plate-ink-faint">{progress}%</span>
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {owner ? (
                        <div
                          className="w-8 h-8 rounded-full bg-gradient-to-br from-edamame-400 to-edamame-600 text-white flex items-center justify-center text-[10.5px] font-bold"
                          title={`Owned by ${owner.name}`}
                        >
                          {owner.avatar || initialsOf(owner.name)}
                        </div>
                      ) : ownerName ? (
                        <div
                          className="w-8 h-8 rounded-full bg-ink/10 dark:bg-plate-ink/15 text-ink-faint dark:text-plate-ink-faint flex items-center justify-center text-[10.5px] font-bold"
                          title={`Owned by ${ownerName}`}
                        >
                          {initialsOf(ownerName)}
                        </div>
                      ) : (
                        <button
                          onClick={() => openAssignModal(c.id)}
                          title="Assign case owner"
                          className="w-8 h-8 rounded-full border border-dashed border-ink/20 dark:border-plate-ink/25 text-ink-faint dark:text-plate-ink-faint hover:border-edamame-500 hover:text-edamame-500 flex items-center justify-center transition-colors"
                        >
                          <UserPlus size={13} strokeWidth={1.8} />
                        </button>
                      )}
                      <button
                        onClick={() => openAssignModal(c.id)}
                        className="btn-press px-3 py-1.5 rounded-lg text-[11.5px] font-semibold bg-paper-2 dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft hover:bg-edamame-500 hover:text-white transition-colors"
                      >
                        Assign
                      </button>
                      <ChevronRight
                        size={17}
                        strokeWidth={1.8}
                        className="text-ink-soft/40 dark:text-plate-ink-soft/40"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Activity Feed */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-edamame-500" strokeWidth={1.8} />
              <h2 className="text-base font-bold text-ink dark:text-plate-ink">Activity Feed</h2>
            </div>
            <div className="bg-paper-2 dark:bg-plate-card border border-ink/10 dark:border-plate-ink/15 rounded-xl shadow-sm p-4 min-h-[280px]">
              {recentActivity.length === 0 ? (
                <div className="py-10 text-center text-sm text-ink-faint dark:text-plate-ink-faint">
                  <Clock className="w-8 h-8 mx-auto mb-3 text-ink-soft/40 dark:text-plate-ink-soft/40" strokeWidth={1.8} />
                  Activity will appear here as your team works.
                </div>
              ) : (
                <ul className="space-y-4">
                  {recentActivity.map(ev => {
                    const actor = getMember(ev.actorId);
                    const actorName = actor?.name ?? memberNameFor(ev.actorId) ?? undefined;
                    const hue = hueFromId(actor?.id || ev.actorId || ev.id);
                    return (
                      <li key={ev.id} className="flex items-start gap-3">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{ background: `oklch(0.93 0.05 ${hue})`, color: `oklch(0.42 0.12 ${hue})` }}
                        >
                          {actor ? (actor.avatar || initialsOf(actor.name)) : actorName ? initialsOf(actorName) : '—'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] text-ink dark:text-plate-ink-soft leading-snug">{ev.summary}</p>
                          <p className="text-[11px] text-ink-faint dark:text-plate-ink-faint mt-0.5">
                            {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Assign modal */}
      {assignModal && (() => {
        const assignCaseItem = cases.find(c => c.id === assignModal.caseId);
        if (!assignCaseItem) return null;
        return (
          <AssignCaseDialog
            caseItem={assignCaseItem}
            teamMembers={teamMembers}
            cases={cases}
            tasks={tasks}
            currentUserId={currentUserId}
            onClose={() => setAssignModal(null)}
            onConfirm={(caseId, newOwnerId, note) => {
              onAssignCase(caseId, newOwnerId, note);
              setAssignModal(null);
            }}
          />
        );
      })()}
    </div>
  );
};
