import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Users,
  Briefcase,
  CheckCircle2,
  AlertTriangle,
  Activity,
  ChevronRight,
  Filter,
  UserCheck,
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

type Workload = 'light' | 'medium' | 'heavy';

function workloadFor(activeCaseCount: number, activeTaskCount: number): Workload {
  const score = activeCaseCount * 2 + activeTaskCount;
  if (score <= 4) return 'light';
  if (score <= 10) return 'medium';
  return 'heavy';
}

const roleLabel: Record<TeamMember['role'], string> = {
  partner: 'Partner',
  lawyer: 'Lawyer',
  assistant: 'Assistant',
};

const statusStyles: Record<TeamMember['status'], { dot: string; label: string; ring: string }> = {
  available: { dot: 'bg-emerald-500', label: 'Available', ring: 'ring-emerald-500/30' },
  busy: { dot: 'bg-amber-500', label: 'Busy', ring: 'ring-amber-500/30' },
  offline: { dot: 'bg-slate-400', label: 'Offline', ring: 'ring-slate-400/30' },
};

const workloadStyles: Record<Workload, { label: string; badge: string; bar: string }> = {
  light: {
    label: 'Light',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    bar: 'bg-emerald-500',
  },
  medium: {
    label: 'Medium',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    bar: 'bg-amber-500',
  },
  heavy: {
    label: 'Heavy',
    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    bar: 'bg-rose-500',
  },
};

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

  // Per-member stats derived live from cases/tasks
  const memberStats = useMemo(() => {
    return teamMembers.map(m => {
      const memberCases = cases.filter(c => c.caseOwner === m.id && c.status !== 'closed');
      const memberTasks = tasks.filter(t => t.assignedTo === m.id && !t.isCompleted);
      const overdue = memberTasks.filter(t => t.date < today).length;
      const wl = workloadFor(memberCases.length, memberTasks.length);
      return {
        member: m,
        caseCount: memberCases.length,
        taskCount: memberTasks.length,
        overdueCount: overdue,
        workload: wl,
      };
    });
  }, [teamMembers, cases, tasks, today]);

  const maxLoad = Math.max(
    1,
    ...memberStats.map(s => s.caseCount * 2 + s.taskCount),
  );

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
      .slice(0, 12);
  }, [activity]);

  const totalActiveCases = cases.filter(c => c.status !== 'closed').length;
  const totalOpenTasks = tasks.filter(t => !t.isCompleted).length;
  const totalOverdue = tasks.filter(t => !t.isCompleted && t.date < today).length;
  const atRiskMembers = memberStats.filter(s => s.overdueCount > 0).length;

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
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl md:text-4xl font-ibm-serif font-bold text-slate-900 dark:text-white mb-2">
              Team Dashboard
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-400">
              Workload, assignments, and collaboration across your firm
            </p>
          </div>
          <button
            onClick={() => navigate('/team-members')}
            className="btn-press inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white transition-colors"
          >
            <Users size={16} />
            Manage Members
          </button>
        </div>

        {/* Top metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <MetricCard
            label="Team Members"
            value={teamMembers.length}
            icon={<Users className="w-5 h-5" />}
            tone="slate"
          />
          <MetricCard
            label="Active Cases"
            value={totalActiveCases}
            icon={<Briefcase className="w-5 h-5" />}
            tone="edamame"
          />
          <MetricCard
            label="Open Tasks"
            value={totalOpenTasks}
            icon={<CheckCircle2 className="w-5 h-5" />}
            tone="blue"
          />
          <MetricCard
            label="Overdue"
            value={totalOverdue}
            icon={<AlertTriangle className="w-5 h-5" />}
            tone="rose"
            sublabel={atRiskMembers > 0 ? `${atRiskMembers} at risk` : undefined}
          />
        </div>

        {/* Team Members Grid */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-ibm-serif font-bold text-slate-900 dark:text-white">Team Members</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {memberStats.map(({ member, caseCount, taskCount, overdueCount, workload }) => {
              const ss = statusStyles[member.status];
              const ws = workloadStyles[workload];
              return (
                <div
                  key={member.id}
                  className="group relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="flex items-start gap-4">
                    <div className={`relative w-14 h-14 rounded-full bg-gradient-to-br from-edamame-400 to-edamame-600 text-white flex items-center justify-center font-ibm-serif font-bold text-lg ring-4 ${ss.ring}`}>
                      {member.avatar || member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-800 ${ss.dot}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-ibm-serif font-bold text-slate-900 dark:text-white text-base truncate">
                        {member.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{member.email}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {roleLabel[member.role]}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${ss.dot}`} />
                          {ss.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-slate-100 dark:border-slate-700">
                    <Stat label="Cases" value={caseCount} />
                    <Stat label="Tasks" value={taskCount} />
                    <Stat
                      label="Overdue"
                      value={overdueCount}
                      valueClass={overdueCount > 0 ? 'text-rose-600 dark:text-rose-400' : undefined}
                    />
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Workload
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${ws.badge}`}>
                        {ws.label}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${ws.bar}`}
                        style={{ width: `${Math.min(100, ((caseCount * 2 + taskCount) / maxLoad) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Workload Overview */}
        <section className="mb-12">
          <h2 className="text-xl font-ibm-serif font-bold text-slate-900 dark:text-white mb-5">Workload Overview</h2>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
            <div className="space-y-4">
              {memberStats.map(({ member, caseCount, taskCount, overdueCount }) => {
                const load = caseCount * 2 + taskCount;
                const pct = Math.min(100, (load / maxLoad) * 100);
                return (
                  <div key={member.id} className="flex items-center gap-4">
                    <div className="w-44 flex-shrink-0 flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-edamame-400 to-edamame-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {member.avatar}
                      </div>
                      <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {member.name}
                      </span>
                    </div>
                    <div className="flex-1 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 relative overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-edamame-400 to-edamame-600 rounded-lg transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                      <div className="absolute inset-0 flex items-center px-3 text-xs font-semibold text-slate-700 dark:text-white">
                        {caseCount} cases · {taskCount} tasks
                        {overdueCount > 0 && (
                          <span className="ml-2 text-rose-600 dark:text-rose-300 inline-flex items-center gap-1">
                            <AlertTriangle size={12} /> {overdueCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Shared Case Board + Activity Feed */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Case Board */}
          <section className="xl:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-ibm-serif font-bold text-slate-900 dark:text-white">Shared Case Board</h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search..."
                    className="pl-9 pr-3 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 outline-none transition-all text-slate-900 dark:text-white placeholder-slate-400"
                  />
                </div>
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                  <select
                    value={filterMemberId}
                    onChange={e => setFilterMemberId(e.target.value)}
                    className="pl-9 pr-8 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 outline-none text-slate-900 dark:text-white appearance-none cursor-pointer"
                  >
                    <option value="all">All members</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden">
              {filteredCases.length === 0 && (
                <div className="p-10 text-center text-slate-500 dark:text-slate-400 text-sm">
                  No cases match this filter.
                </div>
              )}
              {filteredCases.map(c => {
                const owner = getMember(c.caseOwner);
                const client = getClient(c.clientId);
                const progress = caseProgress(c.id);
                return (
                  <div
                    key={c.id}
                    className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors group flex items-center gap-4"
                  >
                    <button
                      onClick={() => navigate(`/cases/${c.id}`)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900 dark:text-white text-sm truncate group-hover:text-edamame-500 transition-colors">
                          {c.title}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {client?.name || 'Unknown client'} · {c.status.replace('_', ' ')}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden max-w-[200px]">
                          <div
                            className="h-full bg-edamame-500 rounded-full"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                          {progress}%
                        </span>
                      </div>
                    </button>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {owner ? (
                        <div className="flex items-center gap-2 text-right">
                          <div className="text-right hidden sm:block">
                            <p className="text-[10px] uppercase tracking-wide font-bold text-slate-400">Owner</p>
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{owner.name.split(' ')[0]}</p>
                          </div>
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-edamame-400 to-edamame-600 text-white flex items-center justify-center text-xs font-bold">
                            {owner.avatar}
                          </div>
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 flex items-center justify-center">
                          <UserCheck size={14} />
                        </div>
                      )}
                      <button
                        onClick={() => openAssignModal(c.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-edamame-500 hover:text-white dark:hover:bg-edamame-500 dark:hover:text-white transition-colors"
                      >
                        Assign
                      </button>
                      <button
                        onClick={() => navigate(`/cases/${c.id}`)}
                        className="text-slate-400 hover:text-edamame-500 transition-colors"
                        aria-label="Open case"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Activity Feed */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-edamame-500" />
              <h2 className="text-xl font-ibm-serif font-bold text-slate-900 dark:text-white">Activity Feed</h2>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 min-h-[320px]">
              {recentActivity.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  <Clock className="w-10 h-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                  Activity will appear here as your team works.
                </div>
              ) : (
                <ul className="space-y-4">
                  {recentActivity.map(ev => {
                    const actor = getMember(ev.actorId);
                    return (
                      <li key={ev.id} className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-edamame-400 to-edamame-600 text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                          {actor?.avatar || '—'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800 dark:text-slate-100 leading-snug">
                            {ev.summary}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
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
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-ibm-serif font-bold text-slate-900 dark:text-white">Assign Case</h2>
              <button
                onClick={() => setAssignModal(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors text-xl"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Team member</label>
                <div className="space-y-2">
                  {teamMembers.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setAssignTarget(m.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        assignTarget === m.id
                          ? 'border-edamame-500 bg-edamame-50 dark:bg-edamame-900/20 ring-2 ring-edamame-500/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-edamame-400 to-edamame-600 text-white flex items-center justify-center font-bold">
                        {m.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">{m.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{roleLabel[m.role]}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Note <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  value={assignNote}
                  onChange={e => setAssignNote(e.target.value)}
                  placeholder="Context for the reassignment..."
                  rows={2}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all resize-none"
                />
              </div>

              {/* Assignment history */}
              {(() => {
                const currentCase = cases.find(c => c.id === assignModal.caseId);
                const history = currentCase?.assignmentHistory || [];
                if (history.length === 0) return null;
                return (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                      Assignment history
                    </p>
                    <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                      {history.slice().reverse().map(ev => {
                        const fromMember = getMember(ev.fromOwnerId);
                        const toMember = getMember(ev.toOwnerId);
                        return (
                          <div key={ev.id} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                            <Clock size={12} />
                            <span>
                              {fromMember ? `${fromMember.name} → ` : 'Assigned to '}
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {toMember?.name || 'Unknown'}
                              </span>
                              <span className="ml-2 text-slate-400">{format(new Date(ev.changedAt), 'MMM d')}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setAssignModal(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAssign}
                disabled={!assignTarget}
                className="ml-auto px-4 py-2 text-sm font-semibold text-white bg-edamame-500 hover:bg-edamame-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg transition-colors"
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

// --- Subcomponents -----------------------------------------------------------

const MetricCard: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'slate' | 'edamame' | 'blue' | 'rose';
  sublabel?: string;
}> = ({ label, value, icon, tone, sublabel }) => {
  const toneMap = {
    slate: 'from-slate-500 to-slate-700',
    edamame: 'from-edamame-400 to-edamame-600',
    blue: 'from-blue-400 to-blue-600',
    rose: 'from-rose-400 to-rose-600',
  } as const;
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 flex items-start gap-4 hover:shadow-md transition-all">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${toneMap[tone]} text-white flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-2xl font-ibm-serif font-bold text-slate-900 dark:text-white leading-tight">{value}</p>
        {sublabel && <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">{sublabel}</p>}
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; valueClass?: string }> = ({
  label,
  value,
  valueClass,
}) => (
  <div className="text-center">
    <p className={`text-lg font-ibm-serif font-bold text-slate-900 dark:text-white ${valueClass || ''}`}>
      {value}
    </p>
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {label}
    </p>
  </div>
);
