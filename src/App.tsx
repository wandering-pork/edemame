import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { Sidebar } from './components/Sidebar';
import { NotificationBell } from './components/NotificationBell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RepositoryProvider, useRepositories } from './contexts/RepositoryContext';
import { Dashboard } from './pages/Dashboard';
import { CaseManager } from './pages/CaseManager';
import { CaseDetails } from './pages/CaseDetails';
import { Clients } from './pages/Clients';
import { VisaAdvisor } from './pages/VisaAdvisor';
import { Templates } from './pages/Templates';
import { Settings } from './pages/Settings';
import { TeamDashboard } from './pages/TeamDashboard';
import { TeamMembers } from './pages/TeamMembers';
import Onboarding from './pages/Onboarding';
import LandingPage from './pages/LandingPage';
import { Task, WorkflowTemplate, Theme, Client, Case, StorageMode, Notification, TeamMember, ActivityEvent, CaseAssignmentEvent } from './types';
import { getStorageMode, setStorageMode } from './repositories/factory';
import { seedDefaultTemplates, seedDefaultTeam } from './lib/seedData';

const TEAM_STORAGE_KEY = 'edamame_team_members';
const ACTIVITY_STORAGE_KEY = 'edamame_team_activity';

function loadTeamFromStorage(): TeamMember[] | null {
  try {
    const raw = localStorage.getItem(TEAM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveTeamToStorage(members: TeamMember[]) {
  try { localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(members)); } catch { /* ignore */ }
}

function loadActivityFromStorage(): ActivityEvent[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveActivityToStorage(events: ActivityEvent[]) {
  try { localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(events.slice(-200))); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Inner app — has access to repositories and router
// ---------------------------------------------------------------------------

const AppShell: React.FC = () => {
  const repos = useRepositories();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [theme, setTheme] = useState<Theme>('classic');
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => {
    const fromStorage = loadTeamFromStorage();
    if (fromStorage && fromStorage.length > 0) return fromStorage;
    const seeded = seedDefaultTeam();
    saveTeamToStorage(seeded);
    return seeded;
  });
  const [activity, setActivity] = useState<ActivityEvent[]>(() => loadActivityFromStorage());
  // The current-user id — in single-user installs we treat the first partner as "me".
  const currentUserId = teamMembers[0]?.id;

  const pushActivity = useCallback((ev: Omit<ActivityEvent, 'id' | 'createdAt'> & { createdAt?: string }) => {
    setActivity(prev => {
      const next: ActivityEvent[] = [
        ...prev,
        {
          ...ev,
          id: uuidv4(),
          createdAt: ev.createdAt || new Date().toISOString(),
        },
      ];
      saveActivityToStorage(next);
      return next;
    });
  }, []);

  // Persist team members whenever they change
  useEffect(() => {
    saveTeamToStorage(teamMembers);
  }, [teamMembers]);

  // First-launch backfill: spread any unowned cases/tasks across the seeded team
  // so the Team Dashboard has meaningful distribution on first load.
  useEffect(() => {
    if (loading || teamMembers.length === 0) return;
    const unowned = cases.filter(c => !c.caseOwner);
    if (unowned.length === 0) return;
    setCases(prev => prev.map((c, idx) => {
      if (c.caseOwner) return c;
      const owner = teamMembers[idx % teamMembers.length];
      return { ...c, caseOwner: owner.id };
    }));
    setTasks(prev => prev.map(t => {
      if (t.assignedTo) return t;
      const parentCase = cases.find(c => c.id === t.caseId);
      if (!parentCase) return t;
      const caseIdx = cases.findIndex(c => c.id === parentCase.id);
      const owner = teamMembers[caseIdx % teamMembers.length];
      return { ...t, assignedTo: owner.id };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, teamMembers.length]);

  // Load all data from repositories on mount
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [t, tpl, cl, cs, notifs] = await Promise.all([
          repos.tasks.getAll(),
          repos.templates.getAll(),
          repos.clients.getAll(),
          repos.cases.getAll(),
          repos.notifications.getAll(),
        ]);
        if (cancelled) return;

        // Seed default templates if none exist
        if (tpl.length === 0) {
          const defaults = seedDefaultTemplates();
          await Promise.all(defaults.map(d => repos.templates.create(d)));
          setTemplates(defaults);
        } else {
          setTemplates(tpl);
        }

        setTasks(t);
        setClients(cl);
        setCases(cs);
        setNotifications(notifs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [repos]);

  // Theme
  useEffect(() => {
    const saved = localStorage.getItem('edamame_theme') as Theme;
    if (saved) setTheme(saved);
  }, []);

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem('edamame_theme', newTheme);
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

    const today = new Date().toISOString().split('T')[0];

    const overdueTasks = tasks.filter(t => !t.isCompleted && t.date < today);
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

  // --- Task Actions ---
  const handleAddTask = useCallback(async (task: Task) => {
    await repos.tasks.create(task);
    setTasks(prev => {
      const sameDayTasks = prev.filter(t => t.date === task.date);
      const maxOrder = sameDayTasks.length > 0 ? Math.max(...sameDayTasks.map(t => t.priorityOrder)) : 0;
      return [...prev, { ...task, priorityOrder: maxOrder + 1 }];
    });
  }, [repos]);

  const handleUpdateTask = useCallback(async (updatedTask: Task) => {
    const prev = tasks.find(t => t.id === updatedTask.id);
    await repos.tasks.update(updatedTask);
    setTasks(prevTasks => prevTasks.map(t => t.id === updatedTask.id ? updatedTask : t));
    if (updatedTask.isCompleted && prev && !prev.isCompleted) {
      toast.success(`Task completed: ${updatedTask.title}`);
      pushActivity({
        type: 'task_completed',
        actorId: updatedTask.assignedTo || currentUserId,
        subjectId: updatedTask.id,
        summary: `Task completed: "${updatedTask.title}".`,
      });
    }
  }, [repos, tasks, pushActivity, currentUserId]);

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

  const handleMoveTaskDate = useCallback((taskId: string, newDate: string, offsetFuture: boolean = false) => {
    setTasks(prev => {
      const task = prev.find(t => t.id === taskId);
      if (!task) return prev;
      const oldDate = new Date(task.date);
      const nextDate = new Date(newDate);
      const diffTime = nextDate.getTime() - oldDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      const updated = prev.map(t => {
        if (t.id === taskId) return { ...t, date: newDate, priorityOrder: 999 };
        if (offsetFuture && t.caseId === task.caseId && !t.isCompleted) {
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
    };
    const tasksWithAssignee = newTasks.map(t => ({
      ...t,
      assignedTo: t.assignedTo || caseWithOwner.caseOwner,
    }));
    await repos.cases.create(caseWithOwner);
    await repos.tasks.createMany(tasksWithAssignee);
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
  }, [repos, currentUserId, pushActivity]);

  // --- Template Actions ---
  const handleAddTemplate = useCallback(async (template: WorkflowTemplate) => {
    await repos.templates.create(template);
    setTemplates(prev => [...prev, template]);
  }, [repos]);

  const handleDeleteTemplate = useCallback(async (id: string) => {
    await repos.templates.delete(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }, [repos]);

  // --- Team Actions ---
  const handleAddTeamMember = useCallback((member: TeamMember) => {
    setTeamMembers(prev => [...prev, member]);
    pushActivity({
      type: 'member_added',
      actorId: currentUserId,
      subjectId: member.id,
      summary: `${member.name} joined the team as ${member.role}.`,
    });
    toast.success(`${member.name} added to the team`);
  }, [pushActivity, currentUserId]);

  const handleUpdateTeamMember = useCallback((member: TeamMember) => {
    setTeamMembers(prev => prev.map(m => m.id === member.id ? member : m));
  }, []);

  const handleDeleteTeamMember = useCallback((id: string) => {
    const member = teamMembers.find(m => m.id === id);
    setTeamMembers(prev => prev.filter(m => m.id !== id));
    // Clear assignments so the UI doesn't orphan-reference the removed id.
    setCases(prev => prev.map(c => c.caseOwner === id ? { ...c, caseOwner: undefined } : c));
    setTasks(prev => prev.map(t => t.assignedTo === id ? { ...t, assignedTo: undefined } : t));
    if (member) toast.info(`${member.name} removed`);
  }, [teamMembers]);

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
  }, [cases, repos, teamMembers, pushActivity, currentUserId]);

  // --- Client Actions ---
  const handleAddClient = useCallback(async (client: Client) => {
    await repos.clients.create(client);
    setClients(prev => [...prev, client]);
  }, [repos]);

  const handleUpdateClient = useCallback(async (updatedClient: Client) => {
    await repos.clients.update(updatedClient);
    setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
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
        {/* Notification bell — fixed top-right, clear of the 256px sidebar */}
        <div className="fixed top-4 right-4 z-30">
          <NotificationBell
            notifications={notifications}
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={handleMarkAllAsRead}
            onDelete={handleDeleteNotification}
          />
        </div>
        <main className="w-full md:ml-64">
          <Routes>
            <Route path="/dashboard" element={
              <Dashboard
                tasks={tasks}
                cases={cases}
                clients={clients}
                teamMembers={teamMembers}
                currentUserId={currentUserId}
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
              />
            } />
            <Route path="/cases" element={
              <CaseManager
                cases={cases}
                clients={clients}
                tasks={tasks}
                templates={templates}
                teamMembers={teamMembers}
                onTasksConfirmed={handleTasksConfirmed}
                onAssignCase={handleAssignCase}
              />
            } />
            <Route path="/cases/:caseId" element={
              <CaseDetailsRoute
                cases={cases}
                clients={clients}
                tasks={tasks}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                onAddTask={handleAddTask}
                onMoveTaskDate={handleMoveTaskDate}
              />
            } />
            <Route path="/templates" element={
              <Templates
                templates={templates}
                onAddTemplate={handleAddTemplate}
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
  );
};

// ---------------------------------------------------------------------------
// Bridge component for CaseDetails — reads :caseId from URL
// ---------------------------------------------------------------------------

interface CaseDetailsRouteProps {
  cases: Case[];
  clients: Client[];
  tasks: Task[];
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onAddTask: (task: Task) => void;
  onMoveTaskDate: (taskId: string, newDate: string, offsetFuture: boolean) => void;
}

const CaseDetailsRoute: React.FC<CaseDetailsRouteProps> = (props) => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();

  const caseItem = props.cases.find(c => c.id === caseId);
  const client = caseItem ? props.clients.find(cl => cl.id === caseItem.clientId) : undefined;

  if (!caseItem || !client) {
    return <Navigate to="/cases" replace />;
  }

  return (
    <CaseDetails
      caseItem={caseItem}
      client={client}
      tasks={props.tasks}
      onUpdateTask={props.onUpdateTask}
      onDeleteTask={props.onDeleteTask}
      onAddTask={props.onAddTask}
      onMoveTaskDate={props.onMoveTaskDate}
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
}

const VisaAdvisorRoute: React.FC<VisaAdvisorRouteProps> = (props) => {
  const navigate = useNavigate();

  const handleOpenNewCase = (templateKeyword: string) => {
    navigate('/cases', { state: { suggestedTemplateKeyword: templateKeyword } });
  };

  return (
    <VisaAdvisor
      clients={props.clients}
      templates={props.templates}
      onOpenNewCase={handleOpenNewCase}
    />
  );
};

// ---------------------------------------------------------------------------
// Root App — handles onboarding + storage mode + provides context
// ---------------------------------------------------------------------------

const App: React.FC = () => {
  const [storageMode, setStorageModeState] = useState<StorageMode | null>(getStorageMode());

  const handleOnboardingComplete = (mode: StorageMode) => {
    setStorageMode(mode);
    setStorageModeState(mode);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/onboarding" element={
          storageMode
            ? <Navigate to="/dashboard" replace />
            : <Onboarding onComplete={handleOnboardingComplete} />
        } />
        <Route element={<ProtectedRoute />}>
          <Route path="/*" element={
            storageMode ? (
              <RepositoryProvider storageMode={storageMode}>
                <AppShell />
              </RepositoryProvider>
            ) : (
              <Navigate to="/onboarding" replace />
            )
          } />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
