import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { generateTasksFromCase } from '../services/geminiService';
import { WorkflowTemplate, Task, Client, Case } from '../types';
import { Sparkles, Calendar, ArrowRight, Loader2, Save, Search, User, ChevronDown } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface NewCaseProps {
  templates: WorkflowTemplate[];
  clients: Client[];
  onTasksConfirmed: (tasks: Task[], newCase: Case) => void;
  onChangeView: (view: any) => void;
}

export const NewCase: React.FC<NewCaseProps> = ({ templates, clients, onTasksConfirmed, onChangeView: onGoBack }) => {
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
    
    const clientContext = selectedClient 
      ? `Client Info: Name: ${selectedClient.name}, DOB: ${selectedClient.dob}. ` 
      : '';

    try {
      const tasks = await generateTasksFromCase(
        clientContext + description, 
        selectedTemplate?.description || '', 
        startDate
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
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Case Description <span className="text-gray-400 dark:text-slate-500 font-normal">(Max 3000 words)</span>
              </label>
              <textarea 
                rows={8}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:focus:ring-green-600 focus:border-green-500 dark:focus:border-green-600 text-gray-900 dark:text-white outline-none transition-all resize-none"
                placeholder="Describe the case background, specific visa subclass goals, and any constraints..."
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
