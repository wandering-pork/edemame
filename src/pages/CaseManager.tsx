import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Case, Client, Task, WorkflowTemplate, TeamMember, DocumentChecklistItem, Deadline } from '../types';
import { Search, Plus, FileText, ChevronRight, Calendar, UserPlus, AlertTriangle, Users, MoreHorizontal, Copy, Trash2, Check, X, ArrowUpRight, Minus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { NewCase } from './NewCase';
import { isTaskClosed } from '../lib/taskStatus';
import { CASE_STAGE_LABELS, CASE_STAGE_STEPPER, CASE_STAGE_GROUP_LABELS, caseStageGroup, CaseStageGroup } from '../lib/caseStage';
import { computeCaseRisk } from '../lib/risk';
import { useRepositories } from '../contexts/RepositoryContext';
import { useFirm } from '../contexts/FirmContext';
import { AssignCaseDialog } from '../components/AssignCaseDialog';
import { canDeleteFirmData } from '../lib/firmDirectory';
import { duplicateCase } from '../lib/duplicateCase';
import { toggleSelection, pruneSelection, toggleAll } from '../lib/caseSelection';
import { toLocalISODate } from '../lib/dates';
import { subclassChip, subclassOptions, substreamsFor, NOT_CONFIRMED_LABEL } from '../lib/visaTypes';
import { useVisaConfig } from '../contexts/VisaConfigContext';
import { buildCasePhaseView, phaseProgressSegments, phaseRef } from '../lib/phaseGrouping';
import { visibleCasePhases } from '../lib/casePhases';
import { NO_SUBCLASS_FILTER, effectiveSubclass, matchesVisaFilter, phaseAheadOfStage } from '../lib/caseListFilters';
import { NOT_CONFIRMED_SUBCLASS } from '../types';
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
  /** Bulk assign from the multi-select bar. */
  onAssignCases?: (caseIds: string[], newOwnerId: string, note?: string) => Promise<void>;
  /** Deletes cases with their tasks and deadlines (owners/admins only in a firm). */
  onDeleteCases?: (caseIds: string[]) => Promise<void>;
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
  onAssignCases,
  onDeleteCases,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const repos = useRepositories();
  const [showIntake, setShowIntake] = useState(false);
  const [suggestedTemplateKeyword, setSuggestedTemplateKeyword] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [visaFilter, setVisaFilter] = useState<{ subclass: string; substream: string }>({ subclass: '', substream: '' });
  const [phaseFilter, setPhaseFilter] = useState('');
  const { visaTypes, casePhases } = useVisaConfig();
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const [assignModalCaseId, setAssignModalCaseId] = useState<string | null>(null);
  // At Risk rule 3 only applies to cases at ready_to_lodge — checklists are
  // fetched just for those (few of them), per lib/risk.ts's doc comment.
  const [checklistsByCase, setChecklistsByCase] = useState<Record<string, DocumentChecklistItem[]>>({});
  // Step 1 · 1G.6: a case owner who's disabled or was removed no longer
  // shows up in `teamMembers` (active only) — fall back to their name for
  // display so the row doesn't wrongly offer "Assign" on an already-owned case.
  const { memberNameFor, role } = useFirm();
  // RLS is the real enforcement; this only hides Delete for a role the
  // database would reject. Local mode (role null) is single-user: allowed.
  const canDelete = !!onDeleteCases && canDeleteFirmData(role);

  // ---- List management: row menu, multi-select, duplicate, delete ----
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorIdRef = useRef<string | null>(null);
  const [menuCaseId, setMenuCaseId] = useState<string | null>(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);

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
  }, [scopedCases, clients, searchTerm]);

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
      const subclass = effectiveSubclass(c, template?.visaSubclass);
      const phaseView = buildCasePhaseView(caseTasks, casePhases, template?.steps, subclass);
      const phaseAhead = phaseAheadOfStage(c.stage, phaseView.currentPhaseRef, phaseView.hasPhases);
      return { case: c, client, applicant, template, owner, ownerName, group, risk, subclass, phaseView, phaseAhead, ...rowStatus };
    });
  }, [searchedCases, clients, tasks, templates, teamMembers, deadlines, checklistsByCase, memberNameFor, casePhases]);

  const filterCounts = useMemo(() => {
    const counts: Record<GroupFilter, number> = { all: rows.length, pre_lodgement: 0, with_department: 0, closed: 0 };
    rows.forEach(r => { counts[r.group]++; });
    return counts;
  }, [rows]);

  const atRiskCount = useMemo(() => rows.filter(r => r.risk.atRisk).length, [rows]);

  const filteredRows = useMemo(() => {
    let list = groupFilter === 'all' ? rows : rows.filter(r => r.group === groupFilter);
    if (atRiskOnly) list = list.filter(r => r.risk.atRisk);
    if (visaFilter.subclass) list = list.filter(r => matchesVisaFilter(r.subclass, r.case.visaSubstream, visaFilter));
    if (phaseFilter) list = list.filter(r => r.phaseView.hasPhases && r.phaseView.currentTask && r.phaseView.currentPhaseRef === phaseFilter);
    return list;
  }, [rows, groupFilter, atRiskOnly, visaFilter, phaseFilter]);

  const visibleIds = useMemo(() => filteredRows.map(r => r.case.id), [filteredRows]);
  // Never act on a case the user can't see: drop selected rows that a filter
  // or a delete has hidden.
  useEffect(() => {
    setSelected(prev => pruneSelection(prev, visibleIds));
  }, [visibleIds]);
  const selecting = selected.size > 0;
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));

  const handleToggleRow = (id: string, range: boolean) => {
    setSelected(prev => toggleSelection(prev, visibleIds, id, anchorIdRef.current, range));
    anchorIdRef.current = id;
  };
  const clearSelection = () => { setSelected(new Set()); anchorIdRef.current = null; };

  // Esc clears the selection (when no dialog or menu is open).
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !menuCaseId && !bulkAssignOpen && !deleteIds) clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting, menuCaseId, bulkAssignOpen, deleteIds]);

  const handleDuplicate = (caseId: string) => {
    const source = cases.find(c => c.id === caseId);
    if (!source) return;
    const { newCase, newTasks } = duplicateCase(source, tasks, {
      today: toLocalISODate(),
      now: new Date().toISOString(),
      newId: uuidv4,
    });
    onTasksConfirmed(newTasks, newCase);
  };

  const confirmDelete = async () => {
    if (!deleteIds || !onDeleteCases) return;
    setDeleting(true);
    try {
      await onDeleteCases(deleteIds);
      setSelected(prev => new Set([...prev].filter(id => !deleteIds.includes(id))));
    } finally {
      setDeleting(false);
      setDeleteIds(null);
    }
  };

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

  const selectedCases = cases.filter(c => selected.has(c.id));
  const menuItemCls = 'w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-[12.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-paper dark:hover:bg-plate transition-colors';

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
              onClick={() => setShowIntake(true)}
              className="btn-press focus-ring flex items-center justify-center gap-1.5 bg-edamame-500 hover:bg-edamame-700 text-white px-4 py-2.5 rounded-xl font-bold transition-colors text-[13px] whitespace-nowrap"
            >
              <Plus size={17} strokeWidth={1.8} />
              New Case
            </button>
          </div>
        </div>


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
          {/* Visa type + Phase filters (Work Plans step 4) — overlay the group chips */}
          <label htmlFor="cm-visa-filter" className="sr-only">Filter by visa type</label>
          <select
            id="cm-visa-filter"
            value={visaFilter.subclass}
            onChange={e => setVisaFilter({ subclass: e.target.value, substream: '' })}
            className={`focus-ring px-3 py-1.5 rounded-full border text-[12px] font-semibold bg-paper dark:bg-plate-card outline-none ${
              visaFilter.subclass ? 'border-edamame-500 text-edamame-700 dark:text-edamame-400' : 'border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft'
            }`}
          >
            <option value="">All visas</option>
            <option value={NOT_CONFIRMED_SUBCLASS}>{NOT_CONFIRMED_LABEL}</option>
            <option value={NO_SUBCLASS_FILTER}>No subclass</option>
            {subclassOptions(visaTypes).map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
          {substreamsFor(visaTypes, visaFilter.subclass).length > 0 && (
            <>
              <label htmlFor="cm-substream-filter" className="sr-only">Filter by substream</label>
              <select
                id="cm-substream-filter"
                value={visaFilter.substream}
                onChange={e => setVisaFilter({ ...visaFilter, substream: e.target.value })}
                className={`focus-ring px-3 py-1.5 rounded-full border text-[12px] font-semibold bg-paper dark:bg-plate-card outline-none ${
                  visaFilter.substream ? 'border-edamame-500 text-edamame-700 dark:text-edamame-400' : 'border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft'
                }`}
              >
                <option value="">All substreams</option>
                {substreamsFor(visaTypes, visaFilter.subclass).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </>
          )}
          <label htmlFor="cm-phase-filter" className="sr-only">Filter by current phase</label>
          <select
            id="cm-phase-filter"
            value={phaseFilter}
            onChange={e => setPhaseFilter(e.target.value)}
            className={`focus-ring px-3 py-1.5 rounded-full border text-[12px] font-semibold bg-paper dark:bg-plate-card outline-none ${
              phaseFilter ? 'border-edamame-500 text-edamame-700 dark:text-edamame-400' : 'border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft'
            }`}
          >
            <option value="">Any phase</option>
            {visibleCasePhases(casePhases).map(p => <option key={p.id} value={phaseRef(p)}>In {p.name}</option>)}
          </select>
          <span className="ml-auto inline-flex items-center gap-2 text-[12px] text-ink-faint dark:text-plate-ink-faint whitespace-nowrap">
            {filteredRows.length > 0 && (
              <button
                type="button"
                role="checkbox"
                aria-checked={allVisibleSelected ? 'true' : selecting ? 'mixed' : 'false'}
                aria-label={allVisibleSelected ? 'Clear selection' : `Select all ${filteredRows.length} cases`}
                title={allVisibleSelected ? 'Clear selection' : 'Select all'}
                onClick={() => { setSelected(prev => toggleAll(prev, visibleIds)); anchorIdRef.current = null; }}
                className={`focus-ring w-4 h-4 rounded-[5px] border flex items-center justify-center transition-colors ${
                  selecting ? 'bg-edamame-500 border-edamame-500 text-white' : 'border-ink/25 dark:border-plate-ink/30 hover:border-edamame-500'
                }`}
              >
                {allVisibleSelected ? <Check size={11} strokeWidth={3} /> : selecting ? <Minus size={11} strokeWidth={3} /> : null}
              </button>
            )}
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
              const isSelected = selected.has(c.id);

              return (
                <div
                  key={c.id}
                  onClick={(e) => {
                    // While selecting, a click on the row toggles it (Gmail-style)
                    // instead of opening the case; the chevron still opens it.
                    if (selecting) handleToggleRow(c.id, e.shiftKey);
                    else handleViewDetails(c.id);
                  }}
                  aria-selected={selecting ? isSelected : undefined}
                  className={`group table-row-hover relative flex items-center gap-4 px-5 pl-6 py-[15px] border-b border-ink/10 dark:border-plate-ink/15 last:border-b-0 ${
                    isSelected ? 'bg-edamame-500/[0.07] dark:bg-edamame-500/10' : 'hover:bg-paper-2 dark:hover:bg-plate/60'
                  }`}
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

                  {/* Avatar; turns into a checkbox on hover/focus, and stays one while selecting */}
                  <div className="relative w-[34px] h-[34px] flex-shrink-0">
                    <div
                      aria-hidden="true"
                      className={`absolute inset-0 rounded-full flex items-center justify-center text-[11px] font-bold transition-opacity ${
                        selecting ? 'opacity-0' : 'group-hover:opacity-0 group-focus-within:opacity-0'
                      }`}
                      style={{
                        background: `oklch(0.93 0.05 ${hue})`,
                        color: `oklch(0.42 0.12 ${hue})`,
                      }}
                    >
                      {initialsOf(client?.name || 'Unknown')}
                    </div>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={`Select ${c.title}`}
                      onClick={(e) => { e.stopPropagation(); handleToggleRow(c.id, e.shiftKey); }}
                      className={`focus-ring absolute inset-0 m-auto w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center transition-opacity ${
                        isSelected
                          ? 'bg-edamame-500 border-edamame-500 text-white opacity-100'
                          : `border-ink/30 dark:border-plate-ink/35 bg-paper-2 dark:bg-plate-card hover:border-edamame-500 ${selecting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`
                      }`}
                    >
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </button>
                  </div>

                  {/* Case type + client info */}
                  <div className="flex-[1.6] min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tracking-[-0.015em] text-ink dark:text-plate-ink whitespace-nowrap overflow-hidden text-ellipsis">
                        {c.title}
                      </span>
                      {r.subclass && (
                        <span
                          title={c.visaSubstream || undefined}
                          className="font-mono text-[9.5px] font-medium px-[7px] py-0.5 rounded-md bg-edamame-500/10 text-edamame-700 dark:text-edamame-400 flex-shrink-0"
                        >
                          {subclassChip(r.subclass)}
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
                  <div className="hidden sm:flex flex-col gap-1.5 w-[150px] flex-shrink-0">
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
                    {r.phaseView.hasPhases && r.phaseView.groups.length > 0 ? (
                      <>
                        {/* Phase progress — one segment per non-empty phase, sized by its task count */}
                        <div
                          className="flex items-center gap-[2px]"
                          role="img"
                          tabIndex={0}
                          aria-label={`Phases: ${phaseProgressSegments(r.phaseView).map(s => `${s.name} ${s.done} of ${s.total} done`).join(', ')}`}
                          title={phaseProgressSegments(r.phaseView).map(s => `${s.name}: ${s.done}/${s.total}${s.current ? ' (current)' : ''}`).join('\n')}
                        >
                          {phaseProgressSegments(r.phaseView).map(s => (
                            <span
                              key={s.ref}
                              style={{ flexGrow: s.total }}
                              className={`relative h-1 basis-0 rounded-full overflow-hidden bg-ink/10 dark:bg-plate-ink/15 ${s.current ? 'ring-1 ring-edamame-500/50' : ''}`}
                            >
                              <span className="absolute inset-y-0 left-0 bg-edamame-500/80" style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }} />
                            </span>
                          ))}
                        </div>
                        <span className="text-[10px] text-ink-faint dark:text-plate-ink-faint truncate">
                          <span className="font-semibold text-ink-soft dark:text-plate-ink-soft">{r.phaseView.currentPhaseName}</span>
                          {' · '}<span className="font-mono">{r.completedTasks}/{r.totalTasks}</span>
                        </span>
                        {r.phaseAhead && (
                          <span
                            tabIndex={0}
                            title="The tasks have reached a post-lodgement phase but the case stage is still before lodgement. Update the stage on the case if it has been lodged."
                            className="focus-ring text-[9.5px] font-bold text-amber-700 dark:text-amber-400 rounded"
                          >
                            Phase is ahead of stage
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[10px] text-ink-faint dark:text-plate-ink-faint font-mono">
                        Tasks {r.completedTasks}/{r.totalTasks}
                      </span>
                    )}
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

                  {/* Row menu: Open, Assign, Duplicate, Delete */}
                  <div className="relative flex-shrink-0">
                    <button
                      type="button"
                      aria-label={`More actions for ${c.title}`}
                      aria-haspopup="menu"
                      aria-expanded={menuCaseId === c.id}
                      onClick={(e) => { e.stopPropagation(); setMenuCaseId(id => (id === c.id ? null : c.id)); }}
                      className={`focus-ring w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint dark:text-plate-ink-faint hover:bg-ink/[0.06] dark:hover:bg-plate-ink/10 hover:text-ink dark:hover:text-plate-ink transition-opacity ${
                        menuCaseId === c.id ? 'opacity-100 bg-ink/[0.06] dark:bg-plate-ink/10' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                      }`}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {menuCaseId === c.id && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setMenuCaseId(null); }} />
                        <div
                          role="menu"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => { if (e.key === 'Escape') setMenuCaseId(null); }}
                          className="absolute right-0 top-full mt-1 z-40 w-48 bg-paper-2 dark:bg-plate-card rounded-xl shadow-xl border border-ink/10 dark:border-plate-ink/15 p-1 modal-content"
                        >
                          <button role="menuitem" autoFocus onClick={() => { setMenuCaseId(null); handleViewDetails(c.id); }} className={menuItemCls}>
                            <ArrowUpRight size={14} /> Open case
                          </button>
                          {onAssignCase && (
                            <button role="menuitem" onClick={() => { setMenuCaseId(null); setAssignModalCaseId(c.id); }} className={menuItemCls}>
                              <UserPlus size={14} /> Assign…
                            </button>
                          )}
                          <button
                            role="menuitem"
                            title="New Draft case for the same client, with the same work plan and tasks (not started, dated from today)"
                            onClick={() => { setMenuCaseId(null); handleDuplicate(c.id); }}
                            className={menuItemCls}
                          >
                            <Copy size={14} /> Duplicate
                          </button>
                          {canDelete && (
                            <>
                              <div className="h-px bg-ink/10 dark:bg-plate-ink/15 my-1" />
                              <button
                                role="menuitem"
                                onClick={() => { setMenuCaseId(null); setDeleteIds([c.id]); }}
                                className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-[12.5px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              >
                                <Trash2 size={14} /> Delete…
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    aria-label={`Open ${c.title}`}
                    tabIndex={-1}
                    onClick={(e) => { e.stopPropagation(); handleViewDetails(c.id); }}
                    className="flex-shrink-0 text-ink-soft/40 dark:text-plate-ink-soft/40 hover:text-edamame-600"
                  >
                    <ChevronRight size={18} strokeWidth={1.8} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bulk action bar: floats at the bottom of the list while rows are selected */}
      {selecting && (
        <div className="sticky bottom-5 z-20 mt-4 flex justify-center pointer-events-none">
          <div
            role="toolbar"
            aria-label={`${selected.size} selected`}
            className="edie-tip-in pointer-events-auto flex items-center gap-1.5 pl-4 pr-2 py-2 rounded-full bg-ink dark:bg-plate-card text-plate-ink dark:text-plate-ink shadow-xl border border-plate-ink/10"
          >
            <span className="text-[12.5px] font-bold whitespace-nowrap pr-2">{selected.size} selected</span>
            {!allVisibleSelected && (
              <button
                type="button"
                onClick={() => setSelected(new Set(visibleIds))}
                className="px-2.5 py-1.5 rounded-full text-[12px] font-semibold text-plate-ink/70 hover:text-plate-ink hover:bg-plate-ink/10 whitespace-nowrap transition-colors"
              >
                Select all {visibleIds.length}
              </button>
            )}
            <span aria-hidden="true" className="w-px h-5 bg-plate-ink/15 mx-1" />
            {onAssignCases && (
              <button
                type="button"
                onClick={() => setBulkAssignOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold hover:bg-plate-ink/10 whitespace-nowrap transition-colors"
              >
                <UserPlus size={13} /> Assign
              </button>
            )}
            {selected.size === 1 && (
              <button
                type="button"
                onClick={() => { handleDuplicate([...selected][0]); clearSelection(); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold hover:bg-plate-ink/10 whitespace-nowrap transition-colors"
              >
                <Copy size={13} /> Duplicate
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => setDeleteIds([...selected])}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold text-red-300 hover:bg-red-500/15 whitespace-nowrap transition-colors"
              >
                <Trash2 size={13} /> Delete
              </button>
            )}
            <button
              type="button"
              onClick={clearSelection}
              aria-label="Clear selection (Esc)"
              title="Clear selection (Esc)"
              className="w-7 h-7 rounded-full flex items-center justify-center text-plate-ink/70 hover:text-plate-ink hover:bg-plate-ink/10 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {bulkAssignOpen && onAssignCases && selectedCases.length > 0 && (
        <AssignCaseDialog
          caseItem={selectedCases[0]}
          selection={selectedCases}
          teamMembers={teamMembers}
          cases={cases}
          tasks={tasks}
          currentUserId={currentUserId}
          onClose={() => setBulkAssignOpen(false)}
          onConfirm={(caseId, newOwnerId, note) => {
            void onAssignCases([caseId], newOwnerId, note);
            setBulkAssignOpen(false);
            clearSelection();
          }}
          onConfirmBulk={(caseIds, newOwnerId, note) => {
            void onAssignCases(caseIds, newOwnerId, note);
            setBulkAssignOpen(false);
            clearSelection();
          }}
        />
      )}

      {/* Delete confirmation (one case from the row menu, or the selection) */}
      {deleteIds && (() => {
        const doomed = cases.filter(c => deleteIds.includes(c.id));
        const taskCount = tasks.filter(t => t.caseId && deleteIds.includes(t.caseId)).length;
        return (
          <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4 z-50 modal-backdrop" onClick={() => !deleting && setDeleteIds(null)}>
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="cm-delete-title"
              onClick={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === 'Escape' && !deleting) setDeleteIds(null); }}
              className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl max-w-md w-full modal-content p-6"
            >
              <h2 id="cm-delete-title" className="text-lg font-bold text-ink dark:text-plate-ink">
                {doomed.length === 1 ? 'Delete this case?' : `Delete ${doomed.length} cases?`}
              </h2>
              {doomed.length === 1 ? (
                <p className="mt-1 text-[13px] font-semibold text-ink-soft dark:text-plate-ink-soft">{doomed[0].title}</p>
              ) : (
                <ul className="mt-2 max-h-32 overflow-y-auto custom-scrollbar text-[12.5px] text-ink-soft dark:text-plate-ink-soft space-y-0.5">
                  {doomed.map(c => <li key={c.id} className="truncate">{c.title}</li>)}
                </ul>
              )}
              <p className="mt-3 text-[13px] text-ink-soft dark:text-plate-ink-soft leading-relaxed">
                {taskCount > 0 ? `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'} and any deadlines on ${doomed.length === 1 ? 'it' : 'them'} are deleted too. ` : ''}
                This can't be undone.
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  autoFocus
                  disabled={deleting}
                  onClick={() => setDeleteIds(null)}
                  className="px-4 py-2 text-sm font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-paper dark:hover:bg-plate rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={confirmDelete}
                  className="btn-press px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {deleting ? 'Deleting…' : doomed.length === 1 ? 'Delete case' : `Delete ${doomed.length} cases`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
