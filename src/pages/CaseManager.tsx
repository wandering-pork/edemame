import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Case, Client, Task, WorkflowTemplate, TeamMember, DocumentChecklistItem, Deadline } from '../types';
import { Search, Plus, FileText, ChevronRight, Calendar, UserPlus, Settings2, AlertTriangle, Users } from 'lucide-react';
import { format } from 'date-fns';
import { NewCase } from './NewCase';
import { ConfigurationsPanel } from '../components/case-manager/ConfigurationsPanel';
import { isTaskClosed } from '../lib/taskStatus';
import { CASE_STAGE_LABELS, CASE_STAGE_STEPPER, CASE_STAGE_GROUP_LABELS, caseStageGroup, CaseStageGroup } from '../lib/caseStage';
import { computeCaseRisk } from '../lib/risk';
import { useRepositories } from '../contexts/RepositoryContext';
import { useFirm } from '../contexts/FirmContext';
import { AssignCaseDialog } from '../components/AssignCaseDialog';
import {
  CaseOwnerScope, filterCasesByOwnerScope, defaultCaseOwnerScope, loadCaseOwnerScope, saveCaseOwnerScope,
} from '../lib/caseManagerScope';

interface CaseManagerProps {
  cases: Case[];
  clients: Client[];
  tasks: Task[];
  templates: WorkflowTemplate[];
  teamMembers?: TeamMember[];
  deadlines?: Deadline[];
  /** Cloud mode only — drives the "My cases / All cases" toggle's default and visibility. Local mode is always single-user, so the toggle is hidden. */
  storageMode?: 'local' | 'cloud';
  currentUserId?: string;
  onTasksConfirmed: (tasks: Task[], newCase: Case) => void;
  onAssignCase?: (caseId: string, newOwnerId: string, note?: string) => void;
}

type GroupFilter = 'all' | CaseStageGroup;

const GROUP_FILTERS: { key: GroupFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pre_lodgement', label: CASE_STAGE_GROUP_LABELS.pre_lodgement },
  { key: 'with_department', label: CASE_STAGE_GROUP_LABELS.with_department },
  { key: 'closed', label: CASE_STAGE_GROUP_LABELS.closed },
];

