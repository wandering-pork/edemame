import React, { useState } from 'react';
import { WorkflowTemplate } from '../types';
import { Plus, Trash2, FileText, X, Sparkles } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface TemplatesProps {
  templates: WorkflowTemplate[];
  onAddTemplate: (t: WorkflowTemplate) => void;
  onDeleteTemplate: (id: string) => void;
}

// Assign a stable accent color per template based on index
const accentColors = [
  { bar: 'bg-edamame', icon: 'bg-edamame/10 text-edamame-600 dark:bg-edamame/15 dark:text-edamame-400' },
  { bar: 'bg-blue-500', icon: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  { bar: 'bg-violet-500', icon: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' },
  { bar: 'bg-amber-500', icon: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  { bar: 'bg-rose-500', icon: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' },
  { bar: 'bg-cyan-500', icon: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400' },
];

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
    const accent = accentColors[index % accentColors.length];
    const isSystem = template.userId === null || template.userId === undefined;
    return (
      <div className="card-lift bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden group">
        {/* Accent top bar */}
        <div className={`h-1 w-full ${accent.bar}`} />
        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent.icon}`}>
              <FileText size={18} />
            </div>
            <div className="flex items-center gap-1.5">
              {isSystem && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-edamame/8 dark:bg-edamame/12 text-edamame-700 dark:text-edamame-400 uppercase tracking-wider">
                  System
                </span>
              )}
              {!isSystem && (
                <button
                  onClick={() => onDeleteTemplate(template.id)}
                  className="p-1.5 text-gray-300 dark:text-slate-700 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                  aria-label="Delete template"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
          <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-1.5 leading-snug">
            {template.title}
          </h3>
          {template.visaSubclass && (
            <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 mb-2">
              Subclass {template.visaSubclass}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed line-clamp-3">
            {template.description}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-gray-50 dark:bg-slate-950 min-h-screen transition-colors duration-200 page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white font-fredoka tracking-tight">
            Workflow Templates
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Define standard procedures for different visa types.
          </p>
        </div>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="btn-press flex items-center gap-2 bg-edamame hover:bg-edamame-600 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-edamame/25 text-sm"
        >
          <Plus size={16} />
          New Template
        </button>
      </div>

      {/* Create form */}
      {isEditing && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-edamame/20 dark:border-edamame/15 p-6 mb-8 modal-content">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-edamame/10 dark:bg-edamame/15 text-edamame-600 flex items-center justify-center">
                <Sparkles size={16} />
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Create New Template</h3>
            </div>
            <button
              onClick={() => setIsEditing(false)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                Template Title
              </label>
              <input
                type="text"
                value={newTemplate.title}
                onChange={e => setNewTemplate({ ...newTemplate, title: e.target.value })}
                placeholder="e.g. 190 Visa Application — Standard"
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:border-edamame/50 dark:focus:border-edamame/30 text-gray-900 dark:text-white outline-none transition-colors placeholder-gray-400 dark:placeholder-slate-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                Process Description
              </label>
              <p className="text-xs text-gray-400 dark:text-slate-500 mb-2">
                Describe the steps — the AI will use this to generate specific tasks.
              </p>
              <textarea
                value={newTemplate.description}
                onChange={e => setNewTemplate({ ...newTemplate, description: e.target.value })}
                rows={4}
                placeholder="1. Gather ID documents. 2. Request skills assessment. 3. Submit EOI..."
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:border-edamame/50 dark:focus:border-edamame/30 text-gray-900 dark:text-white outline-none transition-colors placeholder-gray-400 dark:placeholder-slate-600 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
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
          <h2 className="text-xs font-bold text-gray-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="w-4 h-px bg-gray-300 dark:bg-slate-700" />
            Built-in Templates
            <span className="flex-1 h-px bg-gray-100 dark:bg-slate-800" />
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {systemTemplates.map((template, i) => (
              <TemplateCard key={template.id} template={template} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* User templates */}
      {userTemplates.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gray-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="w-4 h-px bg-gray-300 dark:bg-slate-700" />
            Custom Templates
            <span className="flex-1 h-px bg-gray-100 dark:bg-slate-800" />
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {userTemplates.map((template, i) => (
              <TemplateCard key={template.id} template={template} index={i + systemTemplates.length} />
            ))}
          </div>
        </div>
      )}

      {templates.length === 0 && (
        <div className="text-center py-20">
          <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-slate-600">
            <FileText size={36} className="opacity-25" />
            <p className="text-sm">No templates yet. Create your first template to get started.</p>
          </div>
        </div>
      )}
    </div>
  );
};
