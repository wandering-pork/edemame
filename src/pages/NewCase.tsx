import React, { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { generateTasksFromCase } from '../services/geminiService';
import { WorkflowTemplate, Task, Client, Case } from '../types';
import { Sparkles, Calendar, ArrowRight, Loader2, Save, Search, User, ChevronDown } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface NewCaseProps {
  templates: WorkflowTemplate[];
  clients: Client[];
  suggestedTemplateKeyword?: string | null;
  onTasksConfirmed: (tasks: Task[], newCase: Case) => void;
  onChangeView: (view: any) => void;
}

// Contextual placeholder hints keyed by visa subclass.
// Client bio (name, DOB, nationality, passport) is auto-injected — don't ask for those here.
const DESCRIPTION_HINTS: Record<string, string> = {
  '186': `What to include for Subclass 186 (ENS):
• Current visa status & expiry date (onshore / offshore?)
• Pathway: Direct Entry or Temporary Residence Transition (TRT)?
• Employer name, industry, and nominated occupation (ANZSCO code)
• How long has the applicant worked for this employer?
• Skills assessment status — body, lodgement date, outcome (if known)
• English test — type (IELTS/PTE/TOEFL), score, date sat
• Any prior visa refusals or character issues
• Dependants to include (names, ages, relationship)`,

  '482': `What to include for Subclass 482 (TSS):
• Current visa status & expiry date (onshore / offshore?)
• Stream: Short-term, Medium-term, or Labour Agreement?
• Employer name and whether they hold an approved sponsorship (SBS)
• Nominated occupation (ANZSCO code) and job title
• Labour Market Testing evidence — has employer advertised locally?
• English test — type (IELTS/PTE), score, date sat
• Skills assessment required? (occupation-dependent)
• Preferred visa duration (1–4 years) and pathway to PR intent
• Dependants to include (names, ages, relationship)`,

  '490': `What to include for Subclass 490 (Skilled Regional):
• Current visa status & expiry date (onshore / offshore?)
• Nominated occupation (ANZSCO code) and current points score
• Skills assessment — body (TRA/ACS/Engineers Australia/etc.), status, outcome
• English test — type (IELTS/PTE), score (higher = more points)
• Target state/territory for nomination and reason (family, job offer, etc.)
• SkillSelect EOI — submitted? Profile ID?
• Family sponsor in regional Australia? (if taking that pathway)
• Dependants to include (names, ages, relationship)`,

  '820': `What to include for Subclass 820/801 (Partner — Onshore):
• Current visa status & expiry (must be onshore at lodgement)
• Sponsor details: name, Australian citizenship / PR / NZ citizen status
• How long have applicant and sponsor been in a relationship?
• De facto or married? Date of marriage / commencement of de facto
• Cohabitation — living together? Since when? Same address on docs?
• Evidence ready: joint bank accounts, lease/mortgage, photos, travel together
• Any prior visa refusals, character issues, or previous relationships (sponsor)
• Dependants to include on application`,

  // Fallback for custom/unknown subclasses
  default: `What to include for best AI results:
• Current visa status & expiry date (onshore or offshore?)
• Specific immigration goal and why this visa subclass
• Key prerequisites already completed (skills assessment, English test, EOI, etc.)
• Any hard deadlines — course start date, job offer expiry, bridging visa expiry
• Known complications — prior refusals, health issues, character matters
• Dependants to include (names, ages, relationship)`,
};

function getDescriptionPlaceholder(template: WorkflowTemplate | undefined): string {
  if (!template) {
    return 'Select a workflow template above, then describe the case — current visa status, goals, deadlines, and any complications...';
  }
  const key = template.visaSubclass ?? 'default';
  return DESCRIPTION_HINTS[key] ?? DESCRIPTION_HINTS['default'];
}

export const NewCase: React.FC<NewCaseProps> = ({ templates, clients, suggestedTemplateKeyword, onTasksConfirmed, onChangeView: onGoBack }) => {
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [isLoading, setIsLoading] = useState(false);

  // Form State
  const [clientId, setClientId] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Custom Select State
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState('');

  const [generatedTasks, setGeneratedTasks] = useState<Partial<Task>[]>([]);

  // Auto-select suggested template if provided
  useEffect(() => {
    if (suggestedTemplateKeyword) {
      const suggestedTemplate = templates.find(t =>
        t.visaSubclass?.includes(suggestedTemplateKeyword) ||
        t.title?.includes(suggestedTemplateKeyword)
      );
      if (suggestedTemplate) {
        setTemplateId(suggestedTemplate.id);
      }
    }
  }, [suggestedTemplateKeyword, templates]);

  // Filter clients for dropdown
  const filteredClients = useMemo(() => {
    return clients.filter(c => 
      c.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) || 
      c.email.toLowerCase().includes(clientSearchTerm.toLowerCase())
    );
  }, [clients, clientSearchTerm]);

  const selectedClient = clients.find(c => c.id === clientId);

  const handleAnalyze = async () => {
    if (!description || !templateId || !clientId) return;

    setIsLoading(true);
    const selectedTemplate = templates.find(t => t.id === templateId);

    // Build rich client context — the more the LLM knows, the more specific the tasks
    const clientLines: string[] = [];
    if (selectedClient) {
      clientLines.push(`Name: ${selectedClient.name}`);
      if (selectedClient.dob)         clientLines.push(`Date of Birth: ${selectedClient.dob}`);
      if (selectedClient.nationality) clientLines.push(`Nationality: ${selectedClient.nationality}`);
      if (selectedClient.passportNumber) clientLines.push(`Passport Number: ${selectedClient.passportNumber}`);
      if (selectedClient.passportExpiry)  clientLines.push(`Passport Expiry: ${selectedClient.passportExpiry}`);
      if (selectedClient.gender)      clientLines.push(`Gender: ${selectedClient.gender}`);
    }
    const clientContext = clientLines.length
      ? `CLIENT PROFILE:\n${clientLines.join('\n')}\n\nCASE NOTES:\n`
      : '';

    try {
      const tasks = await generateTasksFromCase(
        clientContext + description,
        selectedTemplate?.description || '',
        startDate,
        selectedTemplate?.visaSubclass,
        selectedTemplate?.title,
        selectedTemplate?.steps,
      );
      setGeneratedTasks(tasks);
      setStep('review');
    } catch (e) {
      alert("Failed to generate tasks. Please check your connection or API key.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!selectedClient) return;

    const newCaseId = uuidv4();
    const selectedTemplate = templates.find(t => t.id === templateId);
    
    const newCase: Case = {
      id: newCaseId,
      clientId: selectedClient.id,
      title: `${selectedTemplate?.title} - ${selectedClient.name}`,
      description: description,
      templateId: templateId,
      status: 'open',
      startDate: startDate,
      createdAt: new Date().toISOString()
    };

    const finalTasks: Task[] = generatedTasks.map((t, index) => ({
      id: uuidv4(),
      title: t.title || 'Untitled Task',
      description: t.description || '',
      date: t.date || startDate,
      isCompleted: false,
      priorityOrder: index,
      generatedByAi: true,
      caseId: newCaseId, 
    }));

    onTasksConfirmed(finalTasks, newCase);
    onGoBack('cases');
  };

  const updateGeneratedTask = (index: number, field: string, value: string) => {
    const updated = [...generatedTasks];
    updated[index] = { ...updated[index], [field]: value };
    setGeneratedTasks(updated);
  };

  const handleSelectClient = (client: Client) => {
    setClientId(client.id);
    setClientSearchTerm(client.name);
    setIsClientDropdownOpen(false);
  };

  if (step === 'input') {
    return (
      <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-gray-50 dark:bg-slate-950 min-h-screen transition-colors duration-200">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">New Case Intake</h1>
              <p className="text-gray-500 dark:text-slate-400">Select a client and let AI plan the workflow.</p>
            </div>
            <button 
              onClick={() => onGoBack('cases')}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 p-8 space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Custom Client Selector */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Client Name</label>
                <div 
                  className="relative"
                  onClick={() => setIsClientDropdownOpen(true)}
                >
                  <User className="absolute left-3 top-2.5 text-gray-400 dark:text-slate-500" size={18} />
                  <input 
                    type="text"
                    value={clientSearchTerm}
                    onChange={(e) => {
                      setClientSearchTerm(e.target.value);
                      setIsClientDropdownOpen(true);
                      if (clientId && e.target.value !== clients.find(c => c.id === clientId)?.name) {
                        setClientId(''); // Clear selection if typing
                      }
                    }}
                    onFocus={() => setIsClientDropdownOpen(true)}
                    className="w-full pl-10 pr-10 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:focus:ring-green-600 focus:border-green-500 dark:focus:border-green-600 text-gray-900 dark:text-white outline-none"
                    placeholder="Search client..."
                  />
                  <ChevronDown className="absolute right-3 top-3 text-gray-400 dark:text-slate-500 pointer-events-none" size={16} />
                </div>

                {isClientDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsClientDropdownOpen(false)}
                    ></div>
                    <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredClients.length === 0 ? (
                        <div className="p-3 text-sm text-gray-500 dark:text-slate-500 italic">No clients found.</div>
                      ) : (
                        filteredClients.map(c => (
                          <div 
                            key={c.id}
                            onClick={() => handleSelectClient(c)}
                            className="p-3 hover:bg-green-50 dark:hover:bg-slate-700 cursor-pointer border-b border-gray-100 dark:border-slate-700 last:border-0"
                          >
                            <div className="font-medium text-gray-900 dark:text-white">{c.name}</div>
                            <div className="flex gap-2 text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                              <span>DOB: {c.dob || 'N/A'}</span>
                              <span>•</span>
                              <span>{c.phone || c.email || 'No Contact Info'}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Start Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 text-gray-400 dark:text-slate-500" size={18} />
                  <input 
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:focus:ring-green-600 focus:border-green-500 dark:focus:border-green-600 text-gray-900 dark:text-white outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Select Workflow Template</label>
              <select 
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:focus:ring-green-600 focus:border-green-500 dark:focus:border-green-600 text-gray-900 dark:text-white outline-none"
              >
                <option value="">-- Choose a Workflow --</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Case Notes
                </label>
                <span className="text-xs text-gray-400 dark:text-slate-500">
                  {templateId
                    ? 'Placeholder shows what to include for this visa type'
                    : 'Select a template to see guided prompts'}
                </span>
              </div>
              <textarea
                rows={10}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:focus:ring-green-600 focus:border-green-500 dark:focus:border-green-600 text-gray-900 dark:text-white outline-none transition-all resize-none text-sm leading-relaxed"
                placeholder={getDescriptionPlaceholder(templates.find(t => t.id === templateId))}
              />
            </div>

            <div className="pt-4 flex justify-end">
              <button 
                onClick={handleAnalyze}
                disabled={isLoading || !description || !templateId || !clientId}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-900/20"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Analyzing Workflow...
                  </>
                ) : (
                  <>
                    <Sparkles size={20} />
                    Generate Plan with AI
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-gray-50 dark:bg-slate-950 min-h-screen transition-colors duration-200">
       <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Review Plan</h1>
              <p className="text-gray-500 dark:text-slate-400">Review AI suggested dates and tasks for <strong>{selectedClient?.name}</strong>.</p>
            </div>
            <button 
              onClick={() => setStep('input')}
              className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white underline"
            >
              Back to Edit
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="p-6 bg-green-50 dark:bg-green-900/20 border-b border-green-100 dark:border-green-900/30">
               <div className="flex items-center gap-2 text-green-800 dark:text-green-400 font-medium">
                 <Sparkles size={18} />
                 <span>AI Suggestion</span>
               </div>
               <p className="text-green-700 dark:text-green-500 text-sm mt-1">
                 Based on the "{templates.find(t => t.id === templateId)?.title}" workflow.
               </p>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {generatedTasks.map((task, idx) => (
                <div key={idx} className="p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                   <div className="md:col-span-3">
                     <div className="flex items-center justify-between mb-1">
                       <label className="text-xs text-gray-400 dark:text-slate-500 font-semibold uppercase block">Due Date</label>
                       <button 
                         onClick={() => updateGeneratedTask(idx, 'date', format(new Date(), 'yyyy-MM-dd'))}
                         className="text-[10px] font-bold text-green-600 hover:text-green-500 uppercase tracking-tighter"
                       >
                         Today
                       </button>
                     </div>
                     <input 
                       type="date"
                       value={task.date}
                       onChange={(e) => updateGeneratedTask(idx, 'date', e.target.value)}
                       className="w-full text-sm bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:border-green-500 focus:ring-green-500 text-gray-900 dark:text-white"
                     />
                   </div>
                   <div className="md:col-span-9">
                      <div className="mb-2">
                        <input 
                           type="text"
                           value={task.title}
                           onChange={(e) => updateGeneratedTask(idx, 'title', e.target.value)}
                           className="w-full font-medium text-gray-900 dark:text-white border-none bg-transparent p-0 focus:ring-0 placeholder-gray-400"
                           placeholder="Task Title"
                        />
                      </div>
                      <textarea
                         value={task.description}
                         onChange={(e) => updateGeneratedTask(idx, 'description', e.target.value)}
                         rows={2}
                         className="w-full text-sm text-gray-500 dark:text-slate-400 border-none bg-transparent p-0 focus:ring-0 resize-none placeholder-gray-300 dark:placeholder-slate-600"
                         placeholder="Description"
                      />
                   </div>
                </div>
              ))}
            </div>

            <div className="p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-800 flex justify-end gap-3">
               <button 
                 onClick={() => setStep('input')}
                 className="px-6 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 font-medium hover:bg-white dark:hover:bg-slate-800 transition-colors"
               >
                 Cancel
               </button>
               <button 
                 onClick={handleConfirm}
                 className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-colors shadow-sm"
               >
                 <Save size={18} />
                 Confirm & Create Case
               </button>
            </div>
          </div>
       </div>
    </div>
  );
};
