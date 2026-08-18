import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';
import type { Case, Client, Task, WorkflowTemplate } from '../types';
import { smartSearch } from '../lib/search/smartSearch';
import { TaskDetailModal } from './TaskDetailModal';

interface GlobalSearchProps {
  clients: Client[];
  cases: Case[];
  tasks: Task[];
  templates: WorkflowTemplate[];
  onUpdateTask?: (task: Task) => void;
  onDeleteTask?: (id: string) => void;
  onMoveTaskDate?: (
    taskId: string,
    newDate: string,
    offsetFuture: boolean,
    taskPatch?: { title?: string; description?: string },
  ) => void;
}

const formatDob = (dob?: string) => {
  if (!dob) return 'No date of birth on file';
  const parsed = parseISO(dob);
  return isValid(parsed) ? format(parsed, 'd MMM yyyy') : dob;
};

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="py-1.5">
    <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
      {label}
    </div>
    {children}
  </div>
);

const ResultRow: React.FC<{ primary: string; secondary: string; action: string; onClick: () => void }> = ({
  primary,
  secondary,
  action,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
  >
    <span className="min-w-0 flex-1">
      <span className="block text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">{primary}</span>
      <span className="block text-[11.5px] text-slate-500 dark:text-slate-400 truncate">{secondary}</span>
    </span>
    <span className="flex-shrink-0 text-[11px] font-semibold text-edamame-600 dark:text-edamame-400 opacity-0 group-hover:opacity-100 transition-opacity">
      {action}
    </span>
  </button>
);

/**
 * The app-wide search bar. Mounted once in the Header (which itself sits
 * outside <Routes>), so it is available from every module.
 *
 * Tasks open in a popup rather than navigating, and neither the query nor the
 * result list is cleared when that popup closes — the user can open several
 * results in a row from one search.
 */
export const GlobalSearch: React.FC<GlobalSearchProps> = ({
  clients,
  cases,
  tasks,
  templates,
  onUpdateTask,
  onDeleteTask,
  onMoveTaskDate,
}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query), 150);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      // The task popup renders outside this container, so clicks inside it
      // would otherwise read as "outside" and collapse the results the user
      // is still working through.
      if (openTaskId) return;
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [openTaskId]);

  const results = useMemo(
    () => smartSearch(debouncedQuery, { clients, cases, tasks, templates }),
    [debouncedQuery, clients, cases, tasks, templates]
  );

  const openTask = openTaskId ? tasks.find(t => t.id === openTaskId) ?? null : null;
  const openTaskCase = openTask?.caseId ? cases.find(c => c.id === openTask.caseId) : undefined;
  const openTaskClient = openTaskCase ? clients.find(c => c.id === openTaskCase.clientId) : undefined;

  const showPanel = isOpen && debouncedQuery.trim().length >= 2;

  const goToClient = (clientId: string) => {
    setIsOpen(false);
    navigate('/clients', { state: { focusClientId: clientId } });
  };

  const goToCase = (caseId: string) => {
    setIsOpen(false);
    navigate(`/cases/${caseId}`);
  };

  return (
    <>
      <div ref={containerRef} className="relative flex-1 max-w-[420px]">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') setIsOpen(false);
          }}
          placeholder="Search cases, clients, tasks…"
          aria-label="Search cases, clients and tasks"
          className="w-full pl-9 pr-8 py-2 text-[13px] rounded-lg bg-gray-100 dark:bg-slate-800 border border-transparent
                     text-gray-700 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500
                     focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-edamame-300 dark:focus:border-edamame-700
                     focus:ring-[3px] focus:ring-edamame-500/[.18] transition-colors"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setIsOpen(false);
            }}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
          >
            <X size={14} />
          </button>
        )}

        {showPanel && (
          <div className="absolute left-0 right-0 top-full mt-1.5 z-40 rounded-xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[70vh] overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
            {results.isEmpty ? (
              <div className="px-3 py-4 text-[12.5px] text-slate-500 dark:text-slate-400">
                No matches for “{debouncedQuery.trim()}”.
              </div>
            ) : (
              <>
                {results.clients.length > 0 && (
                  <Section label="Clients">
                    {results.clients.map(client => (
                      <ResultRow
                        key={client.id}
                        primary={client.name}
                        secondary={formatDob(client.dob)}
                        action="Go to this client"
                        onClick={() => goToClient(client.id)}
                      />
                    ))}
                  </Section>
                )}

                {results.cases.length > 0 && (
                  <Section label="Cases">
                    {results.cases.map(({ caseItem, caseNumber, client }) => (
                      <ResultRow
                        key={caseItem.id}
                        primary={caseItem.title}
                        secondary={
                          client ? `${client.name} · ${formatDob(client.dob)}` : caseNumber
                        }
                        action="Go to this case"
                        onClick={() => goToCase(caseItem.id)}
                      />
                    ))}
                  </Section>
                )}

                {results.tasks.length > 0 && (
                  <Section label="Tasks">
                    {results.tasks.map(({ task, caseItem, caseNumber }) => (
                      <ResultRow
                        key={task.id}
                        primary={task.title}
                        secondary={
                          caseItem ? `${caseNumber} · ${caseItem.title}` : 'Not linked to a case'
                        }
                        action="View task"
                        onClick={() => setOpenTaskId(task.id)}
                      />
                    ))}
                  </Section>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Opened in place: closing leaves the query and result list intact. */}
      {openTask && (
        <TaskDetailModal
          task={openTask}
          caseItem={openTaskCase}
          client={openTaskClient}
          onClose={() => setOpenTaskId(null)}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          onMoveTaskDate={onMoveTaskDate}
          onNavigateAway={() => setIsOpen(false)}
        />
      )}
    </>
  );
};
