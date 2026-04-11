import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Case, Client, Task, WorkflowTemplate } from '../types';
import { Search, Plus, FileText, User, Mail, Calendar, CheckCircle2, Clock, ChevronRight } from 'lucide-react';
import { NewCase } from './NewCase';

interface CaseManagerProps {
  cases: Case[];
  clients: Client[];
  tasks: Task[];
  templates: WorkflowTemplate[];
  onTasksConfirmed: (tasks: Task[], newCase: Case) => void;
}

export const CaseManager: React.FC<CaseManagerProps> = ({
  cases,
  clients,
  tasks,
  templates,
  onTasksConfirmed,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showIntake, setShowIntake] = useState(false);
  const [suggestedTemplateKeyword, setSuggestedTemplateKeyword] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

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

  const caseData = useMemo(() => {
    return cases.map(c => {
      const client = clients.find(cl => cl.id === c.clientId);
      const caseTasks = tasks.filter(t => t.caseId === c.id);
      const completedTasks = caseTasks.filter(t => t.isCompleted).length;
      const totalTasks = caseTasks.length;
      const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      
      let status = 'Not Started';
      if (percentage === 100) status = 'Completed';
      else if (percentage > 0) status = 'In Progress';

      return {
        ...c,
        clientName: client?.name || 'Unknown',
        clientDob: client?.dob || 'N/A',
        clientEmail: client?.email || 'N/A',
        progress: percentage,
        status: status,
        taskCount: totalTasks
      };
    });
  }, [cases, clients, tasks]);

  const filteredCases = useMemo(() => {
    return caseData.filter(c => 
      c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.clientDob.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.clientEmail.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [caseData, searchTerm]);

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
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-gray-50 dark:bg-slate-950 min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white font-fredoka tracking-tight">
              Case Manager
            </h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
              Overview and manage all immigration cases.
            </p>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setShowIntake(true)}
              className="btn-press flex items-center justify-center gap-2 bg-edamame hover:bg-edamame-600 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-edamame/25 text-sm whitespace-nowrap"
            >
              <Plus size={18} />
              New Case
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-3 mb-5">
          <div className="relative max-w-lg">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" size={17} />
            <input
              type="text"
              placeholder="Search by case, client, email or reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-transparent focus:border-edamame/40 dark:focus:border-edamame/30 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* Summary row */}
        <div className="flex items-center gap-3 mb-4 text-sm text-gray-500 dark:text-slate-400">
          <span className="font-semibold text-gray-700 dark:text-slate-300">{filteredCases.length}</span>
          {filteredCases.length === 1 ? 'case' : 'cases'}
          {searchTerm && <span className="text-xs italic">matching "{searchTerm}"</span>}
        </div>

        {/* Cases Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-800/70 border-b border-gray-100 dark:border-slate-800">
                  <th className="px-5 py-3.5 text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">
                    Case
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest hidden md:table-cell">
                    Client
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest hidden lg:table-cell">
                    Progress
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">
                    Status
                  </th>
                  <th className="px-5 py-3.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800/80">
                {filteredCases.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-slate-600">
                        <FileText size={32} className="opacity-30" />
                        <span className="text-sm">No cases found matching your search.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCases.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => handleViewDetails(c.id)}
                      className="table-row-hover hover:bg-edamame/3 dark:hover:bg-edamame/5 group"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-edamame/10 dark:bg-edamame/15 text-edamame-600 dark:text-edamame-400 flex items-center justify-center flex-shrink-0 group-hover:bg-edamame/15 transition-colors">
                            <FileText size={16} />
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900 dark:text-white text-sm group-hover:text-edamame-600 dark:group-hover:text-edamame-400 transition-colors leading-snug">
                              {c.title}
                            </div>
                            <div className="text-[11px] text-gray-400 dark:text-slate-600 mt-0.5 font-mono">
                              #{c.id.slice(0, 8).toUpperCase()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-slate-200">
                            <User size={13} className="text-gray-400 flex-shrink-0" />
                            {c.clientName}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500">
                            <Mail size={12} className="flex-shrink-0" />
                            {c.clientEmail}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <div className="w-36">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-gray-700 dark:text-slate-300 tabular-nums">{c.progress}%</span>
                            <span className="text-[10px] text-gray-400 dark:text-slate-600">{c.taskCount} tasks</span>
                          </div>
                          <div className="h-1.5 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-edamame progress-fill rounded-full"
                              style={{ width: `${c.progress}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {c.status === 'Completed' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-edamame/10 text-edamame-700 dark:bg-edamame/15 dark:text-edamame-400">
                            <CheckCircle2 size={11} />
                            Completed
                          </span>
                        ) : c.status === 'In Progress' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400">
                            <Clock size={11} />
                            In Progress
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-500">
                            <Clock size={11} />
                            Not Started
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <ChevronRight size={16} className="text-gray-300 dark:text-slate-700 group-hover:text-edamame transition-colors" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
