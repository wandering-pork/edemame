import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Case, Client, Task, WorkflowTemplate, TeamMember } from '../types';
import { Search, Plus, FileText, X } from 'lucide-react';
import { NewCase } from './NewCase';
import { CaseCard } from '../components/CaseCard';

interface CaseManagerProps {
  cases: Case[];
  clients: Client[];
  tasks: Task[];
  templates: WorkflowTemplate[];
  teamMembers?: TeamMember[];
  onTasksConfirmed: (tasks: Task[], newCase: Case) => void;
  onAssignCase?: (caseId: string, newOwnerId: string, note?: string) => void;
}

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

  const filteredCases = useMemo(() => {
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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
          <div>
            <h1 className="text-3xl md:text-4xl font-ibm-serif font-bold text-slate-900 dark:text-white mb-2">
              Case Manager
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-400">
              Track and manage all immigration cases at a glance
            </p>
          </div>
          <button
            onClick={() => setShowIntake(true)}
            className="btn-press flex items-center justify-center gap-2 bg-edamame-500 hover:bg-edamame-600 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-edamame-500/30 text-sm whitespace-nowrap"
          >
            <Plus size={18} />
            New Case
          </button>
        </div>

        {/* Search bar */}
        <div className="relative max-w-md mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
          <input
            type="text"
            placeholder="Search cases, clients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-edamame-500 dark:focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 rounded-xl text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 outline-none transition-all"
          />
        </div>

        {/* Results count */}
        <div className="mb-8">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-white">{filteredCases.length}</span>{' '}
            {filteredCases.length === 1 ? 'case' : 'cases'}
            {searchTerm && <span className="ml-2 italic">matching "{searchTerm}"</span>}
          </p>
        </div>

        {/* Cases Grid */}
        {filteredCases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <FileText size={32} className="text-slate-400 dark:text-slate-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">No cases found</h3>
            <p className="text-slate-600 dark:text-slate-400">Try adjusting your search or create a new case</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredCases.map((c) => {
              const client = clients.find(cl => cl.id === c.clientId);
              const caseTasks = tasks.filter(t => t.caseId === c.id);
              const owner = teamMembers.find(m => m.id === c.caseOwner);
              return (
                <CaseCard
                  key={c.id}
                  case={c}
                  client={client || { id: '', name: 'Unknown', email: '', phone: '', dob: '', nationality: '' }}
                  tasks={caseTasks}
                  owner={owner}
                  onAssignClick={onAssignCase ? (id) => { setAssignModalCaseId(id); setAssignTarget(c.caseOwner || ''); setAssignNote(''); } : undefined}
                  onViewDetails={handleViewDetails}
                />
              );
            })}
          </div>
        )}
      </div>

      {assignModalCaseId && onAssignCase && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4 z-50 modal-backdrop">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full modal-content">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-ibm-serif font-bold text-slate-900 dark:text-white">Assign Case</h2>
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