const GROUP_STYLES: Record<CaseStageGroup, { dot: string; bg: string; text: string }> = {
  pre_lodgement: {
    dot: '#F59E0B',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-[#B45309] dark:text-[#FBBF24]',
  },
  with_department: {
    dot: '#8B5CF6',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    text: 'text-[#6D28D9] dark:text-[#C4B5FD]',
  },
  closed: {
    dot: '#94A3B8',
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-300',
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
  progress: number;
  completedTasks: number;
  totalTasks: number;
  nextTask?: Task;
  isNextOverdue: boolean;
}

const computeRowStatus = (caseTasks: Task[]): RowStatus => {
  const completedTasks = caseTasks.filter(isTaskClosed).length;
  const totalTasks = caseTasks.length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const pending = caseTasks
    .filter(t => !isTaskClosed(t))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const nextTask = pending[0];
  const isNextOverdue = !!nextTask && new Date(nextTask.date) < new Date();

  return { progress, completedTasks, totalTasks, nextTask, isNextOverdue };
};

export const CaseManager: React.FC<CaseManagerProps> = ({
  cases,
  clients,
  tasks,
  templates,
  teamMembers = [],
  deadlines = [],
  storageMode = 'local',
  currentUserId,
  onTasksConfirmed,
  onAssignCase,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const repos = useRepositories();
  const [showIntake, setShowIntake] = useState(false);
  const [showConfigurations, setShowConfigurations] = useState(false);
  const [suggestedTemplateKeyword, setSuggestedTemplateKeyword] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const [assignModalCaseId, setAssignModalCaseId] = useState<string | null>(null);
  // At Risk rule 3 only applies to cases at ready_to_lodge — checklists are
  // fetched just for those (few of them), per lib/risk.ts's doc comment.
  const [checklistsByCase, setChecklistsByCase] = useState<Record<string, DocumentChecklistItem[]>>({});
  // Step 1 · 1G.6: a case owner who's disabled or was removed no longer
  // shows up in `teamMembers` (active only) — fall back to their name for
  // display so the row doesn't wrongly offer "Assign" on an already-owned case.
  const { memberNameFor, role } = useFirm();

  // Step 1 · 1G.7 — "My cases / All cases" toggle, cloud mode only. Default:
  // All for owners/admins, Mine for plain Members; remembered for the
  // browser session via sessionStorage once the agent picks one explicitly.
  const [ownerScope, setOwnerScope] = useState<CaseOwnerScope>(
    () => loadCaseOwnerScope() ?? defaultCaseOwnerScope(role),
  );
  const handleSetOwnerScope = (scope: CaseOwnerScope) => {
    setOwnerScope(scope);
    saveCaseOwnerScope(scope);
  };
  // `role` resolves asynchronously (FirmContext loads after mount) — once it
  // does, and the agent hasn't already picked a scope this session, re-apply
  // the role-based default rather than sticking with the pre-role guess.
  useEffect(() => {
    if (loadCaseOwnerScope() !== null) return;
    setOwnerScope(defaultCaseOwnerScope(role));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

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

  useEffect(() => {
    const readyToLodgeIds = cases.filter(c => c.stage === 'ready_to_lodge').map(c => c.id);
    if (readyToLodgeIds.length === 0) return;
    let cancelled = false;
    Promise.all(readyToLodgeIds.map(id => repos.checklist.getByCaseId(id).then(items => [id, items] as const)))
      .then(entries => {
        if (cancelled) return;
        setChecklistsByCase(prev => ({ ...prev, ...Object.fromEntries(entries) }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [cases, repos.checklist]);

  const handleViewDetails = (caseId: string) => {
    navigate(`/cases/${caseId}`);
  };

  const scopedCases = useMemo(
    () => (storageMode === 'cloud' ? filterCasesByOwnerScope(cases, ownerScope, currentUserId) : cases),
    [cases, storageMode, ownerScope, currentUserId],
  );

  const searchedCases = useMemo(() => {
    return scopedCases.filter(c => {
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
      // Step 1 · 1G.6: the case still has an owner even once they're
      // disabled/removed — show their name (rather than offering "Assign"
      // as if the case were unowned) when we can't find them in the active list.
      const ownerName = owner ? null : (c.caseOwner ? memberNameFor(c.caseOwner) : null);
      const rowStatus = computeRowStatus(caseTasks);
      const group = caseStageGroup(c.stage);
      const risk = computeCaseRisk(c, tasks, deadlines, checklistsByCase[c.id], new Date(), template?.steps);
      return { case: c, client, applicant, template, owner, ownerName, group, risk, ...rowStatus };
    });
  }, [searchedCases, clients, tasks, templates, teamMembers, deadlines, checklistsByCase, memberNameFor]);

  const filterCounts = useMemo(() => {
    const counts: Record<GroupFilter, number> = { all: rows.length, pre_lodgement: 0, with_department: 0, closed: 0 };
    rows.forEach(r => { counts[r.group]++; });
    return counts;
  }, [rows]);

  const atRiskCount = useMemo(() => rows.filter(r => r.risk.atRisk).length, [rows]);

  const filteredRows = useMemo(() => {
    let list = groupFilter === 'all' ? rows : rows.filter(r => r.group === groupFilter);
    if (atRiskOnly) list = list.filter(r => r.risk.atRisk);
    return list;
  }, [rows, groupFilter, atRiskOnly]);

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
            {storageMode === 'cloud' && (
              <div className="flex gap-0.5 p-[3px] bg-paper-2 dark:bg-plate rounded-[9px]" role="group" aria-label="Case ownership scope">
                <button
                  onClick={() => handleSetOwnerScope('mine')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-xs font-semibold transition-all ${
                    ownerScope === 'mine'
                      ? 'bg-paper dark:bg-plate-card text-ink dark:text-plate-ink'
                      : 'text-ink-soft dark:text-plate-ink-soft hover:text-ink dark:hover:text-plate-ink'
                  }`}
                >
                  My cases
                </button>
                <button
                  onClick={() => handleSetOwnerScope('all')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-xs font-semibold transition-all ${
                    ownerScope === 'all'
                      ? 'bg-paper dark:bg-plate-card text-ink dark:text-plate-ink'
                      : 'text-ink-soft dark:text-plate-ink-soft hover:text-ink dark:hover:text-plate-ink'
                  }`}
                >
                  <Users size={12} strokeWidth={2} className="inline -mt-0.5 mr-1" />
                  All cases
                </button>
              </div>
            )}
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
          {GROUP_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setGroupFilter(f.key)}
              className={`btn-press px-3.5 py-1.5 rounded-full border text-[12px] font-semibold transition-colors whitespace-nowrap ${
                groupFilter === f.key
                  ? 'border-edamame-500 bg-edamame-50 dark:bg-edamame-900/20 text-edamame-700 dark:text-edamame-400'
                  : 'border-ink/15 dark:border-plate-ink/20 bg-paper dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft hover:border-edamame-500'
              }`}
            >
              {f.label} {f.key !== 'all' && `(${filterCounts[f.key]})`}
            </button>
          ))}
          {/* At Risk overlays any group filter rather than being one itself */}
          <button
            onClick={() => setAtRiskOnly(v => !v)}
            className={`btn-press inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-[12px] font-semibold transition-colors whitespace-nowrap ${
              atRiskOnly
                ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-[#B91C1C] dark:text-[#F87171]'
                : 'border-ink/15 dark:border-plate-ink/20 bg-paper dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft hover:border-red-400'
            }`}
          >
            <AlertTriangle size={12} strokeWidth={2} />
            At Risk ({atRiskCount})
          </button>
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
              const groupStyle = GROUP_STYLES[r.group];
              const ref = `#${c.id.slice(0, 8).toUpperCase()}`;
              const stepperIndex = CASE_STAGE_STEPPER.indexOf(c.stage === 'info_requested' ? 'lodged' : c.stage);

              return (
                <div
                  key={c.id}
                  onClick={() => handleViewDetails(c.id)}
                  className="table-row-hover hover:bg-paper-2 dark:hover:bg-plate/60 relative flex items-center gap-4 px-5 pl-6 py-[15px] border-b border-ink/10 dark:border-plate-ink/15 last:border-b-0"
                >
                  {/* Left edge — red only for At Risk rows; otherwise transparent (the
                      stage itself is already shown by the stage chip's own dot+label
                      further along the row, so this border stays a single, unambiguous
                      signal rather than a second, unlabelled color code). */}
                  <div
                    className="absolute left-0 top-[10px] bottom-[10px] w-[3.5px] rounded-sm"
                    style={{ background: r.risk.atRisk ? '#EF4444' : 'transparent' }}
                    aria-hidden="true"
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
                  <div className="hidden min-[1021px]:block flex-1 min-w-[160px]">
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

                  {/* Stage stepper — compact dots along CASE_STAGE_STEPPER. Labelled as
                      the case's stage (not task progress) via role/aria-label on the
                      group and a per-dot title so hover/focus both explain it; the task
                      count below is explicitly prefixed "Tasks" so it never reads as
                      part of the stepper. */}
                  <div className="hidden sm:flex flex-col gap-1.5 w-[132px] flex-shrink-0">
                    <div
                      className="flex items-center gap-[3px]"
                      role="img"
                      tabIndex={0}
                      aria-label={`Stage: ${CASE_STAGE_LABELS[c.stage]} — step ${stepperIndex + 1} of ${CASE_STAGE_STEPPER.length}`}
                      title={`Stage: ${CASE_STAGE_LABELS[c.stage]} — step ${stepperIndex + 1} of ${CASE_STAGE_STEPPER.length}`}
                    >
                      {CASE_STAGE_STEPPER.map((s, i) => (
                        <span
                          key={s}
                          title={`${CASE_STAGE_LABELS[s]} — step ${i + 1} of ${CASE_STAGE_STEPPER.length}`}
                          className={`h-1.5 flex-1 rounded-full ${
                            i < stepperIndex ? 'bg-edamame-500' : i === stepperIndex ? 'bg-edamame-500' : 'bg-paper-2 dark:bg-plate'
                          } ${i === stepperIndex ? 'ring-2 ring-edamame-500/30' : ''}`}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-ink-faint dark:text-plate-ink-faint font-mono">
                      Tasks {r.completedTasks}/{r.totalTasks}
                    </span>
                  </div>

                  {/* Stage chip — fixed-width slot so rows align regardless of label length */}
                  <div className="w-[130px] flex-shrink-0">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2.5 py-[3px] rounded-md ${groupStyle.bg} ${groupStyle.text}`}
                    >
                      <span
                        className="badge-pulse w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: groupStyle.dot }}
                      />
                      <span className="whitespace-nowrap overflow-hidden text-ellipsis">{CASE_STAGE_LABELS[c.stage]}</span>
                    </span>
                  </div>

                  {/* At Risk badge — fixed-width slot (always rendered, empty when not at
                      risk) so the owner/chevron columns after it never shift row to row.
                      Reasons are visible on hover AND keyboard focus, not only a title
                      attribute, and the tooltip opens leftward/right-aligned to the badge
                      so it stays inside the card instead of being clipped by the right edge. */}
                  <div className="w-[80px] flex-shrink-0 flex justify-start">
                    {r.risk.atRisk && (
                      <span
                        tabIndex={0}
                        className="group/risk relative inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-[3px] rounded-md bg-red-50 dark:bg-red-900/20 text-[#B91C1C] dark:text-[#F87171] focus-ring outline-none"
                      >
                        <AlertTriangle size={11} strokeWidth={2.2} />
                        At Risk
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute right-0 left-auto top-full mt-1.5 z-20 w-56 max-w-[85vw] p-2.5 rounded-lg bg-ink dark:bg-plate-card border border-plate-ink/10 text-plate-ink dark:text-plate-ink text-[11px] font-normal leading-snug opacity-0 group-hover/risk:opacity-100 group-focus/risk:opacity-100 transition-opacity shadow-lg"
                        >
                          <ul className="list-disc pl-3.5 space-y-0.5">
                            {r.risk.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
                          </ul>
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Owner / assign */}
                  {r.owner ? (
                    <div
                      className="w-6 h-6 rounded-full bg-gradient-to-br from-edamame-400 to-edamame-600 text-white flex items-center justify-center text-[9.5px] font-bold flex-shrink-0"
                      title={`Owned by ${r.owner.name}`}
                    >
                      {r.owner.avatar || initialsOf(r.owner.name)}
                    </div>
                  ) : r.ownerName ? (
                    <div
                      className="w-6 h-6 rounded-full bg-ink/10 dark:bg-plate-ink/15 text-ink-faint dark:text-plate-ink-faint flex items-center justify-center text-[9.5px] font-bold flex-shrink-0"
                      title={`Owned by ${r.ownerName}`}
                    >
                      {initialsOf(r.ownerName)}
                    </div>
                  ) : (
                    onAssignCase && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAssignModalCaseId(c.id);
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

      {assignModalCaseId && onAssignCase && (() => {
        const assignCaseItem = cases.find(c => c.id === assignModalCaseId);
        if (!assignCaseItem) return null;
        return (
          <AssignCaseDialog
            caseItem={assignCaseItem}
            teamMembers={teamMembers}
            cases={cases}
            tasks={tasks}
            currentUserId={currentUserId}
            onClose={() => setAssignModalCaseId(null)}
            onConfirm={(caseId, newOwnerId, note) => {
              onAssignCase(caseId, newOwnerId, note);
              setAssignModalCaseId(null);
            }}
          />
        );
      })()}
    </div>
  );
};
