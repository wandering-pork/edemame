import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Case, Client, Task, WorkflowTemplate } from '../types';
import { Search, Plus, FileText } from 'lucide-react';
import { NewCase } from './NewCase';
import { CaseCard } from '../components/CaseCard';

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
              return (
                <CaseCard
                  key={c.id}
                  case={c}
                  client={client || { id: '', name: 'Unknown', email: '', phone: '', dob: '', nationality: '' }}
                  tasks={caseTasks}
                  onViewDetails={handleViewDetails}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
