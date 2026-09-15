import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Case, Client, Task, WorkflowTemplate, TeamMember } from '../types';
import { Search, Plus, FileText, X, ChevronRight, Calendar, UserPlus, Settings2 } from 'lucide-react';
import { format } from 'date-fns';
import { NewCase } from './NewCase';
import { ConfigurationsPanel } from '../components/case-manager/ConfigurationsPanel';

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
  const [showConfigurations, setShowConfigurations] = useState(false);
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
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-paper dark:bg-plate min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-[1440px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="font-serif text-[28px] md:text-[29px] font-semibold tracking-[-0.02em] text-ink dark:text-plate-ink">
              Case Manager
            </h1>
            <p className="text-[13px] text-ink-soft dark:text-plate-ink-soft mt-1">
              Track and manage all immigration cases at a glance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfigurations(true)}
              title="Case Manager configurations — document types and other module settings"
              className="btn-press focus-ring flex items-center justify-center gap-1.5 border border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft hover:border-edamame-500 hover:text-edamame-600 dark:hover:text-edamame-400 px-4 py-2.5 rounded-xl font-bold transition-colors text-[13px] whitespace-nowrap"
            >
              <Settings2 size={16} strokeWidth={1.8} />
              Configurations
            </button>
            <button
              onClick={() => setShowIntake(true)}
              className="btn-press focus-ring flex items-center justify-center gap-1.5 bg-edamame-500 hover:bg-edamame-700 text-white px-4 py-2.5 rounded-xl font-bold transition-colors text-[13px] whitespace-nowrap"
            >
              <Plus size={17} strokeWidth={1.8} />
              New Case
            </button>
          </div>
        </div>

        {showConfigurations && <ConfigurationsPanel onClose={() => setShowConfigurations(false)} />}

        {/* Search bar */}
        <div className="relative max-w-md mt-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint dark:text-plate-ink-faint" size={17} strokeWidth={1.8} />
          <input
            type="text"
            placeholder="Search cases, clients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="focus-ring w-full pl-11 pr-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 focus:border-edamame-500 dark:focus:border-edamame-500 rounded-xl text-ink dark:text-plate-ink placeholder-ink-soft/50 dark:placeholder-plate-ink-soft/50 outline-none transition-colors text-[13px]"
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
                  : 'border-ink/15 dark:border-plate-ink/20 bg-paper dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft hover:border-edamame-500'
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-[12px] text-ink-faint dark:text-plate-ink-faint whitespace-nowrap">
            {filteredRows.length} {filteredRows.length === 1 ? 'case' : 'cases'}
            {searchTerm && <span className="ml-1 italic">matching "{searchTerm}"</span>}
          </span>
        </div>

        {/* Cases list */}
        {filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-full bg-paper-2 dark:bg-plate-card flex items-center justify-center mb-4">
              <FileText size={32} className="text-ink-soft/40 dark:text-plate-ink-soft/40" strokeWidth={1.8} />
            </div>
            <h3 className="text-base font-bold text-ink dark:text-plate-ink mb-1">No cases found</h3>
            <p className="text-ink-soft dark:text-plate-ink-soft text-sm">Try adjusting your search or filters, or create a new case</p>
          </div>
        ) : (
          <div className="bg-paper-2/70 dark:bg-plate-card border border-ink/10 dark:border-plate-ink/15 rounded-xl overflow-hidden mt-4">
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
                  className="table-row-hover hover:bg-paper-2 dark:hover:bg-plate/60 relative flex items-center gap-4 px-5 pl-6 py-[15px] border-b border-ink/10 dark:border-plate-ink/15 last:border-b-0"
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
                      <span className="text-sm font-bold tracking-[-0.015em] text-ink dark:text-plate-ink whitespace-nowrap overflow-hidden text-ellipsis">
                        {c.title}
                      </span>
                      {r.template?.visaSubclass && (
                        <span className="font-mono text-[9.5px] font-medium px-[7px] py-0.5 rounded-md bg-edamame-500/10 text-edamame-700 dark:text-edamame-400 flex-shrink-0">
                          SC-{r.template.visaSubclass}
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-ink-faint dark:text-plate-ink-faint mt-[3px] whitespace-nowrap overflow-hidden text-ellipsis">
                      {client?.name || 'Unknown'} &middot; DOB {client?.dob || 'N/A'} &middot; <span className="font-mono">{ref}</span>
                    </div>
                  </div>

                  {/* Next task */}
                  <div className="hidden min-[1021px]:block flex-1 min-w-0">
                    {r.nextTask ? (
                      <>
                        <div className="text-[9px] font-bold tracking-[0.11em] uppercase text-ink-faint dark:text-plate-ink-faint">
                          Next task
                        </div>
                        <div className="text-xs font-semibold mt-1 text-ink dark:text-plate-ink whitespace-nowrap overflow-hidden text-ellipsis">
                          {r.nextTask.title}
                        </div>
                        <div
                          className={`font-mono text-[11px] font-medium mt-0.5 ${
                            r.isNextOverdue ? 'text-red-600 dark:text-red-400' : 'text-ink-soft dark:text-plate-ink-soft'
                          }`}
                        >
                          Due {format(new Date(r.nextTask.date), 'MMM d')}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-ink-soft/40 dark:text-plate-ink-soft/40">
                        <Calendar size={13} strokeWidth={1.8} />
                        No pending tasks
                      </div>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="w-[112px] flex-shrink-0">
                    <div className="font-mono flex justify-between text-[10.5px] text-ink-faint dark:text-plate-ink-faint">
                      <span className="font-medium text-ink dark:text-plate-ink">{r.progress}%</span>
                      <span>{r.completedTasks}/{r.totalTasks}</span>
                    </div>
                    <div className="h-[5px] rounded-full bg-paper-2 dark:bg-plate overflow-hidden mt-[5px]">
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
                        className="w-6 h-6 rounded-full border border-dashed border-ink/20 dark:border-plate-ink/25 text-ink-faint dark:text-plate-ink-faint hover:border-edamame-500 hover:text-edamame-500 flex items-center justify-center flex-shrink-0 transition-colors"
                      >
                        <UserPlus size={12} strokeWidth={1.8} />
                      </button>
                    )
                  )}

                  <ChevronRight size={18} strokeWidth={1.8} className="text-ink-soft/40 dark:text-plate-ink-soft/40 flex-shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {assignModalCaseId && onAssignCase && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4 z-50 modal-backdrop">
          <div className="bg-paper dark:bg-plate-card rounded-2xl shadow-2xl max-w-md w-full modal-content">
            <div className="flex items-center justify-between p-6 border-b border-ink/10 dark:border-plate-ink/15">
              <h2 className="font-serif text-xl font-semibold text-ink dark:text-plate-ink">Assign Case</h2>
              <button
                onClick={() => setAssignModalCaseId(null)}
                className="p-1 hover:bg-ink/8 dark:hover:bg-plate-ink/10 rounded-lg text-ink-soft dark:text-plate-ink-soft"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              {teamMembers.length === 0 && (
                <p className="text-sm text-ink-soft dark:text-plate-ink-soft">No team members yet. Add some in Team Members.</p>
              )}
              {teamMembers.map(m => (
                <button
                  key={m.id}
                  onClick={() => setAssignTarget(m.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                    assignTarget === m.id
                      ? 'border-edamame-500 bg-edamame-50 dark:bg-edamame-900/20 ring-2 ring-edamame-500/20'
                      : 'border-ink/15 dark:border-plate-ink/20 hover:border-ink/25 dark:hover:border-plate-ink/30'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-edamame-400 to-edamame-600 text-white flex items-center justify-center font-bold">
                    {m.avatar || m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-semibold text-ink dark:text-plate-ink text-sm">{m.name}</p>
                    <p className="text-xs text-ink-soft dark:text-plate-ink-soft capitalize">{m.role}</p>
                  </div>
                </button>
              ))}
              <textarea
                value={assignNote}
                onChange={e => setAssignNote(e.target.value)}
                placeholder="Reassignment note (optional)..."
                rows={2}
                className="w-full px-4 py-2 rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper dark:bg-plate text-ink dark:text-plate-ink outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all resize-none text-sm"
              />
            </div>
            <div className="flex items-center gap-3 p-6 border-t border-ink/10 dark:border-plate-ink/15">
              <button
                onClick={() => setAssignModalCaseId(null)}
                className="px-4 py-2 text-sm font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-ink/8 dark:hover:bg-plate-ink/10 rounded-lg transition-colors"
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
                className="ml-auto px-4 py-2 text-sm font-semibold text-white bg-edamame-500 hover:bg-edamame-600 disabled:bg-ink/20 dark:disabled:bg-plate-ink/20 disabled:cursor-not-allowed rounded-lg transition-colors"
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
