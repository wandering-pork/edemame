import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RepositoryProvider, useRepositories, useStorageMode } from './contexts/RepositoryContext';
import { DocumentTypeProvider } from './contexts/DocumentTypeContext';
import { Dashboard } from './pages/Dashboard';
import { CaseManager } from './pages/CaseManager';
import { CaseDetails } from './pages/CaseDetails';
import { Clients } from './pages/Clients';
import { VisaAdvisor } from './pages/VisaAdvisor';
import { openCaseFromAdvisor, OpenCaseParams, OpenCaseOutcome } from './lib/openCaseFromAdvisor';
import { generateTasksFromCase } from './services/geminiService';
import { Templates } from './pages/Templates';
import { Settings } from './pages/Settings';
import { TeamDashboard } from './pages/TeamDashboard';
import { TeamMembers } from './pages/TeamMembers';
import Onboarding from './pages/Onboarding';
import LandingPage from './pages/LandingPage';
import { Task, WorkflowTemplate, Theme, Client, Case, StorageMode, Notification, TeamMember, ActivityEvent, CaseAssignmentEvent, CaseNote, UsageEvent, Deadline } from './types';
import { seedDefaultTemplates } from './lib/seedData';
import { generateCaseNumber } from './lib/caseNumber';
import { toLocalISODate } from './lib/dates';
import { isTaskClosed, TASK_STATUS_LABELS } from './lib/taskStatus';
import { CASE_STAGE_LABELS } from './lib/caseStage';
import { allDeadlines } from './lib/deadlines';
import { knownAnchorsFromDeadlines, rescheduleCaseTasks } from './lib/tasksFromTemplate';
import { buildDeadlineAlerts } from './lib/deadlineAlerts';
import { initialsOfName } from './lib/firmDirectory';
import { SidebarProvider, useSidebar } from './contexts/SidebarContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProfileProvider, useProfile } from './contexts/ProfileContext';
import { LocalFolderProvider, useLocalFolder } from './contexts/LocalFolderContext';
import { FirmProvider, useFirm } from './contexts/FirmContext';
import { CreateFirmGate } from './components/CreateFirmGate';
import { InviteAccept } from './pages/InviteAccept';
import { ResetPassword } from './pages/ResetPassword';
import { LinkFolderGate } from './components/LinkFolderGate';
import { PendingInvitationsBanner } from './components/team/PendingInvitationsBanner';
import { isSupabaseConfigured, supabase } from './lib/supabaseClient';
import { shouldNotifyAssignment } from './lib/assignmentNotify';

// ---------------------------------------------------------------------------
// Inner app — has access to repositories and router
// ---------------------------------------------------------------------------

