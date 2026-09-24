import type { DocumentChecklistItem } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * System default document checklist, grouped by category.
 *
 * Categories mirror the subsections in the reference "System Default Document
 * Checklist" (Project Lighthouse — Immigration Agent Suite), e.g.
 * "482 — Sponsor & Nomination Documents", "820/801 — Relationship Evidence:
 * Financial Aspects". Each category maps to a collapsible section in the
 * Document Checklist tab, and to a selectable item in the Document Checklist
 * Generator's category-selection step.
 *
 * Each entry: [label, description?]
 */
interface CategoryDef {
  category: string;
  items: Array<[string, string?]>;
}

const CHECKLIST_CATEGORIES: Record<string, CategoryDef[]> = {
  '189': [
    {
      category: '189 — Skills & Points',
      items: [
        ['SkillSelect EOI screenshot', 'Showing invitation to apply with points score'],
        ['Skills assessment certificate', 'From assessing authority relevant to the nominated occupation'],
        ['Points test evidence', 'Documents supporting each points claim (age, work experience, qualifications, etc.)'],
      ],
    },
    {
      category: '189 — English Language',
      items: [
        ['IELTS / PTE / TOEFL certificate', 'Superior English earns maximum points'],
      ],
    },
    {
      category: '189 — Identity & Character',
      items: [
        ['Passport (all pages)', 'Valid for at least 12 months from lodgement'],
        ['AFP National Police Check', 'Less than 12 months old at lodgement'],
        ['Overseas police clearances', 'All countries of residence for 12+ months after age 16'],
        ['Medical examination results', 'Conducted by Bupa-approved panel physician'],
      ],
    },
  ],
  '190': [
    {
      category: '190 — State Nomination',
      items: [
        ['State nomination letter', 'From state/territory nominating authority'],
        ['SkillSelect EOI screenshot', 'Showing invitation to apply with points score'],
      ],
    },
    {
      category: '190 — Skills & Qualifications',
      items: [
        ['Skills assessment certificate', 'From assessing authority relevant to the nominated occupation'],
      ],
    },
    {
      category: '190 — English Language',
      items: [
        ['IELTS / PTE certificate', 'English proficiency — higher scores earn more points'],
      ],
    },
    {
      category: '190 — Identity & Character',
      items: [
        ['Passport (all pages)', 'Valid for duration of intended stay'],
        ['AFP National Police Check', 'Less than 12 months old'],
        ['Overseas police clearances', 'All countries of residence after age 16 for 12+ months'],
        ['Medical examination results', 'Bupa panel physician'],
      ],
    },
  ],
  '186': [
    {
      category: '186 — Sponsor & Nomination Documents',
      items: [
        ['Approved Standard Business Sponsor (SBS) letter', 'Standard Business Sponsorship approval'],
        ['Nomination application (Form 1395)', undefined],
        ['Employment contract', 'Current employer — signed by both parties'],
        ['Evidence salary meets current income threshold', 'Core Skills Income Threshold (CSIT) — the renamed/indexed successor to TSMIT'],
        ['Skilling Australians Fund (SAF) levy receipt', undefined],
        ['Employer financials', 'Last 2 years of financial statements to demonstrate business viability'],
      ],
    },
    {
      category: '186 — Applicant: Identity & Civil Status',
      items: [
        ['Passport (all pages)', 'Must be valid for at least 12 months from lodgement'],
        ['Birth certificate or certified extract', undefined],
        ['Marriage or divorce certificates', 'If applicable'],
      ],
    },
    {
      category: '186 — Applicant: Skills & Work Experience',
      items: [
        ['Skills assessment certificate', 'From relevant assessing authority (TRA, ACS, AHPRA, etc.)'],
        ['Degree certificates and academic transcripts', undefined],
        ['Reference letters (last 5 years)', 'From all employers relevant to the nominated occupation'],
        ['IELTS / PTE / TOEFL certificate', 'Competent English required — minimum IELTS 6.0 in each band'],
      ],
    },
    {
      category: '186 — Health & Character',
      items: [
        ['AFP National Police Check', 'Must be less than 12 months old at lodgement'],
        ['Overseas police clearances', 'For each country lived in for 12+ months after age 16'],
        ['Medical examination results', 'Conducted by Bupa-approved panel physician'],
        ['Form 80 — Personal particulars', 'Completed and signed'],
        ['Form 1221 — Additional personal particulars', 'Completed and signed'],
      ],
    },
  ],
  '482': [
    {
      category: '482 — Sponsor & Nomination Documents (Skills in Demand visa)',
      items: [
        ['SBS approval evidence', 'Standard Business Sponsorship approval letter for employer'],
        ['Stream confirmation', 'Core Skills, Specialist Skills, or Labour Agreement — confirm which stream the nomination is lodged under'],
        ['Labour Market Testing evidence', 'Job ad(s) run for the required minimum period, stating salary, unless a current exemption applies'],
        ['Skilling Australians Fund (SAF) levy receipt', undefined],
        ['Employment contract', 'Position, salary, and conditions must match nomination'],
        ['Evidence salary meets current income threshold', 'Core Skills Income Threshold (CSIT) or Specialist Skills Income Threshold (SSIT), whichever applies to the stream'],
      ],
    },
    {
      category: '482 — Primary Applicant: Identity',
      items: [
        ['Passport (all pages)', 'Must be valid for the intended stay duration'],
        ['Birth certificate or certified extract', undefined],
      ],
    },
    {
      category: '482 — Primary Applicant: Skills & Qualifications',
      items: [
        ['Skills assessment (if applicable)', 'Occupation-dependent — confirm with current Skills in Demand visa / Designated Area Migration Agreement (DAMA) requirements'],
        ['Qualifications / degree certificates', 'Certified translations required for non-English documents'],
        ['English language test certificate', 'IELTS, PTE, or TOEFL as required by occupation'],
      ],
    },
    {
      category: '482 — Primary Applicant: Health & Character',
      items: [
        ['AFP National Police Check', 'Must be less than 12 months old'],
        ['Overseas police clearances', 'All countries of residence for 12+ months after age 16'],
        ['Medical examination results', 'Via Bupa MedicalConnect portal'],
      ],
    },
  ],
  // Key is '491' (Skilled Work Regional (Provisional)) — "490" is not a current
  // Australian visa subclass. See the header comment above `seedDefaultTemplates()`
  // in `seedData.ts` for why the corresponding template's `id` stays `tpl-490`.
  '491': [
    {
      category: '491 — State / Territory Nomination or Family Sponsorship',
      items: [
        ['State/territory nomination letter, or family sponsorship approval', 'From the nominating authority, or evidence of an eligible family sponsor in a designated regional area'],
        ['SkillSelect EOI screenshot', 'Showing invitation to apply with points score'],
        ['Evidence of regional intent', 'Job offer, family connection, or settlement plans in regional area'],
      ],
    },
    {
      category: '491 — Skills & Qualifications',
      items: [
        ['Skills assessment certificate', 'From assessing authority relevant to nominated occupation'],
      ],
    },
    {
      category: '491 — English Language',
      items: [
        ['IELTS / PTE certificate', 'English proficiency — higher scores earn more points'],
      ],
    },
    {
      category: '491 — Identity & Character',
      items: [
        ['Passport (all pages)', 'Valid for duration of intended stay'],
        ['AFP National Police Check', 'Less than 12 months old'],
        ['Overseas police clearances', 'All countries of residence after age 16 for 12+ months'],
        ['Medical examination results', 'Bupa panel physician'],
      ],
    },
  ],
  '500': [
    {
      category: '500 — Enrolment & Study',
      items: [
        ['Confirmation of Enrolment (CoE)', 'From the CRICOS-registered education provider for each course'],
        ['Genuine Student (GS) statement', 'Addressing ties to home country, course suitability, and study/career intent'],
        ['Academic transcripts', 'Evidence of prior academic results relevant to the course'],
      ],
    },
    {
      category: '500 — Financial & Health Cover',
      items: [
        ['Evidence of financial capacity', 'Funds for tuition, living costs, and travel — check current minimum requirement'],
        ['Overseas Student Health Cover (OSHC)', 'Covering the full intended stay for all family members included'],
      ],
    },
    {
      category: '500 — English Language',
      items: [
        ['IELTS / PTE / TOEFL certificate', 'If required by the provider or Department'],
      ],
    },
    {
      category: '500 — Identity & Character',
      items: [
        ['Passport (all pages)', 'Valid for the intended duration of study'],
        ['Medical examination results', 'If required based on country of origin or stay length'],
        ['Police clearances', 'If required (e.g. stays over 12 months)'],
      ],
    },
  ],
  '485': [
    {
      category: '485 — Qualification & Stream',
      items: [
        ['Qualification/course completion letter', 'From the CRICOS-registered provider, confirming the Australian study requirement (typically 2 academic years) was met — this is the primary evidence, not the CoE'],
        ['Academic transcript', 'For the completed course'],
        ['Skills assessment (Post-Vocational Education Work stream)', 'Required before lodgement for this stream; generally not required for the Post-Higher Education Work stream — confirm against current requirements'],
      ],
    },
    {
      category: '485 — English Language',
      items: [
        ['IELTS / PTE / TOEFL certificate', 'Competent English required, taken within the required window'],
      ],
    },
    {
      category: '485 — Health & Character',
      items: [
        ['Health insurance evidence', 'Adequate arrangements for the duration of the visa'],
        ['Passport (all pages)', 'Valid for the intended visa period'],
        ['AFP National Police Check', 'Less than 12 months old'],
        ['Overseas police clearances', 'All countries of residence for 12+ months after age 16'],
        ['Medical examination results', 'Bupa panel physician'],
      ],
    },
  ],
  '600': [
    {
      category: '600 — Purpose & Itinerary',
      items: [
        ['Travel itinerary', 'Intended travel dates, accommodation, and activities'],
        ['Invitation letter', 'For the Sponsored Family stream or business visits, from the host/sponsor in Australia'],
      ],
    },
    {
      category: '600 — Financial Capacity & Ties',
      items: [
        ['Evidence of financial capacity', 'Sufficient funds to support the visit without working'],
        ['Evidence of ties to home country', 'Employment, family, property, or other strong incentive to return'],
      ],
    },
    {
      category: '600 — Identity & Character',
      items: [
        ['Passport (all pages)', 'Valid for the intended stay'],
        ['Medical examination results', 'If required based on intended stay length and country of origin'],
        ['Police clearances', 'If requested by the Department — not always required for short visits'],
      ],
    },
  ],
  '417': [
    {
      category: '417 — Eligibility',
      items: [
        ['Passport (all pages)', 'From a country eligible for subclass 417, valid for the intended stay'],
        ['Evidence of age', 'Confirming applicant is within the current age limit for the passport country'],
      ],
    },
    {
      category: '417 — Funds & Travel',
      items: [
        ['Evidence of funds', 'Sufficient funds to support the initial period of stay — check current minimum requirement'],
        ['Outbound/onward travel evidence', 'Return or onward ticket, or funds to purchase one'],
      ],
    },
    {
      category: '417 — Identity & Character',
      items: [
        ['Medical examination results', 'If required based on intended activities or country of origin'],
        ['Police clearances', 'If requested by the Department'],
      ],
    },
  ],
  '820': [
    {
      category: '820/801 — Sponsor Documents',
      items: [
        ["Sponsor's citizenship / PR evidence", 'Australian citizenship certificate, birth certificate, or PR evidence'],
        ['Form 888 — Statutory declaration #1', 'From a friend or family member who knows the couple'],
        ['Form 888 — Statutory declaration #2', 'Second statutory declaration from a different witness'],
      ],
    },
    {
      category: '820/801 — Relationship Evidence: Financial Aspects',
      items: [
        ['Joint bank account statements', 'At least 3–6 months of statements showing shared finances'],
      ],
    },
    {
      category: '820/801 — Relationship Evidence: Nature of Relationship',
      items: [
        ['Relationship photos', 'Chronological photos together (at least 20–30 spanning the relationship)'],
      ],
    },
    {
      category: '820/801 — Relationship Evidence: Household',
      items: [
        ['Lease or mortgage documents', 'Showing shared address — both names on document'],
      ],
    },
    {
      category: '820/801 — Applicant: Identity & Character',
      items: [
        ['Passport (all pages)', "Applicant's passport — valid at lodgement"],
        ['Form 80 — Personal particulars', 'Completed by primary applicant'],
        ['AFP National Police Check', 'Less than 12 months old'],
      ],
    },
    {
      category: '820/801 — Applicant: Health',
      items: [
        ['Medical examination results', 'Bupa panel physician'],
      ],
    },
  ],
};

