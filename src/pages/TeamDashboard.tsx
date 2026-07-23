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

interface TeamDashboardProps {
  teamMembers: TeamMember[];
  cases: Case[];
  clients: Client[];
  tasks: Task[];
  activity: ActivityEvent[];
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
  onAssignCase,
}) => {
  const navigate = useNavigate();
  const [filterMemberId, setFilterMemberId] = useState<string>('all');
  const [assignModal, setAssignModal] = useState<{ caseId: string } | null>(null);
  const [assignNote, setAssignNote] = useState('');
  const [assignTarget, setAssignTarget] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Per-member open tasks, for the 3-column Team View board.
  const memberColumns = useMemo(() => {
    return teamMembers.map(m => {
      const openTasks = tasks
        .filter(t => t.assignedTo === m.id && !t.isCompleted)
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
    const existing = cases.find(c => c.id === caseId)?.caseOwner;
    setAssignTarget(existing || '');
    setAssignNote('');
  };

  const confirmAssign = () => {
    if (!assignModal || !assignTarget) return;
    onAssignCase(assignModal.caseId, assignTarget, assignNote || undefined);
    setAssignModal(null);
    setAssignTarget('');
    setAssignNote('');
  };

  const getMember = (id?: string) => teamMembers.find(m => m.id === id);
  const getClient = (id: string) => clients.find(c => c.id === id);

  const caseProgress = (caseId: string) => {
    const t = tasks.filter(x => x.caseId === caseId);
    if (t.length === 0) return 0;
    return Math.round((t.filter(x => x.isCompleted).length / t.length) * 100);
  };

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-white dark:bg-slate-900 min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-[1440px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-[26px] md:text-[27px] font-extrabold tracking-[-0.035em] text-gray-900 dark:text-slate-100">
              Team View
            </h1>
            <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-1">
              Open tasks across the practice, by owner
            </p>
          </div>
          <button
            onClick={() => navigate('/team-members')}
            className="btn-press focus-ring inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-[13px] bg-gray-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-gray-700 dark:hover:bg-white transition-colors whitespace-nowrap"
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
                className="bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800 rounded-xl p-3"
              >
                <div className="flex items-center gap-2.5 px-1 pb-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={{ background: `oklch(0.93 0.05 ${hue})`, color: `oklch(0.42 0.12 ${hue})` }}
                  >
                    {member.avatar || initialsOf(member.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold tracking-[-0.01em] text-gray-900 dark:text-slate-100 truncate">
                      {member.name}
                    </div>
                    <div className="text-[10.5px] text-gray-400 dark:text-slate-500">{roleLabel[member.role]}</div>
                  </div>
                  <span className="text-[11px] font-bold text-gray-400 dark:text-slate-500 flex-shrink-0">
                    {openTasks.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {openTasks.length === 0 ? (
                    <div className="text-center text-xs text-gray-400 dark:text-slate-600 py-6">No open tasks</div>
                  ) : (
                    openTasks.map(t => {
                      const c = t.caseId ? cases.find(cs => cs.id === t.caseId) : undefined;
                      const overdue = t.date < today;
                      return (
                        <button
                          key={t.id}
                          onClick={() => c && navigate(`/cases/${c.id}`)}
                          className="task-card text-left bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[10px] px-3.5 py-3"
                        >
                          <div className="text-[12.5px] font-semibold tracking-[-0.01em] text-gray-900 dark:text-slate-100 leading-snug">
                            {t.title}
                          </div>
                          <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-1 truncate">
                            {c ? c.title : 'No case linked'}
                          </div>
                          <span
                            className={`inline-block text-[10.5px] font-semibold px-2 py-0.5 rounded-md mt-2 ${
                              overdue
                                ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'
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
            <div className="col-span-full text-center text-sm text-gray-400 dark:text-slate-600 py-16">
              No team members yet.
            </div>
          )}
        </div>

        {/* Shared Case Board + Activity Feed */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-10">
          {/* Case Board */}
          <section className="xl:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">Shared Case Board</h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" size={14} strokeWidth={1.8} />
                  <input
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search..."
                    className="focus-ring pl-9 pr-3 py-2 rounded-lg text-[13px] bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 focus:border-edamame-500 outline-none transition-colors text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500"
                  />
                </div>
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 pointer-events-none" size={14} strokeWidth={1.8} />
                  <select
                    value={filterMemberId}
                    onChange={e => setFilterMemberId(e.target.value)}
                    className="focus-ring pl-9 pr-8 py-2 rounded-lg text-[13px] bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 focus:border-edamame-500 outline-none text-gray-900 dark:text-slate-100 appearance-none cursor-pointer"
                  >
                    <option value="all">All members</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-sm divide-y divide-gray-100 dark:divide-slate-800 overflow-hidden">
              {filteredCases.length === 0 && (
                <div className="p-10 text-center text-gray-400 dark:text-slate-600 text-sm">
                  No cases match this filter.
                </div>
              )}
              {filteredCases.map(c => {
                const owner = getMember(c.caseOwner);
                const client = getClient(c.clientId);
                const progress = caseProgress(c.id);
                const hue = hueFromId(client?.id || c.clientId || c.id);
                return (
                  <div
                    key={c.id}
                    className="table-row-hover p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 flex items-center gap-4"
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
                        <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-[13px] tracking-[-0.01em] truncate">
                          {c.title}
                        </h3>
                        <p className="text-[11.5px] text-gray-400 dark:text-slate-500 truncate">
                          {client?.name || 'Unknown client'} &middot; {c.status.replace('_', ' ')}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 h-1 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden max-w-[160px]">
                            <div className="progress-fill h-full bg-edamame-500 rounded-full" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">{progress}%</span>
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
                      ) : (
                        <button
                          onClick={() => openAssignModal(c.id)}
                          title="Assign case owner"
                          className="w-8 h-8 rounded-full border border-dashed border-gray-300 dark:border-slate-600 text-gray-400 dark:text-slate-500 hover:border-edamame-500 hover:text-edamame-500 flex items-center justify-center transition-colors"
                        >
                          <UserPlus size={13} strokeWidth={1.8} />
                        </button>
                      )}
                      <button
                        onClick={() => openAssignModal(c.id)}
                        className="btn-press px-3 py-1.5 rounded-lg text-[11.5px] font-semibold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-edamame-500 hover:text-white transition-colors"
                      >
                        Assign
                      </button>
                      <ChevronRight
                        size={17}
                        strokeWidth={1.8}
                        className="text-gray-300 dark:text-slate-600"
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
              <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">Activity Feed</h2>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-sm p-4 min-h-[280px]">
              {recentActivity.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400 dark:text-slate-600">
                  <Clock className="w-8 h-8 mx-auto mb-3 text-gray-300 dark:text-slate-700" strokeWidth={1.8} />
                  Activity will appear here as your team works.
                </div>
              ) : (
                <ul className="space-y-4">
                  {recentActivity.map(ev => {
                    const actor = getMember(ev.actorId);
                    const hue = hueFromId(actor?.id || ev.actorId || ev.id);
                    return (
                      <li key={ev.id} className="flex items-start gap-3">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{ background: `oklch(0.93 0.05 ${hue})`, color: `oklch(0.42 0.12 ${hue})` }}
                        >
                          {actor ? (actor.avatar || initialsOf(actor.name)) : '—'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] text-gray-800 dark:text-slate-100 leading-snug">{ev.summary}</p>
                          <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
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
      {assignModal && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4 z-50 modal-backdrop">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full modal-content">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Assign Case</h2>
              <button
                onClick={() => setAssignModal(null)}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors text-xl"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">Team member</label>
                <div className="space-y-2">
                  {teamMembers.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setAssignTarget(m.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        assignTarget === m.id
                          ? 'border-edamame-500 bg-edamame-50 dark:bg-edamame-900/20 ring-2 ring-edamame-500/20'
                          : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-edamame-400 to-edamame-600 text-white flex items-center justify-center font-bold text-sm">
                        {m.avatar || initialsOf(m.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">{m.name}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{roleLabel[m.role]}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                  Note <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={assignNote}
                  onChange={e => setAssignNote(e.target.value)}
                  placeholder="Context for the reassignment..."
                  rows={2}
                  className="focus-ring w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 outline-none transition-all resize-none"
                />
              </div>

              {/* Assignment history */}
              {(() => {
                const currentCase = cases.find(c => c.id === assignModal.caseId);
                const history = currentCase?.assignmentHistory || [];
                if (history.length === 0) return null;
                return (
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-gray-400 dark:text-slate-500 mb-2">
                      Assignment history
                    </p>
                    <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                      {history.slice().reverse().map(ev => {
                        const fromMember = getMember(ev.fromOwnerId);
                        const toMember = getMember(ev.toOwnerId);
                        return (
                          <div key={ev.id} className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-2">
                            <Clock size={12} strokeWidth={1.8} />
                            <span>
                              {fromMember ? `${fromMember.name} → ` : 'Assigned to '}
                              <span className="font-semibold text-gray-700 dark:text-slate-200">
                                {toMember?.name || 'Unknown'}
                              </span>
                              <span className="ml-2 text-gray-400 dark:text-slate-500">{format(new Date(ev.changedAt), 'MMM d')}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center gap-3 p-6 border-t border-gray-200 dark:border-slate-700">
              <button
                onClick={() => setAssignModal(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAssign}
                disabled={!assignTarget}
                className="btn-press ml-auto px-4 py-2 text-sm font-semibold text-white bg-edamame-500 hover:bg-edamame-600 disabled:bg-gray-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Confirm assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
