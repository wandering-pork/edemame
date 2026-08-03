import React, { useMemo, useState } from 'react';
import { X, ChevronRight, ChevronLeft, Plus, Trash2, Sparkles, CheckSquare, Square } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { DocumentChecklistItem, WorkflowTemplate } from '../../types';
import { getCategoriesForSubclass, generateChecklistForCategories, mergeWithWorkflowTemplateSteps } from '../../lib/checklistTemplates';

interface DocumentChecklistGeneratorProps {
  caseId: string;
  visaSubclass?: string;
  /** The case's workflow template, if any — its steps are merged in as firm-level customisation. */
  workflowTemplate?: WorkflowTemplate;
  onClose: () => void;
  /** Called with the final generated + user-added items when the user clicks "Generate". */
  onGenerate: (items: DocumentChecklistItem[]) => void;
}

/**
 * Document Checklist Generator — built-in Workspace Tool.
 *
 * Step 1: pick one or more document categories (per-visa-subclass subsections
 * from the system default checklist).
 * Step 2: preview the generated checklist (system default + workflow template
 * steps merged in), with the ability to manually add missing items before
 * confirming. Confirming populates the Document Checklist tab.
 */
export const DocumentChecklistGenerator: React.FC<DocumentChecklistGeneratorProps> = ({
  caseId,
  visaSubclass,
  workflowTemplate,
  onClose,
  onGenerate,
}) => {
  const categories = useMemo(() => (visaSubclass ? getCategoriesForSubclass(visaSubclass) : []), [visaSubclass]);
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Set<string>>(new Set(categories));
  const [preview, setPreview] = useState<DocumentChecklistItem[]>([]);
  const [manualLabel, setManualLabel] = useState('');
  const [manualCategory, setManualCategory] = useState('Manually Added');

  const toggleCategory = (cat: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const goToPreview = () => {
    if (!visaSubclass) return;
    const chosen: string[] = Array.from(selected.values());
    const systemItems = generateChecklistForCategories(caseId, visaSubclass, chosen);
    const merged = workflowTemplate?.steps?.length
      ? mergeWithWorkflowTemplateSteps(systemItems, caseId, workflowTemplate.steps)
      : systemItems;
    setPreview(merged);
    setStep(2);
  };

  const addManualItem = () => {
    if (!manualLabel.trim()) return;
    setPreview(prev => [
      ...prev,
      {
        id: uuidv4(),
        caseId,
        label: manualLabel.trim(),
        status: 'pending',
        category: manualCategory.trim() || 'Manually Added',
        manuallyAdded: true,
      },
    ]);
    setManualLabel('');
  };

  const removeItem = (id: string) => setPreview(prev => prev.filter(i => i.id !== id));

  const groupedPreview = useMemo(() => {
    const groups = new Map<string, DocumentChecklistItem[]>();
    for (const item of preview) {
      const cat = item.category || 'Uncategorised';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    return Array.from(groups.entries());
  }, [preview]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-edamame/10 dark:bg-edamame/15 flex items-center justify-center">
              <Sparkles size={15} className="text-edamame" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-gray-900 dark:text-white leading-tight">Document Checklist Generator</h3>
              <p className="text-[11px] text-gray-400 dark:text-slate-500">
                Step {step} of 2 — {step === 1 ? 'Select categories' : 'Review & add items'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          {!visaSubclass || categories.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400 dark:text-slate-500">
              No system default checklist is defined for this case's visa subclass yet.
            </div>
          ) : step === 1 ? (
            <div className="space-y-2">
              <p className="text-[12px] text-gray-500 dark:text-slate-400 mb-3">
                Select one or more document categories to generate a checklist for. Categories map to the subsections
                defined per visa type in the system default checklist.
              </p>
              {categories.map(cat => {
                const isSelected = selected.has(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-colors ${
                      isSelected
                        ? 'border-edamame bg-edamame/[0.06] dark:bg-edamame/[0.08]'
                        : 'border-gray-200 dark:border-slate-700 hover:border-edamame/50'
                    }`}
                  >
                    {isSelected ? <CheckSquare size={16} className="text-edamame flex-shrink-0" /> : <Square size={16} className="text-gray-300 dark:text-slate-600 flex-shrink-0" />}
                    <span className="text-[13px] font-semibold text-gray-800 dark:text-slate-200">{cat}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-5">
              {groupedPreview.map(([cat, items]) => (
                <div key={cat}>
                  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500 mb-1.5">{cat}</div>
                  <div className="rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
                    {items.map(item => (
                      <div key={item.id} className="flex items-center gap-2 px-3.5 py-2 border-b border-gray-100 dark:border-slate-800 last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-semibold text-gray-800 dark:text-slate-200 truncate">{item.label}</div>
                          {item.description && <div className="text-[10.5px] text-gray-400 dark:text-slate-500 truncate">{item.description}</div>}
                        </div>
                        <button onClick={() => removeItem(item.id)} className="p-1 text-gray-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 flex-shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Manually add missing item */}
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 p-3.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500 mb-2">Add a missing item</div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={manualLabel}
                    onChange={e => setManualLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                    placeholder="Document name…"
                    className="flex-1 min-w-0 px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-[12.5px] text-gray-800 dark:text-white outline-none focus:border-edamame"
                  />
                  <input
                    value={manualCategory}
                    onChange={e => setManualCategory(e.target.value)}
                    placeholder="Category"
                    className="sm:w-48 px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-[12.5px] text-gray-800 dark:text-white outline-none focus:border-edamame"
                  />
                  <button
                    onClick={addManualItem}
                    disabled={!manualLabel.trim()}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-edamame hover:bg-edamame-600 disabled:opacity-40 text-white font-bold rounded-lg text-[12px] transition-colors flex-shrink-0"
                  >
                    <Plus size={13} /> Add
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-between flex-shrink-0">
          {step === 2 ? (
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              <ChevronLeft size={15} /> Back
            </button>
          ) : <span />}

          {step === 1 ? (
            <button
              onClick={goToPreview}
              disabled={selected.size === 0 || !visaSubclass}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-edamame hover:bg-edamame-600 disabled:opacity-40 text-white font-bold rounded-xl shadow-lg shadow-edamame/20 transition-all"
            >
              Next <ChevronRight size={15} />
            </button>
          ) : (
            <button
              onClick={() => onGenerate(preview)}
              disabled={preview.length === 0}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-edamame hover:bg-edamame-600 disabled:opacity-40 text-white font-bold rounded-xl shadow-lg shadow-edamame/20 transition-all"
            >
              <Sparkles size={15} /> Generate Checklist
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentChecklistGenerator;
