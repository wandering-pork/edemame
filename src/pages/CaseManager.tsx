import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Case, Client, Task, WorkflowTemplate, TeamMember } from '../types';
import { Search, Plus, FileText, X, ChevronRight, Calendar, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { NewCase } from './NewCase';

interface CaseManagerProps {
  cases: Case[];
  clients: Client[];
  tasks: Task[];
  templates: WorkflowTemplate[];
  teamMembers?: TeamMember[];
  onTasksConfirmed: (tasks: Task[], newCase: Case) => void;
  onAssignCase?: (caseId: string, newOwnerId: string, note?: string) => void;
}

type StatusFilter = 'all' | 'active' | 'pending' | 'at-risk' | 'completed';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Pending' },
  { key: 'at-risk', label: 'At Risk' },
  { key: 'completed', label: 'Completed' },
];

const STATUS_STYLES: Record<Exclude<StatusFilter, 'all'>, { dot: string; bg: string; text: string; label: string }> = {
  active: {
    dot: '#10B981',
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-[#047857] dark:text-[#4ADE80]',
    label: 'Active',
  },
  pending: {
    dot: '#F59E0B',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-[#B45309] dark:text-[#FBBF24]',
    label: 'Pending',
  },
  'at-risk': {
    dot: '#EF4444',
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-[#B91C1C] dark:text-[#F87171]',
    label: 'At Risk',
  },
  completed: {
    dot: '#94A3B8',
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-300',
    label: 'Completed',
  },
};

/** Deterministic 0-360 hue from a string id, for pastel avatar backgrounds. */
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
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

interface RowStatus {
  status: Exclude<StatusFilter, 'all'>;
  progress: number;
  completedTasks: number;
  totalTasks: number;
  nextTask?: Task;
  isNextOverdue: boolean;
}

const computeRowStatus = (caseTasks: Task[]): RowStatus => {
  const completedTasks = caseTasks.filter(t => t.isCompleted).length;
  const totalTasks = caseTasks.length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const pending = caseTasks
    .filter(t => !t.isCompleted)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const nextTask = pending[0];
  const isNextOverdue = !!nextTask && new Date(nextTask.date) < new Date();

  let status: Exclude<StatusFilter, 'all'> = 'active';
  if (progress === 100) status = 'completed';
  else if (progress === 0) status = 'pending';
  else if (pending.some(t => new Date(t.date) < new Date())) status = 'at-risk';

  return { status, progress, completedTasks, totalTasks, nextTask, isNextOverdue };
};

export const CaseManager: React.FC<CaseManagerProps> = ({
  cases,
  clients,
  tasks,
  templates,
  teamMembers = [],
  onTasksConfirmed,
  onAssignCase,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showIntake, setShowIntake] = useState(false);
  const [suggestedTemplateKeyword, setSuggestedTemplateKeyword] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [assignModalCaseId, setAssignModalCaseId] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<string>('');
  const [assignNote, setAssignNote] = useState('');

  // Auto-open intake form with suggested template if coming from VisaAdvisor
  useEffect(() => {
    const state = location.state as any;
    if (state?.suggestedTemplateKeyword) {
      setSuggestedTemplateKeyword(state.suggestedTemplateKeyword);
      setShowIntake(true);
      // Clear the state so we don't keep opening the form
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const handleViewDetails = (caseId: string) => {
    navigate(`/cases/${caseId}`);
  };

  const searchedCases = useMemo(() => {
    return cases.filter(c => {
      const client = clients.find(cl => cl.id === c.clientId);
      const searchLower = searchTerm.toLowerCase();
      return (
        c.id.toLowerCase().includes(searchLower) ||
        c.title.toLowerCase().includes(searchLower) ||
        client?.name.toLowerCase().includes(searchLower) ||
        client?.email.toLowerCase().includes(searchLower)
      );
    });
  }, [cases, clients, searchTerm]);

  const rows = useMemo(() => {
    return searchedCases.map(c => {
      const client = clients.find(cl => cl.id === c.clientId);
      const applicant = c.applicantId ? clients.find(cl => cl.id === c.applicantId) : undefined;
      const caseTasks = tasks.filter(t => t.caseId === c.id);
      const template = templates.find(t => t.id === c.templateId);
      const owner = teamMembers.find(m => m.id === c.caseOwner);
      const rowStatus = computeRowStatus(caseTasks);
      return { case: c, client, applicant, template, owner, ...rowStatus };
    });
  }, [searchedCases, clients, tasks, templates, teamMembers]);

  const filterCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: rows.length, active: 0, pending: 0, 'at-risk': 0, completed: 0 };
    rows.forEach(r => { counts[r.status]++; });
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rows;
    return rows.filter(r => r.status === statusFilter);
  }, [rows, statusFilter]);

  if (showIntake) {
    return (
      <NewCase
        templates={templates}
        clients={clients}
        suggestedTemplateKeyword={suggestedTemplateKeyword}
        onTasksConfirmed={(newTasks, newCase) => {
          onTasksConfirmed(newTasks, newCase);
          setShowIntake(false);
          setSuggestedTemplateKeyword(null);
        }}
        onChangeView={() => {
          setShowIntake(false);
          setSuggestedTemplateKeyword(null);
        }}
      />
    );
  }

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-white dark:bg-slate-900 min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-[1440px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-[26px] md:text-[27px] font-extrabold tracking-[-0.035em] text-gray-900 dark:text-slate-100">
              Case Manager
            </h1>
            <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-1">
              Track and manage all immigration cases at a glance
            </p>
          </div>
          <button
            onClick={() => setShowIntake(true)}
            className="btn-press focus-ring flex items-center justify-center gap-1.5 bg-edamame-500 hover:bg-edamame-700 text-white px-4 py-2.5 rounded-xl font-bold transition-colors text-[13px] whitespace-nowrap"
          >
            <Plus size={17} strokeWidth={1.8} />
            New Case
          </button>
        </div>

        {/* Search bar */}
        <div className="relative max-w-md mt-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" size={17} strokeWidth={1.8} />
          <input
            type="text"
            placeholder="Search cases, clients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="focus-ring w-full pl-11 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 focus:border-edamame-500 dark:focus:border-edamame-500 rounded-xl text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 outline-none transition-colors text-[13px]"
          />
        </div>

        {/* Filter chips + count */}
        <div className="flex items-center gap-2 mt-5 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`btn-press px-3.5 py-1.5 rounded-full border text-[12px] font-semibold transition-colors whitespace-nowrap ${
                statusFilter === f.key
                  ? 'border-edamame-500 bg-edamame-50 dark:bg-edamame-900/20 text-edamame-700 dark:text-edamame-400'
                  : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-500 dark:text-slate-400 hover:border-edamame-500'
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-[12px] text-gray-400 dark:text-slate-500 whitespace-nowrap">
            {filteredRows.length} {filteredRows.length === 1 ? 'case' : 'cases'}
            {searchTerm && <span className="ml-1 italic">matching "{searchTerm}"</span>}
          </span>
        </div>

        {/* Cases list */}
        {filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <FileText size={32} className="text-gray-400 dark:text-slate-600" strokeWidth={1.8} />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-slate-100 mb-1">No cases found</h3>
            <p className="text-gray-500 dark:text-slate-400 text-sm">Try adjusting your search or filters, or create a new case</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden mt-4">
            {filteredRows.map((r) => {
              const c = r.case;
              const client = r.client;
              const hue = hueFromId(client?.id || c.clientId || c.id);
              const statusStyle = STATUS_STYLES[r.status];
              const ref = `#${c.id.slice(0, 8).toUpperCase()}`;

              return (
                <div
                  key={c.id}
                  onClick={() => handleViewDetails(c.id)}
                  className="table-row-hover hover:bg-gray-50 dark:hover:bg-slate-800/60 relative flex items-center gap-4 px-5 pl-6 py-[15px] border-b border-gray-100 dark:border-slate-800 last:border-b-0"
                >
                  {/* Status edge */}
                  <div
                    className="absolute left-0 top-[10px] bottom-[10px] w-[3.5px] rounded-sm"
                    style={{ background: statusStyle.dot }}
                  />

                  {/* Avatar */}
                  <div
                    className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                    style={{
                      background: `oklch(0.93 0.05 ${hue})`,
                      color: `oklch(0.42 0.12 ${hue})`,
                    }}
                  >
                    {initialsOf(client?.name || 'Unknown')}
                  </div>

                  {/* Case type + client info */}
                  <div className="flex-[1.6] min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tracking-[-0.015em] text-gray-900 dark:text-slate-100 whitespace-nowrap overflow-hidden text-ellipsis">
                        {c.title}
                      </span>
                      {r.template?.visaSubclass && (
                        <span className="text-[9.5px] font-bold px-[7px] py-0.5 rounded-md bg-edamame-500/10 text-edamame-700 dark:text-edamame-400 flex-shrink-0">
                          SC-{r.template.visaSubclass}
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-gray-400 dark:text-slate-500 mt-[3px] whitespace-nowrap overflow-hidden text-ellipsis">
                      {client?.name || 'Unknown'} &middot; DOB {client?.dob || 'N/A'} &middot; {ref}
                    </div>
                  </div>

                  {/* Next task */}
                  <div className="hidden min-[1021px]:block flex-1 min-w-0">
                    {r.nextTask ? (
                      <>
                        <div className="text-[9px] font-bold tracking-[0.11em] uppercase text-gray-400 dark:text-slate-500">
                          Next task
                        </div>
                        <div className="text-xs font-semibold mt-1 text-gray-900 dark:text-slate-100 whitespace-nowrap overflow-hidden text-ellipsis">
                          {r.nextTask.title}
                        </div>
                        <div
                          className={`text-[11px] font-semibold mt-0.5 ${
                            r.isNextOverdue ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-slate-400'
                          }`}
                        >
                          Due {format(new Date(r.nextTask.date), 'MMM d')}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-gray-300 dark:text-slate-600">
                        <Calendar size={13} strokeWidth={1.8} />
                        No pending tasks
                      </div>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="w-[112px] flex-shrink-0">
                    <div className="flex justify-between text-[10.5px] text-gray-400 dark:text-slate-500">
                      <span className="font-bold text-gray-900 dark:text-slate-100">{r.progress}%</span>
                      <span>{r.completedTasks}/{r.totalTasks}</span>
                    </div>
                    <div className="h-[5px] rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden mt-[5px]">
                      <div
                        className="progress-fill h-full rounded-full bg-edamame-500"
                        style={{ width: `${r.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Status chip */}
                  <span
                    className={`inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2.5 py-[3px] rounded-md flex-shrink-0 ${statusStyle.bg} ${statusStyle.text}`}
                  >
                    <span
                      className="badge-pulse w-1.5 h-1.5 rounded-full"
                      style={{ background: statusStyle.dot }}
                    />
                    {statusStyle.label}
                  </span>

                  {/* Owner / assign */}
                  {r.owner ? (
                    <div
                      className="w-6 h-6 rounded-full bg-gradient-to-br from-edamame-400 to-edamame-600 text-white flex items-center justify-center text-[9.5px] font-bold flex-shrink-0"
                      title={`Owned by ${r.owner.name}`}
                    >
                      {r.owner.avatar || initialsOf(r.owner.name)}
                    </div>
                  ) : (
                    onAssignCase && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAssignModalCaseId(c.id);
                          setAssignTarget(c.caseOwner || '');
                          setAssignNote('');
                        }}
                        title="Assign case owner"
                        className="w-6 h-6 rounded-full border border-dashed border-gray-300 dark:border-slate-600 text-gray-400 dark:text-slate-500 hover:border-edamame-500 hover:text-edamame-500 flex items-center justify-center flex-shrink-0 transition-colors"
                      >
                        <UserPlus size={12} strokeWidth={1.8} />
                      </button>
                    )
                  )}

                  <ChevronRight size={18} strokeWidth={1.8} className="text-gray-300 dark:text-slate-600 flex-shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {assignModalCaseId && onAssignCase && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4 z-50 modal-backdrop">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full modal-content">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Assign Case</h2>
              <button
                onClick={() => setAssignModalCaseId(null)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              {teamMembers.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">No team members yet. Add some in Team Members.</p>
              )}
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
                    {m.avatar || m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">{m.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{m.role}</p>
                  </div>
                </button>
              ))}
              <textarea
                value={assignNote}
                onChange={e => setAssignNote(e.target.value)}
                placeholder="Reassignment note (optional)..."
                rows={2}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all resize-none text-sm"
              />
            </div>
            <div className="flex items-center gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setAssignModalCaseId(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!assignTarget) return;
                  onAssignCase(assignModalCaseId, assignTarget, assignNote || undefined);
                  setAssignModalCaseId(null);
                }}
                disabled={!assignTarget}
                className="ml-auto px-4 py-2 text-sm font-semibold text-white bg-edamame-500 hover:bg-edamame-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
