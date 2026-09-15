import React, { useMemo, useState } from 'react';
import { X, ChevronRight, ChevronLeft, Plus, Trash2, Sparkles, CheckSquare, Square } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { DocumentChecklistItem, WorkflowTemplate } from '../../types';
import { getCategoriesForSubclass, generateChecklistForCategories, mergeWithWorkflowTemplateSteps } from '../../lib/checklistTemplates';
import { DocumentTypePicker } from '../DocumentTypePicker';
import { useDocumentTypes } from '@/contexts/DocumentTypeContext';
import { suggestDocumentTypeCode } from '../../lib/documentTypes';

/** The category generated items with no home end up in (issue #4 §5.3). */
export const ADDITIONAL_DOCUMENTS_CATEGORY = 'Additional Documents';

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
 * Step 2: review the generated checklist (system default + workflow template
 * steps merged in). Every generated item carries a Document Type defaulted
 * from the firm's configured list, editable here and later on the Document
 * Checklist tab; each category has a "+" to add a missing item, and the
 * "Additional Documents" section at the bottom takes anything else.
 */
export const DocumentChecklistGenerator: React.FC<DocumentChecklistGeneratorProps> = ({
  caseId,
  visaSubclass,
  workflowTemplate,
  onClose,
  onGenerate,
}) => {
  const { documentTypes } = useDocumentTypes();
  const categories = useMemo(() => (visaSubclass ? getCategoriesForSubclass(visaSubclass) : []), [visaSubclass]);
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Set<string>>(new Set(categories));
  const [preview, setPreview] = useState<DocumentChecklistItem[]>([]);
  const [manualLabel, setManualLabel] = useState('');
  const [manualTypeCode, setManualTypeCode] = useState<string | undefined>(undefined);
  /** Category whose inline "+ add missing item" row is open (§5.2). */
  const [addingInCategory, setAddingInCategory] = useState<string | null>(null);
  const [categoryItemLabel, setCategoryItemLabel] = useState('');
  const [categoryItemTypeCode, setCategoryItemTypeCode] = useState<string | undefined>(undefined);

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
    // §5.1 — default each generated item's Document Type from the firm's list.
    setPreview(
      merged.map(item => ({
        ...item,
        documentTypeCode: suggestDocumentTypeCode(item.label, documentTypes, item.description),
      })),
    );
    setStep(2);
  };

  const addItem = (label: string, category: string, documentTypeCode?: string) => {
    setPreview(prev => [
      ...prev,
      {
        id: uuidv4(),
        caseId,
        label: label.trim(),
        status: 'pending',
        category,
        manuallyAdded: true,
        documentTypeCode: documentTypeCode || suggestDocumentTypeCode(label, documentTypes),
      },
    ]);
  };

  const addManualItem = () => {
    if (!manualLabel.trim()) return;
    addItem(manualLabel, ADDITIONAL_DOCUMENTS_CATEGORY, manualTypeCode);
    setManualLabel('');
    setManualTypeCode(undefined);
  };

  const addCategoryItem = (category: string) => {
    if (!categoryItemLabel.trim()) return;
    addItem(categoryItemLabel, category, categoryItemTypeCode);
    setCategoryItemLabel('');
    setCategoryItemTypeCode(undefined);
    setAddingInCategory(null);
  };

  const removeItem = (id: string) => setPreview(prev => prev.filter(i => i.id !== id));

  const setItemType = (id: string, code: string) =>
    setPreview(prev => prev.map(i => (i.id === id ? { ...i, documentTypeCode: code } : i)));

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
      <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden border border-ink/10 dark:border-plate-ink/15 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-ink/10 dark:border-plate-ink/15 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-edamame/10 dark:bg-edamame/15 flex items-center justify-center">
              <Sparkles size={15} className="text-edamame" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-ink dark:text-plate-ink leading-tight">Document Checklist Generator</h3>
              <p className="text-[11px] text-ink-faint dark:text-plate-ink-faint">
                Step {step} of 2 — {step === 1 ? 'Select categories' : 'Review & add items'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft rounded-lg hover:bg-paper-2 dark:hover:bg-plate-card transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          {!visaSubclass || categories.length === 0 ? (
            <div className="text-center py-10 text-sm text-ink-faint dark:text-plate-ink-faint">
              No system default checklist is defined for this case's visa subclass yet.
            </div>
          ) : step === 1 ? (
            <div className="space-y-2">
              <p className="text-[12px] text-ink-soft dark:text-plate-ink-soft mb-3">
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
                        : 'border-ink/15 dark:border-plate-ink/20 hover:border-edamame/50'
                    }`}
                  >
                    {isSelected ? <CheckSquare size={16} className="text-edamame flex-shrink-0" /> : <Square size={16} className="text-ink-soft/40 dark:text-plate-ink-soft/40 flex-shrink-0" />}
                    <span className="text-[13px] font-semibold text-ink dark:text-plate-ink-soft">{cat}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-[11.5px] text-ink-soft dark:text-plate-ink-soft">
                Each item is tagged with a Document Type from your firm's list. Change any that were guessed wrong —
                you can also change them later on the Document Checklist tab.
              </p>

              {groupedPreview.map(([cat, items]) => (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint dark:text-plate-ink-faint">{cat}</div>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingInCategory(current => (current === cat ? null : cat));
                        setCategoryItemLabel('');
                        setCategoryItemTypeCode(undefined);
                      }}
                      title={`Add a missing item to "${cat}"`}
                      className="inline-flex items-center gap-1 text-[10.5px] font-bold px-1.5 py-0.5 rounded-md text-ink-faint dark:text-plate-ink-faint hover:text-edamame hover:bg-edamame/[0.08] transition-colors"
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>
                  <div className="rounded-xl border border-ink/15 dark:border-plate-ink/20 overflow-hidden">
                    {items.map(item => (
                      <div key={item.id} className="flex items-center gap-2 px-3.5 py-2 border-b border-ink/10 dark:border-plate-ink/15 last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-semibold text-ink dark:text-plate-ink-soft truncate">{item.label}</div>
                          {item.description && <div className="text-[10.5px] text-ink-faint dark:text-plate-ink-faint truncate">{item.description}</div>}
                        </div>
                        <DocumentTypePicker
                          value={item.documentTypeCode}
                          onChange={code => setItemType(item.id, code)}
                          compact
                          className="w-52 flex-shrink-0"
                        />
                        <button onClick={() => removeItem(item.id)} className="p-1 text-ink-soft/40 dark:text-plate-ink-soft/40 hover:text-red-500 dark:hover:text-red-400 flex-shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    {addingInCategory === cat && (
                      <div className="flex flex-col sm:flex-row gap-2 px-3.5 py-2.5 bg-paper-2 dark:bg-plate-card/50 border-t border-ink/10 dark:border-plate-ink/15">
                        <input
                          autoFocus
                          value={categoryItemLabel}
                          onChange={e => setCategoryItemLabel(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategoryItem(cat); } }}
                          placeholder="Document name…"
                          className="flex-1 min-w-0 px-3 py-1.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-[12px] text-ink dark:text-plate-ink outline-none focus:border-edamame"
                        />
                        <DocumentTypePicker
                          value={categoryItemTypeCode}
                          onChange={setCategoryItemTypeCode}
                          placeholder="Document type"
                          compact
                          className="sm:w-52 flex-shrink-0"
                        />
                        <button
                          onClick={() => addCategoryItem(cat)}
                          disabled={!categoryItemLabel.trim()}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-edamame hover:bg-edamame-600 disabled:opacity-40 text-white font-bold rounded-lg text-[11.5px] transition-colors flex-shrink-0"
                        >
                          <Plus size={12} /> Add
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Additional Documents — the catch-all section (§5.3) */}
              <div className="rounded-xl border border-dashed border-ink/15 dark:border-plate-ink/20 p-3.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint dark:text-plate-ink-faint mb-2">
                  {ADDITIONAL_DOCUMENTS_CATEGORY}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={manualLabel}
                    onChange={e => setManualLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                    placeholder="Document name…"
                    className="flex-1 min-w-0 px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-[12.5px] text-ink dark:text-plate-ink outline-none focus:border-edamame"
                  />
                  <DocumentTypePicker
                    value={manualTypeCode}
                    onChange={setManualTypeCode}
                    placeholder="Document type"
                    className="sm:w-56 flex-shrink-0"
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
        <div className="p-5 bg-paper-2 dark:bg-plate-card/50 border-t border-ink/10 dark:border-plate-ink/15 flex justify-between flex-shrink-0">
          {step === 2 ? (
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-ink-soft dark:text-plate-ink-soft hover:text-ink-soft dark:text-plate-ink-soft dark:hover:text-plate-ink transition-colors"
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