/** All subclasses that have a defined checklist */
export const SUPPORTED_SUBCLASSES = Object.keys(CHECKLIST_CATEGORIES);

/** All category labels available for a given subclass (used by the category-selection step). */
export function getCategoriesForSubclass(visaSubclass: string): string[] {
  return (CHECKLIST_CATEGORIES[visaSubclass] || []).map(c => c.category);
}

function itemsForCategories(visaSubclass: string, categories: string[]): CategoryDef[] {
  const defs = CHECKLIST_CATEGORIES[visaSubclass];
  if (!defs) return [];
  if (!categories || categories.length === 0) return defs;
  return defs.filter(d => categories.includes(d.category));
}

/**
 * Generate DocumentChecklistItem[] for a given case and visa subclass.
 * Returns empty array for unknown subclasses. Generates every category by default.
 */
export function generateChecklist(caseId: string, visaSubclass: string): DocumentChecklistItem[] {
  return generateChecklistForCategories(caseId, visaSubclass, []);
}

/**
 * Generate the system-default checklist for only the selected categories.
 * Pass an empty array (or omit) to generate every category for the subclass.
 */
export function generateChecklistForCategories(
  caseId: string,
  visaSubclass: string,
  categories: string[] = []
): DocumentChecklistItem[] {
  const defs = itemsForCategories(visaSubclass, categories);
  const out: DocumentChecklistItem[] = [];
  for (const def of defs) {
    for (const [label, description] of def.items) {
      out.push({
        id: uuidv4(),
        caseId,
        label,
        description,
        status: 'pending',
        requiredForSubclass: [visaSubclass],
        category: def.category,
      });
    }
  }
  return out;
}

/**
 * Merge the system default checklist (for the selected categories) with items
 * derived from the user's workflow template steps (firm-level customisation).
 * Template steps are added under a "From Workflow Template" category, skipping
 * any step whose title already matches a system-default label (case-insensitive).
 */
export function mergeWithWorkflowTemplateSteps(
  systemItems: DocumentChecklistItem[],
  caseId: string,
  templateSteps: Array<{ title: string; description?: string }>
): DocumentChecklistItem[] {
  const existingLabels = new Set(systemItems.map(i => i.label.trim().toLowerCase()));
  const extra: DocumentChecklistItem[] = [];
  for (const step of templateSteps) {
    const key = step.title.trim().toLowerCase();
    if (!key || existingLabels.has(key)) continue;
    existingLabels.add(key);
    extra.push({
      id: uuidv4(),
      caseId,
      label: step.title,
      description: step.description,
      status: 'pending',
      category: 'From Workflow Template',
    });
  }
  return [...systemItems, ...extra];
}
