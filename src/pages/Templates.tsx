import React, { useState } from 'react';
import { WorkflowTemplate } from '../types';
import { Plus, Trash2, FileText, X, Sparkles, ChevronDown, ChevronUp, List } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface TemplatesProps {
  templates: WorkflowTemplate[];
  onAddTemplate: (t: WorkflowTemplate) => void;
  onDeleteTemplate: (id: string) => void;
}

// Deterministic accent per visa subclass, matching the design handoff's
// 186 (green/brand), 482 (blue), 491 (purple), 820 (amber) palette.
// Any subclass not in this map falls back to a stable color chosen by
// hashing the subclass/title, then cycling through the same palette.
const subclassAccents: Record<string, { bar: string; icon: string }> = {
  '186': { bar: 'bg-edamame', icon: 'bg-edamame/10 text-edamame-600 dark:bg-edamame/15 dark:text-edamame-400' },
  '482': { bar: 'bg-blue-500', icon: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  '491': { bar: 'bg-violet-500', icon: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' },
  '820': { bar: 'bg-amber-500', icon: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  '801': { bar: 'bg-amber-500', icon: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  '500': { bar: 'bg-rose-500', icon: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' },
  '600': { bar: 'bg-cyan-500', icon: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400' },
  '485': { bar: 'bg-teal-500', icon: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400' },
  '190': { bar: 'bg-indigo-500', icon: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' },
};

const fallbackAccents = [
  { bar: 'bg-edamame', icon: 'bg-edamame/10 text-edamame-600 dark:bg-edamame/15 dark:text-edamame-400' },
  { bar: 'bg-blue-500', icon: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  { bar: 'bg-violet-500', icon: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' },
  { bar: 'bg-amber-500', icon: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  { bar: 'bg-rose-500', icon: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' },
  { bar: 'bg-cyan-500', icon: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400' },
];

const hashString = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getAccent = (template: WorkflowTemplate, index: number) => {
  const key = (template.visaSubclass || '').replace(/\D/g, '');
  if (key && subclassAccents[key]) return subclassAccents[key];
  const seed = template.visaSubclass || template.title || String(index);
  return fallbackAccents[hashString(seed) % fallbackAccents.length];
};

export const Templates: React.FC<TemplatesProps> = ({ templates, onAddTemplate, onDeleteTemplate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ title: '', description: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplate.title || !newTemplate.description) return;
    onAddTemplate({ id: uuidv4(), title: newTemplate.title, description: newTemplate.description });
    setNewTemplate({ title: '', description: '' });
    setIsEditing(false);
  };

  const systemTemplates = templates.filter(t => t.userId === null || t.userId === undefined);
  const userTemplates = templates.filter(t => t.userId !== null && t.userId !== undefined);

  const TemplateCard = ({ template, index }: { template: WorkflowTemplate; index: number; key?: string }) => {
    const accent = getAccent(template, index);
    const isSystem = template.userId === null || template.userId === undefined;
    const [stepsOpen, setStepsOpen] = useState(false);
    const steps = template.steps || [];
    return (
      <div className="card-lift bg-paper-2 dark:bg-plate-card rounded-xl border border-ink/15 dark:border-plate-ink/20 overflow-hidden">
        {/* Accent top bar */}
        <div className={`h-1 w-full ${accent.bar}`} />
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div className={`w-[30px] h-[30px] rounded-[9px] flex items-center justify-center flex-shrink-0 ${accent.icon}`}>
              <FileText size={16} strokeWidth={1.8} />
            </div>
            <div className="flex items-center gap-1.5">
              {isSystem ? (
                <span className="text-[9px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.1em]">
                  System
                </span>
              ) : (
                <button
                  onClick={() => onDeleteTemplate(template.id)}
                  className="p-1.5 text-ink-soft/40 dark:text-plate-ink-soft/40 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                  aria-label="Delete template"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
          <h3 className="font-bold text-ink dark:text-plate-ink text-[14.5px] tracking-tight mt-3 leading-snug">
            {template.title}
          </h3>
          {template.visaSubclass && (
            <p className="text-[11px] font-semibold text-ink-faint dark:text-plate-ink-faint mt-0.5">
              Subclass {template.visaSubclass}
            </p>
          )}
          <p className="text-xs text-ink-soft dark:text-plate-ink-soft leading-relaxed mt-2 line-clamp-3">
            {template.description}
          </p>

          {steps.length > 0 && (
            <div>
              <button
                onClick={() => setStepsOpen(v => !v)}
                className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:text-edamame-600 dark:hover:text-edamame-400 transition-colors mt-3.5 select-none"
              >
                <List size={13} strokeWidth={1.8} />
                {steps.length} steps
                {stepsOpen ? <ChevronUp size={13} strokeWidth={1.8} /> : <ChevronDown size={13} strokeWidth={1.8} />}
              </button>
              {stepsOpen && (
                <ol className="mt-2.5 border-t border-ink/10 dark:border-plate-ink/15">
                  {steps.map((step, i) => (
                    <li key={i} className="flex gap-2.5 items-baseline py-1.5 border-b border-ink/10 dark:border-plate-ink/15">
                      <span className="flex-shrink-0 w-4 text-[10px] font-extrabold text-ink-faint dark:text-plate-ink-faint">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-xs text-ink-soft dark:text-plate-ink-soft leading-snug">
                        {step.title}
                        {step.description && (
                          <span className="text-ink-faint dark:text-plate-ink-faint"> — {step.description}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-paper dark:bg-plate min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[26px] font-extrabold text-ink dark:text-plate-ink font-ibm-serif tracking-tight">
              Workflow Templates
            </h1>
            <p className="text-sm text-ink-soft dark:text-plate-ink-soft mt-1">
              Define standard procedures for different visa types.
            </p>
          </div>
          <div className="flex sm:justify-end">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="btn-press flex items-center gap-2 bg-edamame hover:bg-edamame-600 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-edamame/25 text-sm whitespace-nowrap"
            >
              <Plus size={16} />
              New Template
            </button>
          </div>
        </div>

      {/* Create form */}
      {isEditing && (
        <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-sm border border-edamame/20 dark:border-edamame/15 p-6 mb-8 modal-content">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-edamame/10 dark:bg-edamame/15 text-edamame-600 flex items-center justify-center">
                <Sparkles size={16} />
              </div>
              <h3 className="text-base font-bold text-ink dark:text-plate-ink">Create New Template</h3>
            </div>
            <button
              onClick={() => setIsEditing(false)}
              className="p-1.5 rounded-lg text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate-card transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-ink-soft dark:text-plate-ink-soft uppercase tracking-wider mb-1.5">
                Template Title
              </label>
              <input
                type="text"
                value={newTemplate.title}
                onChange={e => setNewTemplate({ ...newTemplate, title: e.target.value })}
                placeholder="e.g. 190 Visa Application — Standard"
                className="w-full px-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl text-sm focus:border-edamame/50 dark:focus:border-edamame/30 text-ink dark:text-plate-ink outline-none transition-colors placeholder-ink-soft/50 dark:placeholder-plate-ink-soft/50"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-soft dark:text-plate-ink-soft uppercase tracking-wider mb-1.5">
                Process Description
              </label>
              <p className="text-xs text-ink-faint dark:text-plate-ink-faint mb-2">
                Describe the steps — the AI will use this to generate specific tasks.
              </p>
              <textarea
                value={newTemplate.description}
                onChange={e => setNewTemplate({ ...newTemplate, description: e.target.value })}
                rows={4}
                placeholder="1. Gather ID documents. 2. Request skills assessment. 3. Submit EOI..."
                className="w-full px-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl text-sm focus:border-edamame/50 dark:focus:border-edamame/30 text-ink dark:text-plate-ink outline-none transition-colors placeholder-ink-soft/50 dark:placeholder-plate-ink-soft/50 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-sm font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate-card rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-press px-5 py-2 text-sm font-semibold bg-edamame hover:bg-edamame-600 text-white rounded-xl shadow-sm shadow-edamame/20 transition-all"
              >
                Save Template
              </button>
            </div>
          </form>
        </div>
      )}

      {/* System templates */}
      {systemTemplates.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-[22px] h-px bg-ink/20 dark:bg-plate-ink/20" />
            <span className="text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.12em]">
              Built-in Templates
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {systemTemplates.map((template, i) => (
              <TemplateCard key={template.id} template={template} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* User templates */}
      {userTemplates.length > 0 && (
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-[22px] h-px bg-ink/20 dark:bg-plate-ink/20" />
            <span className="text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.12em]">
              Custom Templates
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {userTemplates.map((template, i) => (
              <TemplateCard key={template.id} template={template} index={i + systemTemplates.length} />
            ))}
          </div>
        </div>
      )}

        {templates.length === 0 && (
          <div className="text-center py-20">
            <div className="flex flex-col items-center gap-3 text-ink-faint dark:text-plate-ink-faint">
              <FileText size={36} className="opacity-25" />
              <p className="text-sm">No templates yet. Create your first template to get started.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
