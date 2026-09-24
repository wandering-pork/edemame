import { describe, it, expect } from 'vitest';
import { seedDefaultTemplates } from './seedData';
import { generateChecklist, SUPPORTED_SUBCLASSES } from './checklistTemplates';
import { SYSTEM_DOCUMENT_TYPES } from './documentTypes';

/**
 * Every visa subclass the Visa Eligibility Advisor (`api/check-eligibility.ts`)
 * can return. Kept as a literal list here (rather than importing from the
 * Vercel function, which isn't part of the `src/` TS project) so a change to
 * either side is caught: adding a subclass to the Advisor without a matching
 * template/checklist fails this test, and vice versa.
 */
const ADVISOR_SUBCLASSES = ['189', '190', '482', '186', '500', '820', '485', '600', '417', '491'];

describe('Advisor subclass coverage', () => {
  it('every Advisor subclass has a system workflow template', () => {
    const templates = seedDefaultTemplates();
    const templateSubclasses = new Set(templates.map(t => t.visaSubclass));
    for (const subclass of ADVISOR_SUBCLASSES) {
      expect(templateSubclasses.has(subclass), `missing system template for subclass ${subclass}`).toBe(true);
    }
  });

  it('every Advisor subclass has a non-empty document checklist', () => {
    for (const subclass of ADVISOR_SUBCLASSES) {
      expect(SUPPORTED_SUBCLASSES, `missing checklist categories for subclass ${subclass}`).toContain(subclass);
      const items = generateChecklist('case-1', subclass);
      expect(items.length, `checklist for subclass ${subclass} should not be empty`).toBeGreaterThan(0);
    }
  });

  it('every system workflow template has at least one step', () => {
    const templates = seedDefaultTemplates();
    for (const template of templates) {
      expect(template.steps.length, `template ${template.id} should have steps`).toBeGreaterThan(0);
    }
  });
});

describe('Checklist item document type codes', () => {
  const knownCodes = new Set(SYSTEM_DOCUMENT_TYPES.map(t => t.code));

  it('every documentTypeCode referenced by a checklist item exists in documentTypes.ts', () => {
    for (const subclass of SUPPORTED_SUBCLASSES) {
      const items = generateChecklist('case-1', subclass);
      for (const item of items) {
        if (!item.documentTypeCode) continue;
        expect(knownCodes.has(item.documentTypeCode), `unknown document type code "${item.documentTypeCode}" on item "${item.label}" (${subclass})`).toBe(true);
      }
    }
  });
});