const AppShell: React.FC = () => {
  const repos = useRepositories();
  const storageMode = useStorageMode();
  const { collapsed } = useSidebar();
  const { user } = useAuth();
  const { profile, updateProfile } = useProfile();
  const { firm, teamMembers: firmTeamMembers, lostAccessNotice, dismissLostAccessNotice } = useFirm();
  // Safe: AppShell is only ever rendered inside ProtectedRoute, once a profile exists.
  const currentUserId = user!.id;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const theme: Theme = profile?.theme ?? 'classic';
  const [loading, setLoading] = useState(true);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [localTeamMembers, setLocalTeamMembers] = useState<TeamMember[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);

  // Cloud mode: team = the firm's real member directory (FirmContext), never
  // the team_members table. Local mode: team is just "you" — see
  // repos.teamMembers below, which is only read/written in local mode.
  const teamMembers = storageMode === 'cloud' ? firmTeamMembers : localTeamMembers;

  const pushActivity = useCallback(async (ev: Omit<ActivityEvent, 'id' | 'createdAt'> & { createdAt?: string }) => {
    const created = await repos.activity.create({
      ...ev,
      id: uuidv4(),
      createdAt: ev.createdAt || new Date().toISOString(),
    });
    setActivity(prev => [...prev, created]);
  }, [repos]);

  const pushUsageEvent = useCallback(async (ev: Omit<UsageEvent, 'id' | 'createdAt' | 'userId' | 'firmId'>) => {
    await repos.usage.create({ ...ev, id: uuidv4(), userId: currentUserId, firmId: firm?.id, createdAt: new Date().toISOString() });
  }, [repos, currentUserId, firm]);

  // Step 1 · 1G.7 — "assigned to you" notifications, cloud mode only (local
  // mode has no other firm members to notify). Fire-and-forget: never blocks
  // or rolls back the save that triggered it, only logs on failure. The RPC
  // itself (supabase/migrations/20260927000500_assignment_notifications.sql)
  // re-derives the recipient and message server-side from the task/case row
  // — this call only says *which* row changed.
  const notifyAssignment = useCallback((kind: 'task' | 'case', entityId: string) => {
    if (storageMode !== 'cloud' || !firm) return;
    (async () => {
      try {
        const { error } = await supabase.rpc('notify_assignment', { f: firm.id, p_kind: kind, p_entity_id: entityId });
        if (error) console.error('notify_assignment failed:', error);
      } catch (err) {
        console.error('notify_assignment failed:', err);
      }
    })();
  }, [storageMode, firm]);

  // Load all data from repositories on mount, and (cloud mode only) refetch
  // cases/tasks/deadlines whenever the tab regains focus, so a change made by
  // another firm member on another device shows up without a full reload.
  // There is no realtime subscription yet (Step 1 · 1F item #6) — this is a
  // manual pull, debounced to at most once per 30s, and last write wins on
  // conflicting edits (no merge/CRDT).
  const lastFocusRefetch = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [t, customTemplates, cl, cs, notifs, team, activityEvents, deadlineRecords] = await Promise.all([
          repos.tasks.getAll(),
          repos.templates.getAll(),
          repos.clients.getAll(),
          repos.cases.getAll(),
          repos.notifications.getAll(),
          storageMode === 'local' ? repos.teamMembers.getAll() : Promise.resolve([]),
          repos.activity.getAll(),
          repos.deadlines.getAll(),
        ]);
        if (cancelled) return;

        // System default templates are hardcoded in-app, never persisted — merge in every load.
        setTemplates([...seedDefaultTemplates(), ...customTemplates]);

        if (storageMode === 'local') {
          let resolvedTeam = team;
          if (resolvedTeam.length === 0) {
            // Local mode is single-user by construction (a linked folder
            // belongs to one person) — the team is just the signed-in user,
            // no fictional collaborators (see Step 1 · 1F: the old
            // seedDefaultTeam()/round-robin backfill is retired).
            const you: TeamMember = {
              id: currentUserId,
              name: user!.user_metadata?.full_name || user!.email || 'You',
              email: user!.email || '',
              avatar: initialsOfName(user!.user_metadata?.full_name || user!.email || 'You'),
              role: 'partner',
              caseCount: 0,
              activeTaskCount: 0,
              status: 'available',
              joinedAt: new Date().toISOString(),
            };
            try {
              resolvedTeam = [await repos.teamMembers.create(you)];
            } catch (err) {
              console.error('Failed to persist the solo local-mode team member — continuing with the in-memory copy:', err);
              resolvedTeam = [you];
              if (!cancelled) {
                setLoadWarning('Some starter data could not be saved to your storage, so it may disappear on reload. See the browser console for details.');
              }
            }
          }
          setLocalTeamMembers(resolvedTeam);
        }

        setTasks(t);
        setClients(cl);
        setCases(cs);
        setNotifications(notifs);
        setActivity(activityEvents);
        setDeadlines(deadlineRecords);
      } catch (err) {
        console.error('Failed to load data from repositories:', err);
        if (!cancelled) {
          setLoadWarning('We could not load your data from storage. Please reload the page — if this keeps happening, check the browser console for details.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [repos, storageMode, currentUserId]);

  useEffect(() => {
    if (storageMode !== 'cloud') return;
    const REFETCH_MIN_INTERVAL_MS = 30_000;
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFocusRefetch.current < REFETCH_MIN_INTERVAL_MS) return;
      lastFocusRefetch.current = now;
      // notifications is included here (Step 1 · 1G.7) so an "assigned to
      // you" notification another firm member's save triggered actually
      // shows up when this tab regains focus, not just on the next full load.
      Promise.all([repos.cases.getAll(), repos.tasks.getAll(), repos.deadlines.getAll(), repos.notifications.getAll()])
        .then(([cs, t, d, notifs]) => {
          setCases(cs);
          setTasks(t);
          setDeadlines(d);
          setNotifications(notifs);
        })
        .catch(err => console.error('Refetch-on-focus failed:', err));
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [storageMode, repos]);

  const handleThemeChange = (newTheme: Theme) => {
    updateProfile({ theme: newTheme });
  };

  // --- Notification Handlers ---
  const handleMarkAsRead = useCallback(async (id: string) => {
    await repos.notifications.markAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, [repos]);

  const handleMarkAllAsRead = useCallback(async () => {
    await repos.notifications.markAllAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, [repos]);

  const handleDeleteNotification = useCallback(async (id: string) => {
    await repos.notifications.delete(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, [repos]);

  // Auto-generate overdue task notifications
  useEffect(() => {
    if (loading || tasks.length === 0) return;

    const today = toLocalISODate();

    const overdueTasks = tasks.filter(t => !isTaskClosed(t) && t.date < today);
    if (overdueTasks.length === 0) return;

    const createMissing = async () => {
      // Build a set of task IDs already notified
      const existingMessages = new Set(notifications.map(n => n.message));

      const toCreate: Notification[] = [];
      for (const task of overdueTasks) {
        const marker = `task:${task.id}`;
        const alreadyExists = notifications.some(n => n.message.includes(marker));
        if (alreadyExists) continue;

        const notif: Notification = {
          id: uuidv4(),
          title: 'Overdue task',
          message: `"${task.title}" was due on ${task.date}. [${marker}]`,
          type: 'warning',
          read: false,
          createdAt: new Date().toISOString(),
        };
        toCreate.push(notif);
      }

      if (toCreate.length === 0) return;

      // Avoid duplicate state if existingMessages check fails (safety net)
      const uniqueToCreate = toCreate.filter(n => !existingMessages.has(n.message));
      if (uniqueToCreate.length === 0) return;

      const created = await Promise.all(uniqueToCreate.map(n => repos.notifications.create(n)));
      setNotifications(prev => [...prev, ...created]);
    };

    createMissing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, loading]);

  // Auto-generate deadline-approaching notifications (14/7/2-day thresholds), including
  // the derived passport-expiry deadline — see lib/deadlineAlerts.ts. Checked on app load;
  // there's no background job (Step 1 · 1D). Deduplicated by buildDeadlineAlerts against
  // notifications already created, so a reload never creates the same alert twice.
  useEffect(() => {
    if (loading) return;
    const today = new Date();
    const toCreate = buildDeadlineAlerts(allDeadlines(deadlines, clients), notifications, today);
    if (toCreate.length === 0) return;

    (async () => {
      const created = await Promise.all(toCreate.map(n => repos.notifications.create(n)));
      setNotifications(prev => [...prev, ...created]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlines, clients, loading]);

  // --- Rescheduling (Step 1 · 1E) ---
  // Recomputes a case's own template-generated tasks (those carrying a
  // `stepKey`) whenever a new anchor becomes known — a step is marked done,
  // or a deadline for the case is added/updated (see
  // `lib/tasksFromTemplate.ts`'s `rescheduleCaseTasks`). Locked or closed
  // tasks are never touched. Takes explicit `tasksSnapshot`/`deadlinesSnapshot`
  // rather than reading the `tasks`/`deadlines` state directly, since callers
  // invoke this right after applying an update those states haven't
  // necessarily re-rendered with yet.
  const rescheduleCaseFromSnapshot = useCallback(async (caseId: string, tasksSnapshot: Task[], deadlinesSnapshot: Deadline[]) => {
    const caseItem = cases.find(c => c.id === caseId);
    const template = caseItem ? templates.find(t => t.id === caseItem.templateId) : undefined;
    if (!caseItem || !template?.steps?.length) return;

    const caseDeadlines = deadlinesSnapshot.filter(d => d.caseId === caseId);
    const caseTasksAll = tasksSnapshot.filter(t => t.caseId === caseId);
    const knownAnchors = knownAnchorsFromDeadlines(caseDeadlines);
    const changed = rescheduleCaseTasks(template.steps, caseItem.startDate, knownAnchors, caseTasksAll);
    if (changed.length === 0) return;

    await Promise.all(changed.map(t => repos.tasks.update(t)));
    setTasks(prev => prev.map(t => changed.find(c => c.id === t.id) ?? t));
  }, [cases, templates, repos]);

  // --- Deadline Actions ---
  const handleAddDeadline = useCallback(async (deadline: Deadline) => {
    await repos.deadlines.create(deadline);
    const nextDeadlines = [...deadlines, deadline];
    setDeadlines(nextDeadlines);
    pushActivity({
      type: 'deadline_added',
      actorId: currentUserId,
      subjectId: deadline.id,
      summary: `Deadline "${deadline.title}" added, due ${deadline.dueDate}.`,
    });
    if (deadline.caseId) {
      rescheduleCaseFromSnapshot(deadline.caseId, tasks, nextDeadlines);
    }
  }, [repos, deadlines, tasks, pushActivity, currentUserId, rescheduleCaseFromSnapshot]);

  const handleUpdateDeadline = useCallback(async (updated: Deadline) => {
    const prev = deadlines.find(d => d.id === updated.id);
    await repos.deadlines.update(updated);
    const nextDeadlines = deadlines.map(d => d.id === updated.id ? updated : d);
    setDeadlines(nextDeadlines);
    if (prev && prev.status === 'open' && updated.status !== 'open') {
      pushActivity({
        type: 'deadline_resolved',
        actorId: currentUserId,
        subjectId: updated.id,
        summary: `Deadline "${updated.title}" marked ${updated.status}.`,
      });
    }
    if (updated.caseId) {
      rescheduleCaseFromSnapshot(updated.caseId, tasks, nextDeadlines);
    }
  }, [repos, deadlines, tasks, pushActivity, currentUserId, rescheduleCaseFromSnapshot]);

  // --- Case Actions ---
  // Applies a case update (stage/outcome/onHold, or any other case edit) and,
  // when the stage changed, writes a `case_stage_changed` ActivityEvent — the
  // one place besides CaseDetails.tsx's own title/description edit that
  // writes to a case, so the activity log stays consistent regardless of
  // which control made the change.
  const handleUpdateCase = useCallback(async (updated: Case) => {
    const prev = cases.find(c => c.id === updated.id);
    await repos.cases.update(updated);
    setCases(prevList => prevList.map(c => c.id === updated.id ? updated : c));
    if (prev && prev.stage !== updated.stage) {
      pushActivity({
        type: 'case_stage_changed',
        actorId: currentUserId,
        subjectId: updated.id,
        summary: `Case "${updated.title}" moved from ${CASE_STAGE_LABELS[prev.stage]} to ${CASE_STAGE_LABELS[updated.stage]}.`,
      });
    }
    if (prev && shouldNotifyAssignment(prev.caseOwner, updated.caseOwner, currentUserId)) {
      notifyAssignment('case', updated.id);
    }
  }, [repos, cases, pushActivity, currentUserId, notifyAssignment]);

  // --- Task Actions ---
  const handleAddTask = useCallback(async (task: Task) => {
    await repos.tasks.create(task);
    setTasks(prev => {
      const sameDayTasks = prev.filter(t => t.date === task.date);
      const maxOrder = sameDayTasks.length > 0 ? Math.max(...sameDayTasks.map(t => t.priorityOrder)) : 0;
      return [...prev, { ...task, priorityOrder: maxOrder + 1 }];
    });
  }, [repos]);

  // Bulk add — used by CaseDetails' "Generate plan from template" (Step 1 ·
  // 1E), which creates every step's task in one go rather than one at a time.
  const handleAddTasks = useCallback(async (newTasks: Task[]) => {
    if (newTasks.length === 0) return;
    await repos.tasks.createMany(newTasks);
    setTasks(prev => [...prev, ...newTasks]);
  }, [repos]);

  const handleUpdateTask = useCallback(async (updatedTask: Task) => {
    const prev = tasks.find(t => t.id === updatedTask.id);
    await repos.tasks.update(updatedTask);
    const nextTasks = tasks.map(t => t.id === updatedTask.id ? updatedTask : t);
    setTasks(nextTasks);
    if (prev && prev.status !== updatedTask.status) {
      if (updatedTask.status === 'done') {
        toast.success(`Task completed: ${updatedTask.title}`);
      }
      pushActivity({
        type: 'task_status_changed',
        actorId: updatedTask.assignedTo || currentUserId,
        subjectId: updatedTask.id,
        summary: `"${updatedTask.title}" moved from ${TASK_STATUS_LABELS[prev.status]} to ${TASK_STATUS_LABELS[updatedTask.status]}.`,
      });
      // A step's task closing is a new "step done" anchor for the rest of the
      // case's template plan — see `rescheduleCaseFromSnapshot`.
      if (updatedTask.caseId && updatedTask.stepKey && isTaskClosed(updatedTask) && !isTaskClosed(prev)) {
        rescheduleCaseFromSnapshot(updatedTask.caseId, nextTasks, deadlines);
      }
    }
    if (prev && shouldNotifyAssignment(prev.assignedTo, updatedTask.assignedTo, currentUserId)) {
      notifyAssignment('task', updatedTask.id);
    }
  }, [repos, tasks, deadlines, pushActivity, currentUserId, rescheduleCaseFromSnapshot, notifyAssignment]);

  const handleDeleteTask = useCallback(async (id: string) => {
    await repos.tasks.delete(id);
    setTasks(prev => prev.filter(t => t.id !== id));
    toast.info('Task deleted');
  }, [repos]);

  const handleMoveTaskOrder = useCallback((taskId: string, direction: 'up' | 'down') => {
    setTasks(prev => {
      const task = prev.find(t => t.id === taskId);
      if (!task) return prev;
      const sameDayTasks = prev.filter(t => t.date === task.date).sort((a, b) => a.priorityOrder - b.priorityOrder);
      const currentIndex = sameDayTasks.findIndex(t => t.id === taskId);
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= sameDayTasks.length) return prev;
      const targetTask = sameDayTasks[targetIndex];
      const updated = prev.map(t => {
        if (t.id === task.id) return { ...t, priorityOrder: targetTask.priorityOrder };
        if (t.id === targetTask.id) return { ...t, priorityOrder: task.priorityOrder };
        return t;
      });
      // Persist both
      const a = updated.find(t => t.id === task.id)!;
      const b = updated.find(t => t.id === targetTask.id)!;
      repos.tasks.update(a);
      repos.tasks.update(b);
      return updated;
    });
  }, [repos]);

  const handleMoveTaskDate = useCallback((
    taskId: string,
    newDate: string,
    offsetFuture: boolean = false,
    taskPatch?: { title?: string; description?: string; dateLocked?: boolean },
  ) => {
    setTasks(prev => {
      const task = prev.find(t => t.id === taskId);
      if (!task) return prev;
      const oldDate = new Date(task.date);
      const nextDate = new Date(newDate);
      const diffTime = nextDate.getTime() - oldDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      const updated = prev.map(t => {
        if (t.id === taskId) return { ...t, ...taskPatch, date: newDate, priorityOrder: 999 };
        if (offsetFuture && t.caseId === task.caseId && !isTaskClosed(t)) {
          const tDate = new Date(t.date);
          if (tDate > oldDate) {
            const updatedDate = new Date(tDate.getTime() + (diffDays * 24 * 60 * 60 * 1000));
            return { ...t, date: updatedDate.toISOString().split('T')[0] };
          }
        }
        return t;
      });
      // Persist changed tasks
      updated.filter(t => {
        const original = prev.find(o => o.id === t.id);
        return original && original.date !== t.date;
      }).forEach(t => repos.tasks.update(t));
      return updated;
    });

    setTimeout(() => {
      setTasks(prev => {
        const dateTasks = prev.filter(t => t.date === newDate).sort((a, b) => a.priorityOrder - b.priorityOrder);
        const updated = prev.map(t => {
          if (t.date === newDate) {
            const idx = dateTasks.findIndex(dt => dt.id === t.id);
            return { ...t, priorityOrder: idx + 1 };
          }
          return t;
        });
        updated.filter(t => t.date === newDate).forEach(t => repos.tasks.update(t));
        return updated;
      });
    }, 0);
  }, [repos]);

  const handleTasksConfirmed = useCallback(async (newTasks: Task[], newCase: Case) => {
    // Auto-assign to current user (first partner) if no owner provided
    const caseWithOwner: Case = {
      ...newCase,
      caseOwner: newCase.caseOwner || currentUserId,
      caseNumber: newCase.caseNumber || generateCaseNumber(cases),
    };
    const tasksWithAssignee = newTasks.map(t => ({
      ...t,
      assignedTo: t.assignedTo || caseWithOwner.caseOwner,
    }));
    await repos.cases.create(caseWithOwner);
    await repos.tasks.createMany(tasksWithAssignee);
    if (caseWithOwner.description.trim()) {
      const intakeNote: CaseNote = {
        id: uuidv4(),
        caseId: caseWithOwner.id,
        content: caseWithOwner.description.trim(),
        createdAt: caseWithOwner.createdAt,
        userId: currentUserId,
      };
      await repos.caseNotes.create(intakeNote);
    }
    setCases(prev => [...prev, caseWithOwner]);
    setTasks(prev => [...prev, ...tasksWithAssignee]);
    toast.success(`Case created: ${caseWithOwner.title}`);
    if (tasksWithAssignee.length > 0) {
      toast.success(`${tasksWithAssignee.length} tasks generated`);
    }
    pushActivity({
      type: 'case_created',
      actorId: currentUserId,
      subjectId: caseWithOwner.id,
      summary: `New case created: "${caseWithOwner.title}".`,
    });
    const visaSubclass = caseWithOwner.visaSubclass ?? templates.find(t => t.id === caseWithOwner.templateId)?.visaSubclass;
    pushUsageEvent({ type: 'case_created', metadata: { visaSubclass, templateId: caseWithOwner.templateId } });

    // Case creation with an explicit owner/assignee is another "assignment
    // changed to someone else" moment — see Step 1 · 1G.7's plan. Only the
    // case owner and any task explicitly assigned away from the default
    // (rather than every task, which would otherwise spam one notification
    // per generated task when they all just inherit the case owner).
    if (shouldNotifyAssignment(undefined, caseWithOwner.caseOwner, currentUserId)) {
      notifyAssignment('case', caseWithOwner.id);
    }
    newTasks.forEach((original, i) => {
      if (original.assignedTo && shouldNotifyAssignment(undefined, original.assignedTo, currentUserId)) {
        notifyAssignment('task', tasksWithAssignee[i].id);
      }
    });
  }, [repos, currentUserId, pushActivity, pushUsageEvent, cases, templates, notifyAssignment]);

  // --- Template Actions ---
  const handleAddTemplate = useCallback(async (template: WorkflowTemplate) => {
    await repos.templates.create(template);
    setTemplates(prev => [...prev, template]);
  }, [repos]);

  const handleUpdateTemplate = useCallback(async (template: WorkflowTemplate) => {
    await repos.templates.update(template);
    setTemplates(prev => prev.map(t => (t.id === template.id ? template : t)));
  }, [repos]);

  const handleDeleteTemplate = useCallback(async (id: string) => {
    await repos.templates.delete(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }, [repos]);

  // --- Team Actions (local mode only — cloud mode manages the firm's real
  // members through invites/roles, see pages/TeamMembers.tsx and
  // contexts/FirmContext.tsx) ---
  const handleAddTeamMember = useCallback(async (member: TeamMember) => {
    await repos.teamMembers.create(member);
    setLocalTeamMembers(prev => [...prev, member]);
    pushActivity({
      type: 'member_added',
      actorId: currentUserId,
      subjectId: member.id,
      summary: `${member.name} joined the team as ${member.role}.`,
    });
    pushUsageEvent({ type: 'team_member_added' });
    toast.success(`${member.name} added to the team`);
  }, [repos, pushActivity, pushUsageEvent, currentUserId]);

  const handleUpdateTeamMember = useCallback(async (member: TeamMember) => {
    await repos.teamMembers.update(member);
    setLocalTeamMembers(prev => prev.map(m => m.id === member.id ? member : m));
  }, [repos]);

  const handleDeleteTeamMember = useCallback(async (id: string) => {
    const member = teamMembers.find(m => m.id === id);
    await repos.teamMembers.delete(id);
    setLocalTeamMembers(prev => prev.filter(m => m.id !== id));
    // Clear assignments so the UI doesn't orphan-reference the removed id.
    const clearedCases = cases.map(c => c.caseOwner === id ? { ...c, caseOwner: undefined } : c);
    const clearedTasks = tasks.map(t => t.assignedTo === id ? { ...t, assignedTo: undefined } : t);
    await Promise.all([
      ...clearedCases.filter((c, i) => c !== cases[i]).map(c => repos.cases.update(c)),
      ...clearedTasks.filter((t, i) => t !== tasks[i]).map(t => repos.tasks.update(t)),
    ]);
    setCases(clearedCases);
    setTasks(clearedTasks);
    if (member) toast.info(`${member.name} removed`);
  }, [repos, teamMembers, cases, tasks]);

  const handleAssignCase = useCallback(async (caseId: string, newOwnerId: string, note?: string) => {
    const caseItem = cases.find(c => c.id === caseId);
    if (!caseItem) return;
    const event: CaseAssignmentEvent = {
      id: uuidv4(),
      caseId,
      fromOwnerId: caseItem.caseOwner,
      toOwnerId: newOwnerId,
      changedAt: new Date().toISOString(),
      changedBy: currentUserId,
      note,
    };
    const updated: Case = {
      ...caseItem,
      caseOwner: newOwnerId,
      assignmentHistory: [...(caseItem.assignmentHistory || []), event],
    };
    try {
      await repos.cases.update(updated);
    } catch {
      // Repository layer may not persist new optional fields — safe to ignore.
    }
    setCases(prev => prev.map(c => c.id === caseId ? updated : c));
    const newOwner = teamMembers.find(m => m.id === newOwnerId);
    pushActivity({
      type: 'case_assigned',
      actorId: currentUserId,
      subjectId: caseId,
      summary: `${caseItem.title} assigned to ${newOwner?.name || 'team member'}.`,
    });
    toast.success(`Case assigned to ${newOwner?.name || 'team member'}`);
    if (shouldNotifyAssignment(caseItem.caseOwner, newOwnerId, currentUserId)) {
      notifyAssignment('case', caseId);
    }
  }, [cases, repos, teamMembers, pushActivity, currentUserId, notifyAssignment]);

  // --- Client Actions ---
  const handleAddClient = useCallback(async (client: Client) => {
    await repos.clients.create(client);
    setClients(prev => [...prev, client]);
    pushUsageEvent({ type: 'client_created' });
  }, [repos, pushUsageEvent]);

  const handleEligibilityChecked = useCallback((usage: { promptTokens: number; candidatesTokens: number; totalTokens: number; estimatedCostUsd: number }) => {
    pushUsageEvent({
      type: 'eligibility_check',
      metadata: {
        promptTokens: usage.promptTokens,
        candidatesTokens: usage.candidatesTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
      },
    });
  }, [pushUsageEvent]);

  const handleUpdateClient = useCallback(async (updatedClient: Client) => {
    await repos.clients.update(updatedClient);
    setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
  }, [repos]);

  const handleDeleteClient = useCallback(async (id: string) => {
    await repos.clients.delete(id);
    setClients(prev => prev.filter(c => c.id !== id));
  }, [repos]);

  if (loading) {
    return (
      <div className={theme === 'dark' ? 'dark' : ''}>
        <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-edamame-500" />
        </div>
      </div>
    );
  }

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <Toaster position="top-right" richColors theme={theme === 'dark' ? 'dark' : 'light'} />
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 font-sans text-gray-900 dark:text-gray-100 transition-colors duration-200">
        <Sidebar />
        <div className={`${collapsed ? 'md:ml-16' : 'md:ml-[240px]'} min-w-0 transition-[margin-left] duration-300 ease-in-out`}>
          <Header
            theme={theme}
            onThemeChange={handleThemeChange}
            userName={user!.user_metadata?.full_name || ''}
            userEmail={user!.email || ''}
            notifications={notifications}
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={handleMarkAllAsRead}
            onDeleteNotification={handleDeleteNotification}
            clients={clients}
            cases={cases}
            tasks={tasks}
            templates={templates}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onMoveTaskDate={handleMoveTaskDate}
          />
          <PendingInvitationsBanner />
          {lostAccessNotice && (
            <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-xl border border-ink/15 bg-paper-2 px-4 py-3 text-sm text-ink-soft dark:border-plate-ink/20 dark:bg-plate-card dark:text-plate-ink-soft">
              <span>{lostAccessNotice}</span>
              <button
                onClick={dismissLostAccessNotice}
                className="flex-shrink-0 font-semibold underline underline-offset-2"
              >
                Dismiss
              </button>
            </div>
          )}
          {loadWarning && (
            <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
              <span>{loadWarning}</span>
              <button
                onClick={() => setLoadWarning(null)}
                className="flex-shrink-0 font-semibold underline underline-offset-2"
              >
                Dismiss
              </button>
            </div>
          )}
          <main>
          <Routes>
            <Route path="/dashboard" element={
              <Dashboard
                tasks={tasks}
                cases={cases}
                clients={clients}
                deadlines={deadlines}
                teamMembers={teamMembers}
                currentUserId={currentUserId}
                storageMode={storageMode}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                onMoveTaskOrder={handleMoveTaskOrder}
                onMoveTaskDate={handleMoveTaskDate}
                onAddTask={handleAddTask}
              />
            } />
            <Route path="/team" element={
              <TeamDashboard
                teamMembers={teamMembers}
                cases={cases}
                clients={clients}
                tasks={tasks}
                activity={activity}
                onAssignCase={handleAssignCase}
              />
            } />
            <Route path="/team-members" element={
              <TeamMembers
                teamMembers={teamMembers}
                cases={cases}
                clients={clients}
                tasks={tasks}
                onAddMember={handleAddTeamMember}
                onUpdateMember={handleUpdateTeamMember}
                onDeleteMember={handleDeleteTeamMember}
                onUpdateTask={handleUpdateTask}
                onUpdateCase={handleUpdateCase}
              />
            } />
            <Route path="/clients" element={
              <Clients
                clients={clients}
                cases={cases}
                tasks={tasks}
                onAddClient={handleAddClient}
                onUpdateClient={handleUpdateClient}
              />
            } />
            <Route path="/visa-advisor" element={
              <VisaAdvisorRoute
                clients={clients}
                templates={templates}
                cases={cases}
                onEligibilityChecked={handleEligibilityChecked}
                onAddClient={handleAddClient}
                onDeleteClient={handleDeleteClient}
                onTasksConfirmed={handleTasksConfirmed}
              />
            } />
            <Route path="/cases" element={
              <CaseManager
                cases={cases}
                clients={clients}
                tasks={tasks}
                templates={templates}
                teamMembers={teamMembers}
                deadlines={deadlines}
                storageMode={storageMode}
                currentUserId={currentUserId}
                onTasksConfirmed={handleTasksConfirmed}
                onAssignCase={handleAssignCase}
              />
            } />
            <Route path="/cases/:caseId" element={
              <CaseDetailsRoute
                cases={cases}
                clients={clients}
                tasks={tasks}
                templates={templates}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                onAddTask={handleAddTask}
                onAddTasks={handleAddTasks}
                onMoveTaskDate={handleMoveTaskDate}
                deadlines={deadlines}
                onAddDeadline={handleAddDeadline}
                onUpdateDeadline={handleUpdateDeadline}
                onUpdateCase={handleUpdateCase}
              />
            } />
            <Route path="/templates" element={
              <Templates
                templates={templates}
                currentUserId={currentUserId}
                onAddTemplate={handleAddTemplate}
                onUpdateTemplate={handleUpdateTemplate}
                onDeleteTemplate={handleDeleteTemplate}
              />
            } />
            <Route path="/settings" element={
              <Settings
                currentTheme={theme}
                onThemeChange={handleThemeChange}
              />
            } />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </main>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Bridge component for CaseDetails — reads :caseId from URL
// ---------------------------------------------------------------------------

interface CaseDetailsRouteProps {
  cases: Case[];
  clients: Client[];
  tasks: Task[];
  templates: WorkflowTemplate[];
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onAddTask: (task: Task) => void;
  onAddTasks: (tasks: Task[]) => void;
  onMoveTaskDate: (
    taskId: string,
    newDate: string,
    offsetFuture: boolean,
    taskPatch?: { title?: string; description?: string; dateLocked?: boolean },
  ) => void;
  deadlines: Deadline[];
  onAddDeadline: (deadline: Deadline) => void;
  onUpdateDeadline: (deadline: Deadline) => void;
  onUpdateCase: (caseItem: Case) => void;
}

const CaseDetailsRoute: React.FC<CaseDetailsRouteProps> = (props) => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();

  const caseItem = props.cases.find(c => c.id === caseId);
  const client = caseItem ? props.clients.find(cl => cl.id === caseItem.clientId) : undefined;
  const applicant = caseItem?.applicantId ? props.clients.find(cl => cl.id === caseItem.applicantId) : undefined;
  const template = caseItem ? props.templates.find(t => t.id === caseItem.templateId) : undefined;

  if (!caseItem || !client) {
    return <Navigate to="/cases" replace />;
  }

  return (
    <CaseDetails
      caseItem={caseItem}
      client={client}
      applicant={applicant}
      visaSubclass={caseItem.visaSubclass ?? template?.visaSubclass}
      tasks={props.tasks}
      onUpdateTask={props.onUpdateTask}
      onDeleteTask={props.onDeleteTask}
      onAddTask={props.onAddTask}
      onAddTasks={props.onAddTasks}
      onMoveTaskDate={props.onMoveTaskDate}
      deadlines={props.deadlines}
      onAddDeadline={props.onAddDeadline}
      onUpdateDeadline={props.onUpdateDeadline}
      onUpdateCase={props.onUpdateCase}
      onBack={() => navigate('/cases')}
    />
  );
};

// ---------------------------------------------------------------------------
// Bridge component for VisaAdvisor — handles navigation to new case
// ---------------------------------------------------------------------------

interface VisaAdvisorRouteProps {
  clients: Client[];
  templates: WorkflowTemplate[];
  cases: Case[];
  onEligibilityChecked: (usage: { promptTokens: number; candidatesTokens: number; totalTokens: number; estimatedCostUsd: number }) => void;
  onAddClient: (client: Client) => Promise<void>;
  onDeleteClient: (id: string) => Promise<void>;
  onTasksConfirmed: (tasks: Task[], newCase: Case) => Promise<void>;
}

const VisaAdvisorRoute: React.FC<VisaAdvisorRouteProps> = (props) => {
  const navigate = useNavigate();
  const location = useLocation();
  // Tracks whether the user is still looking at the Visa Advisor page when the
  // (possibly slow, AI-backed) case creation finishes, so a navigation triggered
  // after they've already clicked away doesn't yank them somewhere unexpected.
  const locationRef = useRef(location.pathname);
  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  const handleOpenNewCase = async (params: OpenCaseParams): Promise<OpenCaseOutcome> => {
    const { caseId, clientId, aiGenerationFailed } = await openCaseFromAdvisor(params, {
      clients: props.clients,
      templates: props.templates,
      generateTasks: generateTasksFromCase,
      addClient: props.onAddClient,
      deleteClient: props.onDeleteClient,
      createCase: props.onTasksConfirmed,
    });

    // Only mention the AI failure once the case itself is safely saved — no
    // point alarming the user about tasks if the whole thing is about to fail.
    if (aiGenerationFailed) {
      toast.error('AI task generation failed — the case will be created without tasks. You can generate them from the case page.');
    }

    if (locationRef.current === '/visa-advisor') {
      navigate(`/cases/${caseId}`);
    } else {
      toast.success(`Case created: ${params.title}`, {
        action: {
          label: 'View case',
          onClick: () => navigate(`/cases/${caseId}`),
        },
      });
    }

    return { caseId, clientId };
  };

  return (
    <VisaAdvisor
      clients={props.clients}
      templates={props.templates}
      cases={props.cases}
      onOpenNewCase={handleOpenNewCase}
      onEligibilityChecked={props.onEligibilityChecked}
    />
  );
};

// ---------------------------------------------------------------------------
// Root App — handles onboarding + storage mode + provides context
// ---------------------------------------------------------------------------

const Spinner: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <div className="w-8 h-8 border-2 border-edamame-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

/**
 * Gates the app shell on two things that live outside the browser now:
 * the profiles row (which mode + prefs) and, for local mode, an active
 * folder link (the browser-side permission handle to reconnect to it).
 */
const StorageGate: React.FC = () => {
  const { profile, loading: profileLoading, completeOnboarding, updateProfile } = useProfile();
  const { status: folderStatus, supported, linkFolder, reconnect } = useLocalFolder();
  const [switchingToLocal, setSwitchingToLocal] = useState(false);

  const handleOnboardingComplete = async (mode: StorageMode) => {
    await completeOnboarding(mode);
  };

  // Escape hatch for the "cloud isn't configured" dead end below: cloud is
  // unreachable here, so there's no data to migrate — this just flips
  // storageMode back to local and drops the user into folder-linking. The
  // orphaned cloud rows (if any exist from before) are left untouched; they
  // become reachable again if the deployment's Supabase config is fixed and
  // the user switches back to cloud from Settings.
  const handleSwitchToLocal = async () => {
    setSwitchingToLocal(true);
    try {
      await updateProfile({ storageMode: 'local' });
      window.location.reload();
    } catch {
      setSwitchingToLocal(false);
    }
  };

  if (profileLoading) return <Spinner />;

  if (!profile) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding onComplete={handleOnboardingComplete} />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  if (profile.storageMode === 'cloud' && !isSupabaseConfigured) {
    // Cloud mode routes every read and write through Supabase — without real
    // credentials the app shell would render but silently fail on all data.
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 px-6">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Cloud storage isn't configured</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
            This deployment is missing its Supabase configuration, so your cloud data can't be loaded or saved.
            Contact your administrator, or switch to local storage to keep working.
          </p>
          <button
            onClick={handleSwitchToLocal}
            disabled={switchingToLocal}
            className="btn-press mt-5 px-5 py-2.5 rounded-xl font-semibold text-sm bg-edamame-500 hover:bg-edamame-600 text-white transition-all disabled:opacity-50"
          >
            {switchingToLocal ? 'Switching...' : 'Switch to Local Storage'}
          </button>
        </div>
      </div>
    );
  }

  if (profile.storageMode === 'cloud') {
    return <CloudAppGate />;
  }

  if (folderStatus !== 'ready') {
    if (folderStatus === 'checking') return <Spinner />;
    return (
      <LinkFolderGate
        status={folderStatus}
        supported={supported}
        linkedFolderName={profile.linkedFolderName}
        onLink={linkFolder}
        onReconnect={reconnect}
      />
    );
  }

  return (
    <RepositoryProvider storageMode={profile.storageMode}>
      <DocumentTypeProvider>
        <SidebarProvider>
          <AppShell />
        </SidebarProvider>
      </DocumentTypeProvider>
    </RepositoryProvider>
  );
};

/**
 * Cloud mode's app-shell gate (Step 1 · 1F): a firm is required before any
 * repository can be created (every cloud table is firm-scoped), so this sits
 * between StorageGate and RepositoryProvider/AppShell. A brand-new cloud user
 * with no firm yet (and no pending invite already accepted — see
 * pages/InviteAccept.tsx) sees CreateFirmGate instead of the app shell.
 */
const CloudAppGate: React.FC = () => {
  const { firm, loading } = useFirm();

  if (loading) return <Spinner />;
  if (!firm) return <CreateFirmGate />;

  return (
    <RepositoryProvider storageMode="cloud" firmId={firm.id}>
      <DocumentTypeProvider>
        <SidebarProvider>
          <AppShell />
        </SidebarProvider>
      </DocumentTypeProvider>
    </RepositoryProvider>
  );
};

const AppRoutes: React.FC = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      {/* Auth lives inside the landing page: /login opens its log-in sheet and
          /register scrolls to the account form. The routes are kept so existing
          redirects (ProtectedRoute, sign-out) and shared links still work. */}
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
      {/* Fully public, and deliberately outside ProtectedRoute/ProfileProvider: the
          Supabase recovery link signs the visitor in via a short-lived recovery
          session (see pages/ResetPassword.tsx), which would otherwise get bounced
          around by the "signed-in users get sent to /dashboard" rule above or the
          onboarding/firm gates further down the tree before the form ever shows. */}
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute />}>
        {/* Accepting a firm invite needs a session but not a resolved profile/firm — see pages/InviteAccept.tsx. ProtectedRoute already redirects a signed-out visitor to /login and back here (location.state.from), via LandingPage's own sign-in flow. */}
        <Route path="/invite/:token" element={
          <ProfileProvider>
            <InviteAccept />
          </ProfileProvider>
        } />
        <Route path="/*" element={
          <ProfileProvider>
            <FirmProvider>
              <LocalFolderProvider>
                <StorageGate />
              </LocalFolderProvider>
            </FirmProvider>
          </ProfileProvider>
        } />
      </Route>
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
